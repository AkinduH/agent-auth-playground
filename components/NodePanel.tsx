'use client';

import { useState, useEffect } from 'react';
import {
  WorkflowNode,
  AIAgentNodeData,
  LLMNodeData,
  MCPClientNodeData,
  MemoryNodeData,
} from '@/lib/types';
import { workflowStore } from '@/lib/workflowStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface NodePanelProps {
  node: WorkflowNode | null;
  onUpdate: (nodeId: string, updates: Partial<WorkflowNode>) => void;
  workflowId?: string;
  variant?: 'sidebar' | 'modal';
}

export default function NodePanel({
  node,
  onUpdate,
  workflowId,
  variant = 'sidebar',
}: NodePanelProps) {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const geminiModels = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite-preview',
    'gemini-3.1-pro-preview',
  ];
  const openaiModels = [
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
  ];

  useEffect(() => {
    setApiKeys(workflowStore.getApiKeys());
  }, []);

  const containerClassName =
    variant === 'modal'
      ? 'w-full max-h-[80vh] bg-white p-6 overflow-y-auto'
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

  const handleApiKeyChange = (provider: 'gemini' | 'openai', key: string) => {
    workflowStore.setApiKey(provider, key);
    setApiKeys((prev) => ({ ...prev, [provider]: key }));
  };

  const renderNodeConfig = () => {
    switch (node.type) {
      case 'chatTrigger':
        return (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">
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
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
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
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
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
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
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
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
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
                rows={4}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
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
          </div>
        );

      case 'mcpClient':
        const mcpData = node.data as MCPClientNodeData;
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
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

                <p className="text-xs text-white-600">
                  Agent ID and Secret are taken from the connected AI Agent node.
                </p>
              </div>
            )}

            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-semibold text-gray-700 mb-1">Behavior</p>
              <p className="text-xs text-gray-600">
                This node manages MCP tool discovery and tool execution with automatic reconnect
                attempts when connections fail.
              </p>
            </div>
          </div>
        );

      case 'llm':
        const llmData = node.data as LLMNodeData;
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                Provider
              </label>
              <select
                value={llmData.provider || 'gemini'}
                onChange={(e) =>
                  onUpdate(node.id, {
                    data: {
                      ...llmData,
                      provider: e.target.value as 'gemini' | 'openai',
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
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
                {(llmData.provider === 'openai'
                  ? openaiModels
                  : geminiModels
                ).map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                API Key ({llmData.provider === 'openai' ? 'OpenAI' : 'Google'})
              </label>
              <Input
                type="password"
                value={apiKeys[llmData.provider] || ''}
                onChange={(e) =>
                  handleApiKeyChange(llmData.provider, e.target.value)
                }
                placeholder={`Enter your ${
                  llmData.provider === 'openai' ? 'OpenAI' : 'Google'
                } API key`}
              />
              <p className="text-xs text-gray-500 mt-1">
                Stored securely in your browser
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
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
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
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

      case 'memory':
        const memoryData = node.data as MemoryNodeData;
        const memoryMessageCount = workflowId
          ? workflowStore.getWorkflowMemory(workflowId, node.id).length
          : 0;
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                Messages to Keep
              </label>
              <Input
                type="number"
                value={memoryData.maxMessages || 6}
                onChange={(e) =>
                  onUpdate(node.id, {
                    data: {
                      ...memoryData,
                      maxMessages: Math.min(
                        100,
                        Math.max(1, parseInt(e.target.value, 10) || 6)
                      ),
                    },
                  })
                }
                min="1"
                max="100"
              />
              <p className="text-xs text-gray-500 mt-1">
                The latest N chat messages are sent as memory context to the connected AI Agent.
              </p>
            </div>

            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-semibold text-gray-700 mb-1">Stored Messages</p>
              <p className="text-xs text-gray-600 mb-3">
                {memoryMessageCount} message{memoryMessageCount === 1 ? '' : 's'} currently saved.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!workflowId}
                onClick={() => {
                  if (!workflowId) return;
                  workflowStore.clearWorkflowMemory(workflowId, node.id);
                }}
              >
                Clear Memory
              </Button>
            </div>
          </div>
        );

      default:
        return <p className="text-sm text-gray-500">Unknown node type</p>;
    }
  };

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
