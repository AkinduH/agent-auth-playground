import { Workflow, ChatMessage, AgentCredential, LLMCredential } from './types';

const WORKFLOWS_KEY = 'workflows';
const CURRENT_WORKFLOW_KEY = 'currentWorkflow';
const WORKFLOW_MEMORY_KEY = 'workflowMemories';
const OBO_TOKENS_KEY = 'oboTokens';
const MCP_TOOLS_KEY = 'mcpDiscoveredTools';
const AGENT_CREDENTIALS_KEY = 'agentCredentials';
const LLM_CREDENTIALS_KEY = 'llmCredentials';

type OBOTokenEntry = { accessToken: string; expiresAt: number };
type OBOTokenStore = Record<string, OBOTokenEntry>;

type WorkflowMemoryStore = Record<string, Record<string, ChatMessage[]>>;

export interface StoredMCPTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface MCPToolsEntry {
  endpoint: string;
  tools: StoredMCPTool[];
  discoveredAt: number;
}

type MCPToolsStore = Record<string, Record<string, MCPToolsEntry>>;

// Client-side storage utilities
export const workflowStore = {
  // Workflow management
  saveWorkflow(workflow: Workflow): void {
    if (typeof window === 'undefined') return;
    
    const workflows = this.getAllWorkflows();
    const index = workflows.findIndex(w => w.id === workflow.id);
    
    if (index >= 0) {
      workflows[index] = workflow;
    } else {
      workflows.push(workflow);
    }
    
    localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(workflows));
    this.setCurrentWorkflow(workflow.id);
  },

  getAllWorkflows(): Workflow[] {
    if (typeof window === 'undefined') return [];
    
    const stored = localStorage.getItem(WORKFLOWS_KEY);
    return stored ? JSON.parse(stored) : [];
  },

  getWorkflow(id: string): Workflow | null {
    const workflows = this.getAllWorkflows();
    return workflows.find(w => w.id === id) || null;
  },

  // Current workflow
  setCurrentWorkflow(id: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CURRENT_WORKFLOW_KEY, id);
  },

  getCurrentWorkflow(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(CURRENT_WORKFLOW_KEY);
  },

  // Workflow memory by workflowId -> memoryNodeId -> chat messages
  getWorkflowMemory(workflowId: string, memoryNodeId: string): ChatMessage[] {
    if (typeof window === 'undefined') return [];

    const stored = localStorage.getItem(WORKFLOW_MEMORY_KEY);
    const allMemory: WorkflowMemoryStore = stored ? JSON.parse(stored) : {};
    return allMemory[workflowId]?.[memoryNodeId] || [];
  },

  appendWorkflowMemory(
    workflowId: string,
    memoryNodeId: string,
    messages: ChatMessage[],
    maxMessages: number
  ): ChatMessage[] {
    if (typeof window === 'undefined') return [];

    const normalizedMax = Math.max(1, Math.floor(maxMessages || 1));
    const existing = this.getWorkflowMemory(workflowId, memoryNodeId);
    const next = [...existing, ...messages].slice(-normalizedMax);

    const stored = localStorage.getItem(WORKFLOW_MEMORY_KEY);
    const allMemory: WorkflowMemoryStore = stored ? JSON.parse(stored) : {};
    const workflowMemory = allMemory[workflowId] || {};

    allMemory[workflowId] = {
      ...workflowMemory,
      [memoryNodeId]: next,
    };

    localStorage.setItem(WORKFLOW_MEMORY_KEY, JSON.stringify(allMemory));
    return next;
  },

  clearWorkflowMemory(workflowId: string, memoryNodeId: string): void {
    if (typeof window === 'undefined') return;

    const stored = localStorage.getItem(WORKFLOW_MEMORY_KEY);
    if (!stored) return;

    const allMemory: WorkflowMemoryStore = JSON.parse(stored);
    if (!allMemory[workflowId]) return;

    delete allMemory[workflowId][memoryNodeId];

    if (Object.keys(allMemory[workflowId]).length === 0) {
      delete allMemory[workflowId];
    }

    localStorage.setItem(WORKFLOW_MEMORY_KEY, JSON.stringify(allMemory));
  },

  clearWorkflowMemories(workflowId: string): void {
    if (typeof window === 'undefined') return;

    const stored = localStorage.getItem(WORKFLOW_MEMORY_KEY);
    if (!stored) return;

    const allMemory: WorkflowMemoryStore = JSON.parse(stored);
    delete allMemory[workflowId];
    localStorage.setItem(WORKFLOW_MEMORY_KEY, JSON.stringify(allMemory));
  },

  // OBO token management — keyed by `${workflowId}_${nodeId}`
  getOBOToken(workflowId: string, nodeId: string): string | null {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem(OBO_TOKENS_KEY);
    if (!stored) return null;
    const store: OBOTokenStore = JSON.parse(stored);
    const entry = store[`${workflowId}_${nodeId}`];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) return null;
    return entry.accessToken;
  },

  setOBOToken(workflowId: string, nodeId: string, accessToken: string, expiresIn: number): void {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(OBO_TOKENS_KEY);
    const store: OBOTokenStore = stored ? JSON.parse(stored) : {};
    store[`${workflowId}_${nodeId}`] = {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    localStorage.setItem(OBO_TOKENS_KEY, JSON.stringify(store));
  },

  clearOBOTokens(workflowId: string): void {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(OBO_TOKENS_KEY);
    if (!stored) return;
    const store: OBOTokenStore = JSON.parse(stored);
    const prefix = `${workflowId}_`;
    for (const key of Object.keys(store)) {
      if (key.startsWith(prefix)) delete store[key];
    }
    localStorage.setItem(OBO_TOKENS_KEY, JSON.stringify(store));
  },

  // MCP discovered tools — keyed by workflowId -> mcpClientNodeId -> entry
  getMCPTools(workflowId: string, nodeId: string): MCPToolsEntry | null {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem(MCP_TOOLS_KEY);
    if (!stored) return null;
    const store: MCPToolsStore = JSON.parse(stored);
    return store[workflowId]?.[nodeId] || null;
  },

  setMCPTools(workflowId: string, nodeId: string, entry: MCPToolsEntry): void {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(MCP_TOOLS_KEY);
    const store: MCPToolsStore = stored ? JSON.parse(stored) : {};
    const workflowEntries = store[workflowId] || {};
    workflowEntries[nodeId] = entry;
    store[workflowId] = workflowEntries;
    localStorage.setItem(MCP_TOOLS_KEY, JSON.stringify(store));
  },

  clearMCPTools(workflowId: string, nodeId: string): void {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(MCP_TOOLS_KEY);
    if (!stored) return;
    const store: MCPToolsStore = JSON.parse(stored);
    if (!store[workflowId]) return;
    delete store[workflowId][nodeId];
    if (Object.keys(store[workflowId]).length === 0) {
      delete store[workflowId];
    }
    localStorage.setItem(MCP_TOOLS_KEY, JSON.stringify(store));
  },

  clearAllMCPTools(workflowId: string): void {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(MCP_TOOLS_KEY);
    if (!stored) return;
    const store: MCPToolsStore = JSON.parse(stored);
    if (!store[workflowId]) return;
    delete store[workflowId];
    localStorage.setItem(MCP_TOOLS_KEY, JSON.stringify(store));
  },

  // Agent credential management — stored globally, not per-workflow
  getAgentCredentials(): AgentCredential[] {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(AGENT_CREDENTIALS_KEY);
    return stored ? JSON.parse(stored) : [];
  },

  saveAgentCredential(cred: AgentCredential): void {
    if (typeof window === 'undefined') return;
    const creds = this.getAgentCredentials();
    const idx = creds.findIndex((c) => c.id === cred.id);
    if (idx >= 0) {
      creds[idx] = cred;
    } else {
      creds.push(cred);
    }
    localStorage.setItem(AGENT_CREDENTIALS_KEY, JSON.stringify(creds));
  },

  deleteAgentCredential(id: string): void {
    if (typeof window === 'undefined') return;
    const creds = this.getAgentCredentials().filter((c) => c.id !== id);
    localStorage.setItem(AGENT_CREDENTIALS_KEY, JSON.stringify(creds));
  },

  // LLM credential management — stored globally, not per-workflow
  getLLMCredentials(): LLMCredential[] {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(LLM_CREDENTIALS_KEY);
    return stored ? JSON.parse(stored) : [];
  },

  saveLLMCredential(cred: LLMCredential): void {
    if (typeof window === 'undefined') return;
    const creds = this.getLLMCredentials();
    const idx = creds.findIndex((c) => c.id === cred.id);
    if (idx >= 0) {
      creds[idx] = cred;
    } else {
      creds.push(cred);
    }
    localStorage.setItem(LLM_CREDENTIALS_KEY, JSON.stringify(creds));
  },

  deleteLLMCredential(id: string): void {
    if (typeof window === 'undefined') return;
    const creds = this.getLLMCredentials().filter((c) => c.id !== id);
    localStorage.setItem(LLM_CREDENTIALS_KEY, JSON.stringify(creds));
  },
};

// Generate unique IDs
export function generateId(prefix: string = ''): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Create default workflow
export function createDefaultWorkflow(name: string = 'Workflow-1'): Workflow {
  const id = generateId('workflow-');
  return {
    id,
    name,
    nodes: [],
    edges: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
