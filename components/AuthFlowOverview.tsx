'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { MCPNodeTrace, WorkflowTrace, ToolCallTrace, AuthErrorTrace } from '@/lib/authTrace';
import { Button } from '@/components/ui/button';

interface Props {
  trace: WorkflowTrace;
}

type StepType = 'auth' | 'token' | 'consent' | 'secure' | 'unsecure' | 'response' | 'normal' | 'error';
type StaticLane = 'agent' | 'iam' | 'user';
type LaneId = StaticLane | string; // mcp:${nodeId}

interface AuthStep {
  from: LaneId;
  to: LaneId;
  num: number;
  type: StepType;
  label: string;
  detail: string;
  tokenType?: 'agent' | 'obo';
  mcpNodeId?: string;
  errorBadge?: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sublabel?: string;
  color: string;
  bg: string;
  border: string;
  inner?: string;
  lock?: boolean;
  hasError?: boolean;
}

type Boxes = Record<LaneId, Box>;

function stripNodeSuffix(name: string): string {
  return name.replace(/_node_[^_]+_[^_]+$/, '');
}

function mcpDisplayName(m: MCPNodeTrace): string {
  return m.name?.trim() || m.nodeId;
}

function perMcpFlow(m: MCPNodeTrace): 'agent' | 'obo' | 'none' {
  if (m.flow === 'obo') return 'obo';
  if (m.flow === 'agent') return 'agent';
  if (m.flow === 'mixed') return 'agent';
  return 'none';
}

function mcpLaneId(m: MCPNodeTrace): string {
  return `mcp:${m.nodeId}`;
}

function errorBadgeText(err: AuthErrorTrace): string {
  const bits: string[] = [];
  if (err.statusCode) bits.push(`HTTP ${err.statusCode}`);
  if (err.errorCode) bits.push(err.errorCode);
  return bits.join(' · ') || 'failed';
}

function errorDetail(err: AuthErrorTrace): string {
  return err.errorDescription || err.message || 'Authentication failed';
}

