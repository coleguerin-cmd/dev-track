import { useEffect, useState, useCallback, useMemo } from 'react';
import * as api from '../api/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import type { AuditRunIndex, AuditRun, AuditStep, AuditChange, AuditSuggestion } from '@shared/types';

type TriggerFilter = 'all' | 'scheduled' | 'event' | 'manual' | 'requested';
type TimeRange = 'today' | '7d' | '30d' | 'all';

/** Strip markdown syntax for plain-text previews */
function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')     // headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1')     // italic
    .replace(/`(.+?)`/g, '$1')       // inline code
    .replace(/^\s*[-*]\s+/gm, '')    // list items
    .replace(/^\s*\d+\.\s+/gm, '')   // numbered lists
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
    .replace(/^---+$/gm, '')         // hr
    .replace(/\n{2,}/g, ' — ')       // collapse double newlines
    .replace(/\n/g, ' ')             // collapse single newlines
    .trim();
}

function getTimeSince(range: TimeRange): string | undefined {
  if (range === 'all') return undefined;
  const now = new Date();
  if (range === 'today') return now.toISOString().split('T')[0];
  if (range === '7d') return new Date(now.getTime() - 7 * 86400000).toISOString();
  if (range === '30d') return new Date(now.getTime() - 30 * 86400000).toISOString();
  return undefined;
}

// ─── Main View ─────────────────────────────────────────────────────────────

