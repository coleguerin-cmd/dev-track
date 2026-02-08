import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  Clock,
  Code2,
  GitCommitHorizontal,
  Heart,
  Lightbulb,
  ListTodo,
  Sparkles,
  Target,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import * as api from '../api/client';
import { SizeBadge, StatusBadge, SeverityBadge } from '../components/StatusBadge';
import type { QuickStatus, RoadmapItem, Issue, Session, BrainNote, ActivityEvent, Idea } from '@shared/types';

const BASE = '/api/v1';
async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  const j = await r.json(); return j.data as T;
}

export function Dashboard() {
  const [status, setStatus] = useState<QuickStatus | null>(null);
  const [nowItems, setNowItems] = useState<RoadmapItem[]>([]);
  const [nextItems, setNextItems] = useState<RoadmapItem[]>([]);
  const [recentIssues, setRecentIssues] = useState<Issue[]>([]);
  const [lastSession, setLastSession] = useState<Session | null>(null);
  const [brainNotes, setBrainNotes] = useState<BrainNote[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [recentIdeas, setRecentIdeas] = useState<Idea[]>([]);
  const [contextRecovery, setContextRecovery] = useState<any>(null);
  const [changelog, setChangelog] = useState<any[]>([]);

  useEffect(() => {
    api.config.quickStatus().then((d: any) => setStatus(d?.status)).catch(() => {});
    api.backlog.list({ horizon: 'now' }).then((d: any) => setNowItems(d?.items || [])).catch(() => {});
    api.backlog.list({ horizon: 'next' }).then((d: any) => setNextItems((d?.items || []).slice(0, 5))).catch(() => {});
    api.issues.list({ status: 'open' }).then((d: any) => setRecentIssues((d?.issues || []).slice(0, 5))).catch(() => {});
    api.session.getLatest().then((d: any) => setLastSession(d)).catch(() => {});
    apiFetch<{ notes: BrainNote[] }>('/brain/notes').then(d => setBrainNotes(d?.notes || [])).catch(() => {});
    apiFetch<{ events: ActivityEvent[] }>('/activity?limit=12').then(d => setActivity(d?.events || [])).catch(() => {});
    apiFetch<{ ideas: Idea[] }>('/ideas?status=captured').then(d => setRecentIdeas((d?.ideas || []).slice(0, 4))).catch(() => {});
    apiFetch<any>('/brain/context').then(d => setContextRecovery(d)).catch(() => {});
    apiFetch<{ entries: any[] }>('/changelog').then(d => setChangelog((d?.entries || []).slice(0, 5))).catch(() => {});
  }, []);

  const dismissNote = async (id: string) => {
    await fetch(`${BASE}/brain/notes/${id}/dismiss`, { method: 'POST' });
    setBrainNotes(prev => prev.filter(n => n.id !== id));
  };

  const healthPct = status?.health ?? 0;
  const healthColor = healthPct >= 80 ? 'text-status-pass' : healthPct >= 60 ? 'text-accent-blue' : healthPct >= 40 ? 'text-accent-yellow' : 'text-status-fail';

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Top row: Health + Quick Stats */}
      <div className="flex items-start gap-5">
        {/* Health ring */}
        <div className="bg-surface-2 border border-border rounded-lg p-4 flex items-center gap-4 flex-shrink-0">
          <div className="relative w-16 h-16">
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
              <circle
                cx="32" cy="32" r="28"
                fill="none"
                stroke={healthPct >= 80 ? '#22c55e' : healthPct >= 60 ? '#3b82f6' : healthPct >= 40 ? '#eab308' : '#ef4444'}
                strokeWidth="3"
                strokeDasharray={`${(healthPct / 100) * 176} 176`}
                strokeLinecap="round"
                transform="rotate(-90 32 32)"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg font-bold ${healthColor}`}>{healthPct}%</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Project Health</p>
            <p className="text-[10px] text-text-tertiary mt-0.5">{nowItems.filter(i => i.status === 'in_progress').length} active · {recentIssues.length} open issues</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex-1 grid grid-cols-4 gap-3">
          <MiniStat icon={ListTodo} label="Now" value={String(nowItems.length)} sub={`${nowItems.filter(i => i.status === 'in_progress').length} in progress`} />
          <MiniStat icon={CircleDot} label="Issues" value={String(recentIssues.length)} sub={recentIssues.filter(i => i.severity === 'critical' || i.severity === 'high').length > 0 ? `${recentIssues.filter(i => i.severity === 'critical' || i.severity === 'high').length} high+` : 'None critical'} accent={recentIssues.filter(i => i.severity === 'critical').length > 0 ? 'red' : undefined} />
          <MiniStat icon={TrendingUp} label="Last Session" value={lastSession ? `${lastSession.items_shipped}` : '—'} sub={lastSession ? `shipped · ${lastSession.date}` : 'No sessions'} />
          <MiniStat icon={Lightbulb} label="Ideas" value={String(recentIdeas.length)} sub="captured" />
        </div>
      </div>

      {/* AI Briefing — compact, collapsible */}
      {contextRecovery?.briefing && (
        <details className="bg-surface-2 border border-border rounded-lg overflow-hidden group" open>
          <summary className="px-4 py-3 flex items-center gap-2 cursor-pointer select-none hover:bg-surface-3 transition-colors">
            <Sparkles className="w-3.5 h-3.5 text-accent-purple" strokeWidth={2} />
            <span className="text-xs font-semibold text-text-primary flex-1">AI Briefing</span>
            <ArrowUpRight className="w-3 h-3 text-text-tertiary group-open:rotate-90 transition-transform" />
          </summary>
          <div className="px-4 pb-4 space-y-2.5">
            <p className="text-[12px] text-text-secondary leading-relaxed">{contextRecovery.briefing}</p>

            {contextRecovery?.warnings?.length > 0 && (
              <div className="space-y-1">
                {contextRecovery.warnings.slice(0, 3).map((w: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] text-text-secondary">
                    <AlertTriangle className="w-3 h-3 text-accent-yellow mt-0.5 flex-shrink-0" strokeWidth={2} />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {contextRecovery?.suggestions?.length > 0 && (
              <div className="space-y-1">
                {contextRecovery.suggestions.slice(0, 3).map((s: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] text-text-secondary">
                    <ArrowRight className="w-3 h-3 text-accent-blue mt-0.5 flex-shrink-0" strokeWidth={2} />
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      )}

      {/* Brain Notes — horizontal cards */}
      {brainNotes.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {brainNotes.slice(0, 4).map(note => (
            <div key={note.id} className={`bg-surface-2 border rounded-lg p-3 min-w-[260px] max-w-[300px] flex-shrink-0 ${
              note.priority === 'critical' ? 'border-accent-red/20' :
              note.priority === 'high' ? 'border-accent-yellow/20' : 'border-border'
            }`}>
              <div className="flex items-start gap-2">
                <NoteIcon type={note.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-primary leading-tight">{note.title}</p>
                  {note.content && <p className="text-[10px] text-text-tertiary mt-1 line-clamp-2">{note.content}</p>}
                </div>
                <button onClick={() => dismissNote(note.id)} className="text-text-tertiary hover:text-text-secondary opacity-50 hover:opacity-100">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Grid: 2-column layout */}
      <div className="grid grid-cols-5 gap-5">
        {/* Left: Focus + Pipeline (3 cols) */}
        <div className="col-span-3 space-y-5">
          {/* Current Focus */}
          <Section title="Current Focus" icon={Target}>
            <div className="space-y-2">
              {nowItems.map(item => (
                <div key={item.id} className={`bg-surface-2 border rounded-md p-3 ${
                  item.status === 'in_progress' ? 'border-accent-blue/30' : 'border-border'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {item.status === 'in_progress' && <span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse-subtle" />}
                        <span className="text-[13px] font-medium text-text-primary leading-tight">{item.title}</span>
                      </div>
                      {item.summary && <p className="text-[10px] text-text-tertiary mt-1 line-clamp-2">{item.summary}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <StatusBadge status={item.status} />
                      <SizeBadge size={item.size} />
                    </div>
                  </div>
                </div>
              ))}
              {nowItems.length === 0 && <EmptyState text="Nothing in Now — time to promote from Next" />}
            </div>
          </Section>

          {/* Up Next */}
          {nextItems.length > 0 && (
            <Section title="Up Next" icon={ArrowRight}>
              <div className="space-y-1">
                {nextItems.map(item => (
                  <div key={item.id} className="bg-surface-2 border border-border rounded-md px-3 py-2 flex items-center gap-2.5">
                    <span className="text-xs text-text-primary flex-1 truncate">{item.title}</span>
                    <span className="text-[10px] text-text-tertiary">{item.category}</span>
                    <SizeBadge size={item.size} />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Open Issues */}
          {recentIssues.length > 0 && (
            <Section title="Open Issues" icon={CircleDot}>
              <div className="space-y-1.5">
                {recentIssues.map(issue => (
                  <div key={issue.id} className="bg-surface-2 border border-border rounded-md px-3 py-2.5 flex items-start gap-2.5">
                    <SeverityBadge severity={issue.severity} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary leading-tight">{issue.title}</p>
                      <p className="text-[10px] text-text-tertiary mt-0.5">{issue.id}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Right: Activity + Recent (2 cols) */}
        <div className="col-span-2 space-y-5">
          {/* Activity Feed */}
          <Section title="Activity" icon={Activity}>
            <div className="bg-surface-2 border border-border rounded-md divide-y divide-border/40 max-h-[360px] overflow-y-auto">
              {activity.map(item => (
                <div key={item.id} className="px-3 py-2 flex items-start gap-2">
                  <ActivityIcon type={item.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-text-primary leading-tight">{item.title}</p>
                    {item.entity_type && <p className="text-[10px] text-text-tertiary truncate mt-0.5">{item.entity_type} · {item.actor}</p>}
                  </div>
                  <span className="text-[9px] text-text-tertiary flex-shrink-0 mt-0.5">{formatTime(item.timestamp)}</span>
                </div>
              ))}
              {activity.length === 0 && <EmptyState text="No activity yet" />}
            </div>
          </Section>

          {/* Recent Changelog */}
          {changelog.length > 0 && (
            <Section title="Recently Shipped" icon={GitCommitHorizontal}>
              <div className="space-y-1">
                {changelog.map((entry: any) => (
                  <div key={entry.id} className="bg-surface-2 border border-border rounded-md px-3 py-2 flex items-start gap-2">
                    <CheckCircle2 className="w-3 h-3 text-status-pass mt-0.5 flex-shrink-0" strokeWidth={2} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-text-primary leading-tight">{entry.title}</p>
                      <p className="text-[9px] text-text-tertiary mt-0.5">{entry.date} · {entry.type}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Ideas */}
          {recentIdeas.length > 0 && (
            <Section title="Captured Ideas" icon={Lightbulb}>
              <div className="space-y-1">
                {recentIdeas.map(idea => (
                  <div key={idea.id} className="bg-surface-2 border border-border rounded-md px-3 py-2 flex items-center gap-2">
                    <span className="text-xs text-text-primary flex-1 truncate">{idea.title}</span>
                    <span className="text-[10px] bg-surface-3 text-text-tertiary px-1.5 py-0.5 rounded">{idea.priority}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Activity; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-text-tertiary" strokeWidth={1.75} />
        <h2 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, sub, accent }: {
  icon: typeof Heart; label: string; value: string; sub: string; accent?: 'red';
}) {
  return (
    <div className="bg-surface-2 border border-border rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3 h-3 ${accent === 'red' ? 'text-accent-red' : 'text-text-tertiary'}`} strokeWidth={2} />
        <span className="text-[10px] text-text-tertiary uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-lg font-bold ${accent === 'red' ? 'text-accent-red' : 'text-text-primary'}`}>{value}</p>
      <p className="text-[10px] text-text-tertiary">{sub}</p>
    </div>
  );
}

function NoteIcon({ type }: { type: string }) {
  const cls = 'w-3.5 h-3.5 mt-0.5 flex-shrink-0';
  switch (type) {
    case 'warning': return <AlertTriangle className={`${cls} text-accent-yellow`} strokeWidth={2} />;
    case 'suggestion': return <Lightbulb className={`${cls} text-accent-blue`} strokeWidth={2} />;
    case 'decision': return <CheckCircle2 className={`${cls} text-accent-purple`} strokeWidth={2} />;
    default: return <Sparkles className={`${cls} text-text-tertiary`} strokeWidth={2} />;
  }
}

function ActivityIcon({ type }: { type: string }) {
  const cls = 'w-3 h-3 mt-0.5 flex-shrink-0';
  if (type.includes('session')) return <Clock className={`${cls} text-text-tertiary`} strokeWidth={2} />;
  if (type.includes('item')) return <ListTodo className={`${cls} text-text-tertiary`} strokeWidth={2} />;
  if (type.includes('issue')) return <CircleDot className={`${cls} text-accent-red`} strokeWidth={2} />;
  if (type.includes('idea')) return <Lightbulb className={`${cls} text-accent-yellow`} strokeWidth={2} />;
  return <Activity className={`${cls} text-text-tertiary`} strokeWidth={2} />;
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-[11px] text-text-tertiary py-4 text-center bg-surface-2 border border-border rounded-md">{text}</p>;
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
    return '';
  }
}
