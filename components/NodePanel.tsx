'use client';

import { useState, useEffect, useRef } from 'react';
import {
  WorkflowNode,
  AIAgentNodeData,
  LLMNodeData,
  MCPClientNodeData,
  Workflow,
  AgentCredential,
  LLMCredential,
  LLMCredentialProvider,
} from '@/lib/types';
import { workflowStore } from '@/lib/workflowStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface NodePanelProps {
  node: WorkflowNode | null;
  onUpdate: (nodeId: string, updates: Partial<WorkflowNode>) => void;
  workflowId?: string;
  workflow?: Workflow | null;
  variant?: 'sidebar' | 'modal';
  onMCPInitChange?: () => void;
}

function findConnectedAgentCreds(
  workflow: Workflow | null | undefined,
  mcpNodeId: string,
  credentials: AgentCredential[]
): { agentId?: string; agentSecret?: string } | null {
  if (!workflow) return null;
  const edge = workflow.edges.find((e) => e.target === mcpNodeId);
  if (!edge) return null;
  const agent = workflow.nodes.find((n) => n.id === edge.source && n.type === 'aiAgent');
  if (!agent) return null;
  const data = agent.data as AIAgentNodeData;
  if (data.agentCredentialId) {
    const cred = credentials.find((c) => c.id === data.agentCredentialId);
    if (cred) return { agentId: cred.agentId, agentSecret: cred.agentSecret };
  }
  // Fallback for data saved before credential sets were introduced
  const legacy = agent.data as Record<string, unknown>;
  return { agentId: legacy.agentId as string | undefined, agentSecret: legacy.agentSecret as string | undefined };
}

