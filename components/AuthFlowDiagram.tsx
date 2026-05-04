'use client';

import { useEffect, useMemo, useState } from 'react';
import { WorkflowTrace, MCPNodeTrace, ToolCallTrace, AuthErrorTrace, previewToken } from '@/lib/authTrace';
import { Button } from '@/components/ui/button';

interface Props {
  trace: WorkflowTrace;
}

interface Lane {
  id: string;
  label: string;
  sublabel?: string;
  x: number;
  shape: 'circle' | 'rect';
  fill: string;
  stroke: string;
  textColor: string;
}

type ColorKind = 'default' | 'auth' | 'blue' | 'green' | 'red';

type Item =
  | { kind: 'section'; label: string; failed?: boolean }
  | {
      kind: 'message';
      from: string;
      to: string;
      label: string;
      sublabel?: string;
      color?: ColorKind;
      dashed?: boolean;
      token?: string;
      tokenLabel?: string;
      error?: { statusCode?: number; errorCode?: string; errorDescription?: string };
      skipped?: boolean;
    };

const COLORS: Record<ColorKind, string> = {
  default: '#475569',
  auth: '#d97706',
  blue: '#2563eb',
  green: '#059669',
  red: '#dc2626',
};

const STAGE_LABELS: Record<AuthErrorTrace['stage'], string> = {
  config: 'Configuration',
  authorize: 'Authorize',
  authn: 'Authenticate (credentials are invalid)',
  token: 'Token Exchange',
  'obo-consent': 'OBO User Consent',
  'obo-token': 'OBO Token Exchange',
  connect: 'MCP Connect',
  'tool-call': 'Tool Call',
};

function failureSummaryLine(err: AuthErrorTrace): string {
  const status = err.statusCode ? `HTTP ${err.statusCode}` : '';
  const code = err.errorCode ? err.errorCode : '';
  const desc = err.errorDescription || err.message || '';
  return [status, code, desc].filter(Boolean).join('  ·  ');
}

function buildFailureResponse(
  from: string,
  to: string,
  err: AuthErrorTrace,
  defaultLabel: string
): Item {
  const codeBits = [
    err.statusCode ? `HTTP ${err.statusCode}` : null,
    err.errorCode || null,
  ].filter(Boolean);
  const headline =
    codeBits.length > 0
      ? `❌  ${codeBits.join('  ·  ')}  —  ${defaultLabel} failed`
      : `❌  ${defaultLabel} failed`;
  return {
    kind: 'message',
    from,
    to,
    label: headline,
    sublabel: err.errorDescription || err.message,
    color: 'red',
    dashed: true,
    error: {
      statusCode: err.statusCode,
      errorCode: err.errorCode,
      errorDescription: err.errorDescription,
    },
  };
}

function pushSkippedNotice(items: Item[], mcpLabel: string, err: AuthErrorTrace) {
  const stage = STAGE_LABELS[err.stage] || err.stage;
  items.push({
    kind: 'message',
    from: 'Agent',
    to: 'Agent',
    label: `⏭  Subsequent steps skipped — flow halted at ${stage}`,
    sublabel: `Remaining auth + tool steps for ${mcpLabel} were never attempted`,
    color: 'red',
    dashed: true,
    skipped: true,
  });
}

// ── Builders ───────────────────────────────────────────────────────────────────

function buildLanes(trace: WorkflowTrace): Lane[] {
  const lanes: Lane[] = [
    { id: 'User', label: 'User', x: 0, shape: 'circle', fill: '#f97316', stroke: '#ea580c', textColor: '#ffffff' },
    { id: 'App', label: 'App', x: 0, shape: 'rect', fill: '#fdf4f0', stroke: '#94a3b8', textColor: '#334155' },
    { id: 'Agent', label: 'Agent', x: 0, shape: 'rect', fill: '#cbd5e1', stroke: '#64748b', textColor: '#1e293b' },
  ];

  const hasAuth = trace.mcps.some((m) => m.flow !== 'none');
  if (hasAuth) {
    lanes.push({ id: 'IAM', label: 'IAM (Asgardeo)', x: 0, shape: 'rect', fill: '#ffedd5', stroke: '#f59e0b', textColor: '#92400e' });
  }

  lanes.push({
    id: 'LLM',
    label: trace.llm ? `${trace.llm.provider}/${trace.llm.model}` : 'LLM',
    x: 0,
    shape: 'rect',
    fill: '#cffafe',
    stroke: '#06b6d4',
    textColor: '#155e75',
  });

  for (const m of trace.mcps) {
    lanes.push({
      id: `MCP:${m.nodeId}`,
      label: mcpDisplayName(m),
      sublabel: m.endpoint,
      x: 0,
      shape: 'rect',
      fill: '#fef08a',
      stroke: '#a3a3a3',
      textColor: '#3f3f46',
    });
  }
  if (trace.mcps.length === 0) {
    lanes.push({ id: 'MCP:none', label: 'MCP', x: 0, shape: 'rect', fill: '#fef08a', stroke: '#a3a3a3', textColor: '#3f3f46' });
  }

  const startX = 100;
  const gap = 200;
  lanes.forEach((l, i) => { l.x = startX + i * gap; });
  return lanes;
}

