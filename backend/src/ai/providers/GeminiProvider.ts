import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { AIProvider, GeneratedTestCase } from '../AIProvider';

const testCaseSchema = z.object({
  title: z.string(),
  type: z.enum(['UI', 'API']),
  preconditions: z.string().optional(),
  steps: z.array(
    z.object({
      order: z.number().int().positive(),
      action: z.string(),
      expected: z.string().optional(),
    }),
  ),
  expectedResult: z.string(),
});

const generatedTestCasesSchema = z.array(testCaseSchema);

/** Attempt to repair a truncated JSON array by closing any open braces/brackets. */
function repairTruncatedJson(raw: string): string {
  // Extract from first '[' to last complete '}' before the truncation point
  const firstBracket = raw.indexOf('[');
  if (firstBracket === -1) return raw;

  let text = raw.substring(firstBracket);

  // Remove any trailing comma + whitespace (common at truncation point)
  text = text.replace(/,\s*$/, '');

  // Count open braces and brackets to determine what needs closing
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;

  for (const ch of text) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') openBraces++;
    else if (ch === '}') openBraces--;
    else if (ch === '[') openBrackets++;
    else if (ch === ']') openBrackets--;
  }

  // Close unclosed structures
  for (let i = 0; i < openBraces; i++) text += '}';
  for (let i = 0; i < openBrackets; i++) text += ']';

  return text;
}

export class GeminiProvider implements AIProvider {
  private genAI: GoogleGenerativeAI;
  // We use the '-latest' alias rather than pinning a specific version (like gemini-1.5-flash)
  // to ensure we always have access to Google's current recommended fast model without
  // hardcoding a version that will eventually be deprecated.
  // If stability/reproducibility becomes more important than having the newest model,
  // this can be pinned to a specific dated version instead (check https://ai.google.dev/gemini-api/docs/models).
  private modelName = 'gemini-flash-latest';

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is missing or empty.');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateTestCases(requirementText: string): Promise<GeneratedTestCase[]> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
      },
    });

    const prompt = `
You are a QA automation expert. Given the following requirement, generate a comprehensive list of test cases (both UI and API if applicable) in JSON format.
The output MUST be a JSON array of objects conforming exactly to this structure:
[
  {
    "title": "A short descriptive title",
    "type": "UI" or "API",
    "preconditions": "Optional preconditions for this test",
      "steps": [
        {
          "order": 1,
          "action": "What to do",
          "expected": "Optional expected outcome of this step"
        }
      ],
    "expectedResult": "The final expected result"
  }
]

Requirement:
${requirementText}
`;

    // 30s timeout implementation
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI request timed out after 30 seconds')), 30000);
    });

    try {
      const response = await Promise.race([model.generateContent(prompt), timeoutPromise]);

      let text = response.response.text();

      const firstBracket = text.indexOf('[');
      const lastBracket = text.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        text = text.substring(firstBracket, lastBracket + 1);
      } else {
        text = text.trim();
      }

      let parsedJson: unknown;

      try {
        parsedJson = JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse JSON. Raw AI output:', text);
        throw new Error('Failed to parse AI response as JSON.');
      }

      // Zod handles structural validation
      const validationResult = generatedTestCasesSchema.safeParse(parsedJson);

      if (!validationResult.success) {
        throw new Error(`AI generated invalid JSON structure: ${validationResult.error.message}`);
      }

      return validationResult.data as GeneratedTestCase[];
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Gemini Provider Error: ${error.message}`);
      }
      throw new Error('Gemini Provider Error: An unknown error occurred.');
    }
  }
  async generateTestCasesFromBrowser(
    requirementText: string,
    screenshotBase64: string,
    domTree: string,
    scope: 'UI' | 'API' | 'BOTH',
  ): Promise<GeneratedTestCase[]> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
      },
    });

    const scopeInstruction =
      scope === 'UI'
        ? 'Only generate UI test cases.'
        : scope === 'API'
          ? 'Only generate API test cases.'
          : 'Generate both UI and API test cases where appropriate.';

    const prompt = `
You are a QA automation expert. Your task is STRICTLY LIMITED to generating test cases for the ONE specific requirement described below. You MUST NOT generate test cases for any other functionality visible on the page that is unrelated to this requirement.

${scopeInstruction}

FOCUS REQUIREMENT — only generate test cases for functionality directly related to:
  Title: ${requirementText.split('\n')[0].replace('Title: ', '')}
  Description: ${requirementText.split('\n')[1]?.replace('Description: ', '') ?? ''}

IMPORTANT RULES:
- If a page element (button, link, form field) is NOT directly relevant to the requirement above, EXCLUDE it.
- Bias toward excluding uncertain elements rather than including them.
- Base your test cases on the ACTUAL elements visible in the screenshot and the provided DOM tree. Use real button labels, link text, form fields, and placeholders you can see.
- Do NOT make generic assumptions about elements not visible.

The output MUST be a JSON array of objects conforming exactly to this structure:
[
  {
    "title": "A short descriptive title",
    "type": "UI" or "API",
    "preconditions": "Optional preconditions for this test",
      "steps": [
        {
          "order": 1,
          "action": "What to do (e.g. Click the 'Sign In' button)",
          "expected": "Optional expected outcome of this step"
        }
      ],
    "expectedResult": "The final expected result"
  }
]

Requirement:
${requirementText}

Extracted Interactive Elements:
${domTree}
`;

    // 90s timeout for vision + generation (screenshot upload adds latency)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI request timed out after 90 seconds')), 90000);
    });

    try {
      const response = await Promise.race([
        model.generateContent([
          prompt,
          {
            inlineData: {
              data: screenshotBase64,
              mimeType: 'image/png',
            },
          },
        ]),
        timeoutPromise,
      ]);

      let text = response.response.text();

      // Repair truncated JSON before parsing
      text = repairTruncatedJson(text);

      let parsedJson: unknown;

      try {
        parsedJson = JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse JSON. Raw AI output:', text);
        throw new Error('Failed to parse AI response as JSON.');
      }

      const validationResult = generatedTestCasesSchema.safeParse(parsedJson);

      if (!validationResult.success) {
        throw new Error(`AI generated invalid JSON structure: ${validationResult.error.message}`);
      }

      return validationResult.data as GeneratedTestCase[];
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Gemini Provider Error: ${error.message}`);
      }
      throw new Error('Gemini Provider Error: An unknown error occurred.');
    }
  }
}
