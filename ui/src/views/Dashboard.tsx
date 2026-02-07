import { useEffect, useState } from 'react';
import * as api from '../api/client';
import { HealthDot, SizeBadge, StatusBadge, PassRate, SeverityBadge } from '../components/StatusBadge';
import type { QuickStatus, BacklogItem, Action, Issue, SessionEntry, ChangelogEntry, BrainNote, ActivityItem, Idea } from '@shared/types';

const BASE = '/api/v1';
async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  const j = await r.json(); return j.data as T;
}

export function Dashboard() {
  const [status, setStatus] = useState<QuickStatus | null>(null);
  const [nowItems, setNowItems] = useState<BacklogItem[]>([]);
  const [actionsList, setActions] = useState<Action[]>([]);
  const [recentIssues, setRecentIssues] = useState<Issue[]>([]);
  const [lastSession, setLastSession] = useState<SessionEntry | null>(null);
  const [brainNotes, setBrainNotes] = useState<BrainNote[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [infraHealth, setInfraHealth] = useState<any[]>([]);
  const [recentIdeas, setRecentIdeas] = useState<Idea[]>([]);
  const [contextRecovery, setContextRecovery] = useState<any>(null);

  useEffect(() => {
    api.config.quickStatus().then((d: any) => setStatus(d?.status)).catch(() => {});
    api.backlog.list({ horizon: 'now' }).then((d: any) => setNowItems(d?.items || [])).catch(() => {});
    api.actions.list().then((d: any) => setActions(d?.actions || [])).catch(() => {});
    api.issues.list({ status: 'open' }).then((d: any) => setRecentIssues((d?.issues || []).slice(0, 5))).catch(() => {});
    api.session.getLatest().then((d: any) => setLastSession(d)).catch(() => {});
    // Brain notes
    apiFetch<{ notes: BrainNote[] }>('/brain/notes').then(d => setBrainNotes(d?.notes || [])).catch(() => {});
    // Activity feed
    apiFetch<{ activities: ActivityItem[] }>('/activity?limit=15').then(d => setActivity(d?.activities || [])).catch(() => {});
    // Integration health
    fetch(`${BASE}/integrations/health`).then(r => r.json()).then(d => {
      if (d.ok) setInfraHealth(d.data?.integrations || []);
    }).catch(() => {});
    // Recent ideas
    apiFetch<{ ideas: Idea[] }>('/ideas?status=captured').then(d => setRecentIdeas((d?.ideas || []).slice(0, 3))).catch(() => {});
    // Context recovery
    apiFetch<any>('/brain/context').then(d => setContextRecovery(d)).catch(() => {});
  }, []);

  const dismissNote = async (id: string) => {
    await fetch(`${BASE}/brain/notes/${id}/dismiss`, { method: 'POST' });
    setBrainNotes(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header with status */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        {status?.session?.status === 'active' && (
          <div className="flex items-center gap-2 bg-status-pass/10 border border-status-pass/20 rounded-lg px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-status-pass animate-pulse-subtle" />
            <span className="text-sm font-medium text-status-pass">
              Session active · {status.session.duration_hours?.toFixed(1)}h
            </span>
          </div>
        )}
      </div>

      {/* AI Brain Panel — the most important section */}
      {(brainNotes.length > 0 || contextRecovery?.briefing) && (
        <div className="card border-l-2 border-l-accent-purple p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">🧠</span>
            <h2 className="text-sm font-semibold text-accent-purple">From your AI</h2>
          </div>

          {contextRecovery?.briefing && (
            <p className="text-sm text-text-secondary">{contextRecovery.briefing}</p>
          )}

          {contextRecovery?.warnings?.length > 0 && (
            <div className="space-y-1">
              {contextRecovery.warnings.map((w: string, i: number) => (
                <p key={i} className="text-xs text-accent-red">⚠ {w}</p>
              ))}
            </div>
          )}

          {contextRecovery?.suggestions?.length > 0 && (
            <div className="space-y-1">
              {contextRecovery.suggestions.map((s: string, i: number) => (
                <p key={i} className="text-xs text-accent-blue">→ {s}</p>
              ))}
            </div>
          )}

          {brainNotes.length > 0 && (
            <div className="space-y-2 pt-2">
              {brainNotes.slice(0, 5).map(note => (
                <div key={note.id} className={`flex items-start gap-2 p-2 rounded-lg ${
                  note.priority === 'critical' ? 'bg-accent-red/5' :
                  note.priority === 'high' ? 'bg-accent-yellow/5' : 'bg-surface-3'
                }`}>
                  <span className="text-xs mt-0.5">
                    {note.type === 'warning' ? '⚠' :
                     note.type === 'suggestion' ? '💡' :
                     note.type === 'decision' ? '⚖' :
                     note.type === 'reminder' ? '⏰' : '📝'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">{note.title}</span>
                    {note.content && <p className="text-2xs text-text-tertiary mt-0.5">{note.content}</p>}
                  </div>
                  <button onClick={() => dismissNote(note.id)} className="text-2xs text-text-tertiary hover:text-text-primary">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard label="Health" value={`${status?.health ?? 0}%`} sub={`${status?.now_items.length || 0} in Now`} color="blue" />
        <StatCard label="Session" value={status?.session?.status === 'active' ? `${status.session.duration_hours?.toFixed(1)}h` : 'None'} sub={status?.session?.status === 'active' ? 'Active' : 'Inactive'} color={status?.session?.status === 'active' ? 'green' : 'neutral'} />
        <StatCard label="Issues" value={String(status?.open_issues.total ?? 0)} sub={status?.open_issues.critical ? `${status.open_issues.critical} critical` : 'None critical'} color={status?.open_issues.critical ? 'red' : 'neutral'} />
        <StatCard label="Last Session" value={lastSession ? `${lastSession.items_shipped} shipped` : 'N/A'} sub={lastSession?.date || ''} color="purple" />
        <StatCard label="Ideas" value={String(recentIdeas.length)} sub="Captured" color="cyan" />
      </div>

      {/* Main grid: 3 columns */}
      <div className="grid grid-cols-3 gap-5">
        {/* Column 1: Now + Actions */}
        <div className="space-y-5">
          <div>
            <h2 className="label mb-2">Now</h2>
            <div className="space-y-2">
              {nowItems.map(item => (
                <div key={item.id} className="card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium leading-tight">{item.title}</span>
                    <SizeBadge size={item.size} />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={item.status} />
                    {item.category && <span className="text-2xs text-text-tertiary">{item.category}</span>}
                  </div>
                </div>
              ))}
              {nowItems.length === 0 && <p className="text-sm text-text-tertiary py-3 text-center card">Nothing in Now</p>}
            </div>
          </div>

          <div>
            <h2 className="label mb-2">Action Health</h2>
            <div className="space-y-2">
              {actionsList.map(action => (
                <div key={action.id} className="card p-3 flex items-center gap-2.5">
                  <HealthDot health={action.health} />
                  <span className="text-xs font-medium flex-1 truncate">{action.name}</span>
                  <PassRate passed={action.pass_rate.passed} total={action.pass_rate.total} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Column 2: Activity Feed */}
        <div>
          <h2 className="label mb-2">Activity</h2>
          <div className="card divide-y divide-border max-h-[500px] overflow-y-auto">
            {activity.map(item => (
              <div key={item.id} className="px-3 py-2.5 flex items-start gap-2.5">
                <span className="text-xs mt-0.5 w-4 text-center flex-shrink-0">
                  {item.type.includes('session') ? '◷' :
                   item.type.includes('item') ? '☰' :
                   item.type.includes('issue') ? '●' :
                   item.type.includes('diagnostic') ? '⚡' :
                   item.type.includes('idea') ? '💡' :
                   item.type.includes('brain') ? '🧠' : '↳'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-tight">{item.title}</p>
                  {item.detail && <p className="text-2xs text-text-tertiary truncate mt-0.5">{item.detail}</p>}
                </div>
                <span className="text-2xs text-text-tertiary flex-shrink-0">
                  {formatTime(item.timestamp)}
                </span>
              </div>
            ))}
            {activity.length === 0 && (
              <p className="text-xs text-text-tertiary py-6 text-center">No activity yet</p>
            )}
          </div>
        </div>

        {/* Column 3: Issues + Ideas + Infra */}
        <div className="space-y-5">
          {/* Open Issues */}
          <div>
            <h2 className="label mb-2">Open Issues</h2>
            <div className="space-y-2">
              {recentIssues.map(issue => (
                <div key={issue.id} className="card p-3">
                  <div className="flex items-start gap-2">
                    <SeverityBadge severity={issue.severity} />
                    <span className="text-xs leading-tight flex-1">{issue.title}</span>
                  </div>
                  <span className="text-2xs text-text-tertiary">{issue.id} · {issue.discovered}</span>
                </div>
              ))}
              {recentIssues.length === 0 && <p className="text-sm text-text-tertiary py-3 text-center card">No open issues</p>}
            </div>
          </div>

          {/* Recent Ideas */}
          {recentIdeas.length > 0 && (
            <div>
              <h2 className="label mb-2">Recent Ideas</h2>
              <div className="space-y-2">
                {recentIdeas.map(idea => (
                  <div key={idea.id} className="card p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">💡</span>
                      <span className="text-xs font-medium flex-1 truncate">{idea.title}</span>
                      <span className="badge bg-surface-3 text-text-tertiary">{idea.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Infrastructure */}
          {infraHealth.length > 0 && (
            <div>
              <h2 className="label mb-2">Infrastructure</h2>
              <div className="space-y-1.5">
                {infraHealth.map((int: any) => (
                  <div key={int.id} className="card p-2.5 flex items-center gap-2">
                    <span>{int.icon}</span>
                    <span className="text-xs font-medium flex-1 truncate">{int.name}</span>
                    <span className="text-2xs text-text-tertiary truncate max-w-[120px]">{int.health?.detail || ''}</span>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      int.health?.status === 'healthy' ? 'bg-status-pass' :
                      int.health?.status === 'degraded' ? 'bg-status-warn' : 'bg-status-fail'
                    }`} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: {
  label: string; value: string; sub: string;
  color: 'blue' | 'green' | 'red' | 'purple' | 'cyan' | 'neutral';
}) {
  const colors = {
    blue: 'border-l-accent-blue',
    green: 'border-l-status-pass',
    red: 'border-l-status-fail',
    purple: 'border-l-accent-purple',
    cyan: 'border-l-accent-cyan',
    neutral: 'border-l-border-strong',
  };
  return (
    <div className={`card p-3 border-l-2 ${colors[color]}`}>
      <p className="text-2xs text-text-tertiary uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
      <p className="text-2xs text-text-secondary">{sub}</p>
    </div>
  );
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 3600000) return `${Math.round(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.round(diff / 3600000)}h`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return timestamp.substring(0, 10);
  }
}