export function Audits() {
  const [runs, setRuns] = useState<AuditRunIndex[]>([]);
  const [total, setTotal] = useState(0);
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [stats, setStats] = useState<any>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [expandedRunData, setExpandedRunData] = useState<AuditRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCharts, setShowCharts] = useState(() => localStorage.getItem('audits-charts') !== 'false');

  const loadRuns = useCallback(() => {
    const params: any = { limit: 200 };
    if (triggerFilter !== 'all') params.trigger_type = triggerFilter;
    if (statusFilter !== 'all') params.status = statusFilter;
    const since = getTimeSince(timeRange);
    if (since) params.since = since;
    api.audits.list(params)
      .then((d: any) => { setRuns(d?.runs || []); setTotal(d?.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [triggerFilter, statusFilter, timeRange]);

  const loadStats = useCallback(() => {
    api.audits.stats().then((d: any) => setStats(d)).catch(() => {});
  }, []);

  useEffect(() => { loadRuns(); loadStats(); }, [loadRuns, loadStats]);

  const expandRun = async (id: string) => {
    if (expandedRun === id) {
      setExpandedRun(null);
      setExpandedRunData(null);
      return;
    }
    setExpandedRun(id);
    try {
      const data = await api.audits.get(id);
      setExpandedRunData(data);
    } catch { setExpandedRunData(null); }
  };

  const handleSuggestionAction = async (runId: string, suggestionId: string, status: 'approved' | 'dismissed') => {
    await api.audits.updateSuggestion(runId, suggestionId, status);
    // Reload the expanded run
    const data = await api.audits.get(runId);
    setExpandedRunData(data);
    loadRuns();
    loadStats();
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Audits</h1>
        <span className="text-xs text-text-tertiary">
          {total} run{total !== 1 ? 's' : ''} recorded
        </span>
      </div>

      {/* Stats Bar */}
      {stats && <StatsBar stats={stats} />}

      {/* Analytics Toggle + Charts */}
      <div className="flex items-center mb-3">
        <button
          onClick={() => { setShowCharts(!showCharts); localStorage.setItem('audits-charts', String(!showCharts)); }}
          className="btn-ghost text-xs gap-1.5"
        >
          <svg className={`w-3 h-3 transition-transform ${showCharts ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 18l6-6-6-6"/></svg>
          Analytics
        </button>
      </div>
      {showCharts && <AnalyticsPanel runs={runs} />}

      {/* Filters */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex gap-1">
          {([['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All time']] as [TimeRange, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTimeRange(val)}
              className={`btn-ghost text-xs ${timeRange === val ? 'bg-surface-3 text-text-primary' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex gap-1">
          {(['all', 'scheduled', 'event', 'manual', 'requested'] as TriggerFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setTriggerFilter(f)}
              className={`btn-ghost text-xs ${triggerFilter === f ? 'bg-surface-3 text-text-primary' : ''}`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex gap-1">
          {(['all', 'completed', 'failed', 'running'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`btn-ghost text-xs ${statusFilter === s ? 'bg-surface-3 text-text-primary' : ''}`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Run List */}
      <div className="space-y-2">
        {runs.map(run => (
          <div key={run.id}>
            <RunCard
              run={run}
              isExpanded={expandedRun === run.id}
              onClick={() => expandRun(run.id)}
            />
            {expandedRun === run.id && expandedRunData && (
              <div className="flex gap-3 mt-1 mb-2 animate-fade-in">
                {/* Main detail sections */}
                <div className="flex-1 min-w-0">
                  <RunDetail
                    run={expandedRunData}
                    onSuggestionAction={handleSuggestionAction}
                  />
                </div>
                {/* Right sidebar — changes breakdown */}
                {expandedRunData.status === 'completed' && (
                  <ChangesSidebar run={expandedRunData} />
                )}
              </div>
            )}
          </div>
        ))}
        {!loading && runs.length === 0 && (
          <div className="card p-12 text-center">
            <div className="text-3xl mb-3 opacity-40">🔍</div>
            <p className="text-text-secondary text-sm">No audit runs yet</p>
            <p className="text-text-tertiary text-xs mt-1">
              Runs will appear here when automations execute. Trigger a session end, or wait for a scheduled automation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stats Bar ─────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: any }) {
  const today = stats?.today || {};
  const week = stats?.week || {};

  return (
    <div className="grid grid-cols-4 gap-3 mb-5">
      <StatCard label="Runs today" value={today.runs || 0} />
      <StatCard
        label="Cost today"
        value={`$${(today.cost || 0).toFixed(2)}`}
        sub={week.runs ? `$${(week.cost || 0).toFixed(2)} this week` : undefined}
      />
      <StatCard label="Changes today" value={today.changes || 0} />
      <StatCard
        label="Pending suggestions"
        value={today.suggestions_pending || 0}
        accent={today.suggestions_pending > 0}
      />
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="card p-3">
      <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-bold ${accent ? 'text-accent-yellow' : 'text-text-primary'}`}>{value}</p>
      {sub && <p className="text-[9px] text-text-tertiary mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Analytics Charts ───────────────────────────────────────────────────────

// Muted, Linear-style palette
const CHART_COLORS = {
  cost: 'rgba(139, 92, 246, 0.7)',    // soft violet
  runs: 'rgba(99, 102, 241, 0.5)',     // soft indigo
  created: 'rgba(52, 211, 153, 0.7)',  // soft emerald
  updated: 'rgba(96, 165, 250, 0.7)',  // soft blue
  deleted: 'rgba(248, 113, 113, 0.6)', // soft red
  resolved: 'rgba(167, 139, 250, 0.7)',// soft purple
};

function AnalyticsPanel({ runs }: { runs: AuditRunIndex[] }) {
  const completedRuns = runs.filter(r => r.status === 'completed');

  const dailyData = useMemo(() => {
    const map = new Map<string, { date: string; cost: number; runs: number; changes: number }>();
    for (const r of completedRuns) {
      const day = r.started_at.split('T')[0];
      const entry = map.get(day) || { date: day, cost: 0, runs: 0, changes: 0 };
      entry.cost += r.cost_usd;
      entry.runs += 1;
      entry.changes += r.changes_count;
      map.set(day, entry);
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [completedRuns]);

  const totalChanges = useMemo(() => {
    const acc = { created: 0, updated: 0, deleted: 0, resolved: 0 };
    for (const r of completedRuns) {
      acc.created += r.changes_by_action?.created || 0;
      acc.updated += r.changes_by_action?.updated || 0;
      acc.deleted += r.changes_by_action?.deleted || 0;
      acc.resolved += r.changes_by_action?.resolved || 0;
    }
    return [
      { name: 'Created', value: acc.created, color: CHART_COLORS.created },
      { name: 'Updated', value: acc.updated, color: CHART_COLORS.updated },
      { name: 'Deleted', value: acc.deleted, color: CHART_COLORS.deleted },
      { name: 'Resolved', value: acc.resolved, color: CHART_COLORS.resolved },
    ].filter(d => d.value > 0);
  }, [completedRuns]);

  if (completedRuns.length === 0) {
    return (
      <div className="card p-6 text-center mb-5">
        <p className="text-text-tertiary text-xs">No completed runs to chart yet</p>
      </div>
    );
  }

  const tooltipStyle = {
    contentStyle: {
      background: 'var(--color-surface-2)',
      border: '1px solid var(--color-border)',
      borderRadius: '6px',
      fontSize: '11px',
      color: 'var(--color-text-secondary)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    },
    cursor: { fill: 'rgba(255,255,255,0.03)' },
  };

  return (
    <div className="grid grid-cols-3 gap-3 mb-5">
      {/* Cost & Runs per day */}
      <div className="card p-4 col-span-2">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-3">Cost & Runs by Day</p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
                tickFormatter={(v: string) => v.split('-').slice(1).join('/')}
                axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="cost"
                orientation="left"
                tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
                tickFormatter={(v: number) => `$${v.toFixed(1)}`}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="runs"
                orientation="right"
                tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [name === 'cost' ? `$${v.toFixed(3)}` : v, name === 'cost' ? 'Cost' : 'Runs']} />
              <Bar yAxisId="cost" dataKey="cost" fill={CHART_COLORS.cost} radius={[4, 4, 0, 0]} name="cost" />
              <Bar yAxisId="runs" dataKey="runs" fill={CHART_COLORS.runs} radius={[4, 4, 0, 0]} name="runs" />
              <Legend
                wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
                formatter={(value: string) => <span className="text-text-tertiary text-[10px]">{value === 'cost' ? 'Cost ($)' : 'Runs'}</span>}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Changes breakdown (donut) */}
      <div className="card p-4">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-3">Changes by Action</p>
        {totalChanges.length > 0 ? (
          <div className="h-44 flex flex-col items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={totalChanges}
                  innerRadius={38}
                  outerRadius={58}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {totalChanges.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend
                  wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }}
                  formatter={(value: string) => <span className="text-text-tertiary text-[10px]">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-text-tertiary text-xs text-center mt-8">No changes yet</p>
        )}
      </div>
    </div>
  );
}

// ─── Changes Sidebar (right panel) ──────────────────────────────────────────

function ChangesSidebar({ run }: { run: AuditRun }) {
  const changes = run.changes_made;

  // Group by entity_type
  const byEntity = useMemo(() => {
    const map = new Map<string, { type: string; items: AuditChange[]; created: number; updated: number; deleted: number; resolved: number }>();
    for (const c of changes) {
      const entry = map.get(c.entity_type) || { type: c.entity_type, items: [], created: 0, updated: 0, deleted: 0, resolved: 0 };
      entry.items.push(c);
      if (c.action === 'created') entry.created++;
      else if (c.action === 'updated') entry.updated++;
      else if (c.action === 'deleted') entry.deleted++;
      else if (c.action === 'resolved') entry.resolved++;
      map.set(c.entity_type, entry);
    }
    return [...map.values()].sort((a, b) => b.items.length - a.items.length);
  }, [changes]);

  // Totals by action
  const totals = useMemo(() => ({
    created: changes.filter(c => c.action === 'created').length,
    updated: changes.filter(c => c.action === 'updated').length,
    deleted: changes.filter(c => c.action === 'deleted').length,
    resolved: changes.filter(c => c.action === 'resolved').length,
  }), [changes]);

  const ENTITY_LABELS: Record<string, string> = {
    epic: 'Epics',
    roadmap_item: 'Roadmap Items',
    issue: 'Issues',
    idea: 'Ideas',
    changelog: 'Changelog',
    brain_note: 'Brain Notes',
    velocity: 'Velocity',
    project_state: 'Project State',
    milestone: 'Milestones',
    release: 'Releases',
    session: 'Sessions',
  };

  const ACTION_DOT: Record<string, string> = {
    created: 'bg-emerald-400',
    updated: 'bg-blue-400',
    deleted: 'bg-red-400',
    resolved: 'bg-violet-400',
  };

  return (
    <div className="w-64 flex-shrink-0">
      <div className="card p-3 sticky top-4 space-y-4">
        {/* Header */}
        <div>
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">Run Breakdown</p>
          <div className="grid grid-cols-2 gap-2">
            {totals.created > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs text-text-secondary">{totals.created} created</span>
              </div>
            )}
            {totals.updated > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span className="text-xs text-text-secondary">{totals.updated} updated</span>
              </div>
            )}
            {totals.deleted > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                <span className="text-xs text-text-secondary">{totals.deleted} deleted</span>
              </div>
            )}
            {totals.resolved > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                <span className="text-xs text-text-secondary">{totals.resolved} resolved</span>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* By entity type */}
        <div className="space-y-3">
          {byEntity.map(group => (
            <div key={group.type}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-medium text-text-primary">
                  {ENTITY_LABELS[group.type] || group.type}
                </span>
                <span className="text-[10px] text-text-tertiary">{group.items.length}</span>
              </div>
              {/* Action bar */}
              <div className="flex h-1.5 rounded-full overflow-hidden bg-surface-0 mb-1.5">
                {group.created > 0 && (
                  <div className="bg-emerald-400" style={{ width: `${(group.created / group.items.length) * 100}%` }} />
                )}
                {group.updated > 0 && (
                  <div className="bg-blue-400" style={{ width: `${(group.updated / group.items.length) * 100}%` }} />
                )}
                {group.deleted > 0 && (
                  <div className="bg-red-400" style={{ width: `${(group.deleted / group.items.length) * 100}%` }} />
                )}
                {group.resolved > 0 && (
                  <div className="bg-violet-400" style={{ width: `${(group.resolved / group.items.length) * 100}%` }} />
                )}
              </div>
              {/* Individual changes */}
              <div className="space-y-0.5">
                {group.items.map((c, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-surface-2/50 transition-colors">
                    <div className={`w-1 h-1 rounded-full flex-shrink-0 ${ACTION_DOT[c.action] || 'bg-text-tertiary'}`} />
                    <span className="text-[10px] text-text-secondary truncate">
                      {c.entity_id ? `${c.entity_id}` : c.description.replace(/^(created|updated|deleted|resolved)\s+\w+\s*/, '')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Cost & performance */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-tertiary">Cost</span>
            <span className="text-[10px] text-text-primary font-medium">${run.cost_usd.toFixed(4)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-tertiary">Duration</span>
            <span className="text-[10px] text-text-primary font-medium">{formatDuration(run.duration_seconds)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-tertiary">Iterations</span>
            <span className="text-[10px] text-text-primary font-medium">{run.iterations}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-tertiary">Tokens</span>
            <span className="text-[10px] text-text-primary font-medium">{(run.tokens.input + run.tokens.output).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Run Card (collapsed) ──────────────────────────────────────────────────

function RunCard({ run, isExpanded, onClick }: { run: AuditRunIndex; isExpanded: boolean; onClick: () => void }) {
  const statusColor = {
    completed: 'bg-status-pass',
    failed: 'bg-status-fail',
    running: 'bg-accent-yellow animate-pulse',
    cancelled: 'bg-text-tertiary',
  }[run.status] || 'bg-text-tertiary';

  const triggerColors: Record<string, string> = {
    scheduled: 'bg-accent-purple/15 text-accent-purple',
    event: 'bg-accent-blue/15 text-accent-blue',
    manual: 'bg-accent-orange/15 text-accent-orange',
    requested: 'bg-accent-yellow/15 text-accent-yellow',
  };

  const time = new Date(run.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = new Date(run.started_at).toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <div
      onClick={onClick}
      className={`card-hover p-3 cursor-pointer transition-all ${isExpanded ? 'ring-1 ring-accent-blue/30 bg-surface-2' : ''}`}
    >
      <div className="flex items-start gap-3">
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${statusColor}`} />

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-text-primary">{run.automation_name}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${triggerColors[run.trigger_type] || 'bg-surface-3 text-text-tertiary'}`}>
              {run.trigger_type}
            </span>
            {run.status === 'failed' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-status-fail/15 text-status-fail font-medium">
                failed
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary line-clamp-1">{stripMarkdown(run.summary || 'No summary available')}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-[10px] text-text-tertiary">{date} {time}</span>
            <span className="text-[10px] text-text-tertiary">{formatDuration(run.duration_seconds)}</span>
            <span className="text-[10px] text-text-tertiary">${run.cost_usd.toFixed(3)}</span>
            <span className="text-[10px] text-text-tertiary">{run.iterations} iter</span>
            {run.changes_count > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-status-pass/10 text-status-pass font-medium">
                {run.changes_count} change{run.changes_count !== 1 ? 's' : ''}
              </span>
            )}
            {run.suggestions_pending > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-yellow/10 text-accent-yellow font-medium">
                {run.suggestions_pending} suggestion{run.suggestions_pending !== 1 ? 's' : ''}
              </span>
            )}
            {run.errors_count > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-status-fail/10 text-status-fail font-medium">
                {run.errors_count} error{run.errors_count !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Expand indicator */}
        <span className={`text-text-tertiary text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
      </div>
    </div>
  );
}

// ─── Run Detail (expanded) ─────────────────────────────────────────────────

function RunDetail({ run, onSuggestionAction }: { run: AuditRun; onSuggestionAction: (runId: string, sid: string, status: 'approved' | 'dismissed') => void }) {
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(['summary', 'changes']));

  const toggle = (section: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const thinkingSteps = run.steps.filter(s => s.type === 'thinking' && s.content);
  const toolCallPairs = buildToolCallPairs(run.steps);

  return (
    <div className="space-y-2">
      {/* Summary */}
      <DetailSection title="Summary" isOpen={openSections.has('summary')} onToggle={() => toggle('summary')}>
        <div className="text-sm text-text-secondary leading-relaxed audit-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{run.summary}</ReactMarkdown>
        </div>
        <div className="flex items-center gap-4 mt-3 text-[10px] text-text-tertiary">
          <span>Model: <span className="text-text-secondary font-medium">{run.model || 'unknown'}</span></span>
          <span>Provider: <span className="text-text-secondary font-medium">{run.provider || 'unknown'}</span></span>
          <span>Tokens: <span className="text-text-secondary font-medium">{run.tokens.input.toLocaleString()} in / {run.tokens.output.toLocaleString()} out</span></span>
          <span>Cost: <span className="text-text-secondary font-medium">${run.cost_usd.toFixed(4)}</span></span>
        </div>
      </DetailSection>

      {/* Changes Made */}
      {run.changes_made.length > 0 && (
        <DetailSection
          title={`Changes Made (${run.changes_made.length})`}
          isOpen={openSections.has('changes')}
          onToggle={() => toggle('changes')}
        >
          <div className="space-y-1.5">
            {run.changes_made.map((change, i) => (
              <ChangeRow key={i} change={change} />
            ))}
          </div>
        </DetailSection>
      )}

      {/* Suggestions */}
      {run.suggestions.length > 0 && (
        <DetailSection
          title={`Suggestions (${run.suggestions.length})`}
          isOpen={openSections.has('suggestions')}
          onToggle={() => toggle('suggestions')}
          accent
        >
          <div className="space-y-2">
            {run.suggestions.map(suggestion => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onAction={(status) => onSuggestionAction(run.id, suggestion.id, status)}
              />
            ))}
          </div>
        </DetailSection>
      )}

      {/* Thinking Chain */}
      {thinkingSteps.length > 0 && (
        <DetailSection
          title={`Thinking Chain (${thinkingSteps.length} steps)`}
          isOpen={openSections.has('thinking')}
          onToggle={() => toggle('thinking')}
        >
          <div className="space-y-3">
            {thinkingSteps.map((step, i) => (
              <ThinkingStep key={step.index} step={step} stepNumber={i + 1} />
            ))}
          </div>
        </DetailSection>
      )}

      {/* Tool Calls */}
      {toolCallPairs.length > 0 && (
        <DetailSection
          title={`Tool Calls (${toolCallPairs.length})`}
          isOpen={openSections.has('tools')}
          onToggle={() => toggle('tools')}
        >
          <div className="space-y-1">
            {toolCallPairs.map((pair, i) => (
              <ToolCallRow key={i} call={pair.call} result={pair.result} index={i + 1} />
            ))}
          </div>
        </DetailSection>
      )}

      {/* Errors */}
      {run.errors.length > 0 && (
        <DetailSection
          title={`Errors (${run.errors.length})`}
          isOpen={openSections.has('errors')}
          onToggle={() => toggle('errors')}
        >
          <div className="space-y-1">
            {run.errors.map((err, i) => (
              <div key={i} className="text-xs text-status-fail bg-status-fail/5 px-3 py-2 rounded font-mono">
                {err}
              </div>
            ))}
          </div>
        </DetailSection>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function DetailSection({ title, isOpen, onToggle, accent, children }: {
  title: string; isOpen: boolean; onToggle: () => void; accent?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-surface-2 transition-colors ${
          accent ? 'bg-accent-yellow/5' : ''
        }`}
      >
        <span className={`text-xs font-semibold ${accent ? 'text-accent-yellow' : 'text-text-primary'}`}>
          {title}
        </span>
        <span className={`text-text-tertiary text-[10px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {isOpen && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

function ChangeRow({ change }: { change: AuditChange }) {
  const actionColors: Record<string, string> = {
    created: 'bg-status-pass/15 text-status-pass',
    updated: 'bg-accent-blue/15 text-accent-blue',
    deleted: 'bg-status-fail/15 text-status-fail',
    resolved: 'bg-accent-purple/15 text-accent-purple',
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-2/50 transition-colors">
      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${actionColors[change.action] || 'bg-surface-3 text-text-tertiary'}`}>
        {change.action}
      </span>
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-text-tertiary font-mono flex-shrink-0">
        {change.entity_type}
      </span>
      <span className="text-xs text-text-secondary truncate">{change.description}</span>
    </div>
  );
}

function SuggestionCard({ suggestion, onAction }: { suggestion: AuditSuggestion; onAction: (status: 'approved' | 'dismissed') => void }) {
  const priorityColors: Record<string, string> = {
    high: 'text-accent-red',
    medium: 'text-accent-yellow',
    low: 'text-text-tertiary',
  };

  const isActioned = suggestion.status !== 'pending';

  return (
    <div className={`rounded-lg px-3 py-2.5 ${isActioned ? 'bg-surface-1 opacity-60' : 'bg-accent-yellow/5 border border-accent-yellow/10'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[9px] font-medium ${priorityColors[suggestion.priority] || 'text-text-tertiary'}`}>
              {suggestion.priority}
            </span>
            {isActioned && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                suggestion.status === 'approved' ? 'bg-status-pass/15 text-status-pass' : 'bg-surface-3 text-text-tertiary'
              }`}>
                {suggestion.status}
              </span>
            )}
          </div>
          <p className="text-xs text-text-primary font-medium">{suggestion.description}</p>
          {suggestion.reasoning && (
            <p className="text-[10px] text-text-tertiary mt-1">{suggestion.reasoning}</p>
          )}
        </div>
        {!isActioned && (
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onAction('approved'); }}
              className="text-[9px] px-2 py-1 rounded bg-status-pass/15 text-status-pass hover:bg-status-pass/25 transition-colors font-medium"
            >
              Approve
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAction('dismissed'); }}
              className="text-[9px] px-2 py-1 rounded bg-surface-3 text-text-tertiary hover:bg-surface-4 transition-colors font-medium"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingStep({ step, stepNumber }: { step: AuditStep; stepNumber: number }) {
  const [expanded, setExpanded] = useState(stepNumber <= 2);
  const content = step.content || '';
  const isLong = content.length > 300;
  const display = expanded ? content : content.substring(0, 300) + (isLong ? '...' : '');

  return (
    <div className="relative pl-6">
      <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-surface-3 flex items-center justify-center">
        <span className="text-[8px] font-bold text-text-tertiary">{stepNumber}</span>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[9px] text-text-tertiary">
            {new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          {step.tokens && (
            <span className="text-[9px] text-text-tertiary">
              {step.tokens.input + step.tokens.output} tokens
            </span>
          )}
          {step.cost_usd && (
            <span className="text-[9px] text-text-tertiary">${step.cost_usd.toFixed(4)}</span>
          )}
        </div>
        <div className="text-xs text-text-secondary leading-relaxed audit-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{display}</ReactMarkdown>
        </div>
        {isLong && (
          <button onClick={() => setExpanded(!expanded)} className="text-[10px] text-accent-blue hover:underline mt-1">
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    </div>
  );
}

function ToolCallRow({ call, result, index }: { call: AuditStep; result?: AuditStep; index: number }) {
  const [expanded, setExpanded] = useState(false);

  // Determine if this was a mutating call
  const isMutating = call.tool_name && /^(create|update|delete|resolve|publish|add|write|capture)_/.test(call.tool_name);

  return (
    <div className={`rounded px-2 py-1.5 ${expanded ? 'bg-surface-2' : 'hover:bg-surface-2/50'} transition-colors`}>
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <span className="text-[9px] text-text-tertiary w-5 text-right flex-shrink-0">{index}</span>
        <span className={`text-[10px] font-mono font-medium ${isMutating ? 'text-accent-orange' : 'text-accent-blue'}`}>
          {call.tool_name}
        </span>
        {result?.tool_result_preview && (
          <span className="text-[9px] text-text-tertiary truncate flex-1">{result.tool_result_preview}</span>
        )}
        <span className={`text-[9px] text-text-tertiary transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
      </div>
      {expanded && (
        <div className="mt-2 ml-7 space-y-2 animate-fade-in">
          {call.tool_args && Object.keys(call.tool_args).length > 0 && (
            <div>
              <p className="text-[9px] text-text-tertiary uppercase tracking-wider mb-1">Arguments</p>
              <pre className="text-[10px] text-text-secondary bg-surface-1 rounded px-2 py-1.5 overflow-x-auto max-h-40 overflow-y-auto font-mono">
                {JSON.stringify(call.tool_args, null, 2)}
              </pre>
            </div>
          )}
          {result?.tool_result && (
            <div>
              <p className="text-[9px] text-text-tertiary uppercase tracking-wider mb-1">Result</p>
              <pre className="text-[10px] text-text-secondary bg-surface-1 rounded px-2 py-1.5 overflow-x-auto max-h-60 overflow-y-auto font-mono">
                {formatToolResult(result.tool_result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildToolCallPairs(steps: AuditStep[]): { call: AuditStep; result?: AuditStep }[] {
  const pairs: { call: AuditStep; result?: AuditStep }[] = [];
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].type === 'tool_call') {
      const result = steps[i + 1]?.type === 'tool_result' ? steps[i + 1] : undefined;
      pairs.push({ call: steps[i], result });
    }
  }
  return pairs;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

function formatToolResult(result: string): string {
  try {
    const parsed = JSON.parse(result);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return result;
  }
}
