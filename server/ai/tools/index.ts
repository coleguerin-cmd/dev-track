/**
 * Tool Registry — Auto-discovers and registers all tool modules.
 * 
 * To add new tools: create a new file in this directory exporting a ToolModule,
 * then import and add it to the MODULES array below. That's it.
 * 
 * The registry builds flat arrays of definitions and labels from all modules,
 * and routes execution to the correct tool handler.
 */

import type { AIToolDefinition } from '../service.js';
import type { Tool, ToolModule } from './types.js';

// Import all tool modules
import { backlogTools } from './backlog.js';
import { issueTools } from './issues.js';
import { changelogTools } from './changelog.js';
import { ideaTools } from './ideas.js';
import { stateTools } from './state.js';
import { brainTools } from './brain.js';
import { sessionTools } from './session.js';
import { actionTools } from './actions.js';
import { codebaseTools } from './codebase.js';
import { gitTools } from './git.js';
import { fileTools } from './files.js';
import { docTools } from './docs.js';
import { metricsTools } from './metrics.js';
import { configTools } from './config.js';
import { profileTools } from './profiles.js';
import { integrationTools } from './integrations.js';

// ─── Module Registry ────────────────────────────────────────────────────────
// Add new tool modules here. Order determines tool listing order.

const MODULES: ToolModule[] = [
  backlogTools,
  issueTools,
  changelogTools,
  ideaTools,
  stateTools,
  brainTools,
  sessionTools,
  actionTools,
  codebaseTools,
  gitTools,
  fileTools,
  docTools,
  metricsTools,
  configTools,
  profileTools,
  integrationTools,
];

// ─── Build Registry ─────────────────────────────────────────────────────────

const _toolMap = new Map<string, Tool>();
const _definitions: AIToolDefinition[] = [];
const _labels: Record<string, string> = {};

for (const mod of MODULES) {
  for (const tool of mod.tools) {
    const name = tool.definition.function.name;
    _toolMap.set(name, tool);
    _definitions.push(tool.definition);
    _labels[name] = tool.label;
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

/** All tool definitions in OpenAI function-calling format */
export const TOOL_DEFINITIONS: AIToolDefinition[] = _definitions;

/** Friendly labels for UI display */
export const TOOL_LABELS: Record<string, string> = _labels;

/** Execute a tool by name */
export async function executeTool(name: string, args: Record<string, any>): Promise<string> {
  const tool = _toolMap.get(name);
  if (!tool) return JSON.stringify({ error: `Unknown tool: ${name}` });

  try {
    const result = await tool.execute(args);
    return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  } catch (err: any) {
    return JSON.stringify({ error: err.message || 'Tool execution failed' });
  }
}

/** Get registry stats */
export function getToolStats() {
  return {
    total_tools: _definitions.length,
    domains: MODULES.map(m => ({ domain: m.domain, tools: m.tools.length })),
  };
}
