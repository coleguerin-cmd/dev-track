/**
 * Headless AI Agent Runner
 * 
 * Runs AI tasks programmatically without chat UI or SSE streaming.
 * Used by: project init, automation engine, doc generation.
 * Uses AIService.complete() + tool execution loop.
 */

import { getAIService } from './service.js';
import { TOOL_DEFINITIONS, executeTool } from './tools/index.js';

export interface AgentOptions {
  /** Task type for model routing (default: 'deep_audit' = premium tier) */
  task?: string;
  /** Max tool-call iterations (default: 20) */
  maxIterations?: number;
  /** Subset of tool names to allow (default: all) */
  allowedTools?: string[];
  /** Override model ID directly */
  model?: string;
}

export interface AgentResult {
  content: string;
  tool_calls_made: { name: string; args: any; result_preview: string }[];
  iterations: number;
  tokens_used: number;
  cost: number;
}

export async function runAgent(
  systemPrompt: string,
  userMessage: string,
  options: AgentOptions = {},
): Promise<AgentResult> {
  const aiService = getAIService();
  const maxIterations = options.maxIterations ?? 20;
  const task = options.task ?? 'deep_audit';

  // Filter tools if subset specified
  let tools = TOOL_DEFINITIONS;
  if (options.allowedTools) {
    const allowed = new Set(options.allowedTools);
    tools = tools.filter((t: any) => allowed.has(t.function.name));
  }

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const toolCallLog: AgentResult['tool_calls_made'] = [];
  let totalTokens = 0;
  let totalCost = 0;

  for (let i = 0; i < maxIterations; i++) {
    const result = await aiService.complete(messages, {
      task,
      tools: tools.length > 0 ? tools : undefined,
      model: options.model,
    } as any);

    totalTokens += result.usage?.total_tokens || 0;
    totalCost += result.estimated_cost_usd || 0;

    // Add assistant message
    messages.push({
      role: 'assistant',
      content: result.content || null,
      tool_calls: result.tool_calls,
    });

    // If no tool calls, we're done
    if (!result.tool_calls || result.tool_calls.length === 0) {
      return {
        content: result.content || '',
        tool_calls_made: toolCallLog,
        iterations: i + 1,
        tokens_used: totalTokens,
        cost: totalCost,
      };
    }

    // Execute tool calls
    for (const tc of result.tool_calls) {
      const fnName = tc.function.name;
      const fnArgs = typeof tc.function.arguments === 'string'
        ? JSON.parse(tc.function.arguments)
        : tc.function.arguments || {};

      let toolResult: string;
      try {
        toolResult = await executeTool(fnName, fnArgs);
      } catch (err: any) {
        toolResult = JSON.stringify({ error: err.message || 'Tool execution failed' });
      }

      toolCallLog.push({
        name: fnName,
        args: fnArgs,
        result_preview: toolResult.substring(0, 200),
      });

      messages.push({
        role: 'tool',
        content: toolResult,
        tool_call_id: tc.id,
      });
    }
  }

  // Hit max iterations
  return {
    content: messages[messages.length - 1]?.content || `[Agent hit max iterations (${maxIterations})]`,
    tool_calls_made: toolCallLog,
    iterations: maxIterations,
    tokens_used: totalTokens,
    cost: totalCost,
  };
}
