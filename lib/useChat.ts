'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  AIAgentNodeData,
  ChatMessage,
  MCPClientNodeData,
  Workflow,
} from './types';
import { workflowStore, generateId } from './workflowStore';
import { WorkflowTrace, MCPNodeTrace, dominantFlow } from './authTrace';

export interface UseChatOptions {
  onStreamChunk?: (chunk: string) => void;
  onComplete?: (fullMessage: string) => void;
  onError?: (error: string) => void;
}

interface MemoryBinding {
  nodeId: string;
  maxMessages: number;
}

interface OBOPendingNode {
  nodeId: string;
  organizationName: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  authUrl: string;
  codeVerifier: string;
  agentAccessToken: string;
  state: string;
}

interface OBOConsentState {
  pendingMessage: string;
  pendingWorkflow: Workflow;
  pendingUserMsg: ChatMessage;
  pendingNodes: OBOPendingNode[];
  currentNodeIndex: number;
}

function resolveMemoryBinding(workflow: Workflow): MemoryBinding | null {
  const agentNode = workflow.nodes.find((node) => node.type === 'aiAgent');
  if (!agentNode) return null;

  const agentData = agentNode.data as AIAgentNodeData;
  if (!agentData.maxMessages) return null;

  const maxMessages = Math.min(100, Math.max(1, Math.floor(agentData.maxMessages)));
  return { nodeId: agentNode.id, maxMessages };
}

function findUninitializedMCPNodes(workflow: Workflow, workflowId: string): string[] {
  return workflow.nodes
    .filter((n) => n.type === 'mcpClient')
    .filter((n) => {
      const entry = workflowStore.getMCPTools(workflowId, n.id);
      return !entry || !Array.isArray(entry.tools) || entry.tools.length === 0;
    })
    .map((n) => {
      const data = n.data as MCPClientNodeData;
      return data.name?.trim() || n.id;
    });
}

function collectCachedMCPTools(
  workflow: Workflow,
  workflowId: string
): Record<string, { endpoint: string; tools: unknown[] }> {
  const out: Record<string, { endpoint: string; tools: unknown[] }> = {};
  for (const node of workflow.nodes) {
    if (node.type !== 'mcpClient') continue;
    const entry = workflowStore.getMCPTools(workflowId, node.id);
    if (entry) {
      out[node.id] = { endpoint: entry.endpoint, tools: entry.tools };
    }
  }
  return out;
}

function findOBONodes(workflow: Workflow): Array<{
  nodeId: string;
  organizationName: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  agentId: string;
  agentSecret: string;
}> {
  return workflow.nodes
    .filter((n) => n.type === 'mcpClient')
    .filter((n) => {
      const data = n.data as MCPClientNodeData;
      return data.useOAuth2 && data.oauth2Flow === 'obo';
    })
    .map((n) => {
      const data = n.data as MCPClientNodeData;
      // Find the AIAgent node that connects to this MCPClient
      const edge = workflow.edges.find((e) => e.target === n.id);
      const agentNode = edge
        ? workflow.nodes.find((an) => an.id === edge.source && an.type === 'aiAgent')
        : null;
      const agentData = agentNode?.data as AIAgentNodeData | undefined;
      return {
        nodeId: n.id,
        organizationName: data.oauth2OrganizationName || '',
        clientId: data.oauth2ClientId || '',
        redirectUri: data.oauth2RedirectUri || '',
        scope: data.oauth2Scope,
        agentId: agentData?.agentId || '',
        agentSecret: agentData?.agentSecret || '',
      };
    });
}

function extractAuthCode(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get('code');
    if (code) return code;
  } catch {
    // Not a URL, treat as raw code
  }
  return trimmed;
}

function buildOBOConsentMessage(nodeId: string, current: number, total: number): string {
  const multi = total > 1 ? ` (${current} of ${total})` : '';
  return `Authorization Required${multi}\n\nThe AI agent needs your consent to act on your behalf for MCP connection.\n\nClick the link below to log in.`;
}

const CHAT_STORAGE_PREFIX = 'chatMessages:';

function loadStoredMessages(workflowId: string): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CHAT_STORAGE_PREFIX + workflowId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

function saveStoredMessages(workflowId: string, messages: ChatMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHAT_STORAGE_PREFIX + workflowId, JSON.stringify(messages));
  } catch {
    // storage may be full or disabled — drop silently
  }
}

