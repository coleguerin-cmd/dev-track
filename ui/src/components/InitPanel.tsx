/**
 * InitPanel — Full initialization UI with estimate, progress, cancel/resume.
 * 
 * States:
 *   idle        → show "Scan Project" button
 *   estimating  → scanning files, show spinner
 *   estimated   → show estimate card with accept button
 *   running     → phased progress with live updates
 *   paused      → show resume button (from cancel or error)
 *   complete    → show completion summary
 *   error       → show error with retry
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Zap, Play, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Pause, RotateCcw, DollarSign, Clock, Box, FileText,
  CircleDot, Lightbulb, GitCommitHorizontal, Target,
  Layers, ArrowRight,
} from 'lucide-react';
import * as api from '../api/client';
import type { InitEstimate, InitProgressEvent, InitStatus } from '../api/client';

type InitState = 'idle' | 'estimating' | 'estimated' | 'running' | 'paused' | 'complete' | 'error';

interface PhaseInfo {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  cost: number;
  entities: number;
  duration?: number;
}

const PHASE_NAMES: Record<string, string> = {
  prescan: 'Scanning Project',
  discovery: 'Analyzing Architecture',
  systems: 'Creating Systems',
  roadmap: 'Building Roadmap & Issues',
  crossref: 'Cross-Referencing',
  git_import: 'Importing Git History',
  finalize: 'Finalizing',
};

const PHASE_ORDER = ['prescan', 'discovery', 'systems', 'roadmap', 'crossref', 'git_import', 'finalize'];

export function InitPanel({ onComplete }: { onComplete?: () => void }) {
  const [state, setState] = useState<InitState>('idle');
  const [estimate, setEstimate] = useState<InitEstimate | null>(null);
  const [phases, setPhases] = useState<PhaseInfo[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [totalEntities, setTotalEntities] = useState(0);
  const [recentEntities, setRecentEntities] = useState<{ type: string; title: string }[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [completionMessage, setCompletionMessage] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const cancelFnRef = useRef<(() => void) | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check for resumable checkpoint on mount
  useEffect(() => {
    api.init.status().then((status: InitStatus) => {
      if (status.can_resume && status.checkpoint) {
        setState('paused');
        setTotalCost(status.checkpoint.total_cost || 0);
        const ents = status.checkpoint.entities_created || {};
        setTotalEntities(Object.values(ents).reduce((a: number, b: any) => a + (b as number), 0));
      }
    }).catch(() => {});
  }, []);

  // Elapsed time timer
  useEffect(() => {
    if (state === 'running') {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.round((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state]);

  const handleEstimate = async () => {
    setState('estimating');
    try {
      const result = await api.init.estimate();
      setEstimate(result);
      setState('estimated');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to scan project');
      setState('error');
    }
  };

  const handleEvent = useCallback((event: InitProgressEvent) => {
    switch (event.type) {
      case 'phase_start':
        if (event.phase) {
          setPhases(prev => {
            const exists = prev.find(p => p.id === event.phase);
            if (exists) {
              return prev.map(p => p.id === event.phase ? { ...p, status: 'running' } : p);
            }
            return [...prev, {
              id: event.phase!,
              name: PHASE_NAMES[event.phase!] || event.message || event.phase!,
              status: 'running' as const,
              cost: 0,
              entities: 0,
            }];
          });
        }
        break;

      case 'phase_complete':
        if (event.phase) {
          setPhases(prev => prev.map(p =>
            p.id === event.phase
              ? { ...p, status: 'complete', cost: event.phase_cost || p.cost, duration: event.duration_seconds, entities: event.count || p.entities }
              : p
          ));
        }
        if (event.total_cost !== undefined) setTotalCost(event.total_cost);
        if (event.total_entities !== undefined) setTotalEntities(event.total_entities);
        break;

      case 'entity_created':
        if (event.total_cost !== undefined) setTotalCost(event.total_cost);
        if (event.total_entities !== undefined) setTotalEntities(event.total_entities);
        if (event.entity_type && event.entity_title) {
          setRecentEntities(prev => {
            const next = [{ type: event.entity_type!, title: event.entity_title! }, ...prev];
            return next.slice(0, 8);
          });
        }
        break;

      case 'cost_update':
        if (event.total_cost !== undefined) setTotalCost(event.total_cost);
        break;

      case 'done':
        setState('complete');
        setCompletionMessage(event.message || 'Initialization complete!');
        if (event.total_cost !== undefined) setTotalCost(event.total_cost);
        if (event.total_entities !== undefined) setTotalEntities(event.total_entities);
        onComplete?.();
        break;

      case 'cancelled':
        setState('paused');
        break;

      case 'error':
        setErrorMessage(event.error || event.message || 'Unknown error');
        // Don't switch to error state if we have partial progress — show as paused
        if (phases.some(p => p.status === 'complete')) {
          setState('paused');
        } else {
          setState('error');
        }
        break;
    }
  }, [onComplete, phases]);

  const startInit = () => {
    setState('running');
    setPhases([]);
    setRecentEntities([]);
    setTotalCost(0);
    setTotalEntities(0);
    setElapsedSeconds(0);

    const cancel = api.init.run(
      handleEvent,
      (err) => {
        setErrorMessage(err.message);
        setState('error');
      }
    );
    cancelFnRef.current = cancel;
  };

  const resumeInit = () => {
    setState('running');
    setElapsedSeconds(0);

    const cancel = api.init.resume(
      handleEvent,
      (err) => {
        setErrorMessage(err.message);
        setState('error');
      }
    );
    cancelFnRef.current = cancel;
  };

  const cancelInit = async () => {
    try {
      await api.init.cancel();
    } catch {}
    cancelFnRef.current?.();
  };

  // ─── Render States ──────────────────────────────────────────────────

  if (state === 'idle') {
    return (
      <div className="max-w-2xl mx-auto mt-20 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-accent-blue/10 flex items-center justify-center">
          <Zap size={32} className="text-accent-blue" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Welcome to DevTrack</h1>
          <p className="text-sm text-text-secondary mt-2 max-w-md mx-auto">
            DevTrack will analyze your codebase, create systems, roadmap items, issues, and produce a comprehensive project intelligence layer.
          </p>
        </div>
        <button
          onClick={handleEstimate}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent-blue text-white font-medium text-sm hover:bg-accent-blue/90 transition-colors"
        >
          <Zap size={18} />
          Scan Project
        </button>
        <p className="text-[11px] text-text-tertiary">
          Quick scan to estimate initialization cost and time. Requires API keys in Settings.
        </p>
      </div>
    );
  }

  if (state === 'estimating') {
    return (
      <div className="max-w-2xl mx-auto mt-20 text-center space-y-6">
        <Loader2 size={32} className="text-accent-blue animate-spin mx-auto" />
        <p className="text-sm text-text-secondary">Scanning project files...</p>
      </div>
    );
  }

  if (state === 'estimated' && estimate) {
    const { stats, estimate: est } = estimate;
    return (
      <div className="max-w-lg mx-auto mt-16 space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-text-primary">Project Scan Complete</h1>
          <p className="text-sm text-text-secondary mt-1">{estimate.project}</p>
        </div>

        <div className="bg-surface-2 border border-border rounded-lg p-5 space-y-4">
          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-bold text-text-primary">{stats.total_files.toLocaleString()}</p>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Files</p>
            </div>
            <div>
              <p className="text-lg font-bold text-text-primary">{stats.total_lines.toLocaleString()}</p>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Lines</p>
            </div>
            <div>
              <p className="text-lg font-bold text-text-primary capitalize">{est.size_category}</p>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Size</p>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Languages */}
          <div>
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5">Languages</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(stats.languages)
                .sort(([, a], [, b]) => b - a)
                .map(([ext, count]) => (
                  <span key={ext} className="text-[11px] bg-surface-3 text-text-secondary px-2 py-0.5 rounded">
                    {ext} ({count})
                  </span>
                ))
              }
            </div>
          </div>

          {/* Metadata badges */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] bg-surface-3 text-text-secondary px-2 py-0.5 rounded">{stats.project_type}</span>
            {stats.has_readme && <span className="text-[10px] bg-accent-blue/10 text-accent-blue px-2 py-0.5 rounded">README</span>}
            {stats.has_claude_md && <span className="text-[10px] bg-accent-purple/10 text-accent-purple px-2 py-0.5 rounded">CLAUDE.md</span>}
            {stats.has_existing_cursor_rules && <span className="text-[10px] bg-accent-yellow/10 text-accent-yellow px-2 py-0.5 rounded">Cursor Rules</span>}
          </div>

          <div className="h-px bg-border" />

          {/* Cost estimate */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-accent-blue" />
              <div>
                <p className="text-sm font-semibold text-text-primary">${est.cost_low} - ${est.cost_high}</p>
                <p className="text-[10px] text-text-tertiary">Estimated AI cost</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-text-tertiary" />
              <div>
                <p className="text-sm font-semibold text-text-primary">{est.time_minutes_low} - {est.time_minutes_high} min</p>
                <p className="text-[10px] text-text-tertiary">Estimated time</p>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-text-tertiary">
            6 phases: Discovery, Systems, Roadmap & Issues, Cross-Reference, Git Import, Finalize. 
            Uses premium AI for roadmap quality and finalization. You can cancel and resume anytime.
          </p>
        </div>

        <div className="flex justify-center gap-3">
          <button
            onClick={() => setState('idle')}
            className="px-4 py-2.5 rounded-lg border border-border text-sm text-text-secondary hover:bg-surface-2 transition-colors"
          >
            Back
          </button>
          <button
            onClick={startInit}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-accent-blue text-white font-medium text-sm hover:bg-accent-blue/90 transition-colors"
          >
            <Play size={16} />
            Initialize Project
          </button>
        </div>
      </div>
    );
  }

  if (state === 'running') {
    return (
      <div className="max-w-2xl mx-auto mt-12 space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-text-primary">Initializing Project</h1>
          <p className="text-sm text-text-secondary mt-1">
            {formatElapsed(elapsedSeconds)} elapsed
          </p>
        </div>

        {/* Cost + Entity counters */}
        <div className="flex items-center justify-center gap-6">
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-accent-blue" />
            <span className="text-sm font-mono font-semibold text-text-primary">${totalCost.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Box className="w-3.5 h-3.5 text-accent-purple" />
            <span className="text-sm font-mono font-semibold text-text-primary">{totalEntities} entities</span>
          </div>
        </div>

        {/* Phase progress */}
        <div className="bg-surface-2 border border-border rounded-lg p-4 space-y-2">
          {PHASE_ORDER.map((phaseId) => {
            const phase = phases.find(p => p.id === phaseId);
            if (!phase) {
              // Show pending phases
              return (
                <div key={phaseId} className="flex items-center gap-3 py-1.5 opacity-40">
                  <div className="w-5 h-5 rounded-full border border-border flex items-center justify-center">
                    <span className="text-[9px] text-text-tertiary">{PHASE_ORDER.indexOf(phaseId) + 1}</span>
                  </div>
                  <span className="text-xs text-text-tertiary">{PHASE_NAMES[phaseId] || phaseId}</span>
                </div>
              );
            }

            return (
              <div key={phaseId} className={`flex items-center gap-3 py-1.5 ${phase.status === 'running' ? 'opacity-100' : phase.status === 'complete' ? 'opacity-70' : 'opacity-40'}`}>
                {phase.status === 'running' && (
                  <Loader2 className="w-5 h-5 text-accent-blue animate-spin flex-shrink-0" />
                )}
                {phase.status === 'complete' && (
                  <CheckCircle2 className="w-5 h-5 text-status-pass flex-shrink-0" />
                )}
                {phase.status === 'error' && (
                  <XCircle className="w-5 h-5 text-accent-red flex-shrink-0" />
                )}
                {phase.status === 'pending' && (
                  <div className="w-5 h-5 rounded-full border border-border flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] text-text-tertiary">{PHASE_ORDER.indexOf(phaseId) + 1}</span>
                  </div>
                )}
                <span className={`text-xs flex-1 ${phase.status === 'running' ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                  {phase.name}
                </span>
                {phase.status === 'complete' && (
                  <span className="text-[10px] text-text-tertiary font-mono">
                    ${phase.cost.toFixed(2)} · {phase.duration ? `${Math.round(phase.duration)}s` : ''}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Live entity feed */}
        {recentEntities.length > 0 && (
          <div className="bg-surface-2 border border-border rounded-lg p-3">
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">Recent Activity</p>
            <div className="space-y-1">
              {recentEntities.slice(0, 6).map((ent, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <EntityIcon type={ent.type} />
                  <span className="text-text-secondary truncate">{ent.title}</span>
                  <span className="text-[9px] text-text-tertiary ml-auto flex-shrink-0">{ent.type.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cancel button */}
        <div className="flex justify-center">
          <button
            onClick={cancelInit}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-xs text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
          >
            <Pause size={12} />
            Pause Initialization
          </button>
        </div>
      </div>
    );
  }

  if (state === 'paused') {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-accent-yellow/10 flex items-center justify-center">
          <Pause size={32} className="text-accent-yellow" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Initialization Paused</h1>
          <p className="text-sm text-text-secondary mt-2">
            {totalEntities} entities created so far. ${totalCost.toFixed(2)} spent. You can resume anytime.
          </p>
        </div>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => { setState('idle'); setPhases([]); setRecentEntities([]); }}
            className="px-4 py-2.5 rounded-lg border border-border text-sm text-text-secondary hover:bg-surface-2 transition-colors"
          >
            Start Over
          </button>
          <button
            onClick={resumeInit}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-accent-blue text-white font-medium text-sm hover:bg-accent-blue/90 transition-colors"
          >
            <RotateCcw size={16} />
            Resume
          </button>
        </div>
      </div>
    );
  }

  if (state === 'complete') {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-status-pass/10 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-status-pass" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Initialization Complete</h1>
          <p className="text-sm text-text-secondary mt-2">
            {completionMessage || `${totalEntities} entities created. $${totalCost.toFixed(2)} total cost.`}
          </p>
        </div>

        {/* Entity breakdown */}
        <div className="bg-surface-2 border border-border rounded-lg p-4 text-left">
          <div className="flex items-center justify-between text-sm mb-3">
            <span className="text-text-secondary font-medium">Summary</span>
            <span className="text-text-tertiary font-mono text-xs">${totalCost.toFixed(2)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {phases.filter(p => p.status === 'complete').map(p => (
              <div key={p.id} className="flex items-center gap-2 text-[11px]">
                <CheckCircle2 className="w-3 h-3 text-status-pass flex-shrink-0" />
                <span className="text-text-secondary">{p.name}</span>
                <span className="text-text-tertiary ml-auto">${p.cost.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => { onComplete?.(); window.location.reload(); }}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-accent-blue text-white font-medium text-sm hover:bg-accent-blue/90 transition-colors"
        >
          <ArrowRight size={16} />
          Go to Dashboard
        </button>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-accent-red/10 flex items-center justify-center">
          <AlertTriangle size={32} className="text-accent-red" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Initialization Failed</h1>
          <p className="text-sm text-text-secondary mt-2">{errorMessage}</p>
        </div>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => setState('idle')}
            className="px-4 py-2.5 rounded-lg border border-border text-sm text-text-secondary hover:bg-surface-2 transition-colors"
          >
            Back
          </button>
          <button
            onClick={startInit}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent-blue text-white font-medium text-sm hover:bg-accent-blue/90 transition-colors"
          >
            <RotateCcw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function EntityIcon({ type }: { type: string }) {
  const cls = 'w-3 h-3 flex-shrink-0';
  switch (type) {
    case 'systems': return <Layers className={`${cls} text-accent-blue`} />;
    case 'roadmap_items': return <Target className={`${cls} text-accent-purple`} />;
    case 'issues': return <CircleDot className={`${cls} text-accent-red`} />;
    case 'ideas': return <Lightbulb className={`${cls} text-accent-yellow`} />;
    case 'epics': return <FileText className={`${cls} text-accent-blue`} />;
    case 'changelog_entries': return <GitCommitHorizontal className={`${cls} text-text-tertiary`} />;
    default: return <Box className={`${cls} text-text-tertiary`} />;
  }
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
