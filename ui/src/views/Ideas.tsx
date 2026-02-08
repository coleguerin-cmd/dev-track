import { useEffect, useState, useCallback, useMemo } from 'react';
import type { Idea, IdeaStatus, IdeaCategory } from '@shared/types';

const BASE = '/api/v1';
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...opts?.headers }, ...opts });
  const j = await r.json(); if (!j.ok) throw new Error(j.error); return j.data as T;
}

const STATUS_CONFIG: Record<IdeaStatus, { label: string; color: string; icon: string }> = {
  captured: { label: 'Captured', color: 'bg-accent-blue/15 text-accent-blue', icon: '◆' },
  exploring: { label: 'Exploring', color: 'bg-accent-purple/15 text-accent-purple', icon: '○' },
  validated: { label: 'Validated', color: 'bg-status-pass/15 text-status-pass', icon: '✓' },
  promoted: { label: 'Promoted', color: 'bg-accent-green/15 text-accent-green', icon: '↗' },
  parked: { label: 'Parked', color: 'bg-surface-4 text-text-tertiary', icon: '⏸' },
  rejected: { label: 'Rejected', color: 'bg-surface-4 text-text-tertiary', icon: '✗' },
};

const CATEGORIES: IdeaCategory[] = ['feature', 'architecture', 'integration', 'ux', 'performance', 'business', 'process', 'other'];

type ViewMode = 'flat' | 'grouped';

/** Build connected components from related_ideas links */
function buildIdeaGroups(ideas: Idea[]): { groups: Idea[][]; ungrouped: Idea[] } {
  const idIndex = new Map<string, Idea>();
  ideas.forEach(i => idIndex.set(i.id, i));

  // Build adjacency list
  const adj = new Map<string, Set<string>>();
  for (const idea of ideas) {
    if (!adj.has(idea.id)) adj.set(idea.id, new Set());
    const related = (idea as any).related_ideas as string[] | undefined;
    if (related?.length) {
      for (const rid of related) {
        if (!adj.has(rid)) adj.set(rid, new Set());
        adj.get(idea.id)!.add(rid);
        adj.get(rid)!.add(idea.id);
      }
    }
  }

  // BFS to find connected components
  const visited = new Set<string>();
  const components: Idea[][] = [];

  for (const idea of ideas) {
    if (visited.has(idea.id)) continue;
    const neighbors = adj.get(idea.id);
    if (!neighbors || neighbors.size === 0) continue;

    const component: Idea[] = [];
    const queue = [idea.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const node = idIndex.get(current);
      if (node) component.push(node);
      const currentNeighbors = adj.get(current);
      if (currentNeighbors) {
        for (const n of currentNeighbors) {
          if (!visited.has(n)) queue.push(n);
        }
      }
    }

    if (component.length > 1) {
      components.push(component);
    }
  }

  const groupedIds = new Set(components.flat().map(i => i.id));
  const ungrouped = ideas.filter(i => !groupedIds.has(i.id));

  return { groups: components, ungrouped };
}

/** Extract group name from notes (e.g., "Future group: Tiered Audit System") */
function extractGroupName(ideas: Idea[]): string {
  for (const idea of ideas) {
    if (idea.notes) {
      const match = idea.notes.match(/Future group:\s*(.+?)(?:\.|$)/i);
      if (match) return match[1].trim();
    }
  }
  // Fall back to common category or just count
  const categories = [...new Set(ideas.map(i => i.category))];
  if (categories.length === 1 && categories[0] !== 'other') {
    return `${categories[0].charAt(0).toUpperCase() + categories[0].slice(1)} ideas`;
  }
  return `${ideas.length} related ideas`;
}

