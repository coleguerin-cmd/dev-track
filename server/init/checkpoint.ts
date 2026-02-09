/**
 * Init Checkpoint System
 * 
 * Tracks phase completion for cancel/resume support.
 * Checkpoint saved to data/init-checkpoint.json after each phase.
 */

import fs from 'fs';
import path from 'path';
import { getDataDir } from '../project-config.js';

export interface InitCheckpoint {
  run_id: string;
  project: string;
  started_at: string;
  completed_phases: string[];
  current_phase: string | null;
  total_cost: number;
  entities_created: Record<string, number>;
  cancelled: boolean;
  completed: boolean;
  scan_data?: any; // Preserved scan results for resume
}

function getCheckpointPath(): string {
  return path.join(getDataDir(), 'init-checkpoint.json');
}

export function loadCheckpoint(): InitCheckpoint | null {
  try {
    const p = getCheckpointPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch {}
  return null;
}

export function saveCheckpoint(checkpoint: InitCheckpoint): void {
  const p = getCheckpointPath();
  fs.writeFileSync(p, JSON.stringify(checkpoint, null, 2));
}

export function clearCheckpoint(): void {
  try {
    const p = getCheckpointPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

export function createCheckpoint(project: string): InitCheckpoint {
  return {
    run_id: `init-${Date.now()}`,
    project,
    started_at: new Date().toISOString(),
    completed_phases: [],
    current_phase: null,
    total_cost: 0,
    entities_created: {},
    cancelled: false,
    completed: false,
  };
}
