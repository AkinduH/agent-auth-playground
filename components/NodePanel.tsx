'use client';

import { useState, useEffect } from 'react';
import { WorkflowNode, AIAgentNodeData, LLMNodeData } from '@/lib/types';
import { workflowStore } from '@/lib/workflowStore';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface NodePanelProps {
  node: WorkflowNode | null;
  onUpdate: (nodeId: string, updates: Partial<WorkflowNode>) => void;
}

export default function NodePanel({ node, onUpdate }: NodePanelProps) {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [geminiModels, setGeminiModels] = useState<string[]>([
    'gemini-pro',
    'gemini-2.5-flash',
  ]);
  const [openaiModels, setOpenaiModels] = useState<string[]>([
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
  ]);

  useEffect(() => {
    setApiKeys(workflowStore.getApiKeys());
  }, []);

  if (!node) {
    return (
      <div className="w-80 bg-gray-50 border-l border-gray-200 p-6 flex flex-col items-center justify-center text-gray-500">
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
                Temperature
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={agentData.temperature || 0.7}
                  onChange={(e) =>
                    onUpdate(node.id, {
                      data: {
                        ...agentData,
                        temperature: parseFloat(e.target.value),
                      },
                    })
                  }
                  className="flex-1"
                />
                <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                  {(agentData.temperature || 0.7).toFixed(1)}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Higher values = more creative
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                Max Tokens
              </label>
              <Input
                type="number"
                value={agentData.maxTokens || 1000}
                onChange={(e) =>
                  onUpdate(node.id, {
                    data: {
                      ...agentData,
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
                System Prompt
              </label>
              <Textarea
                value={llmData.systemPrompt || ''}
                onChange={(e) =>
                  onUpdate(node.id, {
                    data: { ...llmData, systemPrompt: e.target.value },
                  })
                }
                placeholder="Enter system prompt for the LLM..."
                className="text-sm"
                rows={3}
              />
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

      default:
        return <p className="text-sm text-gray-500">Unknown node type</p>;
    }
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 p-6 overflow-y-auto">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          {node.data.label}
        </h3>
        <p className="text-xs text-gray-500">Node ID: {node.id}</p>
      </div>

      {renderNodeConfig()}
    </div>
  );
}
