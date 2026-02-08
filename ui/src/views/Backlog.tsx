import { useEffect, useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import * as api from '../api/client';
import { SizeBadge, StatusBadge, CategoryTag } from '../components/StatusBadge';
import type { BacklogItem, Horizon } from '@shared/types';

export function Backlog() {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Require 8px of movement before starting drag (so clicks still work)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

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

  const activeItem = activeId ? items.find(i => i.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setExpandedId(null); // collapse any expanded card while dragging
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const itemId = active.id as string;
    const targetHorizon = over.id as Horizon;
    const item = items.find(i => i.id === itemId);

    // Only move if dropped on a different column
    if (item && targetHorizon !== item.horizon && ['now', 'next', 'later'].includes(targetHorizon)) {
      moveItem(itemId, targetHorizon);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Backlog</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          + New Item
        </button>
      </div>

      {/* Three-column Kanban with DnD */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-3 gap-5 items-start">
          <KanbanColumn
            title="Now"
            horizon="now"
            items={nowItems}
            maxItems={3}
            onMove={moveItem}
            onComplete={completeItem}
            onUpdateStatus={updateStatus}
            expandedId={expandedId}
            onToggleExpand={setExpandedId}
            isDropTarget={activeId !== null}
          />
          <KanbanColumn
            title="Next"
            horizon="next"
            items={nextItems}
            onMove={moveItem}
            onComplete={completeItem}
            onUpdateStatus={updateStatus}
            expandedId={expandedId}
            onToggleExpand={setExpandedId}
            isDropTarget={activeId !== null}
          />
          <KanbanColumn
            title="Later"
            horizon="later"
            items={laterItems}
            onMove={moveItem}
            onComplete={completeItem}
            onUpdateStatus={updateStatus}
            expandedId={expandedId}
            onToggleExpand={setExpandedId}
            isDropTarget={activeId !== null}
          />
        </div>

        <DragOverlay>
          {activeItem ? (
            <div className="card p-3 opacity-90 shadow-xl ring-1 ring-accent-blue/40 rotate-[2deg] w-[300px]">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium leading-tight flex-1">{activeItem.title}</span>
                <SizeBadge size={activeItem.size} />
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <StatusBadge status={activeItem.status} />
                {activeItem.category && <CategoryTag category={activeItem.category} />}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

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
  horizon,
  items,
  maxItems,
  onMove,
  onComplete,
  onUpdateStatus,
  expandedId,
  onToggleExpand,
  isDropTarget,
}: {
  title: string;
  horizon: Horizon;
  items: BacklogItem[];
  maxItems?: number;
  onMove: (id: string, horizon: Horizon) => void;
  onComplete: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
  expandedId: string | null;
  onToggleExpand: (id: string | null) => void;
  isDropTarget?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: horizon });
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

      <div
        ref={setNodeRef}
        className={`space-y-2 min-h-[200px] rounded-lg transition-all duration-150 ${
          isOver
            ? 'bg-accent-blue/10 ring-2 ring-accent-blue/30 ring-dashed'
            : isDropTarget
              ? 'ring-1 ring-border-subtle ring-dashed'
              : ''
        }`}
        style={{ padding: isDropTarget ? '4px' : undefined }}
      >
        {items.map(item => (
          <DraggableBacklogCard
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
          <div className={`card border-dashed border-border-subtle p-6 text-center ${isOver ? 'border-accent-blue/40' : ''}`}>
            <p className="text-xs text-text-tertiary">{isOver ? 'Drop here' : 'No items'}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableBacklogCard(props: {
  item: BacklogItem;
  isExpanded: boolean;
  onToggle: () => void;
  onMove: (id: string, horizon: Horizon) => void;
  onComplete: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.item.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.3 : 1 }}
    >
      <BacklogCard {...props} />
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
  const ext = item as any; // access v2 fields that may not be in the type

  return (
    <div className={`card-hover p-3 transition-all cursor-pointer ${isExpanded ? 'ring-1 ring-accent-blue/30' : ''}`} onClick={onToggle}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-tight flex-1">{item.title}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <SizeBadge size={item.size} />
          <span className="text-[9px] text-text-tertiary">{isExpanded ? '▾' : '▸'}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-1.5">
        <StatusBadge status={item.status} />
        {item.category && <CategoryTag category={item.category} />}
        {ext.priority && <span className="text-[9px] font-mono text-text-tertiary">{ext.priority}</span>}
      </div>

      {item.summary && !isExpanded && (
        <p className="text-xs text-text-tertiary mt-1.5 line-clamp-2">{item.summary}</p>
      )}

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-2.5 animate-fade-in" onClick={e => e.stopPropagation()}>
          {/* Full summary */}
          {item.summary && (
            <p className="text-xs text-text-secondary leading-relaxed">{item.summary}</p>
          )}

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
            {ext.type && (
              <div><span className="text-text-tertiary">Type:</span> <span className="text-text-secondary">{ext.type}</span></div>
            )}
            {ext.epic_id && (
              <div><span className="text-text-tertiary">Epic:</span> <span className="text-accent-blue">{ext.epic_id}</span></div>
            )}
            {ext.milestone_id && (
              <div><span className="text-text-tertiary">Milestone:</span> <span className="text-accent-blue">{ext.milestone_id}</span></div>
            )}
            {ext.spawned_from && (
              <div><span className="text-text-tertiary">From:</span> <span className="text-text-secondary">{ext.spawned_from}</span></div>
            )}
            {item.assignee && (
              <div><span className="text-text-tertiary">Assigned:</span> <span className="text-text-secondary">{item.assignee}</span></div>
            )}
            {ext.estimated_sessions && (
              <div><span className="text-text-tertiary">Est:</span> <span className="text-text-secondary">{ext.estimated_sessions} sessions</span></div>
            )}
          </div>

          {/* Related issues */}
          {ext.related_issues?.length > 0 && (
            <div className="text-[10px]">
              <span className="text-text-tertiary">Issues:</span>{' '}
              {ext.related_issues.map((iss: string, i: number) => (
                <span key={iss} className="text-accent-red font-mono">{iss}{i < ext.related_issues.length - 1 ? ', ' : ''}</span>
              ))}
            </div>
          )}

          {/* Dependencies */}
          {item.depends_on?.length > 0 && (
            <div className="text-[10px]">
              <span className="text-text-tertiary">Depends on:</span>{' '}
              <span className="text-text-secondary font-mono">{item.depends_on.join(', ')}</span>
            </div>
          )}

          {/* Design doc */}
          {item.design_doc && (
            <div className="text-[10px] text-accent-blue">📄 {item.design_doc}</div>
          )}

          {/* Tags */}
          {item.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.tags.map(tag => (
                <span key={tag} className="text-[9px] bg-surface-3 text-text-tertiary px-1.5 py-0.5 rounded">{tag}</span>
              ))}
            </div>
          )}

          {/* Acceptance criteria */}
          {ext.acceptance_criteria?.length > 0 && (
            <div className="text-[10px]">
              <span className="text-text-tertiary font-medium">Acceptance Criteria:</span>
              <ul className="mt-0.5 space-y-0.5 ml-3 list-disc text-text-secondary">
                {ext.acceptance_criteria.map((ac: string, i: number) => (
                  <li key={i}>{ac}</li>
                ))}
              </ul>
            </div>
          )}

          {/* AI notes */}
          {ext.ai_notes && (
            <div className="text-[10px] bg-accent-purple/5 border border-accent-purple/20 rounded px-2 py-1.5">
              <span className="text-accent-purple font-medium">AI:</span>{' '}
              <span className="text-text-secondary">{ext.ai_notes}</span>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex items-center gap-3 text-[9px] text-text-tertiary pt-1">
            <span>Created {item.created || ext.created}</span>
            {(item.updated || ext.updated) && (item.updated || ext.updated) !== (item.created || ext.created) && (
              <span>Modified {item.updated || ext.updated}</span>
            )}
            {ext.started && <span>Started {ext.started}</span>}
            {item.completed && <span className="text-status-pass">Completed {item.completed}</span>}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
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
