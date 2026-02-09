/**
 * Init Routes — Project initialization with SSE streaming.
 * 
 * Endpoints:
 *   POST /api/v1/init/estimate  — Quick pre-scan, returns cost/time estimate
 *   POST /api/v1/init           — Run initialization (SSE stream)
 *   POST /api/v1/init/cancel    — Cancel a running initialization
 *   POST /api/v1/init/resume    — Resume from last checkpoint (SSE stream)
 *   GET  /api/v1/init/status    — Get current init status / checkpoint
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getStore } from '../store.js';
import { getProjectRoot, getProjectName } from '../project-config.js';
import { quickEstimate, estimateCost, fullMetadataScan } from '../init/metadata-scanner.js';
import { createCheckpoint, loadCheckpoint, saveCheckpoint, clearCheckpoint, type InitCheckpoint } from '../init/checkpoint.js';
import { runInitPhases, type PhaseProgress } from '../init/phases.js';

const app = new Hono();

// Active init tracking
let activeAbortController: AbortController | null = null;
let activeInitRunning = false;

// ─── POST /estimate — Quick pre-scan cost estimate ──────────────────────────

app.post('/estimate', async (c) => {
  const projectRoot = getProjectRoot();
  
  try {
    const stats = quickEstimate(projectRoot);
    const estimate = estimateCost(stats);
    
    return c.json({
      ok: true,
      data: {
        project: getProjectName(),
        project_root: projectRoot,
        stats,
        estimate,
      },
    });
  } catch (err: any) {
    console.error('[init] Estimate failed:', err.message);
    return c.json({ ok: false, error: err.message }, 500);
  }
});

// ─── POST / — Run full initialization (SSE stream) ─────────────────────────

app.post('/', async (c) => {
  if (activeInitRunning) {
    return c.json({ ok: false, error: 'Initialization already in progress. Cancel it first or wait.' }, 409);
  }

  const projectRoot = getProjectRoot();
  const projectName = getProjectName();
  
  console.log(`[init] Starting phased initialization for: ${projectName} (${projectRoot})`);

  return streamSSE(c, async (stream) => {
    activeInitRunning = true;
    activeAbortController = new AbortController();

    const sendEvent = async (event: PhaseProgress) => {
      try {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        });
      } catch {
        // Client disconnected
      }
    };

    try {
      // Phase 0: Pre-scan
      await sendEvent({
        type: 'phase_start',
        phase: 'prescan',
        phase_number: 0,
        total_phases: 7,
        phase_description: 'Scanning project files and reading metadata',
        message: 'Scanning project...',
      });

      const metadata = await fullMetadataScan(projectRoot);
      const estimate = estimateCost(metadata.quick_stats);

      await sendEvent({
        type: 'phase_complete',
        phase: 'prescan',
        phase_number: 0,
        total_phases: 7,
        phase_cost: 0,
        total_cost: 0,
        message: `Scan complete: ${metadata.quick_stats.total_files} files, ${metadata.quick_stats.total_lines.toLocaleString()} lines. Estimated cost: $${estimate.cost_low}-$${estimate.cost_high}`,
        count: metadata.quick_stats.total_files,
      });

      // Create fresh checkpoint
      const checkpoint = createCheckpoint(projectName);
      checkpoint.scan_data = { estimate };
      saveCheckpoint(checkpoint);

      // Run all phases with SSE streaming
      const result = await runInitPhases(
        metadata,
        checkpoint,
        async (event) => { await sendEvent(event); },
        activeAbortController.signal,
      );

      // Send final summary
      if (result.completed) {
        clearCheckpoint(); // Clean up on success
      }

    } catch (err: any) {
      console.error('[init] Init failed:', err);
      await sendEvent({
        type: 'error',
        error: err.message,
        message: `Initialization failed: ${err.message}`,
      });
    } finally {
      activeInitRunning = false;
      activeAbortController = null;
    }
  });
});

// ─── POST /cancel — Cancel running initialization ──────────────────────────

app.post('/cancel', async (c) => {
  if (!activeInitRunning || !activeAbortController) {
    return c.json({ ok: false, error: 'No initialization in progress' }, 404);
  }

  activeAbortController.abort();
  console.log('[init] Cancellation requested');

  return c.json({
    ok: true,
    data: { message: 'Cancellation requested. The current phase will complete, then initialization will pause.' },
  });
});

// ─── POST /resume — Resume from last checkpoint (SSE stream) ───────────────

app.post('/resume', async (c) => {
  if (activeInitRunning) {
    return c.json({ ok: false, error: 'Initialization already in progress' }, 409);
  }

  const checkpoint = loadCheckpoint();
  if (!checkpoint) {
    return c.json({ ok: false, error: 'No checkpoint found. Start a new initialization instead.' }, 404);
  }

  if (checkpoint.completed) {
    return c.json({ ok: false, error: 'Previous initialization was already completed. Start a new one.' }, 400);
  }

  const projectRoot = getProjectRoot();
  console.log(`[init] Resuming from checkpoint: ${checkpoint.completed_phases.length} phases complete, $${checkpoint.total_cost.toFixed(2)} spent`);

  return streamSSE(c, async (stream) => {
    activeInitRunning = true;
    activeAbortController = new AbortController();

    const sendEvent = async (event: PhaseProgress) => {
      try {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        });
      } catch {}
    };

    try {
      // Re-scan metadata (needed for prompts even on resume)
      await sendEvent({
        type: 'phase_start',
        phase: 'prescan',
        phase_number: 0,
        total_phases: 7,
        phase_description: 'Re-scanning project files for resume',
        message: 'Re-scanning project for resume...',
      });

      const metadata = await fullMetadataScan(projectRoot);

      await sendEvent({
        type: 'phase_complete',
        phase: 'prescan',
        phase_number: 0,
        total_phases: 7,
        phase_cost: 0,
        total_cost: checkpoint.total_cost,
        count: metadata.quick_stats.total_files,
        message: `Resuming from phase ${checkpoint.completed_phases.length + 1}. Previous cost: $${checkpoint.total_cost.toFixed(2)}`,
      });

      // Reset cancelled flag for resume
      checkpoint.cancelled = false;

      const result = await runInitPhases(
        metadata,
        checkpoint,
        async (event) => { await sendEvent(event); },
        activeAbortController.signal,
      );

      if (result.completed) {
        clearCheckpoint();
      }

    } catch (err: any) {
      console.error('[init] Resume failed:', err);
      await sendEvent({
        type: 'error',
        error: err.message,
        message: `Resume failed: ${err.message}`,
      });
    } finally {
      activeInitRunning = false;
      activeAbortController = null;
    }
  });
});

// ─── GET /status — Current init status ──────────────────────────────────────

app.get('/status', async (c) => {
  const checkpoint = loadCheckpoint();
  
  return c.json({
    ok: true,
    data: {
      running: activeInitRunning,
      checkpoint: checkpoint || null,
      can_resume: checkpoint && !checkpoint.completed && !activeInitRunning,
    },
  });
});

export default app;
