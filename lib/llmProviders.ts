import { LLMProvider } from './types';

// Google Gemini Provider
export class GoogleGeminiProvider implements LLMProvider {
  name: 'gemini' = 'gemini';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateResponse(
    message: string,
    systemPrompt: string,
    options: {
      temperature: number;
      maxTokens: number;
      model: string;
    }
  ): Promise<string> {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(this.apiKey);
      const model = genAI.getGenerativeModel({ model: options.model });

      const safetySettings = [
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_NONE',
        },
      ];

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${systemPrompt}\n\nUser message: ${message}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
        },
        safetySettings: safetySettings as any,
      });

      const response = result.response;
      return response.text();
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error(`Gemini API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async listModels(): Promise<string[]> {
    return ['gemini-pro', 'gemini-2.5-flash'];
  }
}

// OpenAI Provider
export class OpenAIProvider implements LLMProvider {
  name: 'openai' = 'openai';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateResponse(
    message: string,
    systemPrompt: string,
    options: {
      temperature: number;
      maxTokens: number;
      model: string;
    }
  ): Promise<string> {
    try {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: this.apiKey });

      const response = await client.chat.completions.create({
        model: options.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from OpenAI');
      }

      return content;
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async listModels(): Promise<string[]> {
    return ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  }
}

// Factory function to get provider
export function getLLMProvider(
  provider: 'gemini' | 'openai',
  apiKey: string
): LLMProvider {
  switch (provider) {
    case 'gemini':
      return new GoogleGeminiProvider(apiKey);
    case 'openai':
      return new OpenAIProvider(apiKey);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
