import { AIProvider } from './AIProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { GroqProvider } from './providers/GroqProvider';

class FallbackAIProvider implements AIProvider {
  private primary: AIProvider;
  private secondary: AIProvider;
  private primaryName: string;
  private secondaryName: string;

  constructor(primaryName: string) {
    this.primaryName = primaryName.toLowerCase();
    this.secondaryName = this.primaryName === 'groq' ? 'gemini' : 'groq';

    this.primary = this.instantiateProvider(this.primaryName);
    this.secondary = this.instantiateProvider(this.secondaryName);
  }

  private instantiateProvider(name: string): AIProvider {
    switch (name) {
      case 'gemini':
        return new GeminiProvider();
      case 'groq':
        return new GroqProvider();
      default:
        throw new Error(`Unsupported AI provider: ${name}`);
    }
  }

  async generateTestCases(requirementText: string) {
    try {
      console.log(`[AI] Attempting generation with primary model (${this.primaryName})...`);
      return await this.primary.generateTestCases(requirementText);
    } catch (err) {
      console.warn(
        `[AI] Primary model (${this.primaryName}) failed. Falling back to secondary model (${this.secondaryName})... Error:`,
        err instanceof Error ? err.message : String(err),
      );
      return await this.secondary.generateTestCases(requirementText);
    }
  }
}

export class AIProviderFactory {
  /**
   * Returns a wrapped AI provider that will automatically fallback to the secondary provider
   * if the primary (configured via AI_PROVIDER env var) fails.
   */
  static getProvider(): AIProvider {
    const primaryName = process.env.AI_PROVIDER || 'gemini';
    return new FallbackAIProvider(primaryName);
  }
}
