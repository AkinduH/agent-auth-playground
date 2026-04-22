import { Workflow, MCPClientNodeData } from './types';

export function validateWorkflow(workflow: Workflow): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!workflow.nodes || workflow.nodes.length === 0) {
    errors.push('Workflow must contain at least one node');
  }

  const hasTrigger = workflow.nodes.some((node) => node.type === 'chatTrigger');
  if (!hasTrigger) {
    errors.push('Workflow must contain a Chat Trigger node');
  }

  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const nodesWithEdges = new Set<string>();

  for (const edge of workflow.edges) {
    nodesWithEdges.add(edge.source);
    nodesWithEdges.add(edge.target);

    if (!nodesById.has(edge.source)) {
      errors.push(`Edge ${edge.id} references a missing source node.`);
    }

    if (!nodesById.has(edge.target)) {
      errors.push(`Edge ${edge.id} references a missing target node.`);
    }
  }

  for (const node of workflow.nodes) {
    if (node.type !== 'chatTrigger' && !nodesWithEdges.has(node.id)) {
      errors.push(`Node ${node.data.label} is not connected to the workflow`);
    }

    if (node.type === 'mcpClient') {
      const data = node.data as MCPClientNodeData;
      if (!data.mcpServerEndpoint?.trim()) {
        errors.push(`MCP Client node ${node.id} requires a server endpoint`);
      }
    }

    if (node.type === 'aiAgent') {
      const hasConnectedLLM = workflow.edges.some(
        (edge) => edge.source === node.id && nodesById.get(edge.target)?.type === 'llm'
      );

      if (!hasConnectedLLM) {
        errors.push(`AI Agent node ${node.id} must connect to an AI Service node`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
