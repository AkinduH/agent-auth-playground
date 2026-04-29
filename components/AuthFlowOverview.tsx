'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { MCPNodeTrace, WorkflowTrace, ToolCallTrace } from '@/lib/authTrace';

interface Props {
  trace: WorkflowTrace;
}

type StepType = 'auth' | 'token' | 'consent' | 'secure' | 'unsecure' | 'response' | 'normal';
type LaneId = 'agent' | 'mcp' | 'iam' | 'user';

interface AuthStep {
  from: LaneId;
  to: LaneId;
  num: number;
  type: StepType;
  label: string;
  detail: string;
  tokenType?: 'agent' | 'obo';
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
}

type Boxes = Partial<Record<LaneId, Box>>;

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

function buildAuthSteps(mcp: MCPNodeTrace, tools: ToolCallTrace[]): AuthStep[] {
  const steps: AuthStep[] = [];
  const tool = tools.find((t) => t.nodeId === mcp.nodeId);
  const flow = perMcpFlow(mcp);
  const mcpLabel = mcpDisplayName(mcp);

  if (flow === 'none') {
    if (tool) {
      const toolName = stripNodeSuffix(tool.publicName);
      steps.push({
        from: 'agent', to: 'mcp', num: 1, type: 'unsecure',
        label: `Agent calls ${mcpLabel}`,
        detail: `Tool: ${toolName} — no identity proof attached. The service cannot verify who is calling.`,
      });
      steps.push({
        from: 'mcp', to: 'agent', num: 2, type: 'response',
        label: `${mcpLabel} returns result`,
        detail: tool.ok ? 'Data returned, but service had no way to verify the caller.' : 'Error occurred.',
      });
    }
    return steps;
  }

  let n = 1;
  steps.push({
    from: 'agent', to: 'iam', num: n++, type: 'auth',
    label: 'Agent authenticates',
    detail: 'The agent securely proves its identity to the Auth Server using its credentials.',
  });
  steps.push({
    from: 'iam', to: 'agent', num: n++, type: 'token', tokenType: 'agent',
    label: 'Agent Token issued',
    detail: "The Auth Server verifies the agent and issues an Access Token — the agent's digital ID badge.",
  });

  if (flow === 'obo') {
    steps.push({
      from: 'agent', to: 'user', num: n++, type: 'consent',
      label: 'Agent asks for your permission',
      detail: `"I need to access ${mcpLabel} on your behalf." You see an Authorize button.`,
    });
    steps.push({
      from: 'user', to: 'iam', num: n++, type: 'auth',
      label: 'You log in and approve',
      detail: 'You sign in, review what the agent wants to do, and grant permission.',
    });
    steps.push({
      from: 'iam', to: 'agent', num: n++, type: 'token', tokenType: 'obo',
      label: 'OBO Token issued',
      detail: 'The Auth Server issues a special token that carries both identities — the agent AND you.',
    });
  }

  if (tool) {
    const toolName = stripNodeSuffix(tool.publicName);
    const tokenType: 'agent' | 'obo' = mcp.oboToken ? 'obo' : 'agent';
    const tokenLabel = tokenType === 'obo' ? 'OBO Token' : 'Agent Token';
    steps.push({
      from: 'agent', to: 'mcp', num: n++, type: 'secure', tokenType,
      label: `Agent calls ${toolName}`,
      detail: `Sends request with Authorization: Bearer <${tokenLabel}>. The service verifies the token before responding.`,
    });
    steps.push({
      from: 'mcp', to: 'agent', num: n++, type: 'response',
      label: `${mcpLabel} verifies and responds`,
      detail: tool.ok
        ? `Token verified ✓ — service confirmed ${tokenType === 'obo' ? 'both the agent and user identity' : 'the agent is authorized'}. Data returned.`
        : 'Error occurred during tool execution.',
    });
  }

  return steps;
}

