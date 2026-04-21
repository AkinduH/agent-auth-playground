'use client';

import { useWorkflow } from '@/lib/useWorkflow';
import { useChat } from '@/lib/useChat';
import WorkflowEditor from '@/components/WorkflowEditor';
import NodePanel from '@/components/NodePanel';
import ChatPanel from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { validateWorkflow } from '@/lib/workflowExecutor';
import { useState } from 'react';
import Link from 'next/link';

export default function Home() {
  const {
    workflow,
    selectedNodeId,
    setSelectedNodeId,
    isSaving,
    updateWorkflow,
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

  const [workflowName, setWorkflowName] = useState(workflow?.name || '');
  const [validationError, setValidationError] = useState<string | null>(null);

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

  const handleSaveName = async () => {
    if (!workflow) return;
    updateWorkflow({ name: workflowName });
    await saveWorkflow();
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
            <div className="flex gap-2 items-center mb-2">
              <Input
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                onBlur={handleSaveName}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveName();
                  }
                }}
                className="text-xl font-bold"
                placeholder="Untitled Workflow"
              />
              <Button onClick={handleSaveName} size="sm" variant="outline">
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
            <p className="text-sm text-gray-500">
              Created {new Date(workflow.createdAt).toLocaleDateString()}
            </p>
          </div>
          <Link href="/settings">
            <Button variant="outline" size="sm">
              ⚙️ Settings
            </Button>
          </Link>
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
            onNodeAdd={addNode}
            onNodeUpdate={updateNode}
            onNodeDelete={deleteNode}
            onEdgeAdd={addEdge}
            onEdgeDelete={deleteEdge}
          />
        </div>

        {/* Center-Right: Chat Panel */}
        <div className="w-96 flex flex-col">
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            error={error || validationError}
            onSendMessage={handleSendMessage}
            onClear={clearMessages}
            disabled={!workflow || workflow.nodes.length === 0}
          />
        </div>

        {/* Far Right: Node Configuration */}
        <div>
          <NodePanel
            node={workflow.nodes.find((n) => n.id === selectedNodeId) || null}
            onUpdate={updateNode}
          />
        </div>
      </div>
    </div>
  );
}
