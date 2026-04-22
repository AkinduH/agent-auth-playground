import { NextRequest, NextResponse } from 'next/server';
import { getLLMProvider } from '@/lib/llmProviders';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      provider,
      model,
      message,
      systemPrompt,
      temperature,
      maxTokens,
      apiKey: requestApiKey,
    } = body;

    if (!provider || !model || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Prefer API key provided by the client payload (browser settings), then fallback to env vars
    let apiKey: string | undefined;

    if (provider === 'gemini') {
      apiKey =
        requestApiKey ||
        undefined;
    } else if (provider === 'openai') {
      apiKey = requestApiKey || undefined;
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: `No API key found for ${provider}. Please configure your API key in Settings.`,
        },
        { status: 401 }
      );
    }

    console.log('Executing LLM:', {
      provider,
      model,
      messageLength: message.length,
    });

    // Get LLM provider
    const llmProvider = getLLMProvider(provider, apiKey);

    // Call LLM
    const output = await llmProvider.generateResponse(message, systemPrompt, {
      temperature: temperature || 0.7,
      maxTokens: maxTokens || 1000,
      model,
    });

    console.log('LLM response generated, length:', output.length);

    return NextResponse.json({
      success: true,
      output,
    });
  } catch (error) {
    console.error('LLM API error:', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
