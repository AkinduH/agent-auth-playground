import { NextRequest, NextResponse } from 'next/server';
import { invokeLLM, ProviderName } from '@/lib/llmProviders';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, model, message, systemPrompt, temperature, maxTokens, apiKey } = body;

    if (!provider || !model || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: `No API key found for ${provider}. Please configure your API key in Settings.` },
        { status: 401 }
      );
    }

    const output = await invokeLLM(
      provider as ProviderName,
      apiKey,
      model,
      message,
      systemPrompt ?? '',
      temperature ?? 0.7,
      maxTokens ?? 1000
    );

    return NextResponse.json({ success: true, output });
  } catch (error) {
    console.error('LLM API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
