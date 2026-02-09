/**
 * Automation Scheduler (Cron)
 * 
 * Checks every minute for due scheduled automations.
 * Fires daily/weekly automations based on last_fired timestamps.
 */

import fs from 'fs';
import path from 'path';
import { getStore } from '../store.js';
import { getDataDir } from '../project-config.js';
import { getAutomationEngine } from './engine.js';

const CHECK_INTERVAL = 60_000; // 1 minute

let _timer: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  if (_timer) clearInterval(_timer);

  _timer = setInterval(() => {
    checkScheduledAutomations().catch(err => {
      console.error('[scheduler] Error checking automations:', err.message);
    });
  }, CHECK_INTERVAL);

  console.log('[scheduler] Started (checking every 60s)');
}

export function stopScheduler(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

async function checkScheduledAutomations(): Promise<void> {
  // Check master kill switch
  try {
    const configPath = path.join(getDataDir(), 'ai/config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (!config?.automations?.enabled || !config?.automations?.scheduler_enabled) return;
    }
  } catch { /* ignore */ }

  const store = getStore();
  const engine = getAutomationEngine();
  const now = new Date();

  const scheduled = store.automations.automations.filter(
    a => a.enabled && a.trigger === 'scheduled'
  );

  // Collect due automations, then fire sequentially with stagger delay
  // This prevents all overdue automations from dogpiling on startup
  const due: { automation: typeof scheduled[0]; schedule: string }[] = [];

  for (const automation of scheduled) {
    const schedule = getScheduleType(automation);
    if (!schedule) continue;

    const lastFired = automation.last_fired ? new Date(automation.last_fired) : null;

    if (shouldFire(schedule, now, lastFired)) {
      due.push({ automation, schedule });
    }
  }

  if (due.length === 0) return;

  // Sort by priority: daily first, then weekly (daily is more time-sensitive)
  const priority: Record<string, number> = { hourly: 0, daily: 1, weekly: 2 };
  due.sort((a, b) => (priority[a.schedule] ?? 1) - (priority[b.schedule] ?? 1));

  for (let i = 0; i < due.length; i++) {
    const { automation, schedule } = due[i];
    // Stagger: wait 30s between each automation to avoid rate limit dogpiling
    if (i > 0) {
      console.log(`[scheduler] Staggering next automation by 30s...`);
      await new Promise(r => setTimeout(r, 30_000));
    }
    console.log(`[scheduler] Firing scheduled automation: ${automation.name} (${schedule})`);
    await engine.fire({
      trigger: 'scheduled',
      data: { schedule_type: schedule, automation_id: automation.id },
      timestamp: now.toISOString(),
    });
  }
}

function getScheduleType(automation: any): string | null {
  // Check automation actions or conditions for schedule info
  // Convention: ai_prompt or description contains "daily" or "weekly"
  const text = `${automation.description} ${automation.ai_prompt || ''} ${automation.name}`.toLowerCase();
  if (text.includes('weekly')) return 'weekly';
  if (text.includes('daily') || text.includes('nightly')) return 'daily';
  if (text.includes('hourly')) return 'hourly';
  return 'daily'; // default for scheduled triggers
}

function shouldFire(schedule: string, now: Date, lastFired: Date | null): boolean {
  if (!lastFired) return true; // Never fired — fire immediately

  const elapsed = now.getTime() - lastFired.getTime();
  const hours = elapsed / (1000 * 60 * 60);

  switch (schedule) {
    case 'hourly': return hours >= 1;
    case 'daily': return hours >= 22; // ~22h buffer to avoid drift
    case 'weekly': return hours >= 166; // ~7 days with buffer
    default: return hours >= 22;
  }
}
