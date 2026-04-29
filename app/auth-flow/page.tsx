'use client';

import { useEffect, useState } from 'react';
import { AuthFlowDiagram } from '@/components/AuthFlowDiagram';
import { AuthFlowOverview } from '@/components/AuthFlowOverview';
import { WorkflowTrace } from '@/lib/authTrace';

const STORAGE_KEY = 'lastAuthTrace';

export default function AuthFlowPage() {
  const [trace, setTrace] = useState<WorkflowTrace | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTrace(JSON.parse(raw) as WorkflowTrace);
    } catch {
      // ignore corrupted payload
    }
    setLoaded(true);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setTrace(JSON.parse(e.newValue) as WorkflowTrace);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const flow = trace?.flow ?? 'none';
  const flowBadge =
    flow === 'obo'
      ? { label: 'OBO Flow', color: 'bg-purple-100 text-purple-800 border-purple-200' }
      : flow === 'agent'
      ? { label: 'Agent Flow', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' }
      : { label: 'Direct', color: 'bg-slate-100 text-slate-700 border-slate-200' };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-sm">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Auth Flow Inspector</h1>
              <p className="text-xs text-slate-500">
                Sequence diagram of authorization and tool-call activity from the most recent run
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {trace && (
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${flowBadge.color}`}
              >
                {flowBadge.label}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {!loaded ? (
          <div className="rounded-lg border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            Loading trace…
          </div>
        ) : trace ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <AuthFlowOverview trace={trace} />
            <div className="my-8 border-t border-slate-200" />
            <AuthFlowDiagram trace={trace} />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-sm font-semibold text-slate-700 mb-1">No execution recorded yet</p>
            <p className="text-xs text-slate-500">
              Run a workflow from the editor, then click "View Auth Flow" to inspect the trace.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
