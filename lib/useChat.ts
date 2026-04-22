'use client';

import { useState, useCallback, useRef } from 'react';
import {
  ChatMessage,
  MemoryNodeData,
  Workflow,
  WorkflowNode,
} from './types';
import { workflowStore, generateId } from './workflowStore';

export interface UseChatOptions {
  onStreamChunk?: (chunk: string) => void;
  onComplete?: (fullMessage: string) => void;
  onError?: (error: string) => void;
}

interface MemoryBinding {
  nodeId: string;
  maxMessages: number;
}

function resolveMemoryBinding(workflow: Workflow): MemoryBinding | null {
  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));

  const memoryEdge = workflow.edges.find((edge) => {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);

    return sourceNode?.type === 'aiAgent' && targetNode?.type === 'memory';
  });

  if (!memoryEdge) {
    return null;
  }

  const memoryNode = nodesById.get(memoryEdge.target) as WorkflowNode | undefined;
  if (!memoryNode || memoryNode.type !== 'memory') {
    return null;
  }

  const memoryData = memoryNode.data as MemoryNodeData;
  const maxMessages = Math.min(
    100,
    Math.max(1, Math.floor(memoryData.maxMessages || 6))
  );

  return {
    nodeId: memoryNode.id,
    maxMessages,
  };
}

export function useChat(workflowId: string, options: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const addMessage = useCallback(
    (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
    },
    []
  );

  const executeWorkflow = useCallback(
    async (userMessage: string, workflowDefinition: Workflow) => {
      setIsLoading(true);
      setError(null);

      // Add user message
      const userMsg: ChatMessage = {
        id: generateId('msg-'),
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
        workflowId,
      };
      addMessage(userMsg);
      const memoryBinding = resolveMemoryBinding(workflowDefinition);
      const memoryMessages = memoryBinding
        ? workflowStore
            .getWorkflowMemory(workflowId, memoryBinding.nodeId)
            .slice(-memoryBinding.maxMessages)
        : [];

      try {
        abortControllerRef.current = new AbortController();

        const response = await fetch('/api/execute-workflow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflow: workflowDefinition,
            input: userMessage,
            workflowId,
            apiKeys: workflowStore.getApiKeys(),
            memoryMessages,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Workflow execution failed');
        }

        // Add assistant message
        const assistantMsg: ChatMessage = {
          id: generateId('msg-'),
          role: 'assistant',
          content: data.output,
          timestamp: Date.now(),
          workflowId,
        };
        addMessage(assistantMsg);

        if (memoryBinding) {
          workflowStore.appendWorkflowMemory(
            workflowId,
            memoryBinding.nodeId,
            [userMsg, assistantMsg],
            memoryBinding.maxMessages
          );
        }

        options.onComplete?.(data.output);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return; // User cancelled
        }

        const errorMsg =
          err instanceof Error ? err.message : 'Unknown error occurred';
        setError(errorMsg);
        options.onError?.(errorMsg);
      } finally {
        setIsLoading(false);
      }
    },
    [workflowId, addMessage, options]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    error,
    addMessage,
    executeWorkflow,
    clearMessages,
    cancel,
  };
}