function buildAuthStepsForMcp(
  mcp: MCPNodeTrace,
  tools: ToolCallTrace[],
  startNum: number,
): { steps: AuthStep[]; nextNum: number } {
  const steps: AuthStep[] = [];
  const tool = tools.find((t) => t.nodeId === mcp.nodeId);
  const flow = perMcpFlow(mcp);
  const mcpLabel = mcpDisplayName(mcp);
  const mcpLane = mcpLaneId(mcp);
  const err = mcp.authError;
  let n = startNum;

  // Helper that wraps the standard "stop here on failure" pattern.
  const failHere = (
    from: LaneId,
    to: LaneId,
    label: string,
    e: AuthErrorTrace,
  ): AuthStep => ({
    from,
    to,
    num: n++,
    type: 'error',
    label,
    detail: errorDetail(e),
    mcpNodeId: mcp.nodeId,
    errorBadge: errorBadgeText(e),
  });

  if (flow === 'none') {
    if (tool) {
      const toolName = stripNodeSuffix(tool.publicName);
      steps.push({
        from: 'agent', to: mcpLane, num: n++, type: 'unsecure',
        label: `Agent calls ${mcpLabel}`,
        detail: `Tool: ${toolName} — no identity proof attached. The service cannot verify who is calling.`,
        mcpNodeId: mcp.nodeId,
      });
      if (tool.ok) {
        steps.push({
          from: mcpLane, to: 'agent', num: n++, type: 'response',
          label: `${mcpLabel} returns result`,
          detail: 'Data returned, but service had no way to verify the caller.',
          mcpNodeId: mcp.nodeId,
        });
      } else {
        steps.push({
          from: mcpLane, to: 'agent', num: n++, type: 'error',
          label: `${mcpLabel} returned an error`,
          detail: tool.errorDescription || tool.result || 'Tool execution failed',
          mcpNodeId: mcp.nodeId,
          errorBadge:
            [tool.statusCode ? `HTTP ${tool.statusCode}` : null, tool.errorCode || null]
              .filter(Boolean)
              .join(' · ') || 'failed',
        });
      }
    }
    return { steps, nextNum: n };
  }

  // Agent authentication ───────────────────────────────────────────
  steps.push({
    from: 'agent', to: 'iam', num: n++, type: 'auth',
    label: `Agent authenticates — ${mcpLabel}`,
    detail: 'The agent securely proves its identity to the Auth Server using its credentials.',
    mcpNodeId: mcp.nodeId,
  });

  if (err && (err.stage === 'config' || err.stage === 'authorize' || err.stage === 'authn' || err.stage === 'token')) {
    const stageLabel =
      err.stage === 'config' ? 'configuration' :
      err.stage === 'authn' ? 'credential rejection' :
      err.stage === 'authorize' ? 'authorize call' :
      'token exchange';
    steps.push(failHere('iam', 'agent', `Agent auth failed — ${stageLabel}`, err));
    return { steps, nextNum: n };
  }

  steps.push({
    from: 'iam', to: 'agent', num: n++, type: 'token', tokenType: 'agent',
    label: `Agent Token issued — ${mcpLabel}`,
    detail: "The Auth Server verifies the agent and issues an Access Token — the agent's digital ID badge.",
    mcpNodeId: mcp.nodeId,
  });

  // OBO consent ─────────────────────────────────────────────────────
  if (flow === 'obo') {
    steps.push({
      from: 'agent', to: 'user', num: n++, type: 'consent',
      label: `Agent asks for your permission — ${mcpLabel}`,
      detail: `"I need to access ${mcpLabel} on your behalf." You see an Authorize button.`,
      mcpNodeId: mcp.nodeId,
    });
    steps.push({
      from: 'user', to: 'iam', num: n++, type: 'auth',
      label: `You log in and approve — ${mcpLabel}`,
      detail: 'You sign in, review what the agent wants to do, and grant permission.',
      mcpNodeId: mcp.nodeId,
    });

    if (err?.stage === 'obo-consent') {
      steps.push(failHere('iam', 'user', `Consent rejected — ${mcpLabel}`, err));
      return { steps, nextNum: n };
    }
    if (err?.stage === 'obo-token') {
      steps.push(failHere('iam', 'agent', `OBO token exchange failed — ${mcpLabel}`, err));
      return { steps, nextNum: n };
    }

    steps.push({
      from: 'iam', to: 'agent', num: n++, type: 'token', tokenType: 'obo',
      label: `OBO Token issued — ${mcpLabel}`,
      detail: 'The Auth Server issues a special token that carries both identities — the agent AND you.',
      mcpNodeId: mcp.nodeId,
    });
  }

  // Tool call ───────────────────────────────────────────────────────
  if (tool) {
    const toolName = stripNodeSuffix(tool.publicName);
    const tokenType: 'agent' | 'obo' = mcp.oboToken ? 'obo' : 'agent';
    const tokenLabel = tokenType === 'obo' ? 'OBO Token' : 'Agent Token';
    steps.push({
      from: 'agent', to: mcpLane, num: n++, type: 'secure', tokenType,
      label: `Agent calls ${toolName}`,
      detail: `Sends request with Authorization: Bearer <${tokenLabel}>. The service verifies the token before responding.`,
      mcpNodeId: mcp.nodeId,
    });

    if (tool.ok) {
      steps.push({
        from: mcpLane, to: 'agent', num: n++, type: 'response',
        label: `${mcpLabel} verifies and responds`,
        detail: `Token verified ✓ — service confirmed ${tokenType === 'obo' ? 'both the agent and user identity' : 'the agent is authorized'}. Data returned.`,
        mcpNodeId: mcp.nodeId,
      });
    } else {
      const badge =
        [tool.statusCode ? `HTTP ${tool.statusCode}` : null, tool.errorCode || null]
          .filter(Boolean)
          .join(' · ') || 'failed';
      steps.push({
        from: mcpLane, to: 'agent', num: n++, type: 'error',
        label: `${mcpLabel} rejected the call`,
        detail: tool.errorDescription || tool.result || 'Tool execution failed',
        mcpNodeId: mcp.nodeId,
        errorBadge: badge,
      });
    }
  } else if (err?.stage === 'connect' || err?.stage === 'tool-call') {
    // Auth ok but couldn't actually reach / use the MCP server.
    steps.push(failHere('agent', mcpLane, `Could not call ${mcpLabel}`, err));
  }

  return { steps, nextNum: n };
}

