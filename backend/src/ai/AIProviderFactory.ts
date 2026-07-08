import { AIProvider } from './AIProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { GroqProvider } from './providers/GroqProvider';

export class AIProviderFactory {
  /**
   * Returns the configured AI provider based on the AI_PROVIDER env var.
   */
  static getProvider(): AIProvider {
    const providerName = process.env.AI_PROVIDER || 'gemini';

    switch (providerName.toLowerCase()) {
      case 'gemini':
        return new GeminiProvider();
      case 'groq':
        return new GroqProvider();
      default:
        throw new Error(`Unsupported AI provider: ${providerName}`);
    }
  }
}
