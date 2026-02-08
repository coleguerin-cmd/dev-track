import type { IssueSeverity, IssueStatus, ItemStatus, Size, Horizon, SystemStatus } from '@shared/types';

export function HealthDot({ status }: { status: SystemStatus | string }) {
  const colors: Record<string, string> = {
    healthy: 'bg-status-pass',
    degraded: 'bg-status-warn',
    critical: 'bg-status-fail',
    unknown: 'bg-status-neutral',
    planned: 'bg-accent-blue',
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status] || 'bg-status-neutral'}`} />;
}

export function SizeBadge({ size }: { size: Size }) {
  const colors: Record<Size, string> = {
    S: 'bg-size-S/20 text-size-S',
    M: 'bg-size-M/20 text-size-M',
    L: 'bg-size-L/20 text-size-L',
    XL: 'bg-size-XL/20 text-size-XL',
  };
  return <span className={`badge ${colors[size]}`}>{size}</span>;
}

export function StatusBadge({ status }: { status: ItemStatus | IssueStatus }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-surface-4', text: 'text-text-tertiary', label: 'Pending' },
    in_progress: { bg: 'bg-accent-blue/15', text: 'text-accent-blue', label: 'In Progress' },
    in_review: { bg: 'bg-accent-purple/15', text: 'text-accent-purple', label: 'In Review' },
    completed: { bg: 'bg-status-pass/15', text: 'text-status-pass', label: 'Done' },
    cancelled: { bg: 'bg-surface-4', text: 'text-text-tertiary', label: 'Cancelled' },
    open: { bg: 'bg-accent-red/15', text: 'text-accent-red', label: 'Open' },
    resolved: { bg: 'bg-status-pass/15', text: 'text-status-pass', label: 'Resolved' },
    wont_fix: { bg: 'bg-surface-4', text: 'text-text-tertiary', label: "Won't Fix" },
  };
  const c = config[status] || config.pending;
  return <span className={`badge ${c.bg} ${c.text}`}>{c.label}</span>;
}

export function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  const config: Record<IssueSeverity, { bg: string; text: string }> = {
    critical: { bg: 'bg-accent-red/15', text: 'text-accent-red' },
    high: { bg: 'bg-accent-orange/15', text: 'text-accent-orange' },
    medium: { bg: 'bg-accent-yellow/15', text: 'text-accent-yellow' },
    low: { bg: 'bg-surface-4', text: 'text-text-tertiary' },
  };
  const c = config[severity];
  return <span className={`badge ${c.bg} ${c.text}`}>{severity}</span>;
}

export function HorizonBadge({ horizon }: { horizon: Horizon }) {
  const config: Record<string, { bg: string; text: string }> = {
    now: { bg: 'bg-accent-blue/15', text: 'text-accent-blue' },
    next: { bg: 'bg-accent-purple/15', text: 'text-accent-purple' },
    later: { bg: 'bg-surface-4', text: 'text-text-tertiary' },
    shipped: { bg: 'bg-status-pass/15', text: 'text-status-pass' },
  };
  const c = config[horizon] || config.later;
  return <span className={`badge ${c.bg} ${c.text}`}>{horizon.toUpperCase()}</span>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    P0: { bg: 'bg-accent-red/15', text: 'text-accent-red' },
    P1: { bg: 'bg-accent-orange/15', text: 'text-accent-orange' },
    P2: { bg: 'bg-accent-yellow/15', text: 'text-accent-yellow' },
    P3: { bg: 'bg-surface-4', text: 'text-text-tertiary' },
  };
  const c = config[priority] || config.P2;
  return <span className={`badge ${c.bg} ${c.text}`}>{priority}</span>;
}

export function CategoryTag({ category }: { category: string }) {
  return (
    <span className="badge bg-surface-3 text-text-tertiary">
      {category}
    </span>
  );
}

export function HealthBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-muted w-8 text-right">{score}%</span>
    </div>
  );
}
