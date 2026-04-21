'use client';

import { useState, useCallback, useEffect } from 'react';
import { Workflow, WorkflowNode, WorkflowEdge } from './types';
import { workflowStore, createDefaultWorkflow } from './workflowStore';

export function useWorkflow() {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const refreshWorkflows = useCallback(() => {
    setWorkflows(workflowStore.getAllWorkflows());
  }, []);

  // Initialize workflow on mount
  useEffect(() => {
    refreshWorkflows();

    const currentWorkflowId = workflowStore.getCurrentWorkflow();
    if (currentWorkflowId) {
      const stored = workflowStore.getWorkflow(currentWorkflowId);
      if (stored) {
        setWorkflow(stored);
        return;
      }
    }

    // Create new default workflow
    const newWorkflow = createDefaultWorkflow();
    workflowStore.saveWorkflow(newWorkflow);
    setWorkflow(newWorkflow);
    refreshWorkflows();
  }, [refreshWorkflows]);

  const createWorkflow = useCallback((name: string) => {
    const newWorkflow = createDefaultWorkflow(name);
    workflowStore.saveWorkflow(newWorkflow);
    setWorkflow(newWorkflow);
    setSelectedNodeId(null);
    refreshWorkflows();
    return newWorkflow;
  }, [refreshWorkflows]);

  const selectWorkflow = useCallback((workflowId: string) => {
    const stored = workflowStore.getWorkflow(workflowId);
    if (!stored) return null;

    workflowStore.setCurrentWorkflow(stored.id);
    setWorkflow(stored);
    setSelectedNodeId(null);
    return stored;
  }, []);

  const updateWorkflow = useCallback((updates: Partial<Workflow>) => {
    setWorkflow((prev) => {
      if (!prev) return null;
      const updated = {
        ...prev,
        ...updates,
        updatedAt: Date.now(),
      };
      return updated;
    });
  }, []);

  const saveWorkflow = useCallback(async (workflowToSave?: Workflow) => {
    const targetWorkflow = workflowToSave || workflow;
    if (!targetWorkflow) return;

    setIsSaving(true);
    try {
      workflowStore.saveWorkflow(targetWorkflow);
      setWorkflow(targetWorkflow);
      refreshWorkflows();
    } finally {
      setIsSaving(false);
    }
  }, [workflow, refreshWorkflows]);

  const addNode = useCallback(
    (node: WorkflowNode) => {
      setWorkflow((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          nodes: [...prev.nodes, node],
          updatedAt: Date.now(),
        };
      });
    },
    []
  );

  const updateNode = useCallback(
    (nodeId: string, updates: Partial<WorkflowNode>) => {
      setWorkflow((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === nodeId ? { ...n, ...updates } : n
          ),
          updatedAt: Date.now(),
        };
      });
    },
    []
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setWorkflow((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          nodes: prev.nodes.filter((n) => n.id !== nodeId),
          edges: prev.edges.filter(
            (e) => e.source !== nodeId && e.target !== nodeId
          ),
          updatedAt: Date.now(),
        };
      });
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
    },
    [selectedNodeId]
  );

  const addEdge = useCallback(
    (edge: WorkflowEdge) => {
      setWorkflow((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          edges: [...prev.edges, edge],
          updatedAt: Date.now(),
        };
      });
    },
    []
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      setWorkflow((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          edges: prev.edges.filter((e) => e.id !== edgeId),
          updatedAt: Date.now(),
        };
      });
    },
    []
  );

  const getSelectedNode = useCallback(() => {
    if (!workflow || !selectedNodeId) return null;
    return workflow.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [workflow, selectedNodeId]);

  return {
    workflow,
    workflows,
    selectedNodeId,
    setSelectedNodeId,
    isSaving,
    createWorkflow,
    selectWorkflow,
    updateWorkflow,
    saveWorkflow,
    addNode,
    updateNode,
    deleteNode,
    addEdge,
    deleteEdge,
    getSelectedNode,
  };
}
