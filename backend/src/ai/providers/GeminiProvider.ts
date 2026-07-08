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
      // Clean markdown code blocks if present
      text = text
        .replace(/^```json\s*/, '')
        .replace(/\s*```$/, '')
        .trim();
      let parsedJson: unknown;

      try {
        parsedJson = JSON.parse(text);
      } catch (e) {
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
      },
    });

    const scopeInstruction =
      scope === 'UI'
        ? 'Only generate UI test cases.'
        : scope === 'API'
          ? 'Only generate API test cases.'
          : 'Generate both UI and API test cases where appropriate.';

    const prompt = `
You are a QA automation expert. Given the following requirement, a screenshot of the live page, and a text representation of the page's interactive elements (DOM/accessibility tree), generate a comprehensive list of test cases in JSON format.
${scopeInstruction}

IMPORTANT: Base your test cases on the ACTUAL elements visible in the screenshot and the provided DOM tree. Use real button labels, link text, form fields, and placeholders that you can see. Do NOT make generic assumptions.

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

    // 45s timeout implementation for vision
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI request timed out after 45 seconds')), 45000);
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
      text = text
        .replace(/^```json\s*/, '')
        .replace(/\s*```$/, '')
        .trim();
      let parsedJson: unknown;

      try {
        parsedJson = JSON.parse(text);
      } catch (e) {
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