function getBoxes(mcp: MCPNodeTrace, W: number, H: number): Boxes {
  const flow = perMcpFlow(mcp);
  const hasIAM = flow !== 'none';
  const hasUser = flow === 'obo';
  const boxes: Boxes = {};

  boxes.agent = {
    x: W / 2 - 85, y: H / 2 - 45, w: 170, h: 90,
    label: 'Smart Agent', sublabel: '(AI Assistant)',
    color: '#475569', bg: '#f1f5f9', border: '#94a3b8',
    inner: 'MCP Client',
  };

  const endpointHost = mcp.endpoint.replace(/^https?:\/\//, '').split('/')[0];
  boxes.mcp = {
    x: W - 185, y: H / 2 - 35, w: 155, h: 70,
    label: mcpDisplayName(mcp),
    sublabel: `(${endpointHost})`,
    color: '#6d28d9', bg: '#fef9c3', border: '#a3a3a3',
  };

  if (hasIAM) {
    boxes.iam = {
      x: 40, y: 24, w: 150, h: 72,
      label: 'Asgardeo IAM', sublabel: '(Auth Server)',
      color: '#b45309', bg: '#fffbeb', border: '#f59e0b', lock: true,
    };
  }

  if (hasUser) {
    boxes.user = {
      x: 40, y: H - 95, w: 130, h: 65,
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
        rx={10} fill={box.bg} stroke={box.border} strokeWidth={box.lock ? 2.5 : 1.5} />
      {box.lock && (
        <g transform={`translate(${box.x + 10}, ${box.y - 10})`}>
          <rect y={6} width={14} height={12} rx={2} fill="#f59e0b" />
          <path d="M2.5,6 V3 a4.5,4.5 0 0 1 9,0 V6" fill="none" stroke="#f59e0b" strokeWidth={1.8} strokeLinecap="round" />
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
          textAnchor="middle" fontSize={9} fill={box.color} opacity={0.6}>{box.sublabel}</text>
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

const STEP_STYLES: Record<StepType, { bg: string; border: string; icon: string }> = {
  auth: { bg: '#fffbeb', border: '#fcd34d', icon: '🔐' },
  token: { bg: '#fef3c7', border: '#f59e0b', icon: '🎫' },
  consent: { bg: '#eff6ff', border: '#60a5fa', icon: '👤' },
  secure: { bg: '#f0fdf4', border: '#4ade80', icon: '🔒' },
  unsecure: { bg: '#fef2f2', border: '#f87171', icon: '⚠️' },
  response: { bg: '#f0fdf4', border: '#86efac', icon: '✅' },
  normal: { bg: '#f8fafc', border: '#e2e8f0', icon: '➡️' },
};

function StepCard({ step }: { step: AuthStep | null }) {
  if (!step) {
    return (
      <div style={{
        padding: '14px 18px', borderRadius: 12, background: '#f8fafc',
        border: '1.5px dashed #cbd5e1', color: '#94a3b8', fontSize: 12, textAlign: 'center',
      }}>
        Press <strong>Play</strong> or <strong>Show All</strong> to walk through the auth flow.
      </div>
    );
  }
  const s = STEP_STYLES[step.type] || STEP_STYLES.normal;
  return (
    <div style={{
      padding: '14px 18px', borderRadius: 12, background: s.bg,
      border: `1.5px solid ${s.border}`, display: 'flex', gap: 12,
      alignItems: 'flex-start', animation: 'authFlowOverviewFadeIn 0.3s ease',
    }}>
      <span style={{ fontSize: 22, flexShrink: 0 }}>{s.icon}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Step {step.num} — {step.label}</div>
        {step.detail && <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, lineHeight: 1.6 }}>{step.detail}</div>}
      </div>
    </div>
  );
}

function FlowSummary({ mcp }: { mcp: MCPNodeTrace }) {
  const flow = perMcpFlow(mcp);
  const flowLabels = {
    agent: { title: 'Agent Authentication (OAuth2 + PKCE)', color: '#f59e0b', desc: 'The agent proves its own identity. The service knows which agent is calling, but not which user.' },
    obo: { title: 'On-Behalf-Of (OBO)', color: '#22c55e', desc: 'The agent authenticates itself, then YOU give explicit consent. The service knows both the agent AND the user.' },
    none: { title: 'No Authentication', color: '#ef4444', desc: 'No identity verification. The service has no idea who is calling — risky for private data.' },
  };
  const f = flowLabels[flow];
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10, borderLeft: `4px solid ${f.color}`,
      background: '#fff', marginBottom: 12, border: '1px solid #e2e8f0', borderLeftWidth: 4,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{f.title}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>{f.desc}</div>
    </div>
  );
}

function stepColor(type: StepType): string {
  if (type === 'auth' || type === 'token') return '#f59e0b';
  if (type === 'secure') return '#7c3aed';
  if (type === 'unsecure') return '#ef4444';
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

  const [activeMcpIdx, setActiveMcpIdx] = useState(0);

  useEffect(() => {
    setActiveMcpIdx((idx) => (idx >= trace.mcps.length ? 0 : idx));
  }, [trace.mcps.length]);

  const activeMcp = trace.mcps[activeMcpIdx];
  const steps = useMemo(
    () => (activeMcp ? buildAuthSteps(activeMcp, realTools) : []),
    [activeMcp, realTools],
  );

  const [cur, setCur] = useState(-1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => { setCur(-1); setPlaying(false); }, [activeMcpIdx, trace]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setCur((p) => {
        if (p >= steps.length - 1) {
          setPlaying(false);
          return p;
        }
        return p + 1;
      });
    }, 1100);
    return () => clearInterval(t);
  }, [playing, steps.length]);

  const W = 680;
  const H = activeMcp && perMcpFlow(activeMcp) === 'obo' ? 340 : 260;
  const boxes = useMemo(
    () => (activeMcp ? getBoxes(activeMcp, W, H) : {}),
    [activeMcp, W, H],
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
      const spread = 24;
      indices.forEach((idx, j) => {
        offsets[idx] = -spread + j * (2 * spread / (indices.length - 1));
      });
    });
    return offsets;
  }, [steps]);

  if (trace.mcps.length === 0) {
    return (
      <>
        <style>{KEYFRAMES}</style>
        <div style={{
          padding: 24, borderRadius: 14, background: '#fff', border: '1px dashed #cbd5e1',
          textAlign: 'center', color: '#64748b', fontSize: 13,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
            No MCP servers in this run
          </div>
          The auth flow overview appears when the workflow connects to one or more MCP servers.
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

  return (
    <div>
      <style>{KEYFRAMES}</style>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Authentication Flow</h2>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
        This workflow connects to {trace.mcps.length} service{trace.mcps.length > 1 ? 's' : ''}, each with its own authentication. Select a service to see its auth flow.
      </p>

      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #e2e8f0', flexWrap: 'wrap' }}>
        {trace.mcps.map((mcp, i) => {
          const active = i === activeMcpIdx;
          const flow = perMcpFlow(mcp);
          const flowColor = flow === 'obo' ? '#22c55e' : flow === 'agent' ? '#f59e0b' : '#94a3b8';
          const flowLabel = flow === 'obo' ? 'OBO' : flow === 'agent' ? 'AGENT' : 'NONE';
          return (
            <button
              key={mcp.nodeId}
              onClick={() => setActiveMcpIdx(i)}
              style={{
                padding: '10px 18px', cursor: 'pointer', border: 'none',
                borderBottom: `3px solid ${active ? flowColor : 'transparent'}`,
                background: active ? '#fff' : 'transparent', marginBottom: -2,
                color: active ? '#1e293b' : '#64748b', fontSize: 13,
                fontWeight: active ? 700 : 500,
                transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span>{mcpDisplayName(mcp)}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                background: flowColor + '18', color: flowColor,
              }}>
                {flowLabel}
              </span>
            </button>
          );
        })}
      </div>

      {activeMcp && <FlowSummary mcp={activeMcp} />}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <button onClick={play} disabled={steps.length === 0}
          style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#6c5ce7', color: '#fff', fontSize: 12, fontWeight: 600, cursor: steps.length === 0 ? 'not-allowed' : 'pointer', opacity: steps.length === 0 ? 0.5 : 1 }}>
          ▶ Play
        </button>
        <button onClick={showAll} disabled={steps.length === 0}
          style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600, cursor: steps.length === 0 ? 'not-allowed' : 'pointer', opacity: steps.length === 0 ? 0.5 : 1 }}>
          Show All
        </button>
        <button onClick={() => { setCur(-1); setPlaying(false); }}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Reset
        </button>
        <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 2px' }} />
        <button disabled={cur <= -1} onClick={() => setCur((s) => Math.max(-1, s - 1))}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: cur <= -1 ? 0.35 : 1 }}>
          ‹
        </button>
        <button disabled={cur >= steps.length - 1} onClick={() => { setPlaying(false); setCur((s) => Math.min(steps.length - 1, s + 1)); }}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: cur >= steps.length - 1 ? 0.35 : 1 }}>
          ›
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          {Math.max(0, cur + 1)} / {steps.length}
        </span>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 14 }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
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
              </g>
            );
          })}
        </svg>
      </div>

      <StepCard step={curStep} />

      <div style={{ marginTop: 16, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: '#64748b' }}>
        {[
          { color: '#f59e0b', label: 'Auth exchange', dash: true },
          { color: '#7c3aed', label: 'Secured call', dash: true },
          { color: '#22c55e', label: 'Response', dash: true },
          { color: '#ef4444', label: 'Unsecured', dash: true },
          { color: '#3b82f6', label: 'User consent', dash: true },
        ].map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
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