function mcpDisplayName(m: MCPNodeTrace): string {
  return m.name?.trim() || m.nodeId;
}

function mcpFullLabel(m: MCPNodeTrace): string {
  const name = m.name?.trim();
  return name ? `${name}  ·  ${m.endpoint}` : m.endpoint;
}

// ── Per-MCP auth sections ──────────────────────────────────────────────────────

function pushAgentAuthSteps(items: Item[], mcp: MCPNodeTrace) {
  const base = mcp.iamBaseUrl ?? '';
  const authorizeUrl = mcp.authorizeUrl ?? `${base}/oauth2/authorize`;
  const authnUrl = mcp.authnUrl ?? `${base}/oauth2/authn`;
  const tokenUrl = mcp.tokenUrl ?? `${base}/oauth2/token`;
  const mcpLabel = mcpDisplayName(mcp);
  const err = mcp.authError;

  const sectionLabel = `AGENT AUTHENTICATION  ·  ${mcpLabel}  (PKCE  ·  Asgardeo Direct Auth)`;
  items.push({
    kind: 'section',
    label: err && (err.stage === 'authorize' || err.stage === 'authn' || err.stage === 'token' || err.stage === 'config')
      ? `${sectionLabel}  ·  FAILED`
      : sectionLabel,
    failed: !!err && (err.stage === 'authorize' || err.stage === 'authn' || err.stage === 'token' || err.stage === 'config'),
  });

  // Pre-flight config error — never reached the IAM at all.
  if (err && err.stage === 'config') {
    items.push({
      kind: 'message', from: 'Agent', to: 'Agent',
      label: `❌  Configuration error  —  ${err.errorCode || 'invalid config'}`,
      sublabel: err.errorDescription || err.message,
      color: 'red', dashed: true,
      error: { errorCode: err.errorCode, errorDescription: err.errorDescription },
    });
    pushSkippedNotice(items, mcpLabel, err);
    return;
  }

  items.push({
    kind: 'message', from: 'Agent', to: 'IAM',
    label: `POST ${authorizeUrl}`,
    sublabel: 'client_id, redirect_uri, response_type=code, response_mode=direct, scope, code_challenge (S256)',
    color: 'auth',
  });
  if (err?.stage === 'authorize') {
    items.push(buildFailureResponse('IAM', 'Agent', err, 'Authorize'));
    pushSkippedNotice(items, mcpLabel, err);
    return;
  }
  items.push({
    kind: 'message', from: 'IAM', to: 'Agent',
    label: 'flowId  +  authenticatorId',
    sublabel: 'response_mode=direct returns flow handle (no browser redirect)',
    color: 'auth', dashed: true,
  });

  items.push({
    kind: 'message', from: 'Agent', to: 'IAM',
    label: `POST ${authnUrl}`,
    sublabel: `flowId, selectedAuthenticator { authenticatorId, params: { username: agentId="${mcp.agentId || '—'}", password: agentSecret } }`,
    color: 'auth',
  });
  if (err?.stage === 'authn') {
    items.push(buildFailureResponse('IAM', 'Agent', err, 'Credential authentication'));
    pushSkippedNotice(items, mcpLabel, err);
    return;
  }
  items.push({
    kind: 'message', from: 'IAM', to: 'Agent',
    label: 'Authorization code',
    sublabel: 'authData.code (one-time use)',
    color: 'auth', dashed: true,
  });

  items.push({
    kind: 'message', from: 'Agent', to: 'IAM',
    label: `POST ${tokenUrl}`,
    sublabel: 'grant_type=authorization_code, client_id, code, code_verifier, redirect_uri',
    color: 'auth',
  });
  if (err?.stage === 'token') {
    items.push(buildFailureResponse('IAM', 'Agent', err, 'Token exchange'));
    pushSkippedNotice(items, mcpLabel, err);
    return;
  }
  items.push({
    kind: 'message', from: 'IAM', to: 'Agent',
    label: 'Agent access_token',
    sublabel: mcp.agentToken ? `access_token = ${previewToken(mcp.agentToken)}` : '(no token captured)',
    color: 'auth', dashed: true,
    token: mcp.agentToken,
    tokenLabel: 'Agent JWT',
  });
}

