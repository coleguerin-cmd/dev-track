import { Hono } from 'hono';
import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import { runScript } from '../script-runner.js';
import type { Action, DiagnosticRun, RunResult } from '../../shared/types.js';

const app = new Hono();

// GET /api/v1/actions
app.get('/', (c) => {
  const store = getStore();
  return c.json({ ok: true, data: { actions: store.actions.actions } });
});

// GET /api/v1/actions/:id
app.get('/:id', (c) => {
  const store = getStore();
  const action = store.actions.actions.find(a => a.id === c.req.param('id'));
  if (!action) return c.json({ ok: false, error: 'Action not found' }, 404);

  const runs = store.runs.filter(r => r.action_id === action.id).slice(-10);
  return c.json({ ok: true, data: { action, recent_runs: runs } });
});

// POST /api/v1/actions
app.post('/', async (c) => {
  const store = getStore();
  const body = await c.req.json();

  const action: Action = {
    id: body.id || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: body.name,
    description: body.description || '',
    playbook: body.playbook || '',
    scripts: body.scripts || [],
    expected_outcomes: body.expected_outcomes || [],
    health: 'unknown',
    pass_rate: { passed: 0, total: 0 },
    open_issues: 0,
    last_run: null,
    created: new Date().toISOString().split('T')[0],
  };

  store.actions.actions.push(action);
  store.saveActions();
  broadcast({ type: 'action_health_changed', data: action, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: action }, 201);
});

// PATCH /api/v1/actions/:id
app.patch('/:id', async (c) => {
  const store = getStore();
  const action = store.actions.actions.find(a => a.id === c.req.param('id'));
  if (!action) return c.json({ ok: false, error: 'Action not found' }, 404);

  const body = await c.req.json();
  if (body.name !== undefined) action.name = body.name;
  if (body.description !== undefined) action.description = body.description;
  if (body.playbook !== undefined) action.playbook = body.playbook;
  if (body.scripts !== undefined) action.scripts = body.scripts;
  if (body.expected_outcomes !== undefined) action.expected_outcomes = body.expected_outcomes;

  store.saveActions();
  return c.json({ ok: true, data: action });
});

// POST /api/v1/actions/:id/run — Execute diagnostic
app.post('/:id/run', async (c) => {
  const store = getStore();
  const action = store.actions.actions.find(a => a.id === c.req.param('id'));
  if (!action) return c.json({ ok: false, error: 'Action not found' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const trigger = body.trigger || 'manual';
  const startTime = Date.now();

  // Execute all scripts
  const scriptOutputs: Record<string, string> = {};
  for (const script of action.scripts) {
    const result = await runScript(script.command, {
      cwd: script.cwd,
      timeout: script.timeout || 120000,
    });
    scriptOutputs[script.name] = result.output;
  }

  const durationSeconds = Math.round((Date.now() - startTime) / 1000);
  const runId = `run-${new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').substring(0, 15)}`;

  // Create run record (outcomes will be marked by user/AI after reviewing output)
  const run: DiagnosticRun = {
    id: runId,
    action_id: action.id,
    timestamp: new Date().toISOString(),
    trigger,
    duration_seconds: durationSeconds,
    result: 'all_pass', // Default — updated when outcomes are marked
    outcomes: action.expected_outcomes.map(eo => ({
      id: eo.id,
      pass: true, // Default pass — user/AI marks failures
      detail: '',
    })),
    issues_created: [],
    issues_resolved: [],
    script_outputs: scriptOutputs,
    notes: '',
  };

  store.saveRun(run);

  // Update action
  action.last_run = run.timestamp;
  store.saveActions();

  broadcast({ type: 'run_completed', data: run, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: run });
});

// PATCH /api/v1/actions/:id/runs/:runId — Update run outcomes
app.patch('/:id/runs/:runId', async (c) => {
  const store = getStore();
  const action = store.actions.actions.find(a => a.id === c.req.param('id'));
  if (!action) return c.json({ ok: false, error: 'Action not found' }, 404);

  const run = store.runs.find(r => r.id === c.req.param('runId'));
  if (!run) return c.json({ ok: false, error: 'Run not found' }, 404);

  const body = await c.req.json();
  if (body.outcomes) {
    run.outcomes = body.outcomes;
    // Compute result
    const allPass = run.outcomes.every(o => o.pass);
    const allFail = run.outcomes.every(o => !o.pass);
    run.result = allPass ? 'all_pass' : allFail ? 'fail' : 'partial_pass';
  }
  if (body.notes !== undefined) run.notes = body.notes;
  if (body.issues_created !== undefined) run.issues_created = body.issues_created;

  // Update action health
  const recentRuns = store.runs.filter(r => r.action_id === action.id).slice(-10);
  const passed = recentRuns.filter(r => r.result === 'all_pass').length;
  action.pass_rate = { passed, total: recentRuns.length };
  action.health = passed === recentRuns.length ? 'green'
    : passed >= recentRuns.length * 0.7 ? 'yellow'
    : 'red';

  store.saveActions();
  broadcast({ type: 'action_health_changed', data: action, timestamp: new Date().toISOString() });
  return c.json({ ok: true, data: run });
});

// GET /api/v1/actions/:id/playbook
app.get('/:id/playbook', (c) => {
  const store = getStore();
  const action = store.actions.actions.find(a => a.id === c.req.param('id'));
  if (!action) return c.json({ ok: false, error: 'Action not found' }, 404);

  const content = store.getPlaybook(action.playbook);
  return c.json({ ok: true, data: { content } });
});

export default app;
