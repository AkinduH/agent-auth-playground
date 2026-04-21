import { Workflow, ChatMessage } from './types';

const WORKFLOWS_KEY = 'workflows';
const CURRENT_WORKFLOW_KEY = 'currentWorkflow';
const CHAT_HISTORY_KEY = 'chatHistory';
const API_KEYS_KEY = 'apiKeys';

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

  deleteWorkflow(id: string): void {
    if (typeof window === 'undefined') return;
    
    const workflows = this.getAllWorkflows();
    const filtered = workflows.filter(w => w.id !== id);
    localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(filtered));
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

  // Chat history
  saveChatMessage(message: ChatMessage): void {
    if (typeof window === 'undefined') return;
    
    const history = this.getChatHistory();
    history.push(message);
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
  },

  getChatHistory(): ChatMessage[] {
    if (typeof window === 'undefined') return [];
    
    const stored = localStorage.getItem(CHAT_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  },

  clearChatHistory(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(CHAT_HISTORY_KEY);
  },

  // API key management
  setApiKey(provider: 'gemini' | 'openai', key: string): void {
    if (typeof window === 'undefined') return;
    
    const keys = this.getApiKeys();
    keys[provider] = key;
    localStorage.setItem(API_KEYS_KEY, JSON.stringify(keys));
  },

  getApiKey(provider: 'gemini' | 'openai'): string | null {
    if (typeof window === 'undefined') return null;    
    const stored = localStorage.getItem(API_KEYS_KEY);
    const keys = stored ? JSON.parse(stored) : {};
    return keys[provider] || null;
  },

  getApiKeys(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    
    const stored = localStorage.getItem(API_KEYS_KEY);
    return stored ? JSON.parse(stored) : {};
  },

  deleteApiKey(provider: 'gemini' | 'openai'): void {
    if (typeof window === 'undefined') return;
    
    const keys = this.getApiKeys();
    delete keys[provider];
    localStorage.setItem(API_KEYS_KEY, JSON.stringify(keys));
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
