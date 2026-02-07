import { useEffect, useState, useCallback } from 'react';
import * as api from '../api/client';
import { SizeBadge, StatusBadge, CategoryTag } from '../components/StatusBadge';
import type { BacklogItem, Horizon } from '@shared/types';

export function Backlog() {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.backlog.list().then((d: any) => setItems(d?.items || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const nowItems = items.filter(i => i.horizon === 'now' && i.status !== 'completed' && i.status !== 'cancelled');
  const nextItems = items.filter(i => i.horizon === 'next' && i.status !== 'completed' && i.status !== 'cancelled');
  const laterItems = items.filter(i => i.horizon === 'later' && i.status !== 'completed' && i.status !== 'cancelled');
  const completedItems = items.filter(i => i.status === 'completed' || i.status === 'cancelled');

  const moveItem = async (id: string, horizon: Horizon) => {
    try {
      await api.backlog.move(id, horizon);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const completeItem = async (id: string) => {
    await api.backlog.complete(id);
    load();
  };

  const reopenItem = async (id: string) => {
    await api.backlog.reopen(id);
    load();
  };

  const updateStatus = async (id: string, status: string) => {
    await api.backlog.update(id, { status });
    load();
  };

  const [showCompleted, setShowCompleted] = useState(false);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Backlog</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          + New Item
        </button>
      </div>

      {/* Three-column Kanban */}
      <div className="grid grid-cols-3 gap-5 items-start">
        <KanbanColumn
          title="Now"
          items={nowItems}
          maxItems={3}
          onMove={moveItem}
          onComplete={completeItem}
          onUpdateStatus={updateStatus}
          expandedId={expandedId}
          onToggleExpand={setExpandedId}
        />
        <KanbanColumn
          title="Next"
          items={nextItems}
          onMove={moveItem}
          onComplete={completeItem}
          onUpdateStatus={updateStatus}
          expandedId={expandedId}
          onToggleExpand={setExpandedId}
        />
        <KanbanColumn
          title="Later"
          items={laterItems}
          onMove={moveItem}
          onComplete={completeItem}
          onUpdateStatus={updateStatus}
          expandedId={expandedId}
          onToggleExpand={setExpandedId}
        />
      </div>

      {/* Completed / Archived items */}
      {completedItems.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <span className={`transition-transform ${showCompleted ? 'rotate-90' : ''}`}>▸</span>
            Completed ({completedItems.length})
          </button>

          {showCompleted && (
            <div className="mt-3 space-y-2 animate-fade-in">
              {completedItems.map(item => (
                <div key={item.id} className="card p-3 opacity-60 hover:opacity-100 transition-opacity">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-status-pass text-sm">✓</span>
                      <span className="text-sm line-through text-text-tertiary truncate">{item.title}</span>
                      <SizeBadge size={item.size} />
                      {item.category && <CategoryTag category={item.category} />}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.completed && (
                        <span className="text-2xs text-text-tertiary">{item.completed}</span>
                      )}
                      <button
                        onClick={() => reopenItem(item.id)}
                        className="btn-ghost text-xs py-1 text-accent-yellow"
                      >
                        ↩ Reopen
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick add form */}
      {showForm && <AddItemModal onClose={() => setShowForm(false)} onAdded={load} />}
    </div>
  );
}

function KanbanColumn({
  title,
  items,
  maxItems,
  onMove,
  onComplete,
  onUpdateStatus,
  expandedId,
  onToggleExpand,
}: {
  title: string;
  items: BacklogItem[];
  maxItems?: number;
  onMove: (id: string, horizon: Horizon) => void;
  onComplete: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
  expandedId: string | null;
  onToggleExpand: (id: string | null) => void;
}) {
  const isOverLimit = maxItems !== undefined && items.length >= maxItems;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 mb-1">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          {title}
        </h2>
        <span className={`text-xs font-medium ${isOverLimit ? 'text-accent-red' : 'text-text-tertiary'}`}>
          {items.length}{maxItems ? `/${maxItems}` : ''}
        </span>
      </div>

      <div className="space-y-2 min-h-[200px]">
        {items.map(item => (
          <BacklogCard
            key={item.id}
            item={item}
            isExpanded={expandedId === item.id}
            onToggle={() => onToggleExpand(expandedId === item.id ? null : item.id)}
            onMove={onMove}
            onComplete={onComplete}
            onUpdateStatus={onUpdateStatus}
          />
        ))}
        {items.length === 0 && (
          <div className="card border-dashed border-border-subtle p-6 text-center">
            <p className="text-xs text-text-tertiary">No items</p>
          </div>
        )}
      </div>
    </div>
  );
}

function BacklogCard({
  item,
  isExpanded,
  onToggle,
  onMove,
  onComplete,
  onUpdateStatus,
}: {
  item: BacklogItem;
  isExpanded: boolean;
  onToggle: () => void;
  onMove: (id: string, horizon: Horizon) => void;
  onComplete: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
}) {
  const horizons: Horizon[] = ['now', 'next', 'later'];
  const otherHorizons = horizons.filter(h => h !== item.horizon);

  return (
    <div className={`card-hover p-3 transition-all ${isExpanded ? 'ring-1 ring-accent-blue/30' : ''}`} onClick={onToggle}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-tight flex-1">{item.title}</span>
        <SizeBadge size={item.size} />
      </div>

      <div className="flex items-center gap-2 mt-1.5">
        <StatusBadge status={item.status} />
        {item.category && <CategoryTag category={item.category} />}
      </div>

      {item.summary && (
        <p className="text-xs text-text-tertiary mt-1.5 line-clamp-2">{item.summary}</p>
      )}

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-2 animate-fade-in" onClick={e => e.stopPropagation()}>
          {item.design_doc && (
            <p className="text-xs text-accent-blue">📄 {item.design_doc}</p>
          )}
          {item.depends_on.length > 0 && (
            <p className="text-xs text-text-tertiary">Depends on: {item.depends_on.join(', ')}</p>
          )}
          {item.assignee && (
            <p className="text-xs text-text-tertiary">Assigned: {item.assignee}</p>
          )}
          <div className="flex items-center gap-1.5 pt-1">
            {item.status !== 'in_progress' && (
              <button className="btn-ghost text-xs py-1" onClick={() => onUpdateStatus(item.id, 'in_progress')}>
                Start
              </button>
            )}
            <button className="btn-ghost text-xs py-1 text-status-pass" onClick={() => onComplete(item.id)}>
              ✓ Complete
            </button>
            {otherHorizons.map(h => (
              <button key={h} className="btn-ghost text-xs py-1" onClick={() => onMove(item.id, h)}>
                → {h.charAt(0).toUpperCase() + h.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AddItemModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [horizon, setHorizon] = useState<Horizon>('next');
  const [size, setSize] = useState('M');
  const [category, setCategory] = useState('');
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      await api.backlog.create({ title, horizon, size, category: category || 'general', summary });
      onAdded();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="card p-6 w-full max-w-md space-y-4 animate-slide-in" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">New Backlog Item</h2>

        <div>
          <label className="label mb-1 block">Title</label>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="Feature name or task" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label mb-1 block">Horizon</label>
            <select className="input" value={horizon} onChange={e => setHorizon(e.target.value as Horizon)}>
              <option value="now">Now</option>
              <option value="next">Next</option>
              <option value="later">Later</option>
            </select>
          </div>
          <div>
            <label className="label mb-1 block">Size</label>
            <select className="input" value={size} onChange={e => setSize(e.target.value)}>
              <option value="S">S (&lt;30m)</option>
              <option value="M">M (1-3h)</option>
              <option value="L">L (4-8h)</option>
              <option value="XL">XL (multi-session)</option>
            </select>
          </div>
          <div>
            <label className="label mb-1 block">Category</label>
            <input className="input" value={category} onChange={e => setCategory(e.target.value)} placeholder="core, ui..." />
          </div>
        </div>

        <div>
          <label className="label mb-1 block">Summary</label>
          <textarea className="input h-20 resize-none" value={summary} onChange={e => setSummary(e.target.value)} placeholder="One-line description..." />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={loading}>
            {loading ? '...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
