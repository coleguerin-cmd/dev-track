import { useEffect, useState } from 'react';
import * as api from '../api/client';
import { CategoryTag } from '../components/StatusBadge';
import type { ChangelogEntry } from '@shared/types';

// Handle both old (files_touched) and new (files_changed) field names
function getFiles(entry: any): string[] {
  return entry.files_touched || entry.files_changed || [];
}

export function Changelog() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    api.changelog.list({ limit: 50 }).then((d: any) => setEntries(d?.entries || [])).catch(() => {});
  }, []);

  // Group by date
  const grouped = entries.reduce<Record<string, ChangelogEntry[]>>((acc, entry) => {
    if (!acc[entry.date]) acc[entry.date] = [];
    acc[entry.date].push(entry);
    return acc;
  }, {});

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Changelog</h1>

      <div className="space-y-6">
        {Object.entries(grouped).map(([date, dateEntries]) => (
          <div key={date}>
            <h2 className="text-sm font-semibold text-text-secondary mb-3 sticky top-0 bg-surface-1 py-1 z-10">
              {date}
            </h2>
            <div className="space-y-2">
              {dateEntries.map(entry => (
                <div
                  key={entry.id}
                  className="card-hover p-4"
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold">{entry.title}</span>
                        <CategoryTag category={entry.category} />
                        {entry.breaking && (
                          <span className="badge bg-accent-red/15 text-accent-red">Breaking</span>
                        )}
                      </div>
                      {entry.description && (
                        <p className="text-xs text-text-secondary">{entry.description}</p>
                      )}
                    </div>
                  </div>

                  {expandedId === entry.id && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2 animate-fade-in">
                      {(entry.items?.length > 0) && (
                        <div>
                          <p className="label mb-1">Items</p>
                          <ul className="space-y-0.5">
                            {entry.items.map((item, i) => (
                              <li key={i} className="text-xs text-text-secondary">• {item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(getFiles(entry).length > 0) && (
                        <div>
                          <p className="label mb-1">Files</p>
                          {getFiles(entry).map(f => (
                            <p key={f} className="text-xs font-mono text-text-tertiary">{f}</p>
                          ))}
                        </div>
                      )}
                      {(entry as any).type && (
                        <p className="text-2xs text-text-tertiary">Type: {(entry as any).type}{(entry as any).scope ? ` · Scope: ${(entry as any).scope}` : ''}</p>
                      )}
                      {entry.backlog_item && (
                        <p className="text-2xs text-text-tertiary">Backlog: {entry.backlog_item}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {entries.length === 0 && (
          <div className="card p-8 text-center text-text-tertiary">
            <p>No changelog entries yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
