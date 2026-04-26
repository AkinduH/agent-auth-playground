'use client';

import { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Connection,
  MarkerType,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MiniMap,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Workflow, WorkflowNode, WorkflowEdge as WorkflowEdgeType, NodeType } from '@/lib/types';
import { generateId } from '@/lib/workflowStore';
import ChatTriggerNode from '@/components/nodes/ChatTriggerNode';
import AIAgentNode from '@/components/nodes/AIAgentNode';
import LLMNode from '@/components/nodes/LLMNode';
import MCPClientNode from '@/components/nodes/MCPClientNode';
import { Button } from '@/components/ui/button';

const nodeTypes = {
  chatTrigger: ChatTriggerNode,
  aiAgent: AIAgentNode,
  llm: LLMNode,
  mcpClient: MCPClientNode,
};

interface WorkflowEditorProps {
  workflow: Workflow | null;
  selectedNodeId: string | null;
  activeNodeIds?: Set<string>;
  onNodeSelect: (nodeId: string | null) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  onNodeAdd: (node: WorkflowNode) => void;
  onNodeUpdate: (nodeId: string, updates: Partial<WorkflowNode>) => void;
  onNodeDelete: (nodeId: string) => void;
  onEdgeAdd: (edge: WorkflowEdgeType) => void;
  onEdgeDelete: (edgeId: string) => void;
}

export default function WorkflowEditor({
  workflow,
  selectedNodeId,
  activeNodeIds,
  onNodeSelect,
  onNodeDoubleClick,
  onNodeAdd,
  onNodeUpdate,
  onNodeDelete,
  onEdgeAdd,
  onEdgeDelete,
}: WorkflowEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Convert workflow to React Flow format
  useEffect(() => {
    if (!workflow) return;

    const rfNodes: Node[] = workflow.nodes.map((node) => ({
      id: node.id,
      data: { ...node.data, isActive: activeNodeIds?.has(node.id) ?? false },
      position: node.position,
      type: node.type,
      selected: node.id === selectedNodeId,
    }));

    const rfEdges: Edge[] = workflow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      animated: true,
      style: {
        stroke: '#565656',
        strokeWidth: 1,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
        color: '#565656',
      },
    }));

    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [workflow, selectedNodeId, activeNodeIds, setNodes, setEdges]);

  // Handle node selection
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      onNodeSelect(node.id);
    },
    [onNodeSelect]
  );

  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeDoubleClick(node.id);
    },
    [onNodeDoubleClick]
  );

  const handlePaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  // Persist position changes in workflow state so later updates don't reset node locations
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeUpdate(node.id, { position: node.position });
    },
    [onNodeUpdate]
  );

  // Enforce handle-level connection rules
  const isValidConnection = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;

      // AIAgent top handle can only connect to LLM nodes
      if (sourceNode.type === 'aiAgent' && connection.sourceHandle === 'top') {
        return targetNode.type === 'llm';
      }

      // AIAgent right handle can only connect to MCP nodes
      if (sourceNode.type === 'aiAgent' && connection.sourceHandle === 'right') {
        return targetNode.type === 'mcpClient';
      }

      return true;
    },
    [nodes]
  );

  // Handle connection/edge creation
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const newEdge: WorkflowEdgeType = {
        id: generateId('edge-'),
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        animated: true,
      };

      onEdgeAdd(newEdge);
    },
    [onEdgeAdd]
  );

  // Handle node deletion
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        onNodeDelete(selectedNodeId);
        onNodeSelect(null);
      }
    },
    [selectedNodeId, onNodeDelete, onNodeSelect]
  );

  // Add node buttons
  const addNode = (type: NodeType) => {
    const position = {
      x: Math.random() * 300,
      y: Math.random() * 300,
    };

    let data: any = { label: '' };

    switch (type) {
      case 'chatTrigger':
        data.label = 'Chat Trigger';
        break;
      case 'aiAgent':
        data = {
          label: 'AI Agent',
          systemPrompt: 'You are a helpful assistant.',
          temperature: 0.7,
          maxTokens: 1000,
          maxToolSteps: 6,
        };
        break;
      case 'llm':
        data = {
          label: 'AI Service',
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          temperature: 0.7,
          maxTokens: 1000,
          systemPrompt: 'You are a helpful assistant.',
        };
        break;
      case 'mcpClient':
        data = {
          label: 'MCP Client',
          mcpServerEndpoint: '',
        };
        break;
    }

    const newNode: WorkflowNode = {
      id: generateId('node-'),
      type,
      position,
      data,
    };

    onNodeAdd(newNode);
  };

  return (
    <div
      className="flex flex-col h-full w-full bg-white"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Toolbar */}
      <div className="border-b border-gray-200 p-3 flex gap-2 flex-wrap bg-gray-50">
        <Button
          onClick={() => addNode('chatTrigger')}
          variant="outline"
          size="sm"
          className="text-xs"
        >
          + Chat Trigger
        </Button>
        <Button
          onClick={() => addNode('aiAgent')}
          variant="outline"
          size="sm"
          className="text-xs"
        >
          + AI Agent
        </Button>
        <Button
          onClick={() => addNode('llm')}
          variant="outline"
          size="sm"
          className="text-xs"
        >
          + AI Service
        </Button>
        <Button
          onClick={() => addNode('mcpClient')}
          variant="outline"
          size="sm"
          className="text-xs"
        >
          + MCP Client
        </Button>
        <div className="flex-1" />

        {selectedNodeId && (
          <Button
            onClick={() => {
              onNodeDelete(selectedNodeId);
              onNodeSelect(null);
            }}
            variant="destructive"
            size="sm"
            className="text-xs"
          >
            Delete Node
          </Button>
        )}
      </div>

      {/* Canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          isValidConnection={isValidConnection}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onPaneClick={handlePaneClick}
          onNodeDragStop={handleNodeDragStop}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{
            style: {
              stroke: '#565656',
              strokeWidth: 2,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: '#565656',
            },
          }}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
}
