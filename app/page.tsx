'use client';

import { useWorkflow } from '@/lib/useWorkflow';
import { useChat } from '@/lib/useChat';
import WorkflowEditor from '@/components/WorkflowEditor';
import NodePanel from '@/components/NodePanel';
import ChatPanel from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { validateWorkflow } from '@/lib/workflowValidation';
import { workflowStore } from '@/lib/workflowStore';
import { useEffect, useRef, useState } from 'react';
import { Workflow } from '@/lib/types';

export default function Home() {
  const {
    workflow,
    selectedNodeId,
    setSelectedNodeId,
    isSaving,
    saveWorkflow,
    importWorkflow,
    addNode,
    updateNode,
    deleteNode,
    addEdge,
    deleteEdge,
  } = useWorkflow();

  const {
    messages,
    isLoading,
    error,
    oboConsentPending,
    lastTrace,
    activeNodeIds,
    executeWorkflow,
    clearMessages,
  } = useChat(workflow?.id || 'temp');

  const [workflowName, setWorkflowName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isNodePanelOpen, setIsNodePanelOpen] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [isOAuthCallback, setIsOAuthCallback] = useState(false);
  const [mcpInitVersion, setMcpInitVersion] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (code && state) {
      window.history.replaceState({}, '', '/');
      const channel = new BroadcastChannel('obo-callback');
      channel.postMessage({ code, state });
      channel.close();
      // If opened as a popup, close automatically; otherwise show the banner
      if (window.opener) {
        window.close();
      } else {
        setIsOAuthCallback(true);
      }
    }
  }, []);

  const selectedNode =
    workflow?.nodes.find((n) => n.id === selectedNodeId) || null;

  useEffect(() => {
    if (!selectedNode) {
      setIsNodePanelOpen(false);
    }
  }, [selectedNode]);

  useEffect(() => {
    setWorkflowName(workflow?.name || '');
  }, [workflow?.id, workflow?.name]);

  useEffect(() => {
    if (!lastTrace) return;
    try {
      localStorage.setItem('lastAuthTrace', JSON.stringify(lastTrace));
    } catch {
      // ignore quota or disabled storage
    }
  }, [lastTrace]);

  const handleSendMessage = async (message: string) => {
    if (!workflow) return;

    setValidationError(null);

    // Skip workflow validation when the user is submitting an OBO authorization code
    if (!oboConsentPending) {
      const cachedToolsForValidation: Record<string, { tools: unknown[] }> = {};
      for (const node of workflow.nodes) {
        if (node.type !== 'mcpClient') continue;
        const entry = workflowStore.getMCPTools(workflow.id, node.id);
        if (entry) cachedToolsForValidation[node.id] = { tools: entry.tools };
      }
      const validation = validateWorkflow(workflow, {
        mcpDiscoveredTools: cachedToolsForValidation,
      });
      if (!validation.valid) {
        setValidationError(
          `Invalid workflow: ${validation.errors.join(', ')}`
        );
        return;
      }
    }

    await executeWorkflow(message, workflow);
  };

  const [isSavedDialogOpen, setIsSavedDialogOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSaveWorkflow = async () => {
    if (!workflow) return;

    const trimmedName = workflowName.trim();
    const updatedWorkflow = {
      ...workflow,
      name: trimmedName || workflow.name,
      updatedAt: Date.now(),
    };

    await saveWorkflow(updatedWorkflow);
    setIsSavedDialogOpen(true);
  };

  const handleDownloadWorkflow = () => {
    if (!workflow) return;
    const json = JSON.stringify(workflow, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const safeName = (workflow.name || 'workflow').replace(/[^a-z0-9-_]+/gi, '_');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Workflow;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !Array.isArray(parsed.nodes) ||
        !Array.isArray(parsed.edges)
      ) {
        throw new Error('Invalid workflow file');
      }
      importWorkflow(parsed);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Failed to import workflow'
      );
    }
  };

  if (!workflow) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <p className="text-gray-500">Loading workflow...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex gap-2 items-center flex-wrap">
              <Input
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                placeholder="Workflow name"
                className="max-w-sm text-lg font-semibold"
              />
              <Button
                onClick={handleSaveWorkflow}
                size="sm"
                variant="default"
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save Workflow'}
              </Button>
              <Button
                onClick={handleDownloadWorkflow}
                size="sm"
                variant="outline"
              >
                Download Workflow
              </Button>
              <Button
                onClick={handleImportClick}
                size="sm"
                variant="outline"
              >
                Import Workflow
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImportFile}
              />
            </div>
            {importError && (
              <p className="text-xs text-red-600 mt-1">{importError}</p>
            )}
            <p className="text-sm text-gray-500 mt-1">
              Created {new Date(workflow.createdAt).toLocaleDateString()}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsChatVisible(!isChatVisible)}
          >
            {isChatVisible ? 'Hide Chat' : 'Show Chat'}
          </Button>
        </div>
      </div>

      {/* OAuth callback banner */}
      {isOAuthCallback && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-3 flex items-center justify-between">
          <p className="text-sm text-green-800 font-medium">
            Authorization successful! You can close this tab and return to the previous one.
          </p>
          <button
            onClick={() => window.close()}
            className="text-xs text-green-700 underline hover:text-green-900"
          >
            Close tab
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Canvas */}
        <div className={isChatVisible ? 'flex-1' : 'w-full'}>
          <WorkflowEditor
            workflow={workflow}
            selectedNodeId={selectedNodeId}
            activeNodeIds={activeNodeIds}
            mcpInitVersion={mcpInitVersion}
            onNodeSelect={setSelectedNodeId}
            onNodeDoubleClick={(nodeId) => {
              setSelectedNodeId(nodeId);
              setIsNodePanelOpen(true);
            }}
            onNodeAdd={addNode}
            onNodeUpdate={updateNode}
            onNodeDelete={deleteNode}
            onEdgeAdd={addEdge}
            onEdgeDelete={deleteEdge}
          />
        </div>

        {/* Right: Chat Panel */}
        {isChatVisible && (
          <div className="w-96 border-l border-gray-200 flex flex-col">
            <ChatPanel
              messages={messages}
              isLoading={isLoading}
              error={error || validationError}
              onSendMessage={handleSendMessage}
              onClear={clearMessages}
              disabled={!workflow || workflow.nodes.length === 0}
              oboConsentPending={oboConsentPending}
              hasTrace={!!lastTrace}
              onViewAuthFlow={() => {
                if (lastTrace) {
                  try {
                    localStorage.setItem('lastAuthTrace', JSON.stringify(lastTrace));
                  } catch {
                    // storage may be full or disabled — proceed anyway
                  }
                }
                window.open('/auth-flow', '_blank', 'noopener,noreferrer');
              }}
            />
          </div>
        )}
      </div>

      <Dialog open={isSavedDialogOpen} onOpenChange={setIsSavedDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="flex items-center gap-2 text-green-700">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700">
              ✓
            </span>
            Saved successfully
          </DialogTitle>
          <DialogDescription>
            Your workflow has been saved.
          </DialogDescription>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setIsSavedDialogOpen(false)}>
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isNodePanelOpen} onOpenChange={setIsNodePanelOpen}>
        <DialogContent
          showCloseButton={false}
          className="w-[95vw] max-w-2xl p-0 gap-0 overflow-hidden rounded-xl border border-gray-200 shadow-2xl"
        >
          <DialogTitle className="sr-only">
            {selectedNode ? `Configure ${selectedNode.data.label}` : 'Configure node'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Edit the selected node settings and behavior for this workflow.
          </DialogDescription>
          <NodePanel
            node={selectedNode}
            onUpdate={updateNode}
            workflowId={workflow.id}
            workflow={workflow}
            variant="modal"
            onMCPInitChange={() => setMcpInitVersion((v) => v + 1)}
          />
          <DialogClose
            aria-label="Close"
            className="absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            <X className="h-4 w-4" />
          </DialogClose>
        </DialogContent>
      </Dialog>
    </div>
  );
}