export default function NodePanel({
  node,
  onUpdate,
  workflowId,
  workflow,
  variant = 'sidebar',
  onMCPInitChange,
}: NodePanelProps) {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [memoryCount, setMemoryCount] = useState(0);
  const [mcpInitInfo, setMcpInitInfo] = useState<{
    count: number;
    discoveredAt: number;
  } | null>(null);
  const [mcpInitLoading, setMcpInitLoading] = useState(false);
  const [mcpInitError, setMcpInitError] = useState<string | null>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelInputValue, setModelInputValue] = useState('');
  const modelComboboxRef = useRef<HTMLDivElement>(null);
  const [agentTokenModalOpen, setAgentTokenModalOpen] = useState(false);
  const [agentToken, setAgentToken] = useState<string | null>(null);
  const [agentTokenLoading, setAgentTokenLoading] = useState(false);
  const [agentTokenError, setAgentTokenError] = useState<string | null>(null);
  const [agentTokenCopied, setAgentTokenCopied] = useState(false);

  const [credentials, setCredentials] = useState<AgentCredential[]>([]);
  const [credFormOpen, setCredFormOpen] = useState(false);
  const [credEditingId, setCredEditingId] = useState<string | null>(null);
  const [credForm, setCredForm] = useState({ name: '', agentId: '', agentSecret: '', agentBaseUrl: '', agentAppClientId: '' });
  const [credFormError, setCredFormError] = useState<string | null>(null);

  const [llmCredentials, setLLMCredentials] = useState<LLMCredential[]>([]);
  const [llmCredFormOpen, setLLMCredFormOpen] = useState(false);
  const [llmCredEditingId, setLLMCredEditingId] = useState<string | null>(null);
  const [llmCredForm, setLLMCredForm] = useState({ name: '', apiKey: '', gcpAccessToken: '', gcpProjectId: '', azureResourceName: '', azureDeploymentName: '', azureApiVersion: '' });
  const [llmCredFormError, setLLMCredFormError] = useState<string | null>(null);

  useEffect(() => {
    if (workflowId && node?.type === 'aiAgent') {
      setMemoryCount(workflowStore.getWorkflowMemory(workflowId, node.id).length);
    }
  }, [workflowId, node?.id, node?.type]);

  useEffect(() => {
    setMcpInitError(null);
    if (workflowId && node?.type === 'mcpClient') {
      const entry = workflowStore.getMCPTools(workflowId, node.id);
      setMcpInitInfo(
        entry ? { count: entry.tools.length, discoveredAt: entry.discoveredAt } : null
      );
    } else {
      setMcpInitInfo(null);
    }
  }, [workflowId, node?.id, node?.type]);

  useEffect(() => {
    if (node?.type !== 'mcpClient') return;
    const mcpData = node.data as MCPClientNodeData;
    if (mcpData.useOAuth2 && (mcpData.oauth2Flow ?? 'agent') === 'agent') {
      const origin = window.location.origin;
      if (mcpData.oauth2RedirectUri !== origin) {
        onUpdate(node.id, { data: { ...mcpData, oauth2RedirectUri: origin } });
      }
    }
  }, [node, onUpdate]);

  const runMCPInit = async (mcpData: MCPClientNodeData, nodeId: string) => {
    if (!workflowId) return;
    const endpoint = mcpData.mcpServerEndpoint?.trim();
    if (!endpoint) {
      setMcpInitError('Add an MCP server endpoint above before initializing.');
      return;
    }

    let oauth2Body: Record<string, string> | undefined;
    if (mcpData.useOAuth2) {
      const baseUrl = mcpData.oauth2BaseUrl?.trim();
      const clientId = mcpData.oauth2ClientId?.trim();
      const redirectUri = window.location.origin;
      if (!baseUrl || !clientId || !redirectUri) {
        setMcpInitError(
          'OAuth2 is enabled but Base URL, Client ID, or Redirect URI is missing.'
        );
        return;
      }
      const agentCreds = findConnectedAgentCreds(workflow, nodeId, credentials);
      if (!agentCreds || !agentCreds.agentId?.trim() || !agentCreds.agentSecret?.trim()) {
        setMcpInitError(
          'Agent ID and Secret are required on the connected AI Agent node for OAuth2 init.'
        );
        return;
      }
      oauth2Body = {
        flow: mcpData.oauth2Flow ?? 'agent',
        baseUrl,
        clientId,
        redirectUri,
        scope: mcpData.oauth2Scope ?? '',
        agentId: agentCreds.agentId,
        agentSecret: agentCreds.agentSecret,
      };
    }

    setMcpInitLoading(true);
    setMcpInitError(null);
    try {
      const res = await fetch('/api/initialize-mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, oauth2: oauth2Body }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || `Initialization failed (${res.status})`);
      }
      const tools = Array.isArray(data.tools) ? data.tools : [];
      const discoveredAt = Date.now();
      workflowStore.setMCPTools(workflowId, nodeId, { endpoint, tools, discoveredAt });
      setMcpInitInfo({ count: tools.length, discoveredAt });
      onMCPInitChange?.();
    } catch (err) {
      setMcpInitError(err instanceof Error ? err.message : 'Initialization failed.');
    } finally {
      setMcpInitLoading(false);
    }
  };

  const clearMCPInit = (nodeId: string) => {
    if (!workflowId) return;
    workflowStore.clearMCPTools(workflowId, nodeId);
    setMcpInitInfo(null);
    setMcpInitError(null);
    onMCPInitChange?.();
  };

  const checkAgentToken = async (cred: AgentCredential) => {
    setAgentTokenLoading(true);
    setAgentTokenError(null);
    try {
      const res = await fetch('/api/check-agent-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: cred.agentBaseUrl,
          clientId: cred.agentAppClientId,
          agentId: cred.agentId,
          agentSecret: cred.agentSecret,
          redirectUri: window.location.origin,
          scope: 'openid',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.token) {
        throw new Error(json.error || 'Failed to fetch agent token');
      }
      setAgentToken(json.token);
      setAgentTokenModalOpen(true);
    } catch (err) {
      setAgentTokenError(err instanceof Error ? err.message : 'Failed to fetch agent token');
    } finally {
      setAgentTokenLoading(false);
    }
  };

  const openAddCredModal = () => {
    setCredForm({ name: '', agentId: '', agentSecret: '', agentBaseUrl: '', agentAppClientId: '' });
    setCredEditingId(null);
    setCredFormError(null);
    setCredFormOpen(true);
  };

  const openEditCredModal = (cred: AgentCredential) => {
    setCredForm({ name: cred.name, agentId: cred.agentId, agentSecret: cred.agentSecret, agentBaseUrl: cred.agentBaseUrl, agentAppClientId: cred.agentAppClientId });
    setCredEditingId(cred.id);
    setCredFormError(null);
    setCredFormOpen(true);
  };

  const saveCredential = () => {
    if (!credForm.name.trim() || !credForm.agentId.trim() || !credForm.agentSecret.trim() || !credForm.agentBaseUrl.trim() || !credForm.agentAppClientId.trim()) {
      setCredFormError('All fields are required.');
      return;
    }
    const cred: AgentCredential = {
      id: credEditingId ?? `cred-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: credForm.name.trim(),
      agentId: credForm.agentId.trim(),
      agentSecret: credForm.agentSecret,
      agentBaseUrl: credForm.agentBaseUrl.trim(),
      agentAppClientId: credForm.agentAppClientId.trim(),
    };
    workflowStore.saveAgentCredential(cred);
    const updated = workflowStore.getAgentCredentials();
    setCredentials(updated);
    setCredFormOpen(false);
  };

  const deleteCredential = (id: string) => {
    workflowStore.deleteAgentCredential(id);
    setCredentials(workflowStore.getAgentCredentials());
    setCredFormOpen(false);
    // Clear the selection on any node currently using this credential
    if (node?.type === 'aiAgent') {
      const agentData = node.data as AIAgentNodeData;
      if (agentData.agentCredentialId === id) {
        onUpdate(node.id, { data: { ...agentData, agentCredentialId: undefined } });
      }
    }
  };

  // Derive which LLM credential bucket to use based on provider + auth type
  function llmCredProvider(provider: string, geminiAuthType?: string): LLMCredentialProvider {
    if (provider === 'gemini') return geminiAuthType === 'gcp-access-token' ? 'gcp' : 'gemini';
    return provider as LLMCredentialProvider;
  }

  const openAddLLMCredForm = () => {
    setLLMCredForm({ name: '', apiKey: '', gcpAccessToken: '', gcpProjectId: '', azureResourceName: '', azureDeploymentName: '', azureApiVersion: '' });
    setLLMCredEditingId(null);
    setLLMCredFormError(null);
    setLLMCredFormOpen(true);
  };

  const openEditLLMCredForm = (cred: LLMCredential) => {
    setLLMCredForm({ name: cred.name, apiKey: cred.apiKey ?? '', gcpAccessToken: cred.gcpAccessToken ?? '', gcpProjectId: cred.gcpProjectId ?? '', azureResourceName: cred.azureResourceName ?? '', azureDeploymentName: cred.azureDeploymentName ?? '', azureApiVersion: cred.azureApiVersion ?? '' });
    setLLMCredEditingId(cred.id);
    setLLMCredFormError(null);
    setLLMCredFormOpen(true);
  };

  const applyLLMCredential = (cred: LLMCredential, llmData: LLMNodeData) => {
    // Write into the existing global API key store so the executor needs no changes
    if (cred.provider === 'gemini') {
      workflowStore.setApiKey('gemini', cred.apiKey ?? '');
      setApiKeys((p) => ({ ...p, gemini: cred.apiKey ?? '' }));
    } else if (cred.provider === 'gcp') {
      workflowStore.setApiKey('gcpAccessToken', cred.gcpAccessToken ?? '');
      workflowStore.setApiKey('gcpProjectId', cred.gcpProjectId ?? '');
      setApiKeys((p) => ({ ...p, gcpAccessToken: cred.gcpAccessToken ?? '', gcpProjectId: cred.gcpProjectId ?? '' }));
    } else if (cred.provider === 'anthropic') {
      workflowStore.setApiKey('anthropic', cred.apiKey ?? '');
      setApiKeys((p) => ({ ...p, anthropic: cred.apiKey ?? '' }));
    } else if (cred.provider === 'openai') {
      workflowStore.setApiKey('openai', cred.apiKey ?? '');
      setApiKeys((p) => ({ ...p, openai: cred.apiKey ?? '' }));
    } else if (cred.provider === 'azure-openai') {
      workflowStore.setApiKey('azure-openai', cred.apiKey ?? '');
      setApiKeys((p) => ({ ...p, 'azure-openai': cred.apiKey ?? '' }));
    }
    // Write Azure config fields into node data (executor reads from there)
    const nodeUpdates: Partial<LLMNodeData> = { llmCredentialId: cred.id };
    if (cred.provider === 'azure-openai') {
      nodeUpdates.azureResourceName = cred.azureResourceName;
      nodeUpdates.azureDeploymentName = cred.azureDeploymentName;
      nodeUpdates.azureApiVersion = cred.azureApiVersion;
    }
    if (node) onUpdate(node.id, { data: { ...llmData, ...nodeUpdates } });
  };

  const saveLLMCredential = (credType: LLMCredentialProvider, llmData: LLMNodeData) => {
    const f = llmCredForm;
    const isGCP = credType === 'gcp';
    const isAzure = credType === 'azure-openai';
    if (!f.name.trim()) { setLLMCredFormError('Name is required.'); return; }
    if (isGCP && (!f.gcpAccessToken.trim() || !f.gcpProjectId.trim())) { setLLMCredFormError('Access token and project ID are required.'); return; }
    if (isAzure && (!f.azureResourceName.trim() || !f.azureDeploymentName.trim() || !f.azureApiVersion.trim() || !f.apiKey.trim())) { setLLMCredFormError('All Azure fields are required.'); return; }
    if (!isGCP && !isAzure && !f.apiKey.trim()) { setLLMCredFormError('API key is required.'); return; }

    const cred: LLMCredential = {
      id: llmCredEditingId ?? `llmcred-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: f.name.trim(),
      provider: credType,
      ...(isGCP ? { gcpAccessToken: f.gcpAccessToken, gcpProjectId: f.gcpProjectId } : {}),
      ...(isAzure ? { azureResourceName: f.azureResourceName.trim(), azureDeploymentName: f.azureDeploymentName.trim(), azureApiVersion: f.azureApiVersion.trim(), apiKey: f.apiKey } : {}),
      ...(!isGCP && !isAzure ? { apiKey: f.apiKey } : {}),
    };
    workflowStore.saveLLMCredential(cred);
    const updated = workflowStore.getLLMCredentials();
    setLLMCredentials(updated);
    setLLMCredFormOpen(false);
    applyLLMCredential(cred, llmData);
  };

  const deleteLLMCredential = (id: string, llmData: LLMNodeData) => {
    workflowStore.deleteLLMCredential(id);
    setLLMCredentials(workflowStore.getLLMCredentials());
    setLLMCredFormOpen(false);
    if (llmData.llmCredentialId === id && node) {
      onUpdate(node.id, { data: { ...llmData, llmCredentialId: undefined } });
    }
  };

  const providerModels: Record<string, string[]> = {
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
    'azure-openai': [],
  };

  useEffect(() => {
    setApiKeys(workflowStore.getApiKeys());
    setCredentials(workflowStore.getAgentCredentials());
    setLLMCredentials(workflowStore.getLLMCredentials());
  }, []);

  const containerClassName =
    variant === 'modal'
      ? 'w-full bg-white overflow-hidden flex flex-col max-h-[80vh]'
      : 'w-80 bg-white border-l border-gray-200 p-6 overflow-y-auto';

  const emptyStateClassName =
    variant === 'modal'
      ? 'w-full min-h-72 bg-gray-50 p-6 flex flex-col items-center justify-center text-gray-500'
      : 'w-80 bg-gray-50 border-l border-gray-200 p-6 flex flex-col items-center justify-center text-gray-500';

  if (!node) {
    return (
      <div className={emptyStateClassName}>
        <div className="text-center">
          <p className="font-semibold mb-2">No node selected</p>
          <p className="text-sm">Click a node to configure it</p>
        </div>
      </div>
    );
  }

  const handleApiKeyChange = (provider: 'gemini' | 'openai' | 'anthropic' | 'azure-openai' | 'gcpAccessToken' | 'gcpProjectId', key: string) => {
    workflowStore.setApiKey(provider, key);
    setApiKeys((prev) => ({ ...prev, [provider]: key }));
  };

  const renderNodeConfig = () => {
    switch (node.type) {
      case 'chatTrigger':
        return (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">
                About
              </p>
              <p className="text-sm text-gray-600">
                This node receives messages from the chat interface and passes
                them to the next node in the workflow.
              </p>
            </div>
          </div>
        );

      case 'aiAgent':
        const agentData = node.data as AIAgentNodeData;
        return (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">
                Agent Name
              </label>
              <Input
                value={agentData.agentName || ''}
                onChange={(e) =>
                  onUpdate(node.id, {
                    data: { ...agentData, agentName: e.target.value },
                  })
                }
                placeholder="Enter agent name"
              />
            </div>

            {/* Credential selector row */}
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">
                Agent Credentials
              </label>
              {(() => {
                const selectedCred = credentials.find((c) => c.id === agentData.agentCredentialId);
                return (
                  <>
                    <div className="flex gap-2">
                      <select
                        value={agentData.agentCredentialId || ''}
                        onChange={(e) => {
                          setCredFormOpen(false);
                          onUpdate(node.id, {
                            data: { ...agentData, agentCredentialId: e.target.value || undefined },
                          });
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="">Select credentials</option>
                        {credentials.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      {selectedCred && (
                        <button
                          type="button"
                          title="Edit credential"
                          onClick={() => openEditCredModal(selectedCred)}
                          className="flex items-center justify-center px-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={openAddCredModal}
                      >
                        + Add
                      </Button>
                    </div>
                    {credentials.length === 0 && !credFormOpen && (
                      <p className="text-xs text-gray-500 mt-1">
                        No credentials saved yet. Click + Add to create one.
                      </p>
                    )}
                    {!credFormOpen && selectedCred && (
                      <div className="mt-2 flex flex-col gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={agentTokenLoading}
                          onClick={() => checkAgentToken(selectedCred)}
                        >
                          {agentTokenLoading ? 'Fetching...' : 'Test Fetching an Agent Token'}
                        </Button>
                        {agentTokenError && (
                          <p className="text-xs text-red-600">{agentTokenError}</p>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Inline credential form (add or edit) */}
            {credFormOpen && (
              <div className="rounded-md border border-blue-200 bg-white p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-800">
                    {credEditingId ? 'Edit Credential' : 'New Credential'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCredFormOpen(false)}
                    className="text-gray-400 hover:text-gray-600 text-base leading-none"
                  >
                    ✕
                  </button>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">Name</label>
                  <Input
                    value={credForm.name}
                    onChange={(e) => setCredForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Travel Agent – Dev"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">Agent ID</label>
                  <Input
                    value={credForm.agentId}
                    onChange={(e) => setCredForm((f) => ({ ...f, agentId: e.target.value }))}
                    placeholder="e.g. f79d600c-e92c-4b58-..."
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">Agent Secret</label>
                  <Input
                    type="password"
                    value={credForm.agentSecret}
                    onChange={(e) => setCredForm((f) => ({ ...f, agentSecret: e.target.value }))}
                    placeholder="Enter agent secret"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">Base URL</label>
                  <Input
                    value={credForm.agentBaseUrl}
                    onChange={(e) => setCredForm((f) => ({ ...f, agentBaseUrl: e.target.value }))}
                    placeholder="https://api.asgardeo.io/t/your-org or https://localhost:9443"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">
                    Agent Application Client ID
                  </label>
                  <Input
                    value={credForm.agentAppClientId}
                    onChange={(e) => setCredForm((f) => ({ ...f, agentAppClientId: e.target.value }))}
                    placeholder="Enter client ID"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Make sure you enable PKCE and public client in the application.
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">Redirect URI</label>
                  <Input
                    value={window.location.origin}
                    readOnly
                    className="bg-white text-gray-500 cursor-not-allowed"
                  />
                </div>
                {credFormError && (
                  <p className="text-xs text-red-600">{credFormError}</p>
                )}
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={saveCredential}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setCredFormOpen(false)}>
                    Cancel
                  </Button>
                  {credEditingId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="ml-auto text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => deleteCredential(credEditingId)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            )}


            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">
                System Prompt
              </label>
              <Textarea
                value={agentData.systemPrompt || ''}
                onChange={(e) =>
                  onUpdate(node.id, {
                    data: { ...agentData, systemPrompt: e.target.value },
                  })
                }
                placeholder="Enter system prompt for the AI agent..."
                className="text-sm"
                rows={3}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">
                Max Tool Steps
              </label>
              <Input
                type="number"
                value={agentData.maxToolSteps || 6}
                onChange={(e) =>
                  onUpdate(node.id, {
                    data: {
                      ...agentData,
                      maxToolSteps: Math.max(1, parseInt(e.target.value, 10) || 6),
                    },
                  })
                }
                min="1"
                max="12"
              />
              <p className="text-xs text-gray-500 mt-1">
                Maximum number of MCP tool calls allowed before forcing a final answer.
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">
                Messages to Keep
              </label>
              <Input
                type="number"
                value={agentData.maxMessages || ''}
                onChange={(e) =>
                  onUpdate(node.id, {
                    data: {
                      ...agentData,
                      maxMessages: e.target.value === ''
                        ? undefined
                        : Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 1)),
                    },
                  })
                }
                min="1"
                max="100"
                placeholder="Disabled"
              />
              <p className="text-xs text-gray-500 mt-1">
                Number of recent chat messages to include as memory context. Leave empty to disable memory.
              </p>
            </div>

            {agentData.maxMessages && workflowId && (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="text-sm font-semibold text-gray-700 mb-1">Stored Messages</p>
                <p className="text-xs text-gray-600 mb-3">
                  {`${memoryCount} message${memoryCount === 1 ? '' : 's'} currently saved.`}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    workflowStore.clearWorkflowMemory(workflowId, node.id);
                    setMemoryCount(0);
                  }}
                  disabled={memoryCount === 0}
                >
                  Clear Memory
                </Button>
              </div>
            )}
          </div>
        );

      case 'mcpClient':
        const mcpData = node.data as MCPClientNodeData;
        return (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">
                MCP Server Name
              </label>
              <Input
                value={mcpData.name || ''}
                onChange={(e) =>
                  onUpdate(node.id, {
                    data: { ...mcpData, name: e.target.value },
                  })
                }
                placeholder="e.g. Bookings API"
              />
              <p className="text-xs text-gray-500 mt-1">
                Optional friendly label shown in the auth flow diagram instead of the node ID.
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">
                MCP Server Endpoint
              </label>
              <Input
                value={mcpData.mcpServerEndpoint || ''}
                onChange={(e) =>
                  onUpdate(node.id, {
                    data: {
                      ...mcpData,
                      mcpServerEndpoint: e.target.value,
                    },
                  })
                }
                placeholder="https://your-mcp-server.example.com/mcp"
              />
              <p className="text-xs text-gray-500 mt-1">
                Required. The AI Agent will connect here to discover and call tools dynamically.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 p-3">
              <div>
                <p className="text-sm font-semibold text-gray-700">Use MCP OAuth2</p>
                <p className="text-xs text-gray-500">
                  Authenticate with Asgardeo before connecting
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!mcpData.useOAuth2}
                onClick={() =>
                  onUpdate(node.id, {
                    data: { ...mcpData, useOAuth2: !mcpData.useOAuth2 },
                  })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  mcpData.useOAuth2 ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    mcpData.useOAuth2 ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {mcpData.useOAuth2 && (
              <div className="space-y-3">
                {/* Flow type selector */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">Auth Flow</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate(node.id, {
                          data: { ...mcpData, oauth2Flow: 'agent' },
                        })
                      }
                      className={`flex-1 py-2 px-3 text-sm rounded-md border transition-colors ${
                        (mcpData.oauth2Flow ?? 'agent') === 'agent'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      Agent Flow
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate(node.id, {
                          data: { ...mcpData, oauth2Flow: 'obo' },
                        })
                      }
                      className={`flex-1 py-2 px-3 text-sm rounded-md border transition-colors ${
                        mcpData.oauth2Flow === 'obo'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      OBO Flow
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {(mcpData.oauth2Flow ?? 'agent') === 'agent'
                      ? 'Agent authenticates using its own credentials (no user interaction).'
                      : 'Agent acts on behalf of a user — user consent is requested in the chat.'}
                  </p>
                </div>
              </div>
            )}

            {mcpData.useOAuth2 && (
              <div className="space-y-3 rounded-md border border-white-200 bg-white-50 p-3">
                <p className="text-xs font-semibold text-white-700 uppercase tracking-wide">
                  OAuth2 Configuration
                </p>

                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1 block">
                    Base URL
                  </label>
                  <Input
                    value={mcpData.oauth2BaseUrl || ''}
                    onChange={(e) =>
                      onUpdate(node.id, {
                        data: { ...mcpData, oauth2BaseUrl: e.target.value },
                      })
                    }
                    placeholder="https://api.asgardeo.io/t/your-org"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1 block">
                    Client ID
                  </label>
                  <Input
                    value={mcpData.oauth2ClientId || ''}
                    onChange={(e) =>
                      onUpdate(node.id, {
                        data: { ...mcpData, oauth2ClientId: e.target.value },
                      })
                    }
                    placeholder="vMH8K3zdIhlSiIDmmvnebNOI_bIa"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1 block">
                    Redirect URI
                  </label>
                  <Input
                    value={window.location.origin}
                    readOnly
                    className="bg-gray-50 text-gray-500 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1 block">
                    Scope
                    <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
                  </label>
                  <Input
                    value={mcpData.oauth2Scope || ''}
                    onChange={(e) =>
                      onUpdate(node.id, {
                        data: { ...mcpData, oauth2Scope: e.target.value },
                      })
                    }
                    placeholder="openid read_bookings write_bookings"
                  />
                </div>

                <p className="text-xs text-gray-500">
                  Agent ID and Secret are taken from the connected AI Agent node.
                  {(mcpData.oauth2Flow ?? 'agent') === 'obo' &&
                    ' For OBO flow, user consent will be requested in the chat before the first message is processed.'}
                </p>
              </div>
            )}

            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Initialization</p>
                  {mcpInitInfo ? (
                    <p className="text-xs text-gray-600">
                      {mcpInitInfo.count} tool{mcpInitInfo.count === 1 ? '' : 's'} cached &middot;{' '}
                      {new Date(mcpInitInfo.discoveredAt).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-xs text-red-600">
                      Not initialized. Tools must be discovered before this MCP client can be used in a chat.
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={mcpInitInfo ? 'outline' : 'default'}
                    disabled={mcpInitLoading || !workflowId}
                    onClick={() => runMCPInit(mcpData, node.id)}
                  >
                    {mcpInitLoading
                      ? 'Connecting...'
                      : mcpInitInfo
                      ? 'Re-discover'
                      : 'Initialize & Connect'}
                  </Button>
                  {mcpInitInfo && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={mcpInitLoading}
                      onClick={() => clearMCPInit(node.id)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              {mcpInitError && (
                <p className="text-xs text-red-600 mt-1">{mcpInitError}</p>
              )}
              <p className="text-xs text-gray-500">
                Tool schemas are cached locally. The agent only sees a <code>tool_search</code> meta-tool at chat time and pulls in matching schemas on demand.
              </p>
            </div>
          </div>
        );

      case 'llm':
        const llmData = node.data as LLMNodeData;
        const isGemini = llmData.provider === 'gemini';
        const isAzure = llmData.provider === 'azure-openai';
        const isGcpAuth = isGemini && llmData.geminiAuthType === 'gcp-access-token';

        const azureResourceName = llmData.azureResourceName || '';
        const azureDeploymentName = llmData.azureDeploymentName || '';
        const azureApiVersion = llmData.azureApiVersion || '';
        const azureEndpointPreview = isAzure
          ? `https://${azureResourceName || 'resource-name'}.openai.azure.com/openai/deployments/${azureDeploymentName || 'deployment-name'}/chat/completions?api-version=${azureApiVersion || 'api-version'}`
          : '';

        return (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">
                Provider
              </label>
              <select
                value={llmData.provider || ''}
                onChange={(e) =>
                  onUpdate(node.id, {
                    data: {
                      ...llmData,
                      provider: e.target.value as 'gemini' | 'openai' | 'anthropic' | 'azure-openai',
                      model: '',
                      geminiAuthType: undefined,
                      azureResourceName: undefined,
                      azureDeploymentName: undefined,
                      azureApiVersion: undefined,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="" disabled>Select a provider</option>
                <option value="gemini">Google Gemini</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="azure-openai">Azure OpenAI</option>
              </select>
            </div>

            {!isAzure && (
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1 block">
                  Model
                </label>
                <div className="relative" ref={modelComboboxRef}>
                  <input
                    type="text"
                    value={modelInputValue !== '' ? modelInputValue : (llmData.model || '')}
                    placeholder="Type or select a model…"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    onFocus={() => {
                      setModelInputValue(llmData.model || '');
                      setModelDropdownOpen(true);
                    }}
                    onChange={(e) => {
                      setModelInputValue(e.target.value);
                      setModelDropdownOpen(true);
                      onUpdate(node.id, { data: { ...llmData, model: e.target.value } });
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        setModelDropdownOpen(false);
                        setModelInputValue('');
                      }, 150);
                    }}
                  />
                  {modelDropdownOpen && (() => {
                    const query = modelInputValue.toLowerCase();
                    const suggestions = (providerModels[llmData.provider] ?? []).filter(
                      (m) => !query || m.toLowerCase().includes(query)
                    );
                    return suggestions.length > 0 ? (
                      <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto text-sm">
                        {suggestions.map((model) => (
                          <li
                            key={model}
                            className="px-3 py-2 cursor-pointer hover:bg-gray-100"
                            onMouseDown={() => {
                              onUpdate(node.id, { data: { ...llmData, model } });
                              setModelInputValue('');
                              setModelDropdownOpen(false);
                            }}
                          >
                            {model}
                          </li>
                        ))}
                      </ul>
                    ) : null;
                  })()}
                </div>
              </div>
            )}

            {isGemini && (
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1 block">
                  Authentication
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdate(node.id, {
                        data: { ...llmData, geminiAuthType: 'api-key' },
                      })
                    }
                    className={`flex-1 py-2 px-3 text-sm rounded-md border transition-colors ${
                      !isGcpAuth
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    Gemini API Key
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdate(node.id, {
                        data: { ...llmData, geminiAuthType: 'gcp-access-token' },
                      })
                    }
                    className={`flex-1 py-2 px-3 text-sm rounded-md border transition-colors ${
                      isGcpAuth
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    GCP Access Token
                  </button>
                </div>
              </div>
            )}

            {/* Credential section — shown once a provider is selected */}
            {llmData.provider && (() => {
              const credType = llmCredProvider(llmData.provider, llmData.geminiAuthType);
              const credLabel: Record<LLMCredentialProvider, string> = {
                gemini: 'Gemini Credentials',
                gcp: 'GCP Credentials',
                anthropic: 'Anthropic Credentials',
                openai: 'OpenAI Credentials',
                'azure-openai': 'Azure OpenAI Credentials',
              };
              const matching = llmCredentials.filter((c) => c.provider === credType);
              const selectedCred = matching.find((c) => c.id === llmData.llmCredentialId);

              return (
                <>
                  {/* Dropdown row */}
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-1 block">
                      {credLabel[credType]}
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={llmData.llmCredentialId || ''}
                        onChange={(e) => {
                          setLLMCredFormOpen(false);
                          const chosen = matching.find((c) => c.id === e.target.value);
                          if (chosen) {
                            applyLLMCredential(chosen, llmData);
                          } else {
                            onUpdate(node.id, { data: { ...llmData, llmCredentialId: undefined } });
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="">Select credentials</option>
                        {matching.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      {selectedCred && (
                        <button
                          type="button"
                          title="Edit credential"
                          onClick={() => openEditLLMCredForm(selectedCred)}
                          className="flex items-center justify-center px-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                      )}
                      <Button type="button" size="sm" variant="outline" onClick={openAddLLMCredForm}>
                        + Add
                      </Button>
                    </div>
                    {matching.length === 0 && !llmCredFormOpen && (
                      <p className="text-xs text-gray-500 mt-1">No credentials saved yet. Click + Add to create one.</p>
                    )}
                  </div>

                  {/* Inline form */}
                  {llmCredFormOpen && (
                    <div className="rounded-md border border-blue-200 bg-white-50 p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-800">
                          {llmCredEditingId ? 'Edit Credential' : 'New Credential'}
                        </p>
                        <button type="button" onClick={() => setLLMCredFormOpen(false)} className="text-gray-400 hover:text-gray-600 text-base leading-none">✕</button>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-gray-700 mb-1 block">Name</label>
                        <Input value={llmCredForm.name} onChange={(e) => setLLMCredForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Production key" />
                      </div>

                      {credType === 'gcp' ? (
                        <>
                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">GCP Access Token</label>
                            <Input type="password" value={llmCredForm.gcpAccessToken} onChange={(e) => setLLMCredForm((f) => ({ ...f, gcpAccessToken: e.target.value }))} placeholder="Paste your GCP access token" />
                            <p className="text-xs text-gray-500 mt-1">Obtain via <code>gcloud auth print-access-token</code></p>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">GCP Project ID</label>
                            <Input value={llmCredForm.gcpProjectId} onChange={(e) => setLLMCredForm((f) => ({ ...f, gcpProjectId: e.target.value }))} placeholder="my-gcp-project" />
                            <p className="text-xs text-gray-500 mt-1">Calls Vertex AI in <code>us-central1</code></p>
                          </div>
                        </>
                      ) : credType === 'azure-openai' ? (
                        <>
                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">Resource Name</label>
                            <Input value={llmCredForm.azureResourceName} onChange={(e) => setLLMCredForm((f) => ({ ...f, azureResourceName: e.target.value }))} placeholder="my-resource" />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">Deployment Name</label>
                            <Input value={llmCredForm.azureDeploymentName} onChange={(e) => setLLMCredForm((f) => ({ ...f, azureDeploymentName: e.target.value }))} placeholder="gpt-4o-deployment" />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">API Version</label>
                            <Input value={llmCredForm.azureApiVersion} onChange={(e) => setLLMCredForm((f) => ({ ...f, azureApiVersion: e.target.value }))} placeholder="2024-02-01" />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-700 mb-1 block">API Key</label>
                            <Input type="password" value={llmCredForm.apiKey} onChange={(e) => setLLMCredForm((f) => ({ ...f, apiKey: e.target.value }))} placeholder="Enter Azure OpenAI API key" />
                          </div>
                        </>
                      ) : (
                        <div>
                          <label className="text-xs font-semibold text-gray-700 mb-1 block">
                            API Key ({credType === 'gemini' ? 'Google' : credType === 'anthropic' ? 'Anthropic' : 'OpenAI'})
                          </label>
                          <Input type="password" value={llmCredForm.apiKey} onChange={(e) => setLLMCredForm((f) => ({ ...f, apiKey: e.target.value }))} placeholder="Enter API key" />
                        </div>
                      )}

                      {llmCredFormError && <p className="text-xs text-red-600">{llmCredFormError}</p>}

                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={() => saveLLMCredential(credType, llmData)}>Save</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setLLMCredFormOpen(false)}>Cancel</Button>
                        {llmCredEditingId && (
                          <Button type="button" size="sm" variant="outline" className="ml-auto text-red-600 border-red-200 hover:bg-red-50" onClick={() => deleteLLMCredential(llmCredEditingId, llmData)}>Delete</Button>
                        )}
                      </div>
                    </div>
                  )}

                </>
              );
            })()}

            {llmData.provider !== 'azure-openai' && (
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1 block">
                  Temperature
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={llmData.temperature || 0.7}
                    onChange={(e) =>
                      onUpdate(node.id, {
                        data: {
                          ...llmData,
                          temperature: parseFloat(e.target.value),
                        },
                      })
                    }
                    className="flex-1"
                  />
                  <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                    {(llmData.temperature || 0.7).toFixed(1)}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">
                Max Tokens
              </label>
              <Input
                type="number"
                value={llmData.maxTokens || 1000}
                onChange={(e) =>
                  onUpdate(node.id, {
                    data: {
                      ...llmData,
                      maxTokens: parseInt(e.target.value) || 1000,
                    },
                  })
                }
                min="1"
                max="4000"
              />
            </div>
          </div>
        );

      default:
        return <p className="text-sm text-gray-500">Unknown node type</p>;
    }
  };


  if (variant === 'modal') {
    return (
      <>
        <div className={containerClassName}>
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2.5 pr-12">
            <div>
              <h3 className="text-base font-bold text-gray-900 leading-tight">
                {node.data.label}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Node configuration</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {renderNodeConfig()}
          </div>
        </div>

        {agentTokenModalOpen && agentToken && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-gray-900">Agent Token</h3>
                <button
                  type="button"
                  onClick={() => setAgentTokenModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                >
                  ✕
                </button>
              </div>
              <div className="bg-gray-50 rounded-md p-3 mb-4 max-h-40 overflow-auto border border-gray-200">
                <code className="text-xs text-gray-800 break-all select-all whitespace-pre-wrap">
                  {agentToken}
                </code>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(agentToken);
                    setAgentTokenCopied(true);
                    setTimeout(() => setAgentTokenCopied(false), 2000);
                  }}
                >
                  {agentTokenCopied ? 'Copied!' : 'Copy'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    window.open(`https://jwt.io/#id_token=${encodeURIComponent(agentToken)}`, '_blank')
                  }
                >
                  Decode
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAgentTokenModalOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className={containerClassName}>
        <div className="mb-6">
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            {node.data.label}
          </h3>
        </div>

        {renderNodeConfig()}
      </div>

      {agentTokenModalOpen && agentToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">Agent Token</h3>
              <button
                type="button"
                onClick={() => setAgentTokenModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <div className="bg-gray-50 rounded-md p-3 mb-4 max-h-40 overflow-auto border border-gray-200">
              <code className="text-xs text-gray-800 break-all select-all whitespace-pre-wrap">
                {agentToken}
              </code>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(agentToken);
                  setAgentTokenCopied(true);
                  setTimeout(() => setAgentTokenCopied(false), 2000);
                }}
              >
                {agentTokenCopied ? 'Copied!' : 'Copy'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  window.open(`https://jwt.io/#id_token=${encodeURIComponent(agentToken)}`, '_blank')
                }
              >
                Decode
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAgentTokenModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
