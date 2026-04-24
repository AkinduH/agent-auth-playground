import { ChatMessage, AIAgentNodeData } from '../types';
import { MCPToolCallResult } from '../mcpClientNode';
import { AgentDecision } from './types';

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export function formatMemoryMessages(memoryMessages: ChatMessage[]): string {
  if (!memoryMessages || memoryMessages.length === 0) return '(no saved memory)';

  return memoryMessages
    .slice(-16)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');
}

export function getAgentStepLimit(data: AIAgentNodeData): number {
  const value = data.maxToolSteps ?? 6;
  if (!Number.isFinite(value)) return 6;
  return Math.min(12, Math.max(1, Math.floor(value)));
}

export function normalizeToolName(value: string): string {
  let normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) normalized = 'tool';
  if (!/^[a-z_]/.test(normalized)) normalized = `tool_${normalized}`;

  return normalized.slice(0, 64);
}

export function ensureUniqueToolName(baseName: string, usedNames: Set<string>): string {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }

  let index = 2;
  while (index < 1000) {
    const suffix = `_${index}`;
    const candidate = `${baseName.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    index += 1;
  }

  throw new Error('Unable to create a unique function name for MCP tool mapping.');
}

export function normalizeInputSchema(
  inputSchema: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (inputSchema && typeof inputSchema === 'object' && inputSchema.type === 'object') {
    return inputSchema;
  }
  return { type: 'object', properties: {} };
}

export function stringifyToolResult(toolResult: MCPToolCallResult): string {
  const textContent = toolResult.content?.trim();
  if (textContent) return textContent;
  if (toolResult.structuredContent) return JSON.stringify(toolResult.structuredContent);
  return JSON.stringify(toolResult.raw);
}

export function parseJsonObject(value: string): unknown {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace <= firstBrace) return null;
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

export function parseAgentDecision(rawDecision: string): AgentDecision | null {
  const parsed = parseJsonObject(rawDecision);
  if (!parsed || typeof parsed !== 'object') return null;

  const r = parsed as Record<string, unknown>;

  if (r.type === 'final' && typeof r.response === 'string') {
    return { type: 'final', response: r.response };
  }

  if (r.type === 'tool' && typeof r.name === 'string') {
    const rawArgs = r.arguments;
    const args =
      rawArgs && typeof rawArgs === 'object' ? (rawArgs as Record<string, unknown>) : {};
    return { type: 'tool', name: r.name, arguments: args };
  }

  return null;
}
