/**
 * AuditRecorder — Instruments AI agent runs to capture every step.
 * 
 * Create before an agent run, pass to runAgent(), then finalize after completion.
 * The recorder captures: thinking content, tool calls with args/results,
 * per-step tokens/cost, and detects entity changes from mutating tool calls.
 */

import { getStore } from '../store.js';
import type {
  AuditRun,
  AuditStep,
  AuditChange,
  AuditSuggestion,
  AuditTriggerType,
} from '../../shared/types.js';

// Tool names that indicate entity mutations
const MUTATING_TOOLS: Record<string, { action: AuditChange['action']; entity_type: string }> = {
  create_backlog_item: { action: 'created', entity_type: 'roadmap_item' },
  update_backlog_item: { action: 'updated', entity_type: 'roadmap_item' },
  delete_backlog_item: { action: 'deleted', entity_type: 'roadmap_item' },
  create_epic: { action: 'created', entity_type: 'epic' },
  update_epic: { action: 'updated', entity_type: 'epic' },
  delete_epic: { action: 'deleted', entity_type: 'epic' },
  create_milestone: { action: 'created', entity_type: 'milestone' },
  update_milestone: { action: 'updated', entity_type: 'milestone' },
  delete_milestone: { action: 'deleted', entity_type: 'milestone' },
  create_release: { action: 'created', entity_type: 'release' },
  update_release: { action: 'updated', entity_type: 'release' },
  publish_release: { action: 'updated', entity_type: 'release' },
  create_issue: { action: 'created', entity_type: 'issue' },
  update_issue: { action: 'updated', entity_type: 'issue' },
  resolve_issue: { action: 'resolved', entity_type: 'issue' },
  capture_idea: { action: 'created', entity_type: 'idea' },
  update_idea: { action: 'updated', entity_type: 'idea' },
  add_changelog_entry: { action: 'created', entity_type: 'changelog' },
  add_brain_note: { action: 'created', entity_type: 'brain_note' },
  write_context_recovery: { action: 'updated', entity_type: 'context_recovery' },
  update_preferences: { action: 'updated', entity_type: 'preferences' },
  update_project_state: { action: 'updated', entity_type: 'project_state' },
  create_system: { action: 'created', entity_type: 'system' },
  update_system: { action: 'updated', entity_type: 'system' },
  create_doc: { action: 'created', entity_type: 'doc' },
  update_doc: { action: 'updated', entity_type: 'doc' },
  delete_doc: { action: 'deleted', entity_type: 'doc' },
  update_velocity: { action: 'updated', entity_type: 'velocity' },
  add_session_observation: { action: 'updated', entity_type: 'profile' },
  update_user_profile: { action: 'updated', entity_type: 'profile' },
  write_project_file: { action: 'updated', entity_type: 'file' },
};

export class AuditRecorder {
  private run: AuditRun;
  private stepIndex = 0;
  private detectedChanges: AuditChange[] = [];
  private lastToolCall: { name: string; args: Record<string, any> } | null = null;

  constructor(
    automationId: string,
    automationName: string,
    triggerType: AuditTriggerType,
    triggerSource: string,
    triggerContext: Record<string, any> = {},
  ) {
    const store = getStore();
    const runId = store.getNextAuditRunId();

    this.run = {
      id: runId,
      automation_id: automationId,
      automation_name: automationName,
      trigger: {
        type: triggerType,
        source: triggerSource,
        context: triggerContext,
      },
      started_at: new Date().toISOString(),
      ended_at: null,
      duration_seconds: 0,
      status: 'running',
      model: '',
      provider: '',
      iterations: 0,
      tokens: { input: 0, output: 0, total: 0 },
      cost_usd: 0,
      steps: [],
      summary: '',
      changes_made: [],
      suggestions: [],
      errors: [],
    };
  }

  /** Record AI thinking/response content */
  recordThinking(
    content: string,
    tokens?: { input: number; output: number },
    cost_usd?: number,
    model?: string,
    provider?: string,
  ): void {
    if (!content && !tokens) return;

    const step: AuditStep = {
      index: this.stepIndex++,
      type: 'thinking',
      timestamp: new Date().toISOString(),
      content: content || undefined,
      tokens,
      cost_usd,
    };
    this.run.steps.push(step);

    if (tokens) {
      this.run.tokens.input += tokens.input;
      this.run.tokens.output += tokens.output;
      this.run.tokens.total += (tokens.input + tokens.output);
    }
    if (cost_usd) this.run.cost_usd += cost_usd;
    if (model && !this.run.model) this.run.model = model;
    if (provider && !this.run.provider) this.run.provider = provider;
  }

