import { WorkflowNode, Workflow } from '../types';

export async function executeChatTrigger(
  node: WorkflowNode,
  workflow: Workflow,
  currentInput: string,
  executeNode: (nodeId: string) => Promise<string>
): Promise<string> {
  console.log(`[ChatTrigger:${node.id}] Received input: "${currentInput}"`);

  const connectedEdges = workflow.edges.filter((e) => e.source === node.id);

  if (connectedEdges.length === 0) {
    return currentInput;
  }

  return executeNode(connectedEdges[0].target);
}
