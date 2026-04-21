'use client';

import { useWorkflow } from '@/lib/useWorkflow';
import { useChat } from '@/lib/useChat';
import WorkflowEditor from '@/components/WorkflowEditor';
import NodePanel from '@/components/NodePanel';
import ChatPanel from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { validateWorkflow } from '@/lib/workflowExecutor';
import { useEffect, useState } from 'react';

const NEW_WORKFLOW_OPTION = '__new_workflow__';

export default function Home() {
  const {
    workflow,
    workflows,
    selectedNodeId,
    setSelectedNodeId,
    isSaving,
    createWorkflow,
    selectWorkflow,
    saveWorkflow,
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
    executeWorkflow,
    clearMessages,
  } = useChat(workflow?.id || 'temp');

  const [workflowName, setWorkflowName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isNodePanelOpen, setIsNodePanelOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

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

  const handleSendMessage = async (message: string) => {
    if (!workflow) return;

    setValidationError(null);

    // Validate workflow
    const validation = validateWorkflow(workflow);
    if (!validation.valid) {
      setValidationError(
        `Invalid workflow: ${validation.errors.join(', ')}`
      );
      return;
    }

    await executeWorkflow(message, workflow);
  };

  const handleWorkflowSelection = (value: string) => {
    if (value === NEW_WORKFLOW_OPTION) {
      createWorkflow('');
      return;
    }

    selectWorkflow(value);
  };

  const handleSaveWorkflowName = async () => {
    if (!workflow) return;

    const trimmedName = workflowName.trim();
    if (!trimmedName) return;

    const updatedWorkflow = {
      ...workflow,
      name: trimmedName,
      updatedAt: Date.now(),
    };

    await saveWorkflow(updatedWorkflow);
  };

  const namedWorkflows = workflows.filter((savedWorkflow) =>
    savedWorkflow.name.trim().length > 0
  );

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
            <div className="flex gap-2 items-center mb-2">
              <Select
                value={workflow.name.trim() ? workflow.id : undefined}
                onValueChange={handleWorkflowSelection}
              >
                <SelectTrigger className="w-full text-xl font-bold">
                  <SelectValue placeholder="Select workflow" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_WORKFLOW_OPTION}>New workflow</SelectItem>
                  {namedWorkflows.map((savedWorkflow) => (
                    <SelectItem key={savedWorkflow.id} value={savedWorkflow.id}>
                      {savedWorkflow.name || ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 items-center">
              <Input
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                placeholder="Rename workflow"
                className="max-w-sm"
              />
              <Button
                onClick={handleSaveWorkflowName}
                size="sm"
                variant="outline"
                disabled={!workflowName.trim()}
              >
                Save
              </Button>
            </div>
            <p className="text-sm text-gray-500">
              Created {new Date(workflow.createdAt).toLocaleDateString()}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setIsChatOpen(true)}>
            Open Chat
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Canvas */}
        <div className="flex-1">
          <WorkflowEditor
            workflow={workflow}
            selectedNodeId={selectedNodeId}
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
      </div>

      <Sheet open={isChatOpen} onOpenChange={setIsChatOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 gap-0">
          <SheetTitle className="sr-only">Workflow Chat</SheetTitle>
          <SheetDescription className="sr-only">
            Chat panel for testing the current workflow and viewing responses.
          </SheetDescription>
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            error={error || validationError}
            onSendMessage={handleSendMessage}
            onClear={clearMessages}
            disabled={!workflow || workflow.nodes.length === 0}
          />
        </SheetContent>
      </Sheet>

      <Dialog open={isNodePanelOpen} onOpenChange={setIsNodePanelOpen}>
        <DialogContent className="w-[95vw] max-w-2xl p-0">
          <DialogTitle className="sr-only">
            {selectedNode ? `Configure ${selectedNode.data.label}` : 'Configure node'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Edit the selected node settings and behavior for this workflow.
          </DialogDescription>
          <NodePanel node={selectedNode} onUpdate={updateNode} variant="modal" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
