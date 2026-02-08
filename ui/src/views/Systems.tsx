import { useEffect, useState } from 'react';
import * as api from '../api/client';

interface SystemItem {
  id: string;
  name: string;
  description: string;
  status: string;
  health_score: number;
  tech_stack: string[];
  open_issues: number;
  updated: string;
}

const STATUS_COLORS: Record<string, string> = {
  healthy: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  critical: 'bg-red-500',
  unknown: 'bg-zinc-500',
  planned: 'bg-blue-500',
};

const STATUS_LABELS: Record<string, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  critical: 'Critical',
  unknown: 'Unknown',
  planned: 'Planned',
};

export function Systems() {
  const [systems, setSystems] = useState<SystemItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api.systems.list().then(data => {
      setSystems(data.systems || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-muted animate-pulse">Loading systems...</div>;

  const avgHealth = systems.length > 0
    ? Math.round(systems.reduce((sum, s) => sum + s.health_score, 0) / systems.length)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Systems</h1>
          <p className="text-sm text-muted mt-0.5">Architecture health map — {systems.length} systems, avg health {avgHealth}%</p>
        </div>
      </div>

      <div className="grid gap-3">
        {systems.map(system => (
          <div
            key={system.id}
            className="bg-surface-1 border border-border rounded-lg p-4 hover:border-zinc-600 transition-colors cursor-pointer"
            onClick={() => setExpanded(expanded === system.id ? null : system.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[system.status] || 'bg-zinc-500'}`} />
                <div>
                  <span className="font-medium text-foreground">{system.name}</span>
                  <span className="text-xs text-muted ml-2">{STATUS_LABELS[system.status] || system.status}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        system.health_score >= 80 ? 'bg-emerald-500' :
                        system.health_score >= 60 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${system.health_score}%` }}
                    />
                  </div>
                  <span className="text-muted w-8 text-right">{system.health_score}%</span>
                </div>
                {system.open_issues > 0 && (
                  <span className="text-amber-400 text-xs">{system.open_issues} issues</span>
                )}
              </div>
            </div>

            {expanded === system.id && (
              <div className="mt-3 pt-3 border-t border-border space-y-2">
                <p className="text-sm text-muted">{system.description}</p>
                {system.tech_stack.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {system.tech_stack.map(tech => (
                      <span key={tech} className="px-2 py-0.5 text-xs bg-zinc-800 text-zinc-300 rounded">
                        {tech}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-zinc-600">Last assessed: {system.updated}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {systems.length === 0 && (
        <div className="text-center text-muted py-12">
          <p>No systems registered yet.</p>
          <p className="text-sm mt-1">Systems are created from the codebase scanner or manually.</p>
        </div>
      )}
    </div>
  );
}
