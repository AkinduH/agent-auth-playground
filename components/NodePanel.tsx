'use client';

import { useState, useEffect } from 'react';
import {
  WorkflowNode,
  AIAgentNodeData,
  LLMNodeData,
  MCPClientNodeData,
  Workflow,
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
  mcpNodeId: string
): { agentId?: string; agentSecret?: string } | null {
  if (!workflow) return null;
  const edge = workflow.edges.find((e) => e.target === mcpNodeId);
  if (!edge) return null;
  const agent = workflow.nodes.find((n) => n.id === edge.source && n.type === 'aiAgent');
  if (!agent) return null;
  const data = agent.data as AIAgentNodeData;
  return { agentId: data.agentId, agentSecret: data.agentSecret };
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

  const runMCPInit = async (mcpData: MCPClientNodeData, nodeId: string) => {
    if (!workflowId) return;
    const endpoint = mcpData.mcpServerEndpoint?.trim();
    if (!endpoint) {
      setMcpInitError('Add an MCP server endpoint above before initializing.');
      return;
    }

    let oauth2Body: Record<string, string> | undefined;
    if (mcpData.useOAuth2) {
      const organizationName = mcpData.oauth2OrganizationName?.trim();
      const clientId = mcpData.oauth2ClientId?.trim();
      const redirectUri = mcpData.oauth2RedirectUri?.trim();
      if (!organizationName || !clientId || !redirectUri) {
        setMcpInitError(
          'OAuth2 is enabled but Organization Name, Client ID, or Redirect URI is missing.'
        );
        return;
      }
      const agentCreds = findConnectedAgentCreds(workflow, nodeId);
      if (!agentCreds || !agentCreds.agentId?.trim() || !agentCreds.agentSecret?.trim()) {
        setMcpInitError(
          'Agent ID and Secret are required on the connected AI Agent node for OAuth2 init.'
        );
        return;
      }
      oauth2Body = {
        flow: mcpData.oauth2Flow ?? 'agent',
        organizationName,
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
  };

  useEffect(() => {
    setApiKeys(workflowStore.getApiKeys());
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

  const handleApiKeyChange = (provider: 'gemini' | 'openai' | 'anthropic' | 'gcpAccessToken' | 'gcpProjectId', key: string) => {
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

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">
                Agent ID
              </label>
              <Input
                value={agentData.agentId || ''}
                onChange={(e) =>
                  onUpdate(node.id, {
                    data: { ...agentData, agentId: e.target.value },
                  })
                }
                placeholder="Enter agent ID"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">
                Agent Secret
              </label>
              <Input
                type="password"
                value={agentData.agentSecret || ''}
                onChange={(e) =>
                  onUpdate(node.id, {
                    data: { ...agentData, agentSecret: e.target.value },
                  })
                }
                placeholder="Enter agent secret"
              />
            </div>

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
                    Organization Name
                  </label>
                  <Input
                    value={mcpData.oauth2OrganizationName || ''}
                    onChange={(e) =>
                      onUpdate(node.id, {
                        data: { ...mcpData, oauth2OrganizationName: e.target.value },
                      })
                    }
                    placeholder="your-org"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Asgardeo tenant name (used in api.asgardeo.io/t/&#123;org&#125;)
                  </p>
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
                    value={mcpData.oauth2RedirectUri || ''}
                    onChange={(e) =>
                      onUpdate(node.id, {
                        data: { ...mcpData, oauth2RedirectUri: e.target.value },
                      })
                    }
                    placeholder="https://example.com/callback"
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
        const isGcpAuth = isGemini && llmData.geminiAuthType === 'gcp-access-token';
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
                      provider: e.target.value as 'gemini' | 'openai' | 'anthropic',
                      model: '',
                      geminiAuthType: undefined,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="" disabled>Select a provider</option>
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">
                Model
              </label>
              <select
                value={llmData.model || ''}
                onChange={(e) =>
                  onUpdate(node.id, {
                    data: { ...llmData, model: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">Select a model</option>
                {(providerModels[llmData.provider] ?? []).map((model: string) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>

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

            {!isGcpAuth && (
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1 block">
                  API Key ({llmData.provider === 'openai' ? 'OpenAI' : llmData.provider === 'anthropic' ? 'Anthropic' : 'Google'})
                </label>
                <Input
                  type="password"
                  value={apiKeys[llmData.provider] || ''}
                  onChange={(e) =>
                    handleApiKeyChange(llmData.provider, e.target.value)
                  }
                  placeholder={`Enter your ${
                    llmData.provider === 'openai' ? 'OpenAI' : llmData.provider === 'anthropic' ? 'Anthropic' : 'Google'
                  } API key`}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Stored securely in your browser
                </p>
              </div>
            )}

            {isGcpAuth && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1 block">
                    GCP Access Token
                  </label>
                  <Input
                    type="password"
                    value={apiKeys['gcpAccessToken'] || ''}
                    onChange={(e) => handleApiKeyChange('gcpAccessToken', e.target.value)}
                    placeholder="Paste your GCP access token"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Obtain via <code>gcloud auth print-access-token</code>
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1 block">
                    GCP Project ID
                  </label>
                  <Input
                    value={apiKeys['gcpProjectId'] || ''}
                    onChange={(e) => handleApiKeyChange('gcpProjectId', e.target.value)}
                    placeholder="my-gcp-project"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Calls Vertex AI in <code>us-central1</code>
                  </p>
                </div>
              </div>
            )}

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
    );
  }

  return (
    <div className={containerClassName}>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          {node.data.label}
        </h3>
      </div>

      {renderNodeConfig()}
    </div>
  );
}
