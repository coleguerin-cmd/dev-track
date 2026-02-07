import { useEffect, useState, useCallback } from 'react';
import * as api from '../api/client';
import { SeverityBadge, StatusBadge } from '../components/StatusBadge';
import type { Issue, IssueSeverity } from '@shared/types';

export function Issues() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [showForm, setShowForm] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = filter === 'all' ? {} : filter === 'open' ? { status: 'open' } : { status: 'resolved' };
    api.issues.list(params).then((d: any) => setIssues(d?.issues || [])).catch(() => {});
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const resolveIssue = async (id: string) => {
    const resolution = prompt('Resolution description:');
    if (!resolution) return;
    await api.issues.resolve(id, resolution);
    load();
  };

  const selected = issues.find(i => i.id === selectedIssue);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Issues</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ New Issue</button>
      </div>

      {/* Filters */}
      <div className="flex gap-1 mb-4">
        {(['open', 'resolved', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`btn-ghost text-xs ${filter === f ? 'bg-surface-3 text-text-primary' : ''}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* Issue list */}
        <div className="col-span-3 space-y-2">
          {issues.map(issue => (
            <div
              key={issue.id}
              onClick={() => setSelectedIssue(issue.id)}
              className={`card-hover p-3 ${selectedIssue === issue.id ? 'ring-1 ring-accent-blue/40' : ''}`}
            >
              <div className="flex items-start gap-2">
                <SeverityBadge severity={issue.severity} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{issue.title}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-2xs text-text-tertiary">{issue.id}</span>
                    <span className="text-2xs text-text-tertiary">·</span>
                    <span className="text-2xs text-text-tertiary">{issue.discovered}</span>
                    {issue.action_id && (
                      <>
                        <span className="text-2xs text-text-tertiary">·</span>
                        <span className="text-2xs text-accent-blue">{issue.action_id}</span>
                      </>
                    )}
                  </div>
                </div>
                <StatusBadge status={issue.status} />
              </div>
            </div>
          ))}
          {issues.length === 0 && (
            <div className="card p-8 text-center text-text-tertiary">
              <p>{filter === 'open' ? 'No open issues!' : 'No issues found'}</p>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="col-span-2">
          {selected ? (
            <div className="card p-4 space-y-3 sticky top-6">
              <div className="flex items-center gap-2">
                <SeverityBadge severity={selected.severity} />
                <StatusBadge status={selected.status} />
                <span className="text-2xs text-text-tertiary">{selected.id}</span>
              </div>
              <h3 className="text-base font-semibold">{selected.title}</h3>

              {selected.symptoms && (
                <div>
                  <p className="label mb-1">Symptoms</p>
                  <p className="text-sm text-text-secondary">{selected.symptoms}</p>
                </div>
              )}
              {selected.root_cause && (
                <div>
                  <p className="label mb-1">Root Cause</p>
                  <p className="text-sm text-text-secondary">{selected.root_cause}</p>
                </div>
              )}
              {selected.files.length > 0 && (
                <div>
                  <p className="label mb-1">Files</p>
                  <div className="space-y-0.5">
                    {selected.files.map(f => (
                      <p key={f} className="text-xs font-mono text-accent-blue">{f}</p>
                    ))}
                  </div>
                </div>
              )}
              {selected.resolution && (
                <div>
                  <p className="label mb-1">Resolution</p>
                  <p className="text-sm text-status-pass">{selected.resolution}</p>
                </div>
              )}
              {selected.status !== 'resolved' && (
                <button onClick={() => resolveIssue(selected.id)} className="btn-primary text-sm w-full mt-2">
                  Resolve Issue
                </button>
              )}
            </div>
          ) : (
            <div className="card p-8 text-center text-text-tertiary">
              <p>Select an issue</p>
            </div>
          )}
        </div>
      </div>

      {showForm && <CreateIssueModal onClose={() => setShowForm(false)} onCreated={load} />}
    </div>
  );
}

function CreateIssueModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<IssueSeverity>('medium');
  const [symptoms, setSymptoms] = useState('');
  const [actionId, setActionId] = useState('');
  const [files, setFiles] = useState('');

  const submit = async () => {
    if (!title.trim()) return;
    await api.issues.create({
      title,
      severity,
      symptoms,
      action_id: actionId || undefined,
      files: files ? files.split(',').map(f => f.trim()) : [],
    });
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="card p-6 w-full max-w-md space-y-4 animate-slide-in" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">New Issue</h2>
        <input className="input" placeholder="Issue title" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label mb-1 block">Severity</label>
            <select className="input" value={severity} onChange={e => setSeverity(e.target.value as IssueSeverity)}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="label mb-1 block">Action</label>
            <input className="input" placeholder="e.g. new-entry" value={actionId} onChange={e => setActionId(e.target.value)} />
          </div>
        </div>
        <textarea className="input h-20 resize-none" placeholder="Symptoms..." value={symptoms} onChange={e => setSymptoms(e.target.value)} />
        <input className="input" placeholder="Files (comma-separated)" value={files} onChange={e => setFiles(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>Create</button>
        </div>
      </div>
    </div>
  );
}