function pushOBOConsentSteps(items: Item[], mcp: MCPNodeTrace) {
  const base = mcp.iamBaseUrl ?? '';
  const authorizeUrl = mcp.authorizeUrl ?? `${base}/oauth2/authorize`;
  const tokenUrl = mcp.tokenUrl ?? `${base}/oauth2/token`;
  const mcpLabel = mcpDisplayName(mcp);
  const err = mcp.authError;

  // OBO always starts with the agent authenticating first. If agent-auth
  // fails, that section already terminates with a failure marker — abort.
  pushAgentAuthSteps(items, mcp);
  if (err && (err.stage === 'authorize' || err.stage === 'authn' || err.stage === 'token' || err.stage === 'config')) {
    return;
  }

  const consentFailed = err?.stage === 'obo-consent';
  items.push({
    kind: 'section',
    label: consentFailed
      ? `USER AUTHORIZATION  ·  ${mcpLabel}  (OBO Consent)  ·  FAILED`
      : `USER AUTHORIZATION  ·  ${mcpLabel}  (OBO Consent)`,
    failed: consentFailed,
  });
  items.push({
    kind: 'message', from: 'Agent', to: 'App',
    label: 'Build /oauth2/authorize URL',
    sublabel: 'response_type=code, scope, state, code_challenge (S256), requested_actor=agentId',
  });
  items.push({
    kind: 'message', from: 'App', to: 'User',
    label: 'Show "Authorize" button (chat consent prompt)',
    sublabel: mcp.oboAuthUrl ? truncate(mcp.oboAuthUrl, 130) : undefined,
  });
  items.push({
    kind: 'message', from: 'User', to: 'IAM',
    label: `GET ${authorizeUrl}`,
    sublabel: 'User opens auth URL in browser, IAM presents login + consent screen',
    color: 'auth',
  });
  if (consentFailed) {
    items.push(buildFailureResponse('IAM', 'User', err!, 'Login / consent'));
    pushSkippedNotice(items, mcpLabel, err!);
    return;
  }
  items.push({
    kind: 'message', from: 'IAM', to: 'User',
    label: 'User authenticates & grants consent',
    sublabel: 'Login UI confirms requested_actor (Agent) + scopes',
    color: 'auth',
  });
  items.push({
    kind: 'message', from: 'IAM', to: 'User',
    label: 'Redirect to redirect_uri with auth code',
    sublabel: 'redirect_uri?code=...&state=...',
    color: 'auth', dashed: true,
  });
  items.push({
    kind: 'message', from: 'User', to: 'Agent',
    label: 'Callback delivers auth code',
    sublabel: 'Page posts {code,state} on BroadcastChannel("obo-callback")',
  });

  const oboTokenFailed = err?.stage === 'obo-token';
  items.push({
    kind: 'section',
    label: oboTokenFailed
      ? `OBO TOKEN EXCHANGE  ·  ${mcpLabel}  ·  FAILED`
      : `OBO TOKEN EXCHANGE  ·  ${mcpLabel}`,
    failed: oboTokenFailed,
  });
  items.push({
    kind: 'message', from: 'Agent', to: 'IAM',
    label: `POST ${tokenUrl}`,
    sublabel: 'grant_type=authorization_code, client_id, code, code_verifier, redirect_uri,  actor_token = Agent Token',
    color: 'auth',
  });
  if (oboTokenFailed) {
    items.push(buildFailureResponse('IAM', 'Agent', err!, 'OBO token exchange'));
    pushSkippedNotice(items, mcpLabel, err!);
    return;
  }
  items.push({
    kind: 'message', from: 'IAM', to: 'Agent',
    label: 'OBO access_token',
    sublabel: mcp.oboToken ? `access_token = ${previewToken(mcp.oboToken)}` : '(no token captured)',
    color: 'auth', dashed: true,
    token: mcp.oboToken,
    tokenLabel: 'OBO JWT',
  });
}

