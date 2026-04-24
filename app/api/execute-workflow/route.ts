import { NextRequest, NextResponse } from 'next/server';
import { WorkflowExecutor } from '@/lib/workflowExecutor';
import { validateWorkflow } from '@/lib/workflowValidation';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workflow, input, workflowId, apiKeys, memoryMessages, oboTokens } = body;

    if (!workflow || !input) {
      return NextResponse.json(
        { success: false, error: 'Missing workflow or input' },
        { status: 400 }
      );
    }

    // Validate workflow
    const validation = validateWorkflow(workflow);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid workflow: ${validation.errors.join(', ')}`,
        },
        { status: 400 }
      );
    }

    console.log('Executing workflow:', workflowId);

    // Execute workflow
    const executor = new WorkflowExecutor(
      workflow,
      input,
      workflowId || 'temp',
      apiKeys || {},
      request.nextUrl.origin,
      Array.isArray(memoryMessages) ? memoryMessages : [],
      oboTokens && typeof oboTokens === 'object' ? oboTokens : {}
    );
    const result = await executor.execute();

    console.log('Workflow execution result:', {
      success: result.success,
      hasError: !!result.error,
      executionTime: result.executionTime,
    });

    return NextResponse.json({
      success: result.success,
      output: result.output,
      error: result.error,
      executionTime: result.executionTime,
    });
  } catch (error) {
    console.error('Workflow API error:', error);

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
