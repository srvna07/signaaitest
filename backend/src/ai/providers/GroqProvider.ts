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

// For models that return an object wrapping the array
const wrappedSchema = z.object({ testCases: generatedTestCasesSchema });

export class GroqProvider implements AIProvider {
  // Using a solid, fast, currently supported Groq model. Update here if their lineup changes.
  private modelName = 'llama-3.3-70b-versatile';
  private apiKey: string;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is missing or empty.');
    }
    this.apiKey = apiKey;
  }

  async generateTestCases(requirementText: string): Promise<GeneratedTestCase[]> {
    const prompt = `
You are a QA automation expert. Given the following requirement, generate a comprehensive list of test cases (both UI and API if applicable) in JSON format.
The output MUST be a JSON object containing a single key "testCases" which is an array of objects conforming exactly to this structure:
{
  "testCases": [
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
}

Requirement:
${requirementText}
`;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI request timed out after 30 seconds')), 30000);
    });

    try {
      const fetchPromise = fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          model: this.modelName,
          response_format: { type: 'json_object' },
        }),
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      interface GroqResponse {
        choices?: Array<{ message?: { content?: string } }>;
      }

      const data = (await response.json()) as GroqResponse;
      let text = data.choices?.[0]?.message?.content || '';

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

      // Check if it's the wrapped object format we requested
      const wrappedValidation = wrappedSchema.safeParse(parsedJson);
      if (wrappedValidation.success) {
        return wrappedValidation.data.testCases as GeneratedTestCase[];
      }

      // Fallback in case it returned the array directly despite the prompt
      const arrayValidation = generatedTestCasesSchema.safeParse(parsedJson);
      if (arrayValidation.success) {
        return arrayValidation.data as GeneratedTestCase[];
      }

      throw new Error('AI generated invalid JSON structure.');
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Groq Provider Error: ${error.message}`);
      }
      throw new Error('Groq Provider Error: An unknown error occurred.');
    }
  }
}
