import type { ActionHealth, IssueSeverity, IssueStatus, ItemStatus, Size, Horizon } from '@shared/types';

export function HealthDot({ health }: { health: ActionHealth }) {
  const colors: Record<ActionHealth, string> = {
    green: 'bg-status-pass',
    yellow: 'bg-status-warn',
    red: 'bg-status-fail',
    unknown: 'bg-status-neutral',
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[health]}`} />;
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
  const config: Record<Horizon, { bg: string; text: string }> = {
    now: { bg: 'bg-accent-blue/15', text: 'text-accent-blue' },
    next: { bg: 'bg-accent-purple/15', text: 'text-accent-purple' },
    later: { bg: 'bg-surface-4', text: 'text-text-tertiary' },
  };
  const c = config[horizon];
  return <span className={`badge ${c.bg} ${c.text}`}>{horizon.toUpperCase()}</span>;
}

export function CategoryTag({ category }: { category: string }) {
  return (
    <span className="badge bg-surface-3 text-text-tertiary">
      {category}
    </span>
  );
}

export function PassRate({ passed, total }: { passed: number; total: number }) {
  if (total === 0) return <span className="text-text-tertiary text-xs">No runs</span>;
  const pct = Math.round((passed / total) * 100);
  const color = pct >= 90 ? 'text-status-pass' : pct >= 70 ? 'text-status-warn' : 'text-status-fail';
  return (
    <span className={`text-xs font-medium ${color}`}>
      {passed}/{total} pass
    </span>
  );
}