function buildAllSteps(mcps: MCPNodeTrace[], tools: ToolCallTrace[]): AuthStep[] {
  const all: AuthStep[] = [];
  let n = 1;
  for (const mcp of mcps) {
    const { steps, nextNum } = buildAuthStepsForMcp(mcp, tools, n);
    all.push(...steps);
    n = nextNum;
  }
  return all;
}

function getBoxes(mcps: MCPNodeTrace[], W: number, H: number): Boxes {
  const boxes: Boxes = {} as Boxes;
  const hasIAM = mcps.some((m) => perMcpFlow(m) !== 'none');
  const hasUser = mcps.some((m) => perMcpFlow(m) === 'obo');

  boxes.agent = {
    x: W / 2 - 85, y: H / 2 - 45, w: 170, h: 90,
    label: 'Smart Agent', sublabel: '(AI Assistant)',
    color: '#475569', bg: '#f1f5f9', border: '#94a3b8',
    inner: 'MCP Client',
  };

  // Stack the MCP boxes vertically on the right side.
  const mcpW = 165;
  const mcpH = 56;
  const gap = 14;
  const totalH = mcps.length * mcpH + Math.max(0, mcps.length - 1) * gap;
  const startY = Math.max(20, H / 2 - totalH / 2);
  mcps.forEach((mcp, i) => {
    const endpointHost = mcp.endpoint.replace(/^https?:\/\//, '').split('/')[0];
    const hasError = !!mcp.authError;
    boxes[mcpLaneId(mcp)] = {
      x: W - mcpW - 30, y: startY + i * (mcpH + gap), w: mcpW, h: mcpH,
      label: mcpDisplayName(mcp),
      sublabel: `(${endpointHost})`,
      color: hasError ? '#b91c1c' : '#6d28d9',
      bg: hasError ? '#fef2f2' : '#fef9c3',
      border: hasError ? '#ef4444' : '#a3a3a3',
      hasError,
    };
  });

  if (hasIAM) {
    boxes.iam = {
      x: 30, y: 24, w: 150, h: 70,
      label: 'Asgardeo IAM', sublabel: '(Auth Server)',
      color: '#b45309', bg: '#fffbeb', border: '#f59e0b', lock: true,
    };
  }

  if (hasUser) {
    boxes.user = {
      x: 30, y: H - 90, w: 130, h: 65,
      label: 'You', sublabel: '(User)',
      color: '#2563eb', bg: '#eff6ff', border: '#3b82f6',
    };
  }

  return boxes;
}

function edgePoint(box: Box, angle: number): { x: number; y: number } {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const hw = box.w / 2 + 8;
  const hh = box.h / 2 + 8;
  if (Math.abs(Math.cos(angle)) * hh > Math.abs(Math.sin(angle)) * hw) {
    const s = Math.sign(Math.cos(angle));
    return { x: cx + s * hw, y: cy + Math.tan(angle) * s * hw };
  }
  const s = Math.sign(Math.sin(angle));
  return { x: cx + (1 / Math.tan(angle)) * s * hh, y: cy + s * hh };
}

interface ArrowPath {
  sx: number; sy: number; mx: number; my: number; ex: number; ey: number;
}

function getArrowPath(fromBox: Box | undefined, toBox: Box | undefined, curveAmt: number): ArrowPath | null {
  if (!fromBox || !toBox) return null;
  const fc = { x: fromBox.x + fromBox.w / 2, y: fromBox.y + fromBox.h / 2 };
  const tc = { x: toBox.x + toBox.w / 2, y: toBox.y + toBox.h / 2 };
  const angle = Math.atan2(tc.y - fc.y, tc.x - fc.x);
  const s = edgePoint(fromBox, angle);
  const e = edgePoint(toBox, angle + Math.PI);
  const mx = (s.x + e.x) / 2 - Math.sin(angle) * (curveAmt || 0);
  const my = (s.y + e.y) / 2 + Math.cos(angle) * (curveAmt || 0);
  return { sx: s.x, sy: s.y, mx, my, ex: e.x, ey: e.y };
}

function BoxEl({ box, active, glowColor }: { box: Box; active: boolean; glowColor: string | null }) {
  return (
    <g>
      {active && glowColor && (
        <rect x={box.x - 5} y={box.y - 5} width={box.w + 10} height={box.h + 10}
          rx={14} fill="none" stroke={glowColor} strokeWidth={3} style={{ animation: 'authFlowOverviewGlow 1.2s infinite' }} />
      )}
      <rect x={box.x + 2} y={box.y + 3} width={box.w} height={box.h} rx={10} fill="rgba(0,0,0,0.04)" />
      <rect x={box.x} y={box.y} width={box.w} height={box.h}
        rx={10} fill={box.bg} stroke={box.border} strokeWidth={box.lock || box.hasError ? 2.5 : 1.5} />
      {box.lock && (
        <g transform={`translate(${box.x + 10}, ${box.y - 10})`}>
          <rect y={6} width={14} height={12} rx={2} fill="#f59e0b" />
          <path d="M2.5,6 V3 a4.5,4.5 0 0 1 9,0 V6" fill="none" stroke="#f59e0b" strokeWidth={1.8} strokeLinecap="round" />
        </g>
      )}
      {box.hasError && (
        <g transform={`translate(${box.x + box.w - 22}, ${box.y - 9})`}>
          <circle cx={9} cy={9} r={9} fill="#ef4444" />
          <text x={9} y={13} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">!</text>
        </g>
      )}
      {box.inner && (
        <>
          <rect x={box.x + 20} y={box.y + box.h - 28} width={box.w - 40} height={20}
            rx={4} fill="#fff" stroke="#8b5cf6" strokeWidth={1} />
          <text x={box.x + box.w / 2} y={box.y + box.h - 14.5} textAnchor="middle"
            fontSize={9} fontWeight={600} fill="#7c3aed">{box.inner}</text>
        </>
      )}
      <text x={box.x + box.w / 2} y={box.y + (box.inner ? 24 : box.h / 2 - (box.sublabel ? 4 : 0))}
        textAnchor="middle" fontSize={12.5} fontWeight={700} fill={box.color}>{box.label}</text>
      {box.sublabel && (
        <text x={box.x + box.w / 2} y={box.y + (box.inner ? 37 : box.h / 2 + 12)}
          textAnchor="middle" fontSize={9} fill={box.color} opacity={0.7}>{box.sublabel}</text>
      )}
    </g>
  );
}

function ArrowSVG({ path, color, dashed, thick, op }: { path: ArrowPath | null; color: string; dashed?: boolean; thick?: boolean; op: number }) {
  const id = React.useId();
  if (!path) return null;
  return (
    <g opacity={op}>
      <defs>
        <marker id={id} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0,8 3,0 6" fill={color} />
        </marker>
      </defs>
      <path d={`M${path.sx},${path.sy} Q${path.mx},${path.my} ${path.ex},${path.ey}`}
        fill="none" stroke={color} strokeWidth={thick ? 2.8 : 1.6}
        strokeDasharray={dashed ? '6 4' : undefined} markerEnd={`url(#${id})`} />
    </g>
  );
}

function Badge({ x, y, num, color }: { x: number; y: number; num: number; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={11} fill={color} />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">{num}</text>
    </g>
  );
}

function TokenTag({ x, y, tokenType }: { x: number; y: number; tokenType: 'agent' | 'obo' }) {
  const isObo = tokenType === 'obo';
  return (
    <g>
      <rect x={x - 38} y={y - 9} width={76} height={18} rx={4}
        fill={isObo ? '#dcfce7' : '#fef3c7'} stroke={isObo ? '#22c55e' : '#f59e0b'} strokeWidth={1} />
      <text x={x} y={y + 3} textAnchor="middle" fontSize={8.5} fontWeight={700}
        fill={isObo ? '#16a34a' : '#b45309'}>{isObo ? 'OBO Token' : 'Agent Token'}</text>
    </g>
  );
}

function WarningTag({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 32} y={y - 9} width={64} height={18} rx={4} fill="#fef2f2" stroke="#ef4444" strokeWidth={1} />
      <text x={x} y={y + 3} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#ef4444">⚠ No Auth</text>
    </g>
  );
}

