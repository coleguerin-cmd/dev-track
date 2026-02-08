import { useEffect, useState } from 'react';
import * as api from '../api/client';
import { SizeBadge } from '../components/StatusBadge';
import type { SessionEntry, SessionPlan } from '@shared/types';

export function Sessions() {
  const [current, setCurrent] = useState<SessionPlan | null>(null);
  const [history, setHistory] = useState<SessionEntry[]>([]);
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
            <span className="text-sm font-semibold">Active Session</span>
            <span className="text-xs text-text-tertiary ml-auto">
              Started {new Date(current.started_at).toLocaleTimeString()}
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-2">{current.objective}</p>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span>Appetite: {current.appetite}</span>
            <span>·</span>
            <span>{current.items.filter(i => i.status === 'completed').length}/{current.items.length} items</span>
          </div>
          {current.items.length > 0 && (
            <div className="mt-3 space-y-1">
              {current.items.map(item => (
                <div key={item.backlog_id} className="flex items-center gap-2 text-xs">
                  <span className={item.status === 'completed' ? 'text-status-pass' : item.status === 'in_progress' ? 'text-accent-blue' : 'text-text-tertiary'}>
                    {item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '●' : '○'}
                  </span>
                  <span className={item.status === 'completed' ? 'line-through text-text-tertiary' : ''}>{item.title}</span>
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
          <div key={idx} className="relative pl-10 pb-6">
            <div className="absolute left-3 w-3 h-3 rounded-full bg-surface-3 border-2 border-border mt-1" />

            <div
              className="card-hover p-4"
              onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            >
              <div className="flex items-center gap-3 mb-1">
                <span className="text-sm font-semibold">{session.date}</span>
                <span className="text-xs text-text-tertiary">
                  {session.duration_hours}h
                </span>
                <span className="badge bg-accent-blue/15 text-accent-blue">
                  {session.items_shipped} shipped
                </span>
                {session.developer && session.developer !== 'default' && (
                  <span className="text-2xs text-text-tertiary">{session.developer}</span>
                )}
              </div>
              <p className="text-sm text-text-secondary">{session.objective}</p>

              {expandedIdx === idx && (
                <div className="mt-3 pt-3 border-t border-border space-y-3 animate-fade-in">
                  {session.shipped.length > 0 && (
                    <div>
                      <p className="label mb-1.5">Shipped</p>
                      <div className="space-y-1">
                        {session.shipped.map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <SizeBadge size={item.size} />
                            <span>{item.title}</span>
                            <span className="text-text-tertiary">{item.category}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {session.discovered.length > 0 && (
                    <div>
                      <p className="label mb-1.5">Discovered</p>
                      <ul className="space-y-0.5">
                        {session.discovered.map((d, i) => (
                          <li key={i} className="text-xs text-accent-yellow">{d}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {session.next_session_suggestion && (
                    <div>
                      <p className="label mb-1">Next Session</p>
                      <p className="text-xs text-text-secondary">{session.next_session_suggestion}</p>
                    </div>
                  )}
                  {session.handoff_message && (
                    <div className="bg-accent-blue/5 rounded-md p-3">
                      <p className="label mb-1 text-accent-blue">Handoff Message</p>
                      <p className="text-xs text-text-secondary">{session.handoff_message}</p>
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
