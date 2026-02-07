import { useEffect, useState, useCallback } from 'react';
import type { Idea, IdeaStatus, IdeaCategory } from '@shared/types';

const BASE = '/api/v1';
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...opts?.headers }, ...opts });
  const j = await r.json(); if (!j.ok) throw new Error(j.error); return j.data as T;
}

const STATUS_CONFIG: Record<IdeaStatus, { label: string; color: string; icon: string }> = {
  captured: { label: 'Captured', color: 'bg-accent-blue/15 text-accent-blue', icon: '💡' },
  exploring: { label: 'Exploring', color: 'bg-accent-purple/15 text-accent-purple', icon: '🔍' },
  validated: { label: 'Validated', color: 'bg-status-pass/15 text-status-pass', icon: '✓' },
  promoted: { label: 'Promoted', color: 'bg-accent-green/15 text-accent-green', icon: '↗' },
  parked: { label: 'Parked', color: 'bg-surface-4 text-text-tertiary', icon: '⏸' },
  rejected: { label: 'Rejected', color: 'bg-surface-4 text-text-tertiary', icon: '✗' },
};

const CATEGORIES: IdeaCategory[] = ['feature', 'architecture', 'integration', 'ux', 'performance', 'business', 'process', 'other'];

export function Ideas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [filter, setFilter] = useState<string>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    apiFetch<{ ideas: Idea[] }>('/ideas').then(d => {
      let filtered = d.ideas;
      if (filter === 'active') filtered = filtered.filter(i => !['promoted', 'rejected', 'parked'].includes(i.status));
      else if (filter !== 'all') filtered = filtered.filter(i => i.status === filter);
      setIdeas(filtered);
    }).catch(() => {});
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const selected = ideas.find(i => i.id === selectedId);

  const updateIdea = async (id: string, updates: Partial<Idea>) => {
    await apiFetch(`/ideas/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    load();
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ideas</h1>
          <p className="text-sm text-text-tertiary mt-1">Capture, explore, and promote ideas to your backlog</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">💡 New Idea</button>
      </div>

      {/* Filters */}
      <div className="flex gap-1 mb-4">
        {['active', 'captured', 'exploring', 'validated', 'parked', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`btn-ghost text-xs ${filter === f ? 'bg-surface-3 text-text-primary' : ''}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-5 items-start">
        {/* Ideas list */}
        <div className="col-span-3 space-y-2">
          {ideas.map(idea => (
            <div key={idea.id} onClick={() => setSelectedId(idea.id)}
              className={`card-hover p-4 ${selectedId === idea.id ? 'ring-1 ring-accent-blue/40' : ''}`}>
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5">{STATUS_CONFIG[idea.status]?.icon || '💡'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold">{idea.title}</span>
                    <span className={`badge ${STATUS_CONFIG[idea.status]?.color}`}>
                      {STATUS_CONFIG[idea.status]?.label}
                    </span>
                    <span className="badge bg-surface-3 text-text-tertiary">{idea.category}</span>
                  </div>
                  {idea.description && (
                    <p className="text-xs text-text-secondary line-clamp-2">{idea.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-2xs text-text-tertiary">
                    <span>{idea.id}</span>
                    <span>{idea.created}</span>
                    {idea.source && <span>via {idea.source}</span>}
                    {idea.open_questions.length > 0 && (
                      <span className="text-accent-yellow">{idea.open_questions.length} open questions</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {ideas.length === 0 && (
            <div className="card p-12 text-center">
              <p className="text-lg text-text-tertiary mb-2">No ideas yet</p>
              <p className="text-sm text-text-tertiary">Capture an idea to get started. Ideas can be promoted to backlog items when ready.</p>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="col-span-2">
          {selected ? (
            <div className="card p-5 space-y-4 sticky top-6">
              <div className="flex items-center gap-2">
                <span className="text-xl">{STATUS_CONFIG[selected.status]?.icon}</span>
                <h3 className="text-base font-semibold flex-1">{selected.title}</h3>
              </div>

              <p className="text-sm text-text-secondary">{selected.description || 'No description'}</p>

              {/* Status selector */}
              <div>
                <p className="label mb-1.5">Status</p>
                <div className="flex flex-wrap gap-1">
                  {(Object.keys(STATUS_CONFIG) as IdeaStatus[]).map(s => (
                    <button key={s} onClick={() => updateIdea(selected.id, { status: s })}
                      className={`text-2xs px-2 py-1 rounded transition-colors ${selected.status === s ? STATUS_CONFIG[s].color : 'bg-surface-3 text-text-tertiary hover:text-text-primary'}`}>
                      {STATUS_CONFIG[s].icon} {STATUS_CONFIG[s].label}
                    </button>
                  ))}
                </div>
              </div>

              {selected.pros.length > 0 && (
                <div>
                  <p className="label mb-1">Pros</p>
                  {selected.pros.map((p, i) => <p key={i} className="text-xs text-status-pass">+ {p}</p>)}
                </div>
              )}
              {selected.cons.length > 0 && (
                <div>
                  <p className="label mb-1">Cons</p>
                  {selected.cons.map((c, i) => <p key={i} className="text-xs text-status-fail">- {c}</p>)}
                </div>
              )}
              {selected.open_questions.length > 0 && (
                <div>
                  <p className="label mb-1">Open Questions</p>
                  {selected.open_questions.map((q, i) => <p key={i} className="text-xs text-accent-yellow">? {q}</p>)}
                </div>
              )}
              {selected.notes && (
                <div>
                  <p className="label mb-1">Notes</p>
                  <p className="text-xs text-text-secondary whitespace-pre-wrap">{selected.notes}</p>
                </div>
              )}

              {selected.status !== 'promoted' && (
                <button onClick={() => updateIdea(selected.id, { status: 'promoted' })}
                  className="btn-primary w-full text-sm">
                  ↗ Promote to Backlog
                </button>
              )}
              {selected.promoted_to && (
                <p className="text-xs text-accent-green">Promoted to backlog: {selected.promoted_to}</p>
              )}
            </div>
          ) : (
            <div className="card p-8 text-center text-text-tertiary">
              <p>Select an idea to see details</p>
            </div>
          )}
        </div>
      </div>

      {showForm && <NewIdeaModal onClose={() => setShowForm(false)} onCreated={load} />}
    </div>
  );
}

function NewIdeaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<IdeaCategory>('feature');
  const [source, setSource] = useState('');

  const submit = async () => {
    if (!title.trim()) return;
    await apiFetch('/ideas', { method: 'POST', body: JSON.stringify({ title, description, category, source: source || 'manual' }) });
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg space-y-4 animate-slide-in" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">💡 New Idea</h2>
        <input className="input" placeholder="What's the idea?" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        <textarea className="input h-24 resize-none" placeholder="Describe it..." value={description} onChange={e => setDescription(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label mb-1 block">Category</label>
            <select className="input" value={category} onChange={e => setCategory(e.target.value as IdeaCategory)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label mb-1 block">Source</label>
            <input className="input" placeholder="conversation, debugging..." value={source} onChange={e => setSource(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>Capture</button>
        </div>
      </div>
    </div>
  );
}