function ErrorTag({ x, y, text }: { x: number; y: number; text: string }) {
  const w = Math.max(64, Math.min(160, text.length * 6.2 + 14));
  return (
    <g>
      <rect x={x - w / 2} y={y - 10} width={w} height={20} rx={4} fill="#fef2f2" stroke="#ef4444" strokeWidth={1.2} />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#b91c1c">❌ {text}</text>
    </g>
  );
}

const STEP_STYLES: Record<StepType, { bg: string; border: string; icon: string }> = {
  auth: { bg: '#fffbeb', border: '#fcd34d', icon: '🔐' },
  token: { bg: '#fef3c7', border: '#f59e0b', icon: '🎫' },
  consent: { bg: '#eff6ff', border: '#60a5fa', icon: '👤' },
  secure: { bg: '#f0fdf4', border: '#4ade80', icon: '🔒' },
  unsecure: { bg: '#fef2f2', border: '#f87171', icon: '⚠️' },
  response: { bg: '#f0fdf4', border: '#86efac', icon: '✅' },
  error: { bg: '#fef2f2', border: '#ef4444', icon: '❌' },
  normal: { bg: '#f8fafc', border: '#e2e8f0', icon: '➡️' },
};

function StepCard({ step }: { step: AuthStep | null }) {
  if (!step) {
    return (
      <div className="px-[18px] py-3.5 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-slate-400 text-xs text-center">
        Press <strong className="font-semibold">Play</strong> or <strong className="font-semibold">Show All</strong> to walk through the auth flow.
      </div>
    );
  }
  const s = STEP_STYLES[step.type] || STEP_STYLES.normal;
  return (
    <div
      className="px-[18px] py-3.5 rounded-xl flex gap-3 items-start"
      style={{ background: s.bg, border: `1.5px solid ${s.border}`, animation: 'authFlowOverviewFadeIn 0.3s ease' }}
    >
      <span className="text-[22px] flex-shrink-0">{s.icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-bold text-slate-900 flex flex-wrap items-center gap-2">
          <span>Step {step.num} — {step.label}</span>
          {step.errorBadge && (
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-red-200 text-red-900">
              {step.errorBadge}
            </span>
          )}
        </div>
        {step.detail && <div className="text-xs text-slate-500 mt-0.5 leading-relaxed break-words">{step.detail}</div>}
      </div>
    </div>
  );
}

function stepColor(type: StepType): string {
  if (type === 'auth' || type === 'token') return '#f59e0b';
  if (type === 'secure') return '#7c3aed';
  if (type === 'unsecure') return '#ef4444';
  if (type === 'error') return '#dc2626';
  if (type === 'response') return '#22c55e';
  if (type === 'consent') return '#3b82f6';
  return '#94a3b8';
}

const KEYFRAMES = `
@keyframes authFlowOverviewFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes authFlowOverviewGlow { 0%,100% { opacity: 0.6; } 50% { opacity: 0.2; } }
`;

export function AuthFlowOverview({ trace }: Props) {
  const realTools = useMemo(
    () => trace.tools.filter((t) => t.publicName !== 'tool_search'),
    [trace.tools],
  );

  const steps = useMemo(
    () => buildAllSteps(trace.mcps, realTools),
    [trace.mcps, realTools],
  );

  const [cur, setCur] = useState(-1);
  const [playing, setPlaying] = useState(false);

  // Autoplay whenever the trace changes (including on first mount) so the
  // page kicks off the walkthrough on its own.
  useEffect(() => {
    setCur(-1);
    setPlaying(false);
    if (trace.mcps.length === 0) return;
    const t = setTimeout(() => {
      setCur(0);
      setPlaying(true);
    }, 80);
    return () => clearTimeout(t);
  }, [trace]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setCur((p) => {
        // Loop back to the start once we run off the end. Reset stops it.
        if (p >= steps.length - 1) return 0;
        return p + 1;
      });
    }, 1100);
    return () => clearInterval(t);
  }, [playing, steps.length]);

  const W = 720;
  const hasUser = trace.mcps.some((m) => perMcpFlow(m) === 'obo');
  const mcpCount = trace.mcps.length;
  const mcpAreaH = mcpCount * 56 + Math.max(0, mcpCount - 1) * 14;
  const H = Math.max(hasUser ? 360 : 260, mcpAreaH + 80);

  const boxes = useMemo(
    () => (mcpCount > 0 ? getBoxes(trace.mcps, W, H) : ({} as Boxes)),
    [trace.mcps, W, H, mcpCount],
  );

  const curveOffsets = useMemo(() => {
    const pairMap: Record<string, number[]> = {};
    steps.forEach((s, i) => {
      const key = [s.from, s.to].sort().join('|');
      if (!pairMap[key]) pairMap[key] = [];
      pairMap[key].push(i);
    });
    const offsets = new Array(steps.length).fill(0);
    Object.values(pairMap).forEach((indices) => {
      if (indices.length <= 1) return;
      const spread = 28;
      indices.forEach((idx, j) => {
        offsets[idx] = -spread + (j * (2 * spread)) / Math.max(1, indices.length - 1);
      });
    });
    return offsets;
  }, [steps]);

  if (trace.mcps.length === 0) {
    return (
      <>
        <style>{KEYFRAMES}</style>
        <div className="p-6 rounded-xl bg-white border border-dashed border-slate-300 text-center text-slate-500 text-sm">
          <div className="text-sm font-bold text-slate-700 mb-1">No Auth Flows in this run</div>
          The auth flow overview appears when the workflow connects to one or more authentication services.
        </div>
      </>
    );
  }

  const curStep = cur >= 0 && cur < steps.length ? steps[cur] : null;
  const activeSet = new Set<LaneId>();
  let glowClr: string | null = null;
  if (curStep) {
    activeSet.add(curStep.from);
    activeSet.add(curStep.to);
    glowClr = stepColor(curStep.type);
  }

  const play = () => { setCur(-1); setTimeout(() => { setCur(0); setPlaying(true); }, 80); };
  const showAll = () => { setPlaying(false); setCur(steps.length - 1); };

  const failedCount = trace.mcps.filter((m) => m.authError).length +
    realTools.filter((t) => !t.ok && !trace.mcps.find((m) => m.nodeId === t.nodeId && m.authError)).length;

  return (
    <div>
      <style>{KEYFRAMES}</style>
      <h2 className="text-lg font-bold text-slate-900 mb-1">Authentication Flow</h2>
      <p className="text-sm text-slate-500 mb-3">
        This workflow connects to {trace.mcps.length} service{trace.mcps.length > 1 ? 's' : ''}. All auth flows are shown together below — step numbers run in execution order.
        {failedCount > 0 && (
          <span className="ml-1 text-red-700 font-semibold">
            {failedCount} step{failedCount > 1 ? 's' : ''} failed.
          </span>
        )}
      </p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {trace.mcps.map((mcp) => {
          const flow = perMcpFlow(mcp);
          const flowColor = flow === 'obo' ? '#22c55e' : flow === 'agent' ? '#f59e0b' : '#94a3b8';
          const flowLabel = flow === 'obo' ? 'OBO' : flow === 'agent' ? 'AGENT' : 'NONE';
          const hasError = !!mcp.authError;
          return (
            <span
              key={mcp.nodeId}
              className="px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 border"
              style={{
                background: hasError ? '#fef2f2' : '#f8fafc',
                borderColor: hasError ? '#ef4444' : '#e2e8f0',
                color: hasError ? '#b91c1c' : '#334155',
              }}
            >
              <span>{mcpDisplayName(mcp)}</span>
              <span
                className="text-[9px] font-bold px-1 py-0.5 rounded"
                style={{ background: flowColor + '22', color: flowColor }}
              >
                {flowLabel}
              </span>
              {hasError && (
                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-200 text-red-900">
                  ⛔ {mcp.authError!.errorCode || `HTTP ${mcp.authError!.statusCode ?? 'err'}`}
                </span>
              )}
            </span>
          );
        })}
      </div>

      <div className="flex gap-1.5 items-center mb-2.5 flex-wrap">
        <Button
          onClick={play}
          disabled={steps.length === 0}
          size="sm"
          className="bg-[#6c5ce7] hover:bg-[#5b4dd0] text-white text-xs font-semibold"
        >
          ▶ Play
        </Button>
        <Button onClick={showAll} disabled={steps.length === 0} size="sm" variant="outline" className="text-xs font-semibold">
          Show All
        </Button>
        <Button onClick={() => { setCur(-1); setPlaying(false); }} size="sm" variant="outline" className="text-xs font-semibold">
          Reset
        </Button>
        <div className="w-px h-5 bg-slate-200 mx-0.5" />
        <Button
          disabled={cur <= -1}
          onClick={() => setCur((s) => Math.max(-1, s - 1))}
          size="sm"
          variant="outline"
          className="text-xs px-2.5"
        >
          ‹
        </Button>
        <Button
          disabled={cur >= steps.length - 1}
          onClick={() => { setPlaying(false); setCur((s) => Math.min(steps.length - 1, s + 1)); }}
          size="sm"
          variant="outline"
          className="text-xs px-2.5"
        >
          ›
        </Button>
        <span className="ml-auto text-[11px] text-slate-400 font-mono">
          {Math.max(0, cur + 1)} / {steps.length}
        </span>
      </div>

      <div className="mb-2.5">
        <StepCard step={curStep} />
      </div>

      <div className="max-w-[720px] mx-auto bg-white rounded-xl border border-slate-200 overflow-hidden mb-3.5">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
          {(Object.entries(boxes) as [LaneId, Box][]).map(([id, box]) => (
            <BoxEl key={id} box={box} active={activeSet.has(id)} glowColor={activeSet.has(id) ? glowClr : null} />
          ))}
          {steps.map((step, i) => {
            if (i > cur) return null;
            const fromBox = boxes[step.from];
            const toBox = boxes[step.to];
            const path = getArrowPath(fromBox, toBox, curveOffsets[i]);
            if (!path) return null;
            const isCur = i === cur;
            const color = stepColor(step.type);
            const dashed = step.type !== 'normal';
            return (
              <g key={i}>
                <ArrowSVG path={path} color={color} dashed={dashed} thick={isCur} op={isCur ? 1 : 0.18} />
                <Badge x={path.mx} y={path.my} num={step.num} color={isCur ? color : '#cbd5e1'} />
                {isCur && (step.type === 'token' || step.type === 'secure') && step.tokenType && (
                  <TokenTag x={path.mx} y={path.my - 18} tokenType={step.tokenType} />
                )}
                {isCur && step.type === 'unsecure' && (
                  <WarningTag x={path.mx} y={path.my - 18} />
                )}
                {isCur && step.type === 'error' && step.errorBadge && (
                  <ErrorTag x={path.mx} y={path.my - 18} text={step.errorBadge} />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 flex gap-3.5 flex-wrap text-[11px] text-slate-500">
        {[
          { color: '#f59e0b', label: 'Auth exchange', dash: true },
          { color: '#7c3aed', label: 'Secured call', dash: true },
          { color: '#22c55e', label: 'Response', dash: true },
          { color: '#3b82f6', label: 'User consent', dash: true },
          { color: '#ef4444', label: 'Unsecured', dash: true },
          { color: '#dc2626', label: 'Failure', dash: true },
        ].map((l, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <svg width={24} height={8}>
              <line x1={0} y1={4} x2={24} y2={4} stroke={l.color} strokeWidth={2} strokeDasharray={l.dash ? '4 3' : undefined} />
            </svg>
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