function pushToolCall(items: Item[], t: ToolCallTrace, trace: WorkflowTrace) {
  const mcp = trace.mcps.find((m) => m.nodeId === t.nodeId);
  const token = mcp?.oboToken || mcp?.agentToken;
  const laneId = mcp ? `MCP:${mcp.nodeId}` : `MCP:${t.nodeId}` || 'MCP:none';
  const tokenKind = mcp?.oboToken ? 'OBO' : mcp?.agentToken ? 'Agent' : '';
  const serverLabel = mcp ? mcpFullLabel(mcp) : t.endpoint;
  items.push({
    kind: 'message', from: 'Agent', to: laneId,
    label: token
      ? `Tool call: ${stripNodeSuffix(t.publicName)}  ·  Authorization: Bearer <${tokenKind} Token>`
      : `Tool call: ${stripNodeSuffix(t.publicName)}  ·  (no auth header)`,
    sublabel: `${serverLabel}    args: ${truncate(t.args, 80)}`,
    color: 'blue', token, tokenLabel: token ? `${tokenKind} JWT` : undefined,
  });

  if (t.ok) {
    items.push({
      kind: 'message', from: laneId, to: 'Agent',
      label: `✓ Result (${stripNodeSuffix(t.publicName)})`,
      sublabel: truncate(t.result, 110),
      color: 'green', dashed: true,
    });
  } else {
    const codeBits = [
      t.statusCode ? `HTTP ${t.statusCode}` : null,
      t.errorCode || null,
    ].filter(Boolean);
    const headline = codeBits.length > 0
      ? `❌  ${codeBits.join('  ·  ')}  —  ${stripNodeSuffix(t.publicName)} failed`
      : `❌  Error (${stripNodeSuffix(t.publicName)})`;
    items.push({
      kind: 'message', from: laneId, to: 'Agent',
      label: headline,
      sublabel: t.errorDescription
        ? `${t.errorDescription}  ·  ${truncate(t.result, 90)}`
        : truncate(t.result, 110),
      color: 'red', dashed: true,
      error: {
        statusCode: t.statusCode,
        errorCode: t.errorCode,
        errorDescription: t.errorDescription,
      },
    });
  }
}

function buildItems(trace: WorkflowTrace): Item[] {
  const items: Item[] = [];

  items.push({ kind: 'section', label: 'USER REQUEST' });
  items.push({
    kind: 'message', from: 'User', to: 'App',
    label: 'Asks query',
    sublabel: trace.userMessage ? `"${truncate(trace.userMessage, 90)}"` : undefined,
  });
  items.push({ kind: 'message', from: 'App', to: 'Agent', label: 'Forward request to Agent' });

  items.push({ kind: 'section', label: 'AGENT OPERATIONS' });
  items.push({
    kind: 'message', from: 'Agent', to: 'LLM',
    label: 'Prompt + tool schemas + memory',
    sublabel: 'Builds JSON tool list, sends step prompt',
  });

  // Exclude internal tool_search calls — they are implementation details, not auth-relevant operations
  const realTools = trace.tools.filter((t) => t.publicName !== 'tool_search');

  if (realTools.length === 0) {
    items.push({
      kind: 'message', from: 'LLM', to: 'Agent',
      label: 'No tool calls in this run',
      sublabel: 'Agent answered directly',
      color: 'default', dashed: true,
    });
  } else {
    items.push({
      kind: 'message', from: 'LLM', to: 'Agent',
      label: 'Tool decision (JSON)',
      sublabel: '{ Tool call is needed. }',
      dashed: true,
  });
  }

  // Interleave auth steps and tool calls in chronological execution order.
  // MCP auth is lazy: it fires on the first tool call to each MCP node.
  const shownMCPAuth = new Set<string>();
  for (const t of realTools) {
    const mcp = trace.mcps.find((m) => m.nodeId === t.nodeId);
    if (mcp && mcp.flow !== 'none' && !shownMCPAuth.has(mcp.nodeId)) {
      shownMCPAuth.add(mcp.nodeId);
      if (mcp.flow === 'agent') {
        pushAgentAuthSteps(items, mcp);
      } else if (mcp.flow === 'obo') {
        pushOBOConsentSteps(items, mcp);
      }
    }
    pushToolCall(items, t, trace);
  }

  // Render auth sections for MCPs that failed before any tool call was made.
  // Without this, an early auth failure (e.g. wrong agent secret on connect)
  // would never show its sequence in the diagram.
  for (const mcp of trace.mcps) {
    if (shownMCPAuth.has(mcp.nodeId)) continue;
    if (mcp.flow === 'none' && !mcp.authError) continue;
    if (mcp.flow === 'obo') {
      pushOBOConsentSteps(items, mcp);
    } else {
      pushAgentAuthSteps(items, mcp);
    }
    shownMCPAuth.add(mcp.nodeId);
  }

  // Final response — or workflow-level failure if execution was halted before
  // a final answer could be produced.
  if (trace.failure) {
    items.push({ kind: 'section', label: 'WORKFLOW HALTED', failed: true });
    const stage = trace.failure.stage === 'workflow'
      ? 'Workflow'
      : STAGE_LABELS[trace.failure.stage as AuthErrorTrace['stage']] || trace.failure.stage;
    items.push({
      kind: 'message', from: 'Agent', to: 'App',
      label: `❌  Execution failed at: ${stage}`,
      sublabel: truncate(trace.failure.message, 140),
      color: 'red', dashed: true,
    });
    items.push({
      kind: 'message', from: 'App', to: 'User',
      label: 'Display error to user',
      sublabel: 'Workflow could not complete because of the failure above',
      color: 'red', dashed: true,
    });
  } else {
    items.push({ kind: 'section', label: 'RESPONSE' });
    items.push({
      kind: 'message', from: 'Agent', to: 'App',
      label: 'Final answer',
      sublabel: trace.finalAnswer ? `"${truncate(trace.finalAnswer, 90)}"` : undefined,
    });
    items.push({ kind: 'message', from: 'App', to: 'User', label: 'Display response', dashed: true });
  }

  return items;
}

