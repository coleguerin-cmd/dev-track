/**
 * Tool system types — shared across all tool modules.
 */

import type { AIToolDefinition } from '../service.js';

export interface Tool {
  definition: AIToolDefinition;
  label: string;
  execute: (args: Record<string, any>) => Promise<any>;
}

export interface ToolModule {
  /** Domain name (e.g., 'backlog', 'issues') */
  domain: string;
  /** All tools in this domain */
  tools: Tool[];
}
