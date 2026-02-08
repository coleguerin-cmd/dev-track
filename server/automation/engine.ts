/**
 * Automation Engine
 * 
 * Evaluates triggers, checks conditions, executes actions.
 * Supports both rigid condition-based and AI-driven automations.
 */

import { getStore } from '../store.js';
import { broadcast } from '../ws.js';
import { runAgent } from '../ai/runner.js';
import type { Automation, AutomationCondition } from '../../shared/types.js';

export type TriggerType = 'issue_created' | 'item_completed' | 'session_ended' | 'health_changed' | 'scheduled' | 'file_changed' | 'manual';

export interface TriggerContext {
  trigger: TriggerType;
  data?: any;
  timestamp?: string;
}

class AutomationEngine {
  private _running = new Map<string, boolean>();

  /**
   * Fire a trigger — finds matching automations and executes them.
   * Runs async (non-blocking). Logs results to activity feed.
   */
  async fire(context: TriggerContext): Promise<void> {
    const store = getStore();
    const automations = store.automations.automations.filter(a =>
      a.enabled && a.trigger === context.trigger
    );

    if (automations.length === 0) return;

    console.log(`[automation] Trigger: ${context.trigger} — ${automations.length} automation(s) matched`);

    for (const automation of automations) {
      // Skip if already running (prevent overlap)
      if (this._running.get(automation.id)) {
        console.log(`[automation] Skipping ${automation.id} — already running`);
        continue;
      }

      // Run async, don't block the caller
      this.executeAutomation(automation, context).catch(err => {
        console.error(`[automation] Error in ${automation.id}:`, err.message);
      });
    }
  }

  private async executeAutomation(automation: Automation, context: TriggerContext): Promise<void> {
    this._running.set(automation.id, true);
    const startTime = Date.now();

    try {
      // Check rigid conditions (if any)
      if (!automation.ai_driven && automation.conditions.length > 0) {
        const passes = this.evaluateConditions(automation.conditions, context.data);
        if (!passes) {
          console.log(`[automation] ${automation.id} — conditions not met, skipping`);
          return;
        }
      }

      if (automation.ai_driven && automation.ai_prompt) {
        // Run AI agent
        await this.runAIAutomation(automation, context);
      } else {
        // Execute rigid actions
        await this.executeActions(automation, context);
      }

      // Update automation metadata
      const store = getStore();
      const auto = store.automations.automations.find(a => a.id === automation.id);
      if (auto) {
        auto.last_fired = new Date().toISOString();
        auto.fire_count++;
        store.saveAutomations();
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`[automation] ${automation.id} completed in ${duration}s`);

      // Log to activity
      const store2 = getStore();
      store2.addActivity({
        type: 'system_health_changed',
        entity_type: 'automation',
        entity_id: automation.id,
        title: `Automation fired: ${automation.name}`,
        actor: 'system',
        metadata: { trigger: context.trigger, duration_seconds: duration },
      });

    } finally {
      this._running.delete(automation.id);
    }
  }

  private evaluateConditions(conditions: AutomationCondition[], data: any): boolean {
    if (!data) return false;
    return conditions.every(cond => {
      const value = data[cond.field];
      switch (cond.op) {
        case 'eq': return value === cond.value;
        case 'neq': return value !== cond.value;
        case 'gt': return value > cond.value;
        case 'lt': return value < cond.value;
        case 'contains': return String(value).includes(String(cond.value));
        case 'in': return Array.isArray(cond.value) && cond.value.includes(value);
        default: return false;
      }
    });
  }

  private async runAIAutomation(automation: Automation, context: TriggerContext): Promise<void> {
    const store = getStore();

    // Build context summary for the AI
    const contextSummary = [
      `Trigger: ${context.trigger}`,
      context.data ? `Data: ${JSON.stringify(context.data).substring(0, 2000)}` : '',
      `Project: ${store.config.project}`,
      `Status: ${store.getQuickStatusLine()}`,
      `Open issues: ${store.issues.issues.filter(i => i.status === 'open').length}`,
      `Roadmap items (now): ${store.roadmap.items.filter(i => i.horizon === 'now' && i.status !== 'completed').map(i => i.title).join(', ') || 'none'}`,
    ].filter(Boolean).join('\n');

    const systemPrompt = [
      'You are the DevTrack automation agent. You have full access to all DevTrack tools.',
      'Execute the following automation task with depth, precision, and attention to detail.',
      'Use tools to read current state, make changes, and verify your work.',
      'Be thorough — check for edge cases, stale data, contradictions.',
      'When creating or updating entities, provide rich descriptions and complete metadata.',
      'When deduplicating: list existing items first, check for semantic overlap, keep the more complete version.',
      '',
      `Automation: ${automation.name}`,
      `Description: ${automation.description}`,
      '',
      automation.ai_prompt || '',
    ].join('\n');

    const result = await runAgent(systemPrompt, contextSummary, {
      task: 'deep_audit',
      maxIterations: 20,
    });

    console.log(`[automation] AI agent for "${automation.name}" completed: ${result.iterations} iterations, ${result.tool_calls_made.length} tool calls, $${result.cost.toFixed(4)}`);
  }

  private async executeActions(automation: Automation, context: TriggerContext): Promise<void> {
    for (const action of automation.actions) {
      switch (action.type) {
        case 'notify':
          broadcast({
            type: 'activity_event',
            data: { title: `Automation: ${automation.name}`, detail: action.value },
            timestamp: new Date().toISOString(),
          });
          break;

        case 'run_ai_agent':
          if (action.value?.prompt) {
            await runAgent(
              'You are the DevTrack automation agent. Execute the task using available tools.',
              action.value.prompt,
              { task: action.value.task || 'deep_audit' },
            );
          }
          break;

        default:
          console.log(`[automation] Unknown action type: ${action.type}`);
      }
    }
  }
}

// Singleton
let _engine: AutomationEngine | null = null;

export function getAutomationEngine(): AutomationEngine {
  if (!_engine) _engine = new AutomationEngine();
  return _engine;
}
