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
import type { BacklogItem, Horizon, Epic } from '@shared/types';

type ViewMode = 'kanban' | 'epic';

const EPIC_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f59e0b', '#10b981', '#06b6d4', '#3b82f6',
];

export function Backlog() {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showEpicForm, setShowEpicForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('roadmap-view') as ViewMode) || 'kanban';
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const load = useCallback(() => {
    api.backlog.list().then((d: any) => setItems(d?.items || [])).catch(() => {});
    api.epics.list().then((d: any) => setEpics(d?.epics || [])).catch(() => {});
    api.issues.list({ status: 'open' }).then((d: any) => setIssues(d?.issues || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    localStorage.setItem('roadmap-view', viewMode);
  }, [viewMode]);

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

  const updateItemEpic = async (id: string, epicId: string | null) => {
    await api.backlog.update(id, { epic_id: epicId });
    load();
  };

  const [showCompleted, setShowCompleted] = useState(false);

  const activeItem = activeId ? items.find(i => i.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setExpandedId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const itemId = active.id as string;
    const targetHorizon = over.id as Horizon;
    const item = items.find(i => i.id === itemId);

    if (item && targetHorizon !== item.horizon && ['now', 'next', 'later'].includes(targetHorizon)) {
      moveItem(itemId, targetHorizon);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Roadmap</h1>
          {/* View mode toggle */}
          <div className="flex items-center bg-surface-2 rounded-lg p-0.5 border border-border/50">
            <button
              onClick={() => setViewMode('kanban')}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                viewMode === 'kanban'
                  ? 'bg-surface-3 text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              Kanban
            </button>
            <button
              onClick={() => setViewMode('epic')}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                viewMode === 'epic'
                  ? 'bg-surface-3 text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              By Epic
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'epic' && (
            <button onClick={() => setShowEpicForm(true)} className="btn-ghost text-xs">
              + Epic
            </button>
          )}
          <button onClick={() => setShowForm(true)} className="btn-primary">
            + New Item
          </button>
        </div>
      </div>

      {viewMode === 'kanban' ? (
        /* ─── Kanban View ─── */
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-5 items-start">
            <div className="grid grid-cols-3 gap-5 items-start flex-1 min-w-0">
              <KanbanColumn
                title="Now"
                horizon="now"
                items={nowItems}
                maxItems={3}
                onMove={moveItem}
                onComplete={completeItem}
                onUpdateStatus={updateStatus}
                onUpdateEpic={updateItemEpic}
                expandedId={expandedId}
                onToggleExpand={setExpandedId}
                isDropTarget={activeId !== null}
                epics={epics}
              />
              <KanbanColumn
                title="Next"
                horizon="next"
                items={nextItems}
                onMove={moveItem}
                onComplete={completeItem}
                onUpdateStatus={updateStatus}
                onUpdateEpic={updateItemEpic}
                expandedId={expandedId}
                onToggleExpand={setExpandedId}
                isDropTarget={activeId !== null}
                epics={epics}
              />
              <KanbanColumn
                title="Later"
                horizon="later"
                items={laterItems}
                onMove={moveItem}
                onComplete={completeItem}
                onUpdateStatus={updateStatus}
                onUpdateEpic={updateItemEpic}
                expandedId={expandedId}
                onToggleExpand={setExpandedId}
                isDropTarget={activeId !== null}
                epics={epics}
              />
            </div>

            {/* Shipped column — collapsible rail */}
            {completedItems.length > 0 && (
              <div className={`flex-shrink-0 transition-all duration-200 ${showCompleted ? 'w-56' : 'w-10'}`}>
                {!showCompleted ? (
                  <button
                    onClick={() => setShowCompleted(true)}
                    className="w-10 rounded-lg bg-surface-2/50 border border-border/50 hover:border-border hover:bg-surface-2 transition-all flex flex-col items-center py-3 gap-2 group"
                  >
                    <span className="text-2xs font-medium text-text-tertiary group-hover:text-text-secondary uppercase tracking-widest"
                      style={{ writingMode: 'vertical-lr' }}
                    >
                      Shipped
                    </span>
                    <span className="text-xs font-semibold text-text-tertiary bg-surface-3 rounded-full w-6 h-6 flex items-center justify-center">
                      {completedItems.length}
                    </span>
                  </button>
                ) : (
                  <div className="animate-fade-in">
                    <div className="flex items-center justify-between px-1 mb-2">
                      <h2 className="text-sm font-semibold text-text-tertiary uppercase tracking-wider">
                        Shipped
                      </h2>
                      <button
                        onClick={() => setShowCompleted(false)}
                        className="text-text-tertiary hover:text-text-secondary text-xs"
                      >
                        ✕
                      </button>
                    </div>
                    <span className="text-xs text-text-tertiary px-1 mb-2 block">{completedItems.length} items</span>
                    <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-0.5">
                      {completedItems.map(item => {
                        const isExp = expandedId === item.id;
                        const ext = item as any;
                        return (
                          <div
                            key={item.id}
                            className={`rounded-lg bg-surface-2/40 border border-border/30 p-2.5 transition-all cursor-pointer group ${
                              isExp ? 'opacity-100 ring-1 ring-border/60' : 'opacity-50 hover:opacity-80'
                            }`}
                            onClick={() => setExpandedId(isExp ? null : item.id)}
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-status-pass text-xs mt-0.5">✓</span>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-medium leading-tight ${isExp ? 'text-text-secondary whitespace-normal' : 'text-text-tertiary group-hover:text-text-secondary truncate'}`}>
                                  {item.title}
                                </p>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <SizeBadge size={item.size} />
                                  {item.completed && (
                                    <span className="text-2xs text-text-tertiary">{item.completed}</span>
                                  )}
                                  <span className="text-[8px] text-text-tertiary">{isExp ? '▾' : '▸'}</span>
                                </div>
                              </div>
                            </div>

                            {isExp && (
                              <div className="mt-2 pt-2 border-t border-border/40 space-y-2 animate-fade-in" onClick={e => e.stopPropagation()}>
                                {item.summary && (
                                  <p className="text-[10px] text-text-secondary leading-relaxed">{item.summary}</p>
                                )}
                                <div className="space-y-0.5 text-[10px]">
                                  {ext.type && (
                                    <div><span className="text-text-tertiary">Type:</span> <span className="text-text-secondary">{ext.type}</span></div>
                                  )}
                                  {ext.epic_id && (
                                    <div><span className="text-text-tertiary">Epic:</span> <span className="text-accent-blue">{ext.epic_id}</span></div>
                                  )}
                                  {ext.spawned_from && (
                                    <div><span className="text-text-tertiary">From:</span> <span className="text-text-secondary">{ext.spawned_from}</span></div>
                                  )}
                                </div>
                                {ext.related_issues?.length > 0 && (
                                  <div className="text-[10px]">
                                    <span className="text-text-tertiary">Issues:</span>{' '}
                                    {ext.related_issues.map((iss: string, i: number) => (
                                      <span key={iss} className="text-accent-red font-mono">{iss}{i < ext.related_issues.length - 1 ? ', ' : ''}</span>
                                    ))}
                                  </div>
                                )}
                                {item.tags?.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {item.tags.map(tag => (
                                      <span key={tag} className="text-[9px] bg-surface-3 text-text-tertiary px-1.5 py-0.5 rounded">{tag}</span>
                                    ))}
                                  </div>
                                )}
                                {ext.ai_notes && (
                                  <div className="text-[10px] bg-accent-purple/5 border border-accent-purple/20 rounded px-2 py-1.5">
                                    <span className="text-accent-purple font-medium">AI:</span>{' '}
                                    <span className="text-text-secondary">{ext.ai_notes}</span>
                                  </div>
                                )}
                                <div className="flex flex-wrap gap-2 text-[9px] text-text-tertiary pt-1">
                                  {ext.started && <span>Started {ext.started}</span>}
                                  {item.completed && <span className="text-status-pass">Completed {item.completed}</span>}
                                </div>
                                <button
                                  onClick={() => reopenItem(item.id)}
                                  className="btn-ghost text-2xs py-0.5 px-1.5 text-accent-yellow"
                                >
                                  ↩ Reopen
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
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
      ) : (
        /* ─── By Epic View ─── */
        <EpicGroupedView
          items={items}
          epics={epics}
          issues={issues}
          expandedId={expandedId}
          onToggleExpand={setExpandedId}
          onMove={moveItem}
          onComplete={completeItem}
          onUpdateStatus={updateStatus}
          onUpdateEpic={updateItemEpic}
          onReopen={reopenItem}
          onRefresh={load}
        />
      )}

      {showForm && <AddItemModal epics={epics} onClose={() => setShowForm(false)} onAdded={load} />}
      {showEpicForm && <AddEpicModal onClose={() => setShowEpicForm(false)} onAdded={load} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   By Epic Grouped View
   ═══════════════════════════════════════════════════════════════════════════ */

function EpicGroupedView({
  items,
  epics,
  issues,
  expandedId,
  onToggleExpand,
  onMove,
  onComplete,
  onUpdateStatus,
  onUpdateEpic,
  onReopen,
  onRefresh,
}: {
  items: BacklogItem[];
  epics: Epic[];
  issues: any[];
  expandedId: string | null;
  onToggleExpand: (id: string | null) => void;
  onMove: (id: string, horizon: Horizon) => void;
  onComplete: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
  onUpdateEpic: (id: string, epicId: string | null) => void;
  onReopen: (id: string) => void;
  onRefresh: () => void;
}) {
  const [collapsedEpics, setCollapsedEpics] = useState<Set<string>>(() => new Set());
  const [editingEpicId, setEditingEpicId] = useState<string | null>(null);
  const [showIssuesForEpic, setShowIssuesForEpic] = useState<string | null>(null);

  const toggleCollapse = (epicId: string) => {
    setCollapsedEpics(prev => {
      const next = new Set(prev);
      if (next.has(epicId)) next.delete(epicId);
      else next.add(epicId);
      return next;
    });
  };

  // Build a map: roadmap_item_id -> epic_id for issue cross-referencing
  const itemEpicMap = new Map<string, string>();
  items.forEach(i => {
    const eid = (i as any).epic_id;
    if (eid) itemEpicMap.set(i.id, eid);
  });

  // Compute open issues per epic via: issue.roadmap_item -> item.epic_id
  const issuesPerEpic = new Map<string, any[]>();
  for (const issue of issues) {
    const ri = issue.roadmap_item;
    if (ri && itemEpicMap.has(ri)) {
      const epicId = itemEpicMap.get(ri)!;
      if (!issuesPerEpic.has(epicId)) issuesPerEpic.set(epicId, []);
      issuesPerEpic.get(epicId)!.push(issue);
    }
  }

  // Group items by epic
  const epicGroups = epics.map(epic => ({
    epic,
    items: items.filter(i => (i as any).epic_id === epic.id),
    issues: issuesPerEpic.get(epic.id) || [],
  }));

  const ungroupedItems = items.filter(i => !(i as any).epic_id);

  const STATUS_DOT: Record<string, string> = {
    pending: 'bg-text-tertiary',
    in_progress: 'bg-accent-blue',
    completed: 'bg-status-pass',
    cancelled: 'bg-text-tertiary/50',
    blocked: 'bg-accent-red',
  };

  const HORIZON_TAG: Record<string, string> = {
    now: 'text-accent-green bg-accent-green/10',
    next: 'text-accent-blue bg-accent-blue/10',
    later: 'text-text-tertiary bg-surface-3',
    shipped: 'text-status-pass bg-status-pass/10',
  };

  return (
    <div className="space-y-3">
      {epicGroups.map(({ epic, items: epicItems, issues: epicIssues }) => {
        const isCollapsed = collapsedEpics.has(epic.id);
        const completedCount = epicItems.filter(i => i.status === 'completed').length;
        const totalCount = epicItems.length;
        const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        const isEditing = editingEpicId === epic.id;

        return (
          <div key={epic.id} className="rounded-lg border border-border/50 bg-surface-1 overflow-hidden">
            {/* Epic header */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-2/50 transition-colors"
              onClick={() => toggleCollapse(epic.id)}
            >
              <span className="text-[10px] text-text-tertiary">{isCollapsed ? '▸' : '▾'}</span>
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: epic.color || '#6366f1' }}
              />
              <span className="text-sm font-semibold flex-1">{epic.title}</span>

              {/* Status */}
              <span className={`text-2xs px-1.5 py-0.5 rounded ${
                epic.status === 'completed' ? 'bg-status-pass/10 text-status-pass' :
                epic.status === 'active' || epic.status === 'in_progress' ? 'bg-accent-blue/10 text-accent-blue' :
                'bg-surface-3 text-text-tertiary'
              }`}>
                {epic.status}
              </span>

              {/* Open issues badge — clickable */}
              {epicIssues.length > 0 && (
                <button
                  className={`text-2xs px-1.5 py-0.5 rounded font-medium transition-colors ${
                    showIssuesForEpic === epic.id
                      ? 'bg-accent-red/20 text-accent-red ring-1 ring-accent-red/30'
                      : 'bg-accent-red/10 text-accent-red hover:bg-accent-red/20'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowIssuesForEpic(showIssuesForEpic === epic.id ? null : epic.id);
                  }}
                >
                  {epicIssues.length} issue{epicIssues.length !== 1 ? 's' : ''}
                </button>
              )}

              {/* Progress */}
              <div className="flex items-center gap-2 w-32">
                <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-status-pass rounded-full transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="text-2xs text-text-tertiary font-mono w-14 text-right">
                  {completedCount}/{totalCount}
                </span>
              </div>

              {/* Edit button */}
              <button
                className="text-text-tertiary hover:text-text-secondary text-xs px-1"
                onClick={(e) => { e.stopPropagation(); setEditingEpicId(isEditing ? null : epic.id); }}
              >
                ✎
              </button>
            </div>

            {/* Inline epic editor */}
            {isEditing && (
              <InlineEpicEditor
                epic={epic}
                onSave={() => { setEditingEpicId(null); onRefresh(); }}
                onCancel={() => setEditingEpicId(null)}
              />
            )}

            {/* Inline issues panel */}
            {showIssuesForEpic === epic.id && epicIssues.length > 0 && (
              <div className="px-4 py-2.5 bg-accent-red/5 border-t border-accent-red/10 space-y-1.5 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-semibold text-accent-red uppercase tracking-wider">
                    Blocking Issues
                  </span>
                  <button
                    className="text-text-tertiary hover:text-text-secondary text-xs"
                    onClick={() => setShowIssuesForEpic(null)}
                  >
                    ✕
                  </button>
                </div>
                {epicIssues.map((issue: any) => (
                  <div key={issue.id} className="flex items-start gap-2 px-1 py-1.5 rounded hover:bg-surface-2/30 transition-colors">
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      issue.severity === 'critical' ? 'bg-red-500' :
                      issue.severity === 'high' ? 'bg-orange-400' :
                      issue.severity === 'medium' ? 'bg-yellow-400' :
                      'bg-blue-300'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary leading-tight">{issue.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-mono text-text-tertiary">{issue.id}</span>
                        <span className={`text-[9px] font-medium ${
                          issue.severity === 'critical' ? 'text-red-400' :
                          issue.severity === 'high' ? 'text-orange-400' :
                          issue.severity === 'medium' ? 'text-yellow-400' :
                          'text-blue-300'
                        }`}>{issue.severity}</span>
                        {issue.roadmap_item && (
                          <span className="text-[9px] text-text-tertiary">blocks {issue.roadmap_item}</span>
                        )}
                      </div>
                      {issue.symptoms && (
                        <p className="text-[10px] text-text-tertiary mt-0.5 line-clamp-2">{issue.symptoms}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Progress bar (thin) */}
            {!isCollapsed && totalCount > 0 && (
              <div className="h-0.5 bg-surface-3">
                <div
                  className="h-full bg-status-pass transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}

            {/* Items */}
            {!isCollapsed && (
              <div className="divide-y divide-border/30">
                {epicItems.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-text-tertiary">
                    No items in this epic
                  </div>
                ) : (
                  epicItems.map(item => (
                    <EpicItemRow
                      key={item.id}
                      item={item}
                      isExpanded={expandedId === item.id}
                      onToggle={() => onToggleExpand(expandedId === item.id ? null : item.id)}
                      onMove={onMove}
                      onComplete={onComplete}
                      onUpdateStatus={onUpdateStatus}
                      onUpdateEpic={onUpdateEpic}
                      onReopen={onReopen}
                      epics={epics}
                      statusDot={STATUS_DOT}
                      horizonTag={HORIZON_TAG}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Ungrouped section */}
      {ungroupedItems.length > 0 && (
        <div className="rounded-lg border border-border/30 border-dashed bg-surface-1/50 overflow-hidden">
          <div
            className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-2/50 transition-colors"
            onClick={() => toggleCollapse('__ungrouped__')}
          >
            <span className="text-[10px] text-text-tertiary">
              {collapsedEpics.has('__ungrouped__') ? '▸' : '▾'}
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-surface-3 flex-shrink-0" />
            <span className="text-sm font-medium text-text-tertiary flex-1">Ungrouped</span>
            <span className="text-2xs text-text-tertiary font-mono">{ungroupedItems.length} items</span>
          </div>

          {!collapsedEpics.has('__ungrouped__') && (
            <div className="divide-y divide-border/30">
              {ungroupedItems.map(item => (
                <EpicItemRow
                  key={item.id}
                  item={item}
                  isExpanded={expandedId === item.id}
                  onToggle={() => onToggleExpand(expandedId === item.id ? null : item.id)}
                  onMove={onMove}
                  onComplete={onComplete}
                  onUpdateStatus={onUpdateStatus}
                  onUpdateEpic={onUpdateEpic}
                  onReopen={onReopen}
                  epics={epics}
                  statusDot={STATUS_DOT}
                  horizonTag={HORIZON_TAG}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {epics.length === 0 && ungroupedItems.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-lg text-text-tertiary mb-2">No epics yet</p>
          <p className="text-sm text-text-tertiary mb-4">Create an epic to group related roadmap items together.</p>
        </div>
      )}
    </div>
  );
}

/* ─── Epic Item Row (compact list row) ──── */

function EpicItemRow({
  item,
  isExpanded,
  onToggle,
  onMove,
  onComplete,
  onUpdateStatus,
  onUpdateEpic,
  onReopen,
  epics,
  statusDot,
  horizonTag,
}: {
  item: BacklogItem;
  isExpanded: boolean;
  onToggle: () => void;
  onMove: (id: string, horizon: Horizon) => void;
  onComplete: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
  onUpdateEpic: (id: string, epicId: string | null) => void;
  onReopen: (id: string) => void;
  epics: Epic[];
  statusDot: Record<string, string>;
  horizonTag: Record<string, string>;
}) {
  const ext = item as any;
  const horizons: Horizon[] = ['now', 'next', 'later'];
  const otherHorizons = horizons.filter(h => h !== item.horizon);
  const isCompleted = item.status === 'completed' || item.status === 'cancelled';

  return (
    <div className={`transition-colors ${isCompleted ? 'opacity-50' : ''}`}>
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-2/30 transition-colors"
        onClick={onToggle}
      >
        {/* Status dot */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[item.status] || 'bg-text-tertiary'}`} />

        {/* Title */}
        <span className={`text-sm flex-1 min-w-0 truncate ${isCompleted ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>
          {item.title}
        </span>

        {/* Horizon tag */}
        <span className={`text-2xs px-1.5 py-0.5 rounded font-medium ${horizonTag[item.horizon] || 'bg-surface-3 text-text-tertiary'}`}>
          {item.horizon}
        </span>

        {/* Size */}
        <SizeBadge size={item.size} />

        {/* Priority */}
        {ext.priority && (
          <span className={`text-2xs font-mono ${
            ext.priority === 'P0' ? 'text-red-400' :
            ext.priority === 'P1' ? 'text-orange-400' :
            ext.priority === 'P2' ? 'text-yellow-400' :
            'text-text-tertiary'
          }`}>{ext.priority}</span>
        )}

        <span className="text-[9px] text-text-tertiary">{isExpanded ? '▾' : '▸'}</span>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-1 bg-surface-2/20 animate-fade-in" onClick={e => e.stopPropagation()}>
          <div className="pl-5 space-y-2.5">
            {item.summary && (
              <p className="text-xs text-text-secondary leading-relaxed">{item.summary}</p>
            )}

            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
              {ext.type && (
                <div><span className="text-text-tertiary">Type:</span> <span className="text-text-secondary">{ext.type}</span></div>
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

            {/* Epic selector */}
            <div className="text-[10px] flex items-center gap-2">
              <span className="text-text-tertiary">Epic:</span>
              <select
                className="bg-surface-3 border border-border/50 rounded px-1.5 py-0.5 text-[10px] text-text-secondary"
                value={ext.epic_id || ''}
                onChange={e => onUpdateEpic(item.id, e.target.value || null)}
              >
                <option value="">None</option>
                {epics.map(ep => (
                  <option key={ep.id} value={ep.id}>{ep.title}</option>
                ))}
              </select>
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

            {/* Tags */}
            {item.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.tags.map(tag => (
                  <span key={tag} className="text-[9px] bg-surface-3 text-text-tertiary px-1.5 py-0.5 rounded">{tag}</span>
                ))}
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
              {!isCompleted && item.status !== 'in_progress' && (
                <button className="btn-ghost text-xs py-1" onClick={() => onUpdateStatus(item.id, 'in_progress')}>
                  Start
                </button>
              )}
              {!isCompleted && (
                <button className="btn-ghost text-xs py-1 text-status-pass" onClick={() => onComplete(item.id)}>
                  ✓ Complete
                </button>
              )}
              {isCompleted && (
                <button className="btn-ghost text-xs py-1 text-accent-yellow" onClick={() => onReopen(item.id)}>
                  ↩ Reopen
                </button>
              )}
              {!isCompleted && otherHorizons.map(h => (
                <button key={h} className="btn-ghost text-xs py-1" onClick={() => onMove(item.id, h)}>
                  → {h.charAt(0).toUpperCase() + h.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Inline Epic Editor ──── */

function InlineEpicEditor({
  epic,
  onSave,
  onCancel,
}: {
  epic: Epic;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(epic.title);
  const [description, setDescription] = useState(epic.description);
  const [status, setStatus] = useState(epic.status);
  const [color, setColor] = useState(epic.color);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.epics.update(epic.id, { title, description, status, color });
      onSave();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 py-3 bg-surface-2/30 border-t border-border/30 space-y-2 animate-fade-in" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <input
          className="input text-sm flex-1"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Epic title"
        />
        <select
          className="input text-xs w-28"
          value={status}
          onChange={e => setStatus(e.target.value as any)}
        >
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <textarea
        className="input text-xs w-full h-14 resize-none"
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description..."
      />
      <div className="flex items-center gap-3">
        <span className="text-2xs text-text-tertiary">Color:</span>
        <div className="flex gap-1">
          {EPIC_COLORS.map(c => (
            <button
              key={c}
              className={`w-5 h-5 rounded-full transition-all ${color === c ? 'ring-2 ring-white/40 scale-110' : 'opacity-60 hover:opacity-100'}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="flex-1" />
        <button className="btn-ghost text-xs" onClick={onCancel}>Cancel</button>
        <button className="btn-primary text-xs" onClick={save} disabled={saving}>
          {saving ? '...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Kanban Components (unchanged from original)
   ═══════════════════════════════════════════════════════════════════════════ */

function KanbanColumn({
  title,
  horizon,
  items,
  maxItems,
  onMove,
  onComplete,
  onUpdateStatus,
  onUpdateEpic,
  expandedId,
  onToggleExpand,
  isDropTarget,
  epics,
}: {
  title: string;
  horizon: Horizon;
  items: BacklogItem[];
  maxItems?: number;
  onMove: (id: string, horizon: Horizon) => void;
  onComplete: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
  onUpdateEpic: (id: string, epicId: string | null) => void;
  expandedId: string | null;
  onToggleExpand: (id: string | null) => void;
  isDropTarget?: boolean;
  epics: Epic[];
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
            onUpdateEpic={onUpdateEpic}
            epics={epics}
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
  onUpdateEpic: (id: string, epicId: string | null) => void;
  epics: Epic[];
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
  onUpdateEpic,
  epics,
}: {
  item: BacklogItem;
  isExpanded: boolean;
  onToggle: () => void;
  onMove: (id: string, horizon: Horizon) => void;
  onComplete: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
  onUpdateEpic: (id: string, epicId: string | null) => void;
  epics: Epic[];
}) {
  const horizons: Horizon[] = ['now', 'next', 'later'];
  const otherHorizons = horizons.filter(h => h !== item.horizon);
  const ext = item as any;

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
          {item.summary && (
            <p className="text-xs text-text-secondary leading-relaxed">{item.summary}</p>
          )}

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
            {ext.type && (
              <div><span className="text-text-tertiary">Type:</span> <span className="text-text-secondary">{ext.type}</span></div>
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

          {/* Epic selector */}
          <div className="text-[10px] flex items-center gap-2">
            <span className="text-text-tertiary">Epic:</span>
            <select
              className="bg-surface-3 border border-border/50 rounded px-1.5 py-0.5 text-[10px] text-text-secondary"
              value={ext.epic_id || ''}
              onChange={e => onUpdateEpic(item.id, e.target.value || null)}
            >
              <option value="">None</option>
              {epics.map(ep => (
                <option key={ep.id} value={ep.id}>{ep.title}</option>
              ))}
            </select>
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

/* ═══════════════════════════════════════════════════════════════════════════
   Modals
   ═══════════════════════════════════════════════════════════════════════════ */

function AddItemModal({ epics, onClose, onAdded }: { epics: Epic[]; onClose: () => void; onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [horizon, setHorizon] = useState<Horizon>('next');
  const [size, setSize] = useState('M');
  const [category, setCategory] = useState('');
  const [summary, setSummary] = useState('');
  const [epicId, setEpicId] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const data: any = { title, horizon, size, category: category || 'general', summary };
      if (epicId) data.epic_id = epicId;
      await api.backlog.create(data);
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
        <h2 className="text-lg font-semibold">New Roadmap Item</h2>

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

        {/* Epic selector */}
        {epics.length > 0 && (
          <div>
            <label className="label mb-1 block">Epic</label>
            <select className="input" value={epicId} onChange={e => setEpicId(e.target.value)}>
              <option value="">None</option>
              {epics.map(ep => (
                <option key={ep.id} value={ep.id}>{ep.title}</option>
              ))}
            </select>
          </div>
        )}

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

function AddEpicModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(EPIC_COLORS[0]);
  const [status, setStatus] = useState('planning');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      await api.epics.create({ title, description, color, status });
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
        <h2 className="text-lg font-semibold">New Epic</h2>

        <div>
          <label className="label mb-1 block">Title</label>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="Epic name" />
        </div>

        <div>
          <label className="label mb-1 block">Description</label>
          <textarea className="input h-20 resize-none" value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this epic cover?" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label mb-1 block">Status</label>
            <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="planning">Planning</option>
              <option value="active">Active</option>
            </select>
          </div>
          <div>
            <label className="label mb-1 block">Color</label>
            <div className="flex gap-1.5 pt-1">
              {EPIC_COLORS.map(c => (
                <button
                  key={c}
                  className={`w-6 h-6 rounded-full transition-all ${color === c ? 'ring-2 ring-white/40 scale-110' : 'opacity-50 hover:opacity-100'}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={loading}>
            {loading ? '...' : 'Create Epic'}
          </button>
        </div>
      </div>
    </div>
  );
}