  /** Record that a tool is about to be called */
  recordToolCall(name: string, args: Record<string, any>): void {
    this.lastToolCall = { name, args };
    const step: AuditStep = {
      index: this.stepIndex++,
      type: 'tool_call',
      timestamp: new Date().toISOString(),
      tool_name: name,
      tool_args: args,
    };
    this.run.steps.push(step);
  }

  /** Record the result of a tool call */
  recordToolResult(name: string, result: string): void {
    const step: AuditStep = {
      index: this.stepIndex++,
      type: 'tool_result',
      timestamp: new Date().toISOString(),
      tool_name: name,
      tool_result: result.length > 5000 ? result.substring(0, 5000) + '...[truncated]' : result,
      tool_result_preview: result.substring(0, 200),
    };
    this.run.steps.push(step);

    // Detect entity changes from mutating tool calls
    this.detectChange(name, this.lastToolCall?.args || {}, result);
    this.lastToolCall = null;
  }

  /** Finalize the run with summary and persist */
  finalize(
    agentContent: string,
    iterations: number,
    suggestions?: AuditSuggestion[],
  ): AuditRun {
    this.run.ended_at = new Date().toISOString();
    this.run.duration_seconds = Math.round(
      (new Date(this.run.ended_at).getTime() - new Date(this.run.started_at).getTime()) / 1000
    );
    this.run.status = 'completed';
    this.run.iterations = iterations;
    this.run.changes_made = this.detectedChanges;
    this.run.suggestions = suggestions || [];
    this.run.summary = this.generateSummary(agentContent);

    // Persist
    const store = getStore();
    store.saveAuditRun(this.run);
    return this.run;
  }

  /** Mark the run as failed */
  fail(error: string): AuditRun {
    this.run.ended_at = new Date().toISOString();
    this.run.duration_seconds = Math.round(
      (new Date(this.run.ended_at).getTime() - new Date(this.run.started_at).getTime()) / 1000
    );
    this.run.status = 'failed';
    this.run.errors.push(error);
    this.run.changes_made = this.detectedChanges;
    this.run.summary = `Failed: ${error}`;

    const store = getStore();
    store.saveAuditRun(this.run);
    return this.run;
  }

  getRun(): AuditRun {
    return this.run;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  private detectChange(toolName: string, args: Record<string, any>, result: string): void {
    const mapping = MUTATING_TOOLS[toolName];
    if (!mapping) return;

    // Try to extract entity ID from args or result
    let entityId = args.id || '';
    if (!entityId) {
      try {
        const parsed = JSON.parse(result);
        entityId = parsed?.created?.id || parsed?.updated?.id || parsed?.deleted?.id || parsed?.resolved?.id || '';
      } catch { /* ignore */ }
    }

    // Build description from tool name + key args
    let description = `${mapping.action} ${mapping.entity_type}`;
    if (entityId) description += ` "${entityId}"`;
    if (args.title) description += `: ${args.title}`;
    else if (args.status) description += ` → ${args.status}`;
    else if (args.horizon) description += ` → ${args.horizon}`;

    // Check for errors in result
    try {
      const parsed = JSON.parse(result);
      if (parsed?.error || parsed?.duplicate) return; // Don't count failed operations as changes
    } catch { /* raw string result, still a change */ }

    this.detectedChanges.push({
      entity_type: mapping.entity_type,
      entity_id: entityId,
      action: mapping.action,
      description,
      tool_name: toolName,
    });
  }

  private generateSummary(agentContent: string): string {
    // Store the full agent response as summary — markdown rendering handles display
    if (agentContent && agentContent.trim().length > 0) {
      return agentContent;
    }

    // Fallback: build from detected changes
    const parts: string[] = [];
    const changesByType = new Map<string, number>();
    for (const c of this.detectedChanges) {
      const key = `${c.action} ${c.entity_type}`;
      changesByType.set(key, (changesByType.get(key) || 0) + 1);
    }
    for (const [key, count] of changesByType) {
      parts.push(`${count}x ${key}`);
    }
    return parts.length > 0
      ? `${this.run.automation_name}: ${parts.join(', ')}.`
      : `${this.run.automation_name} completed with no detected changes.`;
  }
}
