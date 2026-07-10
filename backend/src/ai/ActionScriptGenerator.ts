import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ActionScriptTestCase {
  id: string;
  title: string;
  type: 'UI' | 'API';
  preconditions?: string | null;
  steps: unknown;
  expectedResult: string;
}

export class ActionScriptGenerator {
  static async generate(testCase: ActionScriptTestCase): Promise<string> {
    const primaryProvider = process.env.AI_PROVIDER || 'gemini';

    try {
      if (primaryProvider.toLowerCase() === 'groq') {
        return await this.generateWithGroq(testCase);
      } else {
        return await this.generateWithGemini(testCase);
      }
    } catch (err) {
      console.warn(
        `Primary provider (${primaryProvider}) failed to generate action-script, trying fallback...`,
        err,
      );
      if (primaryProvider.toLowerCase() === 'groq') {
        return await this.generateWithGemini(testCase);
      } else {
        return await this.generateWithGroq(testCase);
      }
    }
  }

  private static getPrompt(testCase: ActionScriptTestCase): string {
    const defaultFormat = testCase.type === 'UI' ? 'python-playwright' : 'python-requests';

    return `
You are a QA automation expert. Convert the following human-readable test case into a fully runnable Python script.

Test Case Details:
- Test Case ID: ${testCase.id}
- Title: ${testCase.title}
- Type: ${testCase.type}
- Target Format: ${defaultFormat}
- Preconditions: ${testCase.preconditions || 'None'}
- Steps:
${JSON.stringify(testCase.steps, null, 2)}
- Expected Result: ${testCase.expectedResult}

Generation Rules:
1. For UI Test Cases (Target Format: python-playwright):
   - Generate a Python Playwright script using the sync API and a pytest-style test function (e.g. \`def test_${testCase.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}(page: Page):\`).
   - For input fields, NEVER use \`text=\` selectors. Instead, use \`page.get_by_placeholder()\`, \`page.get_by_label()\`, or standard CSS selectors like \`page.locator('input[type="..."]')\`. Only use \`text=\` for clicking buttons or links.
   - Assert page visibility or text using Playwright expectations: \`expect(page.locator(...)).to_be_visible()\`.
   - To assert URLs, use Playwright's built-in \`expect(page).to_have_url(re.compile(r".*..."))\`. Do NOT use \`expect(page.url).to_contain\`.
   - Include standard imports: \`import os\`, \`import re\`, \`from playwright.sync_api import Page, expect\`.
2. For API Test Cases (Target Format: python-requests):
   - Generate a Python test script using the \`requests\` library (e.g. \`def test_${testCase.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}():\`).
   - Send requests using \`requests.get()\`, \`requests.post()\`, etc., to relative URL paths.
   - Assert status codes and response content using standard \`assert\` statements (e.g. \`assert response.status_code == 200\`).
   - Include standard imports: \`import os\`, \`import requests\`.

CRITICAL SECURITY AND DEPLOYMENT RULES:
- The base URL of the target environment MUST be read directly from the environment variable \`BASE_URL\` using exactly \`os.environ["BASE_URL"]\`. Do NOT provide a fallback value like "https://example.com", and do NOT hardcode the full target domain directly in the test calls.
- NEVER include literal hardcoded secrets, passwords, API keys, or tokens in the code.
- If a step mentions credentials or secrets, they MUST be loaded dynamically from environment variables using a clear naming convention: \`os.environ["SECRET_<NAME>"]\` or \`os.environ.get("SECRET_<NAME>")\` (e.g. \`os.environ["SECRET_DEV_PASSWORD"]\`).
- Add a comment above every credential loading line stating: \`# Note: Injected by the execution engine at runtime\`.
- You MUST include a comment header in the script noting: \`# AI-generated test script from test case ID: ${testCase.id}\`.

Output only the Python code. Do not wrap the output in markdown code blocks. Start directly with the Python code (e.g. \`import os\`).
`;
  }

  private static async generateWithGemini(testCase: ActionScriptTestCase): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is missing');

    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-2.5-flash for code generation tasks
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    const prompt = this.getPrompt(testCase);
    const response = await model.generateContent(prompt);
    let text = response.response.text();
    // Strip markdown code blocks if the model wrapped them anyway
    text = text
      .replace(/^```python\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '')
      .trim();
    return text;
  }

  private static async generateWithGroq(testCase: ActionScriptTestCase): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY is missing');

    const prompt = this.getPrompt(testCase);
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq HTTP ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    let text = data.choices?.[0]?.message?.content || '';
    text = text
      .replace(/^```python\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '')
      .trim();
    return text;
  }
}