function truncate(s: string | undefined, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function stripNodeSuffix(name: string): string {
  return name.replace(/_node_[^_]+_[^_]+$/, '');
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TraceMeta({ trace }: { trace: WorkflowTrace }) {
  const failedTools = trace.tools.filter((t) => t.publicName !== 'tool_search' && !t.ok);
  const failedMcps = trace.mcps.filter((m) => m.authError);
  const hasFailure = !!trace.failure || failedTools.length > 0 || failedMcps.length > 0;

  return (
    <div className="space-y-2 mb-3">
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-50 p-3 rounded border border-slate-200">
        <div>
          <span className="text-slate-500">LLM:</span>{' '}
          {trace.llm ? `${trace.llm.provider}${trace.llm.model ? `/${trace.llm.model}` : ''}` : '—'}
        </div>
        <div className="col-span-2">
          <span className="text-slate-500">MCP servers:</span> {trace.mcps.length},{' '}
          <span className="text-slate-500">tool calls:</span> {trace.tools.filter((t) => t.publicName !== 'tool_search').length},{' '}
          <span className="text-slate-500">status:</span>{' '}
          {hasFailure ? (
            <span className="text-red-700 font-bold">FAILED</span>
          ) : (
            <span className="text-emerald-700 font-bold">OK</span>
          )}
        </div>
      </div>

      {hasFailure && (
        <FailureBanner trace={trace} failedTools={failedTools} failedMcps={failedMcps} />
      )}
    </div>
  );
}

function FailureBanner({
  trace,
  failedTools,
  failedMcps,
}: {
  trace: WorkflowTrace;
  failedTools: ToolCallTrace[];
  failedMcps: MCPNodeTrace[];
}) {
  return (
    <div className="text-[11px] font-mono bg-red-50 p-3 rounded border border-red-300">
      <div className="font-bold text-red-800 mb-1 text-[12px]">
        ⛔  Authentication / execution failure detected
      </div>

      {trace.failure && (
        <div className="mb-2 text-red-900">
          <span className="text-red-600">workflow:</span>{' '}
          <span className="font-semibold">
            {trace.failure.stage === 'workflow'
              ? 'Workflow'
              : STAGE_LABELS[trace.failure.stage as AuthErrorTrace['stage']] || trace.failure.stage}
          </span>{' '}
          — {trace.failure.message}
        </div>
      )}

      {failedMcps.map((m) => {
        const err = m.authError!;
        return (
          <div key={`mcp-err-${m.nodeId}`} className="mb-1 text-red-900">
            <span className="text-red-600">{mcpDisplayName(m)}:</span>{' '}
            <span className="font-semibold">{STAGE_LABELS[err.stage] || err.stage}</span>
            {err.statusCode && (
              <span className="ml-1 px-1 py-0.5 bg-red-200 text-red-900 rounded text-[10px]">
                HTTP {err.statusCode}
              </span>
            )}
            {err.errorCode && (
              <span className="ml-1 px-1 py-0.5 bg-red-200 text-red-900 rounded text-[10px]">
                {err.errorCode}
              </span>
            )}
            <div className="text-[10px] text-red-800 mt-0.5 break-words">
              {err.errorDescription || err.message}
            </div>
            {err.url && (
              <div className="text-[10px] text-red-700/80 mt-0.5 truncate" title={err.url}>
                @ {err.url}
              </div>
            )}
          </div>
        );
      })}

      {failedTools
        .filter((t) => !failedMcps.some((m) => m.nodeId === t.nodeId && m.authError?.stage === 'tool-call'))
        .map((t, i) => (
          <div key={`tool-err-${i}`} className="mb-1 text-red-900">
            <span className="text-red-600">tool {stripNodeSuffix(t.publicName)}:</span>{' '}
            {t.statusCode && (
              <span className="px-1 py-0.5 bg-red-200 text-red-900 rounded text-[10px]">
                HTTP {t.statusCode}
              </span>
            )}
            {t.errorCode && (
              <span className="ml-1 px-1 py-0.5 bg-red-200 text-red-900 rounded text-[10px]">
                {t.errorCode}
              </span>
            )}
            <div className="text-[10px] text-red-800 mt-0.5 break-words">
              {t.errorDescription || truncate(t.result, 200)}
            </div>
          </div>
        ))}
    </div>
  );
}

function MCPList({ trace }: { trace: WorkflowTrace }) {
  if (trace.mcps.length === 0) return null;
  return (
    <details className="mt-4 text-xs" open>
      <summary className="cursor-pointer font-semibold text-slate-700">MCP Nodes &amp; Tokens</summary>
      <div className="mt-2 space-y-2">
        {trace.mcps.map((m) => {
          const token = m.oboToken || m.agentToken;
          return (
            <div key={m.nodeId} className="border border-slate-200 rounded p-2 bg-white">
              <div className="font-mono text-[11px] text-slate-700">
                <span className="font-bold">{mcpDisplayName(m)}</span>
                {m.name && <span className="text-slate-400"> ({m.nodeId})</span>}{' '}
                ({m.flow}) → {m.endpoint}
              </div>
              {m.agentToken && (
                <div className="font-mono text-[10px] text-amber-700 mt-1 flex items-center gap-2">
                  <span title={m.agentToken}>Agent Token: {previewToken(m.agentToken)}</span>
                  <JwtLink token={m.agentToken} label="Decode" />
                </div>
              )}
              {m.oboToken && (
                <div className="font-mono text-[10px] text-amber-700 mt-1 flex items-center gap-2">
                  <span title={m.oboToken}>OBO Token: {previewToken(m.oboToken)}</span>
                  <JwtLink token={m.oboToken} label="Decode" />
                </div>
              )}
              {!token && m.flow !== 'none' && !m.authError && (
                <div className="font-mono text-[10px] text-slate-500 mt-1">No token captured</div>
              )}
              {m.authError && (
                <div className="font-mono text-[10px] mt-1 p-1.5 bg-red-50 border border-red-200 rounded">
                  <div className="text-red-800 font-bold flex flex-wrap items-center gap-1">
                    <span>⛔ {STAGE_LABELS[m.authError.stage] || m.authError.stage}</span>
                    {m.authError.statusCode && (
                      <span className="px-1 py-0.5 bg-red-200 text-red-900 rounded text-[9px]">
                        HTTP {m.authError.statusCode}
                      </span>
                    )}
                    {m.authError.errorCode && (
                      <span className="px-1 py-0.5 bg-red-200 text-red-900 rounded text-[9px]">
                        {m.authError.errorCode}
                      </span>
                    )}
                  </div>
                  {m.authError.errorDescription && (
                    <div className="text-red-800 mt-0.5 break-words">{m.authError.errorDescription}</div>
                  )}
                  {m.authError.url && (
                    <div className="text-red-700/80 mt-0.5 truncate" title={m.authError.url}>
                      @ {m.authError.url}
                    </div>
                  )}
                </div>
              )}
              {m.oboAuthUrl && (
                <div className="font-mono text-[10px] text-slate-500 mt-1 truncate" title={m.oboAuthUrl}>
                  Auth URL: {m.oboAuthUrl}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function ToolCallList({ trace }: { trace: WorkflowTrace }) {
  const tools = trace.tools.filter((t) => t.publicName !== 'tool_search');
  if (tools.length === 0) return null;
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer font-semibold text-slate-700">Tool Calls ({tools.length})</summary>
      <div className="mt-2 space-y-2">
        {tools.map((t, i) => {
          const mcp = trace.mcps.find((m) => m.nodeId === t.nodeId);
          const token = mcp?.oboToken || mcp?.agentToken;
          return (
            <div key={i} className="border border-slate-200 rounded p-2 bg-white">
              <div className="font-mono text-[11px] text-slate-600 flex items-center gap-2">
                <span className="font-bold text-blue-600">step {t.step}</span>
                <span>{stripNodeSuffix(t.publicName)}</span>
                <span className="text-slate-400">@</span>
                <span className="text-slate-500">{t.endpoint}</span>
                {token ? (
                  <span className="ml-auto inline-flex items-center gap-1">
                    <span className="text-amber-700">🔒 with auth</span>
                    <JwtLink token={token} label="Decode JWT" />
                  </span>
                ) : (
                  <span className="ml-auto text-slate-400">no auth</span>
                )}
              </div>
              <div className="font-mono text-[10px] text-slate-500 mt-1">args: {t.args}</div>
              {!t.ok && (t.statusCode || t.errorCode) && (
                <div className="font-mono text-[10px] mt-1 flex flex-wrap items-center gap-1">
                  {t.statusCode && (
                    <span className="px-1 py-0.5 bg-red-200 text-red-900 rounded text-[9px] font-bold">
                      HTTP {t.statusCode}
                    </span>
                  )}
                  {t.errorCode && (
                    <span className="px-1 py-0.5 bg-red-200 text-red-900 rounded text-[9px] font-bold">
                      {t.errorCode}
                    </span>
                  )}
                  {t.errorDescription && <span className="text-red-700">{t.errorDescription}</span>}
                </div>
              )}
              <div className={`font-mono text-[10px] mt-1 ${t.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                {t.ok ? 'result' : 'error'}: {t.result}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function JwtLink({ token, label }: { token: string; label: string }) {
  return (
    <a
      href={`https://www.jwt.io/#token=${encodeURIComponent(token)}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Open token on jwt.io"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded text-[10px] text-amber-900 font-medium no-underline"
    >
      <KeyIcon />
      {label}
    </a>
  );
}

function KeyIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="7.5" cy="15.5" r="4" />
      <path d="M11 12l9-9" />
      <path d="M16 7l3 3" />
    </svg>
  );
}

// ── Main diagram ───────────────────────────────────────────────────────────────

export function AuthFlowDiagram({ trace }: Props) {
  const lanes = useMemo(() => buildLanes(trace), [trace]);
  const items = useMemo(() => buildItems(trace), [trace]);

  const layout = useMemo(() => {
    const messageRowH = 78;
    const sectionRowH = 40;
    const startY = 110;
    let y = startY;
    let msgCount = 0;
    const rows = items.map((it) => {
      const row =
        it.kind === 'section'
          ? { y, height: sectionRowH, messageNumber: 0 }
          : { y, height: messageRowH, messageNumber: ++msgCount };
      y += row.height;
      return row;
    });
    return { rows, totalH: y + 30, totalMessages: msgCount };
  }, [items]);

  const [step, setStep] = useState(layout.totalMessages);
  const [autoplay, setAutoplay] = useState(false);

  useEffect(() => { setStep(layout.totalMessages); }, [layout.totalMessages]);

  useEffect(() => {
    if (!autoplay) return;
    const t = setInterval(() => {
      setStep((s) => (s >= layout.totalMessages ? 0 : s + 1));
    }, 1300);
    return () => clearInterval(t);
  }, [autoplay, layout.totalMessages]);

  const HEADER_H = 110; // matches startY in layout
  const width = lanes[lanes.length - 1].x + 120;
  const contentH = layout.totalH - HEADER_H;
  const lanesById = useMemo(() => new Map(lanes.map((l) => [l.id, l])), [lanes]);

  const arrowMarkers = (['default', 'auth', 'blue', 'green'] as ColorKind[]).map((k) => (
    <marker key={k} id={`arr-${k}`} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill={COLORS[k]} />
    </marker>
  ));

  return (
    <div className="w-full">
      <TraceMeta trace={trace} />
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-base font-bold text-slate-800">Sequence Flow</h3>
        <div className="ml-auto flex items-center gap-2">
          <Button
            onClick={() => { setStep(0); setAutoplay(true); }}
            size="sm"
            variant="outline"
            className="text-xs text-cyan-800 bg-cyan-50 hover:bg-cyan-100 border-cyan-200"
          >
            ▶ Animate
          </Button>
          <Button
            onClick={() => { setAutoplay(false); setStep(layout.totalMessages); }}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            Show all
          </Button>
        </div>
      </div>

      <div className="overflow-auto bg-white rounded border border-slate-200 max-h-[68vh]">
        {/* Sticky entity header — sticks to top of the scroll container */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100" style={{ width }}>
          <svg width={width} height={HEADER_H} viewBox={`0 0 ${width} ${HEADER_H}`} className="block">
            <defs>{arrowMarkers}</defs>
            {lanes.map((lane) => {
              const boxH = lane.sublabel ? 60 : 44;
              const boxY = lane.sublabel ? 12 : 18;
              return (
                <g key={lane.id}>
                  {/* Lifeline stub connecting box bottom to header edge */}
                  <line x1={lane.x} y1={boxY + boxH} x2={lane.x} y2={HEADER_H} stroke="#e2e8f0" strokeWidth="2" strokeDasharray="5,5" />
                  {lane.shape === 'circle' ? (
                    <>
                      <circle cx={lane.x} cy={40} r={22} fill={lane.fill} stroke={lane.stroke} />
                      <text x={lane.x} y={45} textAnchor="middle" fontSize="11" fontWeight="700" fill={lane.textColor}>
                        {lane.label}
                      </text>
                    </>
                  ) : (
                    <>
                      <rect x={lane.x - 80} y={boxY} width={160} height={boxH} rx={6} fill={lane.fill} stroke={lane.stroke} />
                      <foreignObject x={lane.x - 78} y={boxY + 2} width={156} height={boxH - 4}>
                        <div
                          // @ts-ignore
                          xmlns="http://www.w3.org/1999/xhtml"
                          className="h-full flex flex-col items-center justify-center text-center px-1"
                          title={lane.sublabel ? `${lane.label}\n${lane.sublabel}` : lane.label}
                        >
                          <div className="text-[11px] font-bold leading-tight truncate w-full" style={{ color: lane.textColor }}>
                            {lane.label}
                          </div>
                          {lane.sublabel && (
                            <div className="text-[8.5px] font-mono leading-tight mt-0.5 break-all line-clamp-2" style={{ color: lane.textColor, opacity: 0.7 }}>
                              {lane.sublabel}
                            </div>
                          )}
                        </div>
                      </foreignObject>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Scrollable content — lifelines + all message rows */}
        <svg width={width} height={contentH} viewBox={`0 0 ${width} ${contentH}`} className="block">
          <defs>{arrowMarkers}</defs>

          {/* Full-height lifelines */}
          {lanes.map((lane) => (
            <line key={lane.id} x1={lane.x} y1={0} x2={lane.x} y2={contentH - 10} stroke="#e2e8f0" strokeWidth="2" strokeDasharray="5,5" />
          ))}

          {/* Items — shift each row up by HEADER_H */}
          {items.map((item, idx) => {
            const rawRow = layout.rows[idx];
            const row = { ...rawRow, y: rawRow.y - HEADER_H };

            if (item.kind === 'section') {
              const sectionFill = item.failed ? '#fef2f2' : '#ecfeff';
              const sectionStroke = item.failed ? '#fca5a5' : '#67e8f9';
              const sectionTextColor = item.failed ? '#b91c1c' : '#0e7490';
              return (
                <g key={idx}>
                  <rect x={20} y={row.y + 6} width={width - 40} height={row.height - 12} fill={sectionFill} stroke={sectionStroke} strokeOpacity={0.7} rx={4} />
                  <text x={width / 2} y={row.y + row.height / 2 + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={sectionTextColor} letterSpacing="1.5">
                    — {item.label} —
                  </text>
                </g>
              );
            }

            const visible = step >= row.messageNumber;
            const opacity = visible ? 1 : 0.18;
            const fromLane = lanesById.get(item.from) ?? lanes[0];
            const toLane = lanesById.get(item.to) ?? lanes[lanes.length - 1];
            const x1 = fromLane.x;
            const x2 = toLane.x;
            const arrowY = row.y + row.height - 12;
            const labelLeft = Math.min(x1, x2);
            const labelWidth = Math.max(Math.abs(x2 - x1), 280);
            const stroke = COLORS[item.color || 'default'];
            const tokenAvailable = !!item.token;

            return (
              <g key={idx} opacity={opacity} className="transition-opacity duration-300">
                <foreignObject x={labelLeft - 80} y={row.y + 4} width={labelWidth + 160} height={row.height - 18}>
                  <div
                    // @ts-ignore
                    xmlns="http://www.w3.org/1999/xhtml"
                    className="text-center text-[10.5px] leading-snug px-1"
                  >
                    <div className="font-semibold" style={{ color: stroke }}>
                      <span className="inline-block px-1.5 py-0.5 mr-1 rounded bg-white border border-slate-200 text-slate-500 text-[9px] font-mono">
                        {row.messageNumber}
                      </span>
                      {item.label}
                    </div>
                    {item.sublabel && (
                      <div className="text-slate-500 font-mono text-[9.5px] mt-0.5 break-words">
                        {item.sublabel}
                      </div>
                    )}
                    {tokenAvailable && (
                      <div className="mt-0.5">
                        <JwtLink token={item.token!} label={item.tokenLabel || 'Decode JWT'} />
                      </div>
                    )}
                  </div>
                </foreignObject>
                <line
                  x1={x1} y1={arrowY} x2={x2} y2={arrowY}
                  stroke={stroke}
                  strokeWidth={item.color === 'blue' ? 2.2 : 1.8}
                  strokeDasharray={item.dashed ? '5 4' : undefined}
                  markerEnd={`url(#arr-${item.color || 'default'})`}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <MCPList trace={trace} />
      <ToolCallList trace={trace} />
    </div>
  );
}
