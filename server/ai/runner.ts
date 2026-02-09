/**
 * Headless AI Agent Runner
 * 
 * Runs AI tasks programmatically without chat UI or SSE streaming.
 * Used by: project init, automation engine, doc generation.
 * Uses AIService.complete() + tool execution loop.
 */

import { getAIService } from './service.js';
import { TOOL_DEFINITIONS, executeTool } from './tools/index.js';
import type { AuditRecorder } from '../automation/recorder.js';
import type { ModelTier } from './router.js';

export interface AgentOptions {
  /** Task type for model routing (default: 'deep_audit' = premium tier) */
  task?: string;
  /** Model tier override — bypasses task routing, picks best model in tier */
  tier?: ModelTier;
  /** Max tool-call iterations (default: 20) */
  maxIterations?: number;
  /** Max cost in USD — stops the agent when cumulative cost exceeds this (no default = unlimited) */
  maxCost?: number;
  /** Subset of tool names to allow (default: all) */
  allowedTools?: string[];
  /** Override model ID directly */
  model?: string;
  /** Optional audit recorder to capture every step */
  recorder?: AuditRecorder;
  /** Custom Helicone properties for request tracking */
  heliconeProperties?: Record<string, string>;
  /** Max output tokens per AI call (default: 4096) — increase for tools that need large output like doc generation */
  maxTokens?: number;
  /** Progress callback — fires after each tool call execution */
  onToolCall?: (event: ToolCallEvent) => void;
  /** Abort signal — set to cancel a running agent */
  signal?: AbortSignal;
}

export interface ToolCallEvent {
  toolName: string;
  args: any;
  result: string;
  iteration: number;
  totalCost: number;
  totalTokens: number;
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
  await aiService.waitForReady(10000);
  const maxIterations = options.maxIterations ?? 20;
  const task = options.task ?? 'deep_audit';

  // Resolve model: explicit model > tier override > task routing (via service)
  let resolvedModel = options.model;
  if (!resolvedModel && options.tier) {
    const router = aiService.getRouter();
    if (router && router.isDiscovered()) {
      resolvedModel = router.routeByTier(options.tier);
      console.log(`[runner] Tier override '${options.tier}' → model: ${resolvedModel}`);
    } else {
      console.warn(`[runner] Tier '${options.tier}' requested but router not ready — falling back to task routing`);
    }
  }

  // Filter tools if subset specified
  let tools = TOOL_DEFINITIONS;
  if (options.allowedTools !== undefined) {
    const allowed = new Set(options.allowedTools);
    tools = tools.filter((t: any) => allowed.has(t.function.name));
  }

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const toolCallLog: AgentResult['tool_calls_made'] = [];
  const recorder = options.recorder;
  let totalTokens = 0;
  let totalCost = 0;

  for (let i = 0; i < maxIterations; i++) {
    // Check cancel signal
    if (options.signal?.aborted) {
      return {
        content: '[Agent cancelled by user]',
        tool_calls_made: toolCallLog,
        iterations: i,
        tokens_used: totalTokens,
        cost: totalCost,
      };
    }

    const result = await aiService.complete(messages, {
      task,
      tools: tools.length > 0 ? tools : undefined,
      model: resolvedModel,
      max_tokens: options.maxTokens,
      heliconeProperties: options.heliconeProperties,
    } as any);

    totalTokens += result.usage?.total_tokens || 0;
    totalCost += result.estimated_cost_usd || 0;

    // Check cost cap AFTER accumulating this iteration's cost
    if (options.maxCost && totalCost >= options.maxCost) {
      return {
        content: `[Agent stopped: cost cap reached ($${totalCost.toFixed(2)} / $${options.maxCost.toFixed(2)})]`,
        tool_calls_made: toolCallLog,
        iterations: i + 1,
        tokens_used: totalTokens,
        cost: totalCost,
      };
    }

    // Record thinking step
    if (recorder) {
      recorder.recordThinking(
        result.content || '',
        result.usage ? { input: result.usage.input_tokens, output: result.usage.output_tokens } : undefined,
        result.estimated_cost_usd,
        result.model,
        result.provider,
      );
    }

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
      // Check cancel between tool calls too
      if (options.signal?.aborted) {
        return {
          content: '[Agent cancelled by user]',
          tool_calls_made: toolCallLog,
          iterations: i + 1,
          tokens_used: totalTokens,
          cost: totalCost,
        };
      }

      const fnName = tc.function.name;
      const fnArgs = typeof tc.function.arguments === 'string'
        ? JSON.parse(tc.function.arguments)
        : tc.function.arguments || {};

      // Record tool call
      if (recorder) recorder.recordToolCall(fnName, fnArgs);

      let toolResult: string;
      try {
        toolResult = await executeTool(fnName, fnArgs);
      } catch (err: any) {
        toolResult = JSON.stringify({ error: err.message || 'Tool execution failed' });
      }

      // Record tool result
      if (recorder) recorder.recordToolResult(fnName, toolResult);

      // Fire progress callback
      if (options.onToolCall) {
        options.onToolCall({
          toolName: fnName,
          args: fnArgs,
          result: toolResult,
          iteration: i + 1,
          totalCost,
          totalTokens,
        });
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