export function useChat(workflowId: string, options: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadStoredMessages(workflowId));
  const hydratedWorkflowIdRef = useRef<string>(workflowId);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oboConsentPending, setOboConsentPending] = useState(false);
  const [lastTrace, setLastTrace] = useState<WorkflowTrace | null>(null);
  const [activeNodeIds, setActiveNodeIds] = useState<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const oboConsentStateRef = useRef<OBOConsentState | null>(null);
  const oboClientPatchRef = useRef<Record<string, Partial<MCPNodeTrace>>>({});
  const processOBOCodeRef = useRef<((code: string, opts?: { silent?: boolean }) => Promise<void>) | null>(null);

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  // When the active workflow changes, hydrate messages for the new workflow
  useEffect(() => {
    if (hydratedWorkflowIdRef.current === workflowId) return;
    hydratedWorkflowIdRef.current = workflowId;
    setMessages(loadStoredMessages(workflowId));
  }, [workflowId]);

  // Persist chat history whenever it changes
  useEffect(() => {
    saveStoredMessages(workflowId, messages);
  }, [workflowId, messages]);

  const doExecuteWorkflow = useCallback(
    async (
      userMessage: string,
      workflowDefinition: Workflow,
      oboTokens: Record<string, string> = {},
      existingUserMsg?: ChatMessage
    ) => {
      setIsLoading(true);
      setError(null);

      const userMsg: ChatMessage = existingUserMsg ?? {
        id: generateId('msg-'),
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
        workflowId,
      };

      if (!existingUserMsg) {
        addMessage(userMsg);
      }

      const memoryBinding = resolveMemoryBinding(workflowDefinition);
      const memoryMessages = memoryBinding
        ? workflowStore
            .getWorkflowMemory(workflowId, memoryBinding.nodeId)
            .slice(-memoryBinding.maxMessages)
        : [];

      const MIN_GLOW_MS = 1000;
      const startTimes = new Map<string, number>();
      const pendingRemovals = new Map<string, ReturnType<typeof setTimeout>>();

      const removeActive = (nodeId: string) => {
        setActiveNodeIds((prev) => {
          if (!prev.has(nodeId)) return prev;
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      };

      const handleStart = (nodeId: string) => {
        const existing = pendingRemovals.get(nodeId);
        if (existing) {
          clearTimeout(existing);
          pendingRemovals.delete(nodeId);
        }
        startTimes.set(nodeId, Date.now());
        setActiveNodeIds((prev) => {
          if (prev.has(nodeId)) return prev;
          const next = new Set(prev);
          next.add(nodeId);
          return next;
        });
      };

      const handleEnd = (nodeId: string) => {
        const start = startTimes.get(nodeId) ?? Date.now();
        const elapsed = Date.now() - start;
        if (elapsed >= MIN_GLOW_MS) {
          removeActive(nodeId);
          return;
        }
        const timer = setTimeout(() => {
          pendingRemovals.delete(nodeId);
          removeActive(nodeId);
        }, MIN_GLOW_MS - elapsed);
        pendingRemovals.set(nodeId, timer);
      };

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
            oboTokens,
            mcpDiscoveredTools: collectCachedMCPTools(workflowDefinition, workflowId),
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.body) {
          throw new Error('No response body from workflow API');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let data: any = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sepIndex: number;
          while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, sepIndex);
            buffer = buffer.slice(sepIndex + 2);
            const line = rawEvent.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            let parsed: any;
            try {
              parsed = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }

            if (parsed.type === 'node-start') {
              handleStart(parsed.nodeId);
            } else if (parsed.type === 'node-end') {
              handleEnd(parsed.nodeId);
            } else if (parsed.type === 'result') {
              data = parsed;
            }
          }
        }

        if (!data) {
          throw new Error('Workflow stream ended without a result');
        }

        if (!data.success) {
          throw new Error(data.error || 'Workflow execution failed');
        }

        const assistantMsg: ChatMessage = {
          id: generateId('msg-'),
          role: 'assistant',
          content: data.output,
          timestamp: Date.now(),
          workflowId,
        };
        addMessage(assistantMsg);

        if (data.trace) {
          const trace: WorkflowTrace = data.trace;
          // Merge in client-side OBO data (auth URL + agent token captured during init)
          const patches = oboClientPatchRef.current;
          for (const m of trace.mcps) {
            const patch = patches[m.nodeId];
            if (patch) Object.assign(m, patch);
          }
          trace.flow = dominantFlow(trace.mcps);
          setLastTrace(trace);
        }

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
        setActiveNodeIds(new Set());
        if (err instanceof Error && err.name === 'AbortError') return;
        const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(errorMsg);
        options.onError?.(errorMsg);
      } finally {
        setIsLoading(false);
      }
    },
    [workflowId, addMessage, options]
  );

  const processOBOCode = useCallback(
    async (codeInput: string, { silent = false }: { silent?: boolean } = {}) => {
      const state = oboConsentStateRef.current;
      if (!state) return;

      if (!silent) {
        addMessage({
          id: generateId('msg-'),
          role: 'user',
          content: codeInput,
          timestamp: Date.now(),
          workflowId,
        });
      } else {
        addMessage({
          id: generateId('msg-'),
          role: 'assistant',
          content: 'Authorization received. Exchanging token...',
          timestamp: Date.now(),
          workflowId,
        });
      }

      setIsLoading(true);
      setError(null);

      try {
        const currentNode = state.pendingNodes[state.currentNodeIndex];
        const code = extractAuthCode(codeInput);

        const exchangeRes = await fetch('/api/obo/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            authCode: code,
            agentAccessToken: currentNode.agentAccessToken,
            codeVerifier: currentNode.codeVerifier,
            organizationName: currentNode.organizationName,
            clientId: currentNode.clientId,
            redirectUri: currentNode.redirectUri,
          }),
        });

        if (!exchangeRes.ok) {
          const errData = await exchangeRes.json().catch(() => ({}));
          throw new Error(
            (errData as { error?: string }).error || `OBO exchange failed: ${exchangeRes.status}`
          );
        }

        const { accessToken, expiresIn } = await exchangeRes.json();
        workflowStore.setOBOToken(workflowId, currentNode.nodeId, accessToken, expiresIn || 3600);

        const nextIndex = state.currentNodeIndex + 1;

        if (nextIndex < state.pendingNodes.length) {
          oboConsentStateRef.current = { ...state, currentNodeIndex: nextIndex };
          const nextNode = state.pendingNodes[nextIndex];
          addMessage({
            id: generateId('msg-'),
            role: 'assistant',
            content: buildOBOConsentMessage(nextNode.nodeId, nextIndex + 1, state.pendingNodes.length),
            timestamp: Date.now(),
            workflowId,
            type: 'obo-consent',
            metadata: { authUrl: nextNode.authUrl },
          });
        } else {
          oboConsentStateRef.current = null;
          setOboConsentPending(false);

          addMessage({
            id: generateId('msg-'),
            role: 'assistant',
            content: 'Authorization complete! Processing your request...',
            timestamp: Date.now(),
            workflowId,
          });

          // Collect all valid OBO tokens for the workflow
          const allOBONodes = findOBONodes(state.pendingWorkflow);
          const oboTokens: Record<string, string> = {};
          for (const node of allOBONodes) {
            const token = workflowStore.getOBOToken(workflowId, node.nodeId);
            if (token) oboTokens[node.nodeId] = token;
          }

          await doExecuteWorkflow(
            state.pendingMessage,
            state.pendingWorkflow,
            oboTokens,
            state.pendingUserMsg
          );
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'OBO token exchange failed';
        setError(errorMsg);
        options.onError?.(errorMsg);
        oboConsentStateRef.current = null;
        setOboConsentPending(false);
      } finally {
        setIsLoading(false);
      }
    },
    [workflowId, addMessage, doExecuteWorkflow, options]
  );

  // Keep ref current so the BroadcastChannel handler always calls the latest version
  useEffect(() => {
    processOBOCodeRef.current = processOBOCode;
  }, [processOBOCode]);

  // Listen for OAuth2 callback codes posted from the redirect tab
  useEffect(() => {
    if (!oboConsentPending) return;

    const channel = new BroadcastChannel('obo-callback');
    channel.onmessage = (event: MessageEvent<{ code: string; state: string }>) => {
      const { code, state } = event.data;
      const pending = oboConsentStateRef.current;
      if (!pending) return;
      const currentNode = pending.pendingNodes[pending.currentNodeIndex];
      if (currentNode.state !== state) return;
      processOBOCodeRef.current?.(code, { silent: true });
    };

    return () => channel.close();
  }, [oboConsentPending]);

  const executeWorkflow = useCallback(
    async (userMessage: string, workflowDefinition: Workflow) => {
      // While OBO consent is pending the chat input is disabled in the UI;
      // the auth code arrives via the BroadcastChannel popup callback.
      if (oboConsentStateRef.current !== null) return;

      const uninitializedMCPs = findUninitializedMCPNodes(workflowDefinition, workflowId);
      if (uninitializedMCPs.length > 0) {
        const errorMsg = `Initialize MCP Client${
          uninitializedMCPs.length > 1 ? 's' : ''
        } before chatting: ${uninitializedMCPs.join(', ')}. Open each MCP node and click "Initialize & Connect".`;
        setError(errorMsg);
        options.onError?.(errorMsg);
        return;
      }

      // Check which OBO nodes are missing a valid stored token
      const oboNodes = findOBONodes(workflowDefinition);
      const missingNodes = oboNodes.filter(
        (n) => !workflowStore.getOBOToken(workflowId, n.nodeId)
      );

      if (missingNodes.length > 0) {
        const userMsg: ChatMessage = {
          id: generateId('msg-'),
          role: 'user',
          content: userMessage,
          timestamp: Date.now(),
          workflowId,
        };
        addMessage(userMsg);

        setIsLoading(true);
        setError(null);

        try {
          // Initialize all OBO flows in parallel — get agent token + auth URL for each
          const initResults = await Promise.all(
            missingNodes.map(async (node) => {
              const res = await fetch('/api/obo/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(node),
              });
              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(
                  (errData as { error?: string }).error ||
                    `OBO init failed for MCP node ${node.nodeId}`
                );
              }
              const data = await res.json();
              return {
                nodeId: node.nodeId,
                organizationName: node.organizationName,
                clientId: node.clientId,
                redirectUri: node.redirectUri,
                scope: node.scope,
                authUrl: data.authUrl as string,
                codeVerifier: data.codeVerifier as string,
                agentAccessToken: data.agentAccessToken as string,
                state: data.state as string,
              } satisfies OBOPendingNode;
            })
          );

          // Stash auth URL + agent token per node for later trace merging
          for (const r of initResults) {
            oboClientPatchRef.current[r.nodeId] = {
              oboAuthUrl: r.authUrl,
              agentToken: r.agentAccessToken,
            };
          }

          oboConsentStateRef.current = {
            pendingMessage: userMessage,
            pendingWorkflow: workflowDefinition,
            pendingUserMsg: userMsg,
            pendingNodes: initResults,
            currentNodeIndex: 0,
          };
          setOboConsentPending(true);

          // Show consent prompt for the first node
          const first = initResults[0];
          addMessage({
            id: generateId('msg-'),
            role: 'assistant',
            content: buildOBOConsentMessage(first.nodeId, 1, initResults.length),
            timestamp: Date.now(),
            workflowId,
            type: 'obo-consent',
            metadata: { authUrl: first.authUrl },
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'OBO initialization failed';
          setError(errorMsg);
          options.onError?.(errorMsg);
        } finally {
          setIsLoading(false);
        }
        return;
      }

      // All OBO tokens present (or no OBO nodes) — execute normally
      const oboTokens: Record<string, string> = {};
      for (const node of oboNodes) {
        const token = workflowStore.getOBOToken(workflowId, node.nodeId);
        if (token) oboTokens[node.nodeId] = token;
      }

      await doExecuteWorkflow(userMessage, workflowDefinition, oboTokens);
    },
    [workflowId, addMessage, doExecuteWorkflow, processOBOCode, options]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    oboConsentStateRef.current = null;
    setOboConsentPending(false);
    setLastTrace(null);
    setActiveNodeIds(new Set());
    oboClientPatchRef.current = {};
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(CHAT_STORAGE_PREFIX + workflowId);
      } catch {
        // ignore
      }
    }
  }, [workflowId]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
    setActiveNodeIds(new Set());
  }, []);

  return {
    messages,
    isLoading,
    error,
    oboConsentPending,
    lastTrace,
    activeNodeIds,
    addMessage,
    executeWorkflow,
    clearMessages,
    cancel,
  };
}
