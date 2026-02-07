import { useEffect, useState } from 'react';
import * as api from '../api/client';
import type { VelocityData, SessionMetric } from '@shared/types';

export function Metrics() {
  const [velocity, setVelocity] = useState<VelocityData | null>(null);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    api.metrics.velocity().then(d => setVelocity(d)).catch(() => {});
    api.metrics.summary().then(d => setSummary(d)).catch(() => {});
  }, []);

  const sessions = velocity?.sessions || [];
  const totals = velocity?.totals;

  // Simple bar chart data
  const maxItems = Math.max(...sessions.map(s => s.items_shipped), 1);
  const maxPoints = Math.max(...sessions.map(s => s.points), 1);

  // Category breakdown across all sessions
  const categoryTotals: Record<string, number> = {};
  sessions.forEach(s => {
    Object.entries(s.by_category || {}).forEach(([cat, count]) => {
      categoryTotals[cat] = (categoryTotals[cat] || 0) + count;
    });
  });
  const totalCategoryItems = Object.values(categoryTotals).reduce((a, b) => a + b, 0) || 1;
  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Metrics</h1>

      {/* Summary cards */}
      {totals && (
        <div className="grid grid-cols-5 gap-3 mb-8">
          <MetricCard label="Sessions" value={totals.total_sessions} />
          <MetricCard label="Items Shipped" value={totals.total_items_shipped} />
          <MetricCard label="Total Points" value={totals.total_points} />
          <MetricCard label="Avg Items/Session" value={totals.avg_items_per_session.toFixed(1)} />
          <MetricCard label="Issues Found" value={`${totals.total_issues_resolved}/${totals.total_issues_found} fixed`} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Velocity chart — Items per session */}
        <div className="card p-4">
          <h3 className="label mb-4">Items Shipped per Session</h3>
          <div className="flex items-end gap-1 h-40">
            {sessions.slice(-20).map((s, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-2xs text-text-tertiary">{s.items_shipped}</span>
                <div
                  className="w-full bg-accent-blue/60 rounded-t transition-all hover:bg-accent-blue"
                  style={{ height: `${(s.items_shipped / maxItems) * 100}%`, minHeight: 2 }}
                  title={`${s.date}: ${s.items_shipped} items`}
                />
                <span className="text-2xs text-text-tertiary rotate-45 origin-left whitespace-nowrap">
                  {s.date.slice(5)}
                </span>
              </div>
            ))}
          </div>
          {sessions.length === 0 && (
            <p className="text-xs text-text-tertiary text-center py-8">No session data yet</p>
          )}
        </div>

        {/* Points per session */}
        <div className="card p-4">
          <h3 className="label mb-4">Points per Session</h3>
          <div className="flex items-end gap-1 h-40">
            {sessions.slice(-20).map((s, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-2xs text-text-tertiary">{s.points}</span>
                <div
                  className="w-full bg-accent-purple/60 rounded-t transition-all hover:bg-accent-purple"
                  style={{ height: `${(s.points / maxPoints) * 100}%`, minHeight: 2 }}
                  title={`${s.date}: ${s.points} points`}
                />
                <span className="text-2xs text-text-tertiary rotate-45 origin-left whitespace-nowrap">
                  {s.date.slice(5)}
                </span>
              </div>
            ))}
          </div>
          {sessions.length === 0 && (
            <p className="text-xs text-text-tertiary text-center py-8">No session data yet</p>
          )}
        </div>

        {/* Category breakdown */}
        <div className="card p-4">
          <h3 className="label mb-4">Category Breakdown (All Time)</h3>
          <div className="space-y-2">
            {sortedCategories.map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="text-xs text-text-secondary w-20 truncate">{cat}</span>
                <div className="flex-1 h-5 bg-surface-3 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-cyan/60 rounded-full transition-all"
                    style={{ width: `${(count / totalCategoryItems) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-text-tertiary w-12 text-right">
                  {Math.round((count / totalCategoryItems) * 100)}%
                </span>
              </div>
            ))}
            {sortedCategories.length === 0 && (
              <p className="text-xs text-text-tertiary text-center py-4">No data yet</p>
            )}
          </div>
        </div>

        {/* Backlog + Issues summary */}
        {summary && (
          <div className="card p-4">
            <h3 className="label mb-4">Current State</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-3 rounded-lg p-3">
                <p className="text-2xs text-text-tertiary">Now</p>
                <p className="text-xl font-bold text-accent-blue">{summary.backlog?.now || 0}</p>
              </div>
              <div className="bg-surface-3 rounded-lg p-3">
                <p className="text-2xs text-text-tertiary">Next</p>
                <p className="text-xl font-bold text-accent-purple">{summary.backlog?.next || 0}</p>
              </div>
              <div className="bg-surface-3 rounded-lg p-3">
                <p className="text-2xs text-text-tertiary">Open Issues</p>
                <p className="text-xl font-bold text-accent-red">{summary.issues?.open || 0}</p>
              </div>
              <div className="bg-surface-3 rounded-lg p-3">
                <p className="text-2xs text-text-tertiary">Completed</p>
                <p className="text-xl font-bold text-status-pass">{summary.backlog?.completed || 0}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-3 text-center">
      <p className="text-2xs text-text-tertiary uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
