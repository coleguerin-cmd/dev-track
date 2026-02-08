import { useEffect, useState } from 'react';
import * as api from '../api/client';
import type { Session } from '@shared/types';

export function Sessions() {
  const [current, setCurrent] = useState<Session | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    api.session.getCurrent().then(d => setCurrent(d)).catch(() => {});
    api.session.getLog(20).then((d: any) => setHistory([...(d?.sessions || [])].reverse())).catch(() => {});
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Sessions</h1>

      {/* Active session */}
      {current && current.status === 'active' && (
        <div className="card border-l-2 border-l-status-pass p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-status-pass animate-pulse-subtle" />
            <span className="text-sm font-semibold">Active Session #{current.id}</span>
            <span className="text-xs text-text-tertiary ml-auto">
              Started {new Date(current.started_at).toLocaleTimeString()}
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-2">{current.objective}</p>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span>Appetite: {current.appetite}</span>
            <span>·</span>
            <span>{current.items_shipped} items shipped</span>
            {current.points > 0 && (
              <>
                <span>·</span>
                <span>{current.points} points</span>
              </>
            )}
          </div>
          {current.roadmap_items_completed.length > 0 && (
            <div className="mt-3 space-y-1">
              {current.roadmap_items_completed.map(id => (
                <div key={id} className="flex items-center gap-2 text-xs">
                  <span className="text-status-pass">✓</span>
                  <span>{id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History timeline */}
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

        {history.map((session, idx) => (
          <div key={session.id || idx} className="relative pl-10 pb-6">
            <div className="absolute left-3 w-3 h-3 rounded-full bg-surface-3 border-2 border-border mt-1" />

            <div
              className="card-hover p-4"
              onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            >
              <div className="flex items-center gap-3 mb-1">
                <span className="text-sm font-semibold">
                  {session.id ? `#${session.id}` : ''} {session.date}
                </span>
                <span className="text-xs text-text-tertiary">
                  {session.duration_hours}h
                </span>
                <span className="badge bg-accent-blue/15 text-accent-blue">
                  {session.items_shipped} shipped
                </span>
                {session.points > 0 && (
                  <span className="badge bg-emerald-500/15 text-emerald-400">
                    {session.points} pts
                  </span>
                )}
                {session.developer && session.developer !== 'default' && session.developer !== 'user' && (
                  <span className="text-2xs text-text-tertiary">{session.developer}</span>
                )}
              </div>
              <p className="text-sm text-text-secondary">{session.objective}</p>

              {expandedIdx === idx && (
                <div className="mt-3 pt-3 border-t border-border space-y-3 animate-fade-in">
                  {/* v2 fields */}
                  {session.roadmap_items_completed?.length > 0 && (
                    <div>
                      <p className="label mb-1.5">Completed Items</p>
                      <div className="space-y-1">
                        {session.roadmap_items_completed.map((id: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="text-status-pass">✓</span>
                            <span>{id}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {session.issues_resolved?.length > 0 && (
                    <div>
                      <p className="label mb-1.5">Issues Resolved</p>
                      <div className="space-y-1">
                        {session.issues_resolved.map((id: string, i: number) => (
                          <div key={i} className="text-xs text-emerald-400">{id}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {session.retro && (
                    <div>
                      <p className="label mb-1">Retro</p>
                      <p className="text-xs text-text-secondary">{session.retro}</p>
                    </div>
                  )}
                  {session.next_suggestion && (
                    <div>
                      <p className="label mb-1">Next Session</p>
                      <p className="text-xs text-text-secondary">{session.next_suggestion}</p>
                    </div>
                  )}
                  {session.ai_observation && (
                    <div className="bg-accent-blue/5 rounded-md p-3">
                      <p className="label mb-1 text-accent-blue">AI Observation</p>
                      <p className="text-xs text-text-secondary">{session.ai_observation}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {history.length === 0 && (
          <div className="pl-10 card p-8 text-center text-text-tertiary">
            <p>No completed sessions yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