export function Ideas() {
  const [allIdeas, setAllIdeas] = useState<Idea[]>([]);
  const [filter, setFilter] = useState<string>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('ideas-view') as ViewMode) || 'flat';
  });

  const load = useCallback(() => {
    apiFetch<{ ideas: Idea[] }>('/ideas').then(d => {
      setAllIdeas(d.ideas || []);
    }).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    localStorage.setItem('ideas-view', viewMode);
  }, [viewMode]);

  const ideas = useMemo(() => {
    let filtered = allIdeas;
    if (filter === 'active') filtered = filtered.filter(i => !['promoted', 'rejected', 'parked'].includes(i.status));
    else if (filter !== 'all') filtered = filtered.filter(i => i.status === filter);
    return filtered;
  }, [allIdeas, filter]);

  const selected = allIdeas.find(i => i.id === selectedId);

  const updateIdea = async (id: string, updates: Partial<Idea>) => {
    await apiFetch(`/ideas/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    load();
  };

  const { groups, ungrouped } = useMemo(() => buildIdeaGroups(ideas), [ideas]);

  const scrollToIdea = (id: string) => {
    setSelectedId(id);
    // If in filter mode that hides this idea, switch to 'all'
    const idea = allIdeas.find(i => i.id === id);
    if (idea) {
      const inCurrent = ideas.find(i => i.id === id);
      if (!inCurrent) setFilter('all');
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ideas</h1>
            <p className="text-sm text-text-tertiary mt-1">Capture, explore, and promote ideas to your backlog</p>
          </div>
          {/* View mode toggle */}
          <div className="flex items-center bg-surface-2 rounded-lg p-0.5 border border-border/50">
            <button
              onClick={() => setViewMode('flat')}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                viewMode === 'flat'
                  ? 'bg-surface-3 text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              Flat
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                viewMode === 'grouped'
                  ? 'bg-surface-3 text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              By Group
            </button>
          </div>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">New Idea</button>
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
          {viewMode === 'flat' ? (
            /* ─── Flat list ─── */
            <>
              {ideas.map(idea => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  isSelected={selectedId === idea.id}
                  onClick={() => setSelectedId(idea.id)}
                  allIdeas={allIdeas}
                  onScrollToIdea={scrollToIdea}
                />
              ))}
              {ideas.length === 0 && (
                <div className="card p-12 text-center">
                  <p className="text-lg text-text-tertiary mb-2">No ideas yet</p>
                  <p className="text-sm text-text-tertiary">Capture an idea to get started. Ideas can be promoted to backlog items when ready.</p>
                </div>
              )}
            </>
          ) : (
            /* ─── Grouped list ─── */
            <>
              {groups.map((group, gi) => {
                const groupName = extractGroupName(group);
                return (
                  <IdeaGroupSection
                    key={gi}
                    name={groupName}
                    ideas={group}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    allIdeas={allIdeas}
                    onScrollToIdea={scrollToIdea}
                  />
                );
              })}
              {ungrouped.length > 0 && (
                <IdeaGroupSection
                  name="Ungrouped"
                  ideas={ungrouped}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  allIdeas={allIdeas}
                  onScrollToIdea={scrollToIdea}
                  isDashed
                />
              )}
              {groups.length === 0 && ungrouped.length === 0 && (
                <div className="card p-12 text-center">
                  <p className="text-lg text-text-tertiary mb-2">No ideas yet</p>
                  <p className="text-sm text-text-tertiary">Capture an idea to get started.</p>
                </div>
              )}
              {groups.length === 0 && ungrouped.length > 0 && (
                <p className="text-xs text-text-tertiary text-center mt-2">
                  No related_ideas links found. Link ideas to see groups.
                </p>
              )}
            </>
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

              {/* Related ideas */}
              {(selected as any).related_ideas?.length > 0 && (
                <div>
                  <p className="label mb-1.5">Related Ideas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {((selected as any).related_ideas as string[]).map(rid => {
                      const relIdea = allIdeas.find(i => i.id === rid);
                      return (
                        <button
                          key={rid}
                          onClick={() => scrollToIdea(rid)}
                          className="text-2xs px-2 py-1 rounded-full bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-colors truncate max-w-[180px]"
                          title={relIdea ? relIdea.title : rid}
                        >
                          {relIdea ? `${rid}: ${relIdea.title}` : rid}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {(selected.pros?.length > 0) && (
                <div>
                  <p className="label mb-1">Pros</p>
                  {selected.pros.map((p, i) => <p key={i} className="text-xs text-status-pass">+ {p}</p>)}
                </div>
              )}
              {(selected.cons?.length > 0) && (
                <div>
                  <p className="label mb-1">Cons</p>
                  {selected.cons.map((c, i) => <p key={i} className="text-xs text-status-fail">- {c}</p>)}
                </div>
              )}
              {(selected.open_questions?.length > 0) && (
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

              {/* Tags */}
              {(selected as any).tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(selected as any).tags.map((t: string) => (
                    <span key={t} className="text-[9px] bg-surface-3 text-text-tertiary px-1.5 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              )}

              {/* Priority */}
              {(selected as any).priority && (
                <div>
                  <p className="label mb-1">Priority</p>
                  <span className={`text-xs font-semibold ${
                    (selected as any).priority === 'critical' ? 'text-red-400' :
                    (selected as any).priority === 'high' ? 'text-orange-400' :
                    (selected as any).priority === 'medium' ? 'text-yellow-400' :
                    'text-blue-300'
                  }`}>{(selected as any).priority}</span>
                </div>
              )}

              {/* Timestamps */}
              <div className="flex items-center gap-3 text-[10px] text-text-tertiary pt-2 border-t border-border/50">
                <span>Created {selected.created}</span>
                {(selected as any).updated && (selected as any).updated !== selected.created && (
                  <span>Modified {(selected as any).updated}</span>
                )}
              </div>

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

/* ─── Idea Card (used in flat and grouped views) ─── */

function IdeaCard({
  idea,
  isSelected,
  onClick,
  allIdeas,
  onScrollToIdea,
}: {
  idea: Idea;
  isSelected: boolean;
  onClick: () => void;
  allIdeas: Idea[];
  onScrollToIdea: (id: string) => void;
}) {
  const relatedIds = (idea as any).related_ideas as string[] | undefined;
  const hasRelated = relatedIds && relatedIds.length > 0;

  return (
    <div onClick={onClick}
      className={`card-hover p-4 ${isSelected ? 'ring-1 ring-accent-blue/40' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="text-sm mt-0.5 text-text-tertiary">{STATUS_CONFIG[idea.status]?.icon || '◆'}</span>
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
            {(idea.open_questions?.length > 0) && (
              <span className="text-accent-yellow">{idea.open_questions.length} open questions</span>
            )}
          </div>

          {/* Related ideas chips (inline) */}
          {hasRelated && (
            <div className="flex flex-wrap gap-1 mt-2">
              {relatedIds!.map(rid => {
                const rel = allIdeas.find(i => i.id === rid);
                return (
                  <button
                    key={rid}
                    onClick={(e) => { e.stopPropagation(); onScrollToIdea(rid); }}
                    className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-colors truncate max-w-[150px]"
                    title={rel ? rel.title : rid}
                  >
                    {rid}{rel ? `: ${rel.title}` : ''}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Idea Group Section (used in grouped view) ─── */

function IdeaGroupSection({
  name,
  ideas,
  selectedId,
  onSelect,
  allIdeas,
  onScrollToIdea,
  isDashed,
}: {
  name: string;
  ideas: Idea[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  allIdeas: Idea[];
  onScrollToIdea: (id: string) => void;
  isDashed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`rounded-lg border overflow-hidden ${isDashed ? 'border-border/30 border-dashed bg-surface-1/50' : 'border-border/50 bg-surface-1'}`}>
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-2/50 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-[10px] text-text-tertiary">{collapsed ? '▸' : '▾'}</span>
        <span className={`text-sm font-semibold ${isDashed ? 'text-text-tertiary' : 'text-text-primary'}`}>
          {name}
        </span>
        <span className="text-2xs text-text-tertiary font-mono">{ideas.length}</span>
      </div>

      {!collapsed && (
        <div className="space-y-1 px-2 pb-2">
          {ideas.map(idea => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              isSelected={selectedId === idea.id}
              onClick={() => onSelect(idea.id)}
              allIdeas={allIdeas}
              onScrollToIdea={onScrollToIdea}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── New Idea Modal ─── */

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
        <h2 className="text-lg font-semibold">New Idea</h2>
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
