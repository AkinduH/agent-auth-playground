import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export type ProviderName = 'gemini' | 'openai' | 'anthropic';

export const PROVIDER_MODELS: Record<ProviderName, string[]> = {
  gemini: [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite-preview',
    'gemini-3.1-pro-preview',
  ],
  openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
};

async function invokeVertexAI(
  gcpAccessToken: string,
  gcpProjectId: string,
  model: string,
  message: string,
  systemPrompt: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const location = 'us-central1';
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${gcpProjectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: message }] }],
    ...(systemPrompt && {
      systemInstruction: { parts: [{ text: systemPrompt }] },
    }),
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${gcpAccessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Vertex AI error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export async function invokeLLM(
  provider: ProviderName,
  apiKey: string,
  model: string,
  message: string,
  systemPrompt: string,
  temperature: number,
  maxTokens: number,
  gcpAccessToken?: string,
  gcpProjectId?: string
): Promise<string> {

  if (provider === 'gemini' && gcpAccessToken && gcpProjectId) {
    return invokeVertexAI(gcpAccessToken, gcpProjectId, model, message, systemPrompt, temperature, maxTokens);
  }

  const messages = [new SystemMessage(systemPrompt), new HumanMessage(message)];

  let llm: ChatGoogleGenerativeAI | ChatOpenAI | ChatAnthropic;

  if (provider === 'gemini') {
    llm = new ChatGoogleGenerativeAI({ model, apiKey, temperature, maxOutputTokens: maxTokens });
  } else if (provider === 'openai') {
    llm = new ChatOpenAI({ model, apiKey, temperature, maxTokens });
  } else {
    llm = new ChatAnthropic({ model, apiKey, temperature, maxTokens });
  }

  const response = await llm.invoke(messages);
  const content = response.content;
  return typeof content === 'string' ? content : JSON.stringify(content);
}

export function listModels(provider: ProviderName): string[] {
  return PROVIDER_MODELS[provider] ?? [];
}
