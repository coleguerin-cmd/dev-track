import { useEffect, useState } from 'react';
import * as api from '../api/client';
import { HealthDot, PassRate } from '../components/StatusBadge';
import type { Action, DiagnosticRun } from '@shared/types';

export function Actions() {
  const [actionsList, setActions] = useState<Action[]>([]);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [runs, setRuns] = useState<DiagnosticRun[]>([]);
  const [playbook, setPlaybook] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);

  useEffect(() => {
    api.actions.list().then((d: any) => setActions(d?.actions || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedAction) {
      api.actions.get(selectedAction).then((d: any) => {
        setRuns(d?.recent_runs || []);
      }).catch(() => {});
      api.actions.getPlaybook(selectedAction).then((d: any) => {
        setPlaybook(d?.content || '');
      }).catch(() => {});
    }
  }, [selectedAction]);

  const runDiagnostic = async (id: string) => {
    setRunningId(id);
    try {
      const run = await api.actions.run(id);
      setRuns(prev => [run, ...prev]);
      // Refresh action list
      api.actions.list().then((d: any) => setActions(d?.actions || []));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRunningId(null);
    }
  };

  const copyPrompt = (action: Action, run: DiagnosticRun) => {
    const failures = run.outcomes.filter(o => !o.pass);
    const text = `Diagnostic run on "${action.name}" found issues:\n${
      failures.map(f => `❌ ${f.id}: ${f.detail}`).join('\n')
    }\n\nRun details saved to .dev-track/data/runs/${run.id}.json\n\nPlease investigate and fix these issues.`;
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Actions</h1>

      <div className="grid grid-cols-2 gap-6">
        {/* Action list */}
        <div className="space-y-3">
          {actionsList.map(action => (
            <div
              key={action.id}
              onClick={() => setSelectedAction(action.id)}
              className={`card-hover p-4 ${selectedAction === action.id ? 'ring-1 ring-accent-blue/40' : ''}`}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <HealthDot health={action.health} />
                <span className="text-sm font-semibold flex-1">{action.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); runDiagnostic(action.id); }}
                  disabled={runningId === action.id}
                  className="btn-primary text-xs py-1 px-2"
                >
                  {runningId === action.id ? '⟳ Running...' : '▶ Run'}
                </button>
              </div>
              <p className="text-xs text-text-secondary mb-2">{action.description}</p>
              <div className="flex items-center gap-4">
                <PassRate passed={action.pass_rate.passed} total={action.pass_rate.total} />
                {action.open_issues > 0 && (
                  <span className="text-xs text-accent-red">{action.open_issues} issues</span>
                )}
                {action.last_run && (
                  <span className="text-2xs text-text-tertiary">
                    Last: {new Date(action.last_run).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Expected outcomes */}
              <div className="mt-3 flex flex-wrap gap-1">
                {action.expected_outcomes.map(eo => {
                  // Find latest run outcome
                  const latestRun = runs.find(r => r.action_id === action.id);
                  const outcome = latestRun?.outcomes.find(o => o.id === eo.id);
                  const passed = outcome?.pass ?? true;
                  return (
                    <span key={eo.id} className={`text-2xs px-1.5 py-0.5 rounded ${passed ? 'bg-status-pass/10 text-status-pass' : 'bg-status-fail/10 text-status-fail'}`}>
                      {passed ? '✓' : '✗'} {eo.description.substring(0, 30)}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
          {actionsList.length === 0 && (
            <div className="card p-8 text-center">
              <p className="text-text-tertiary">No actions tracked yet.</p>
              <p className="text-xs text-text-tertiary mt-1">Actions represent features you want to monitor.</p>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div>
          {selectedAction ? (
            <div className="space-y-4">
              <h2 className="label">Recent Runs</h2>
              <div className="space-y-2">
                {runs.slice(0, 10).map(run => (
                  <div key={run.id} className="card p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${
                        run.result === 'all_pass' ? 'bg-status-pass' :
                        run.result === 'partial_pass' ? 'bg-status-warn' : 'bg-status-fail'
                      }`} />
                      <span className="text-xs font-medium flex-1">
                        {run.result === 'all_pass' ? 'All Pass' :
                         run.result === 'partial_pass' ? 'Partial Pass' : 'Fail'}
                      </span>
                      <span className="text-2xs text-text-tertiary">
                        {new Date(run.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {run.outcomes.map(o => (
                        <span key={o.id} className={`text-2xs ${o.pass ? 'text-status-pass' : 'text-status-fail'}`}>
                          {o.pass ? '✓' : '✗'} {o.id}
                        </span>
                      ))}
                    </div>
                    {run.result !== 'all_pass' && (
                      <button
                        onClick={() => {
                          const action = actionsList.find(a => a.id === selectedAction)!;
                          copyPrompt(action, run);
                        }}
                        className="btn-ghost text-xs py-1 text-accent-blue"
                      >
                        📋 Copy Cursor Prompt
                      </button>
                    )}
                  </div>
                ))}
                {runs.length === 0 && (
                  <p className="text-xs text-text-tertiary py-4 text-center">No runs yet</p>
                )}
              </div>

              {playbook && (
                <>
                  <h2 className="label mt-6">Playbook</h2>
                  <div className="card p-4 text-xs text-text-secondary font-mono whitespace-pre-wrap max-h-80 overflow-y-auto">
                    {playbook}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="card p-8 text-center text-text-tertiary">
              <p>Select an action to see details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
