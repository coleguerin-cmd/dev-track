/**
 * AIService — Unified interface across OpenAI, Anthropic, and Google AI providers.
 * 
 * Handles:
 * - Multi-provider support with automatic Helicone proxy routing
 * - Streaming and non-streaming completions
 * - Tool calling in OpenAI function-calling format
 * - Usage tracking and cost estimation
 * - Graceful degradation when provider keys are missing
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { getDataDir, getCredentialsPath } from '../project-config.js';
import { getStore } from '../store.js';
import { ModelRouter, type TaskType } from './router.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: AIToolCall[];
}

export interface AIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface AIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface AICompletionOptions {
  task?: TaskType;
  model?: string;           // Override model for this call
  temperature?: number;
  max_tokens?: number;
  tools?: AIToolDefinition[];
  stream?: boolean;
  /** Custom properties sent to Helicone for tracking (user, session, automation, etc.) */
  heliconeProperties?: Record<string, string>;
}

export interface AICompletionResult {
  content: string;
  tool_calls?: AIToolCall[];
  model: string;
  provider: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  estimated_cost_usd: number;
}

export interface StreamEvent {
  type: 'text_delta' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end' | 'done' | 'error';
  content?: string;
  tool_call?: Partial<AIToolCall>;
  tool_call_index?: number;
  model?: string;
  provider?: string;
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  error?: string;
}

// ─── Credentials ─────────────────────────────────────────────────────────────

interface AICredentials {
  openai?: string;
  anthropic?: string;
  google?: string;
  helicone?: string;
  helicone_org_id?: string;
}

function loadCredentials(): AICredentials {
  try {
    const credPath = getCredentialsPath();
    if (fs.existsSync(credPath)) {
      const data = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
      return data.ai || {};
    }
  } catch {}
  // Fallback to environment variables
  return {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_AI_API_KEY,
    helicone: process.env.HELICONE_API_KEY,
    helicone_org_id: process.env.HELICONE_ORG_ID,
  };
}

// ─── Cost Estimation ─────────────────────────────────────────────────────────

// Approximate cost per 1M tokens (input/output) as of Feb 2026
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-5.2':             { input: 3.00, output: 15.00 },
  'gpt-5.3-codex':       { input: 3.00, output: 15.00 },
  'gpt-5-pro':           { input: 15.00, output: 60.00 },
  // Anthropic
  'claude-opus-4-6':             { input: 15.00, output: 75.00 },
  'claude-sonnet-4-5-20250929':  { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001':   { input: 1.00, output: 5.00 },
  // Google
  'gemini-3-pro-preview':  { input: 1.25, output: 5.00 },
  'gemini-3-flash-preview': { input: 0.15, output: 0.60 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || { input: 3.0, output: 15.0 };
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
}

// ─── Rate Limit Retry ────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 5000; // 5 seconds initial delay

/**
 * Simple per-minute token usage tracker per provider.
 * Preemptively delays requests when approaching known rate limits.
 */
class TokenRateTracker {
  private windows: Map<string, { tokens: number; timestamp: number }[]> = new Map();
  
  // Known rate limits (input tokens per minute) — divided by expected concurrency
  private limits: Record<string, number> = {
    anthropic: 130000,  // 450K limit / 3 concurrent agents, with buffer
    openai: 300000,     // Typically higher, /3
    google: 400000,     // /3
  };

  recordUsage(provider: string, inputTokens: number) {
    const now = Date.now();
    if (!this.windows.has(provider)) this.windows.set(provider, []);
    const window = this.windows.get(provider)!;
    window.push({ tokens: inputTokens, timestamp: now });
    // Prune entries older than 60s
    const cutoff = now - 60000;
    while (window.length > 0 && window[0].timestamp < cutoff) {
      window.shift();
    }
  }

  async waitIfNeeded(provider: string, estimatedTokens: number) {
    const limit = this.limits[provider];
    if (!limit) return;

    const now = Date.now();
    const window = this.windows.get(provider) || [];
    const cutoff = now - 60000;
    const recentTokens = window
      .filter(w => w.timestamp >= cutoff)
      .reduce((sum, w) => sum + w.tokens, 0);

    if (recentTokens + estimatedTokens > limit) {
      // Find when oldest entry in window will expire
      const oldest = window.find(w => w.timestamp >= cutoff);
      const waitMs = oldest ? (oldest.timestamp + 60000 - now + 1000) : 10000;
      console.warn(`[ai] Token rate approaching limit for ${provider} (${recentTokens}/${limit} in last 60s). Waiting ${Math.round(waitMs / 1000)}s...`);
      await new Promise(r => setTimeout(r, Math.min(waitMs, 30000)));
    }
  }
}

const tokenTracker = new TokenRateTracker();

/**
 * Retry wrapper with exponential backoff for rate limit (429) errors.
 * Delays: 5s, 15s, 45s (base * 3^attempt)
 */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.status || err?.statusCode || err?.error?.status;
      const isRateLimit = status === 429 || (err?.message || '').includes('rate_limit');
      
      if (!isRateLimit || attempt >= MAX_RETRIES) {
        throw err; // Not a rate limit error, or exhausted retries
      }

      // Extract retry-after header if available, otherwise use exponential backoff
      const retryAfter = err?.headers?.['retry-after'];
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : BASE_DELAY_MS * Math.pow(3, attempt);

      console.warn(`[ai] Rate limited (${label}), retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delayMs / 1000)}s...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error(`[ai] Exhausted ${MAX_RETRIES} retries for ${label}`);
}

// ─── Provider Detection ──────────────────────────────────────────────────────

function getProvider(model: string): 'openai' | 'anthropic' | 'google' {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gemini')) return 'google';
  return 'openai';
}

// ─── AIService ───────────────────────────────────────────────────────────────

export class AIService {
  private creds: AICredentials;
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  private google: GoogleGenerativeAI | null = null;
  private router: ModelRouter;
  private config: any;

  private initialized = false;

  constructor() {
    this.creds = loadCredentials();
    this.config = this.loadConfig();
    this.router = new ModelRouter(this.config, this.getAvailableProviders());
    this.initProviders();
    // Kick off async model discovery (don't await — runs in background)
    this.discover().catch(err => console.warn('[ai] Model discovery failed:', err.message));
  }

  /** Discover available models from provider APIs */
  async discover(): Promise<void> {
    await this.router.discoverModels({
      openai: this.openai || undefined,
      anthropic: this.anthropic || undefined,
      googleApiKey: this.creds.google || undefined,
    });
    this.initialized = true;
  }

  /** Wait for initial discovery to complete (with timeout) */
  async waitForReady(timeoutMs = 10000): Promise<void> {
    const start = Date.now();
    while (!this.initialized && Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  private loadConfig(): any {
    try {
      const configPath = path.join(getDataDir(), 'ai/config.json');
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch {}
    return { providers: {}, features: {}, budget: {}, defaults: {} };
  }

  private getAvailableProviders(): Set<string> {
    const available = new Set<string>();
    if (this.creds.openai) available.add('openai');
    if (this.creds.anthropic) available.add('anthropic');
    if (this.creds.google) available.add('google');
    return available;
  }

  private initProviders() {
    const useHelicone = !!(this.creds.helicone && this.config.providers?.helicone?.enabled === true);

    console.log(`[ai] Initializing providers (helicone: ${useHelicone ? 'ON' : 'OFF'})`);

    // OpenAI
    if (this.creds.openai) {
      const opts: any = { apiKey: this.creds.openai };
      if (useHelicone) {
        opts.baseURL = 'https://oai.helicone.ai/v1';
        opts.defaultHeaders = {
          'Helicone-Auth': `Bearer ${this.creds.helicone}`,
          ...(this.creds.helicone_org_id ? { 'Helicone-Organization-Id': this.creds.helicone_org_id } : {}),
        };
      }
      this.openai = new OpenAI(opts);
      console.log(`[ai]   OpenAI: configured`);
    }

    // Anthropic
    if (this.creds.anthropic) {
      const opts: any = { apiKey: this.creds.anthropic };
      if (useHelicone) {
        opts.baseURL = 'https://anthropic.helicone.ai';
        opts.defaultHeaders = {
          'Helicone-Auth': `Bearer ${this.creds.helicone}`,
          ...(this.creds.helicone_org_id ? { 'Helicone-Organization-Id': this.creds.helicone_org_id } : {}),
        };
      }
      this.anthropic = new Anthropic(opts);
      console.log(`[ai]   Anthropic: configured`);
    }

    // Google
    if (this.creds.google) {
      this.google = new GoogleGenerativeAI(this.creds.google);
      console.log(`[ai]   Google: configured`);
    }
  }

  // ─── Helicone Headers ──────────────────────────────────────────────────────

  /** Build Helicone headers from options — both User-Id and custom properties */
  private buildHeliconeHeaders(options: AICompletionOptions): Record<string, string> {
    const headers: Record<string, string> = {};
    
    if (options.heliconeProperties) {
      // Set the User-Id field (shows in Helicone's User column)
      if (options.heliconeProperties.User) {
        headers['Helicone-User-Id'] = options.heliconeProperties.User;
      }
      
      // Set custom properties (show in Helicone's Properties column)
      for (const [key, value] of Object.entries(options.heliconeProperties)) {
        headers[`Helicone-Property-${key}`] = value;
      }
    }
    
    // Always send task type as a property
    if (options.task) {
      headers['Helicone-Property-Task'] = options.task;
    }
    
    // Always send project name
    try {
      const store = getStore();
      headers['Helicone-Property-Project'] = store.config?.project || 'unknown';
    } catch { /* ignore if store not available */ }
    
    return headers;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Non-streaming completion */
  async complete(messages: AIMessage[], options: AICompletionOptions = {}): Promise<AICompletionResult> {
    const model = options.model || this.router.route(options.task || 'chat');
    const provider = getProvider(model);

    // Preemptive rate limit check — estimate input tokens roughly (4 chars ≈ 1 token)
    const estimatedTokens = messages.reduce((sum, m) => sum + Math.ceil((m.content || '').length / 4), 0);
    await tokenTracker.waitIfNeeded(provider, estimatedTokens);

    let result: AICompletionResult;
    if (provider === 'anthropic') {
      result = await this.completeAnthropic(messages, model, options);
    } else if (provider === 'google') {
      result = await this.completeGoogle(messages, model, options);
    } else {
      result = await this.completeOpenAI(messages, model, options);
    }

    // Record actual usage for rate tracking
    tokenTracker.recordUsage(provider, result.usage.input_tokens);
    return result;
  }

  /** Streaming completion — yields StreamEvents */
  async *stream(messages: AIMessage[], options: AICompletionOptions = {}): AsyncGenerator<StreamEvent> {
    const model = options.model || this.router.route(options.task || 'chat');
    const provider = getProvider(model);

    if (provider === 'anthropic') {
      yield* this.streamAnthropic(messages, model, options);
    } else if (provider === 'google') {
      // Google doesn't have great streaming tool call support — fall back to non-streaming
      const result = await this.completeGoogle(messages, model, options);
      if (result.tool_calls && result.tool_calls.length > 0) {
        for (const tc of result.tool_calls) {
          yield { type: 'tool_call_start', tool_call: tc };
          yield { type: 'tool_call_end', tool_call: tc };
        }
      }
      if (result.content) {
        yield { type: 'text_delta', content: result.content };
      }
      yield { type: 'done', model, provider, usage: result.usage };
    } else {
      yield* this.streamOpenAI(messages, model, options);
    }
  }

  /** Get available models (from auto-discovery) */
  getAvailableModels(): { id: string; provider: string; name: string; tier: string }[] {
    return this.router.getAvailableModels().map(m => ({
      id: m.id,
      provider: m.provider,
      name: m.name,
      tier: m.tier,
    }));
  }

  /** Check if any provider is configured */
  isConfigured(): boolean {
    return !!(this.openai || this.anthropic || this.google);
  }

  getConfig() { return this.config; }
  /** Reload config from disk — call after external writes to ai/config.json */
  reloadConfig() { this.config = this.loadConfig(); }
  getRouter() { return this.router; }

  // ─── OpenAI Provider ───────────────────────────────────────────────────────

  private async completeOpenAI(messages: AIMessage[], model: string, options: AICompletionOptions): Promise<AICompletionResult> {
    if (!this.openai) throw new Error('OpenAI not configured');

    const heliconeHeaders = this.buildHeliconeHeaders(options);
    const params: any = {
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 4096,
    };
    if (options.tools?.length) params.tools = options.tools;

    const reqOpts = Object.keys(heliconeHeaders).length > 0 ? { headers: heliconeHeaders } : undefined;
    const response = await withRetry(
      () => this.openai!.chat.completions.create(params, reqOpts),
      `OpenAI ${model}`
    );
    const choice = response.choices[0];
    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return {
      content: choice.message?.content || '',
      tool_calls: choice.message?.tool_calls as AIToolCall[] | undefined,
      model,
      provider: 'openai',
      usage: {
        input_tokens: usage.prompt_tokens,
        output_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      },
      estimated_cost_usd: estimateCost(model, usage.prompt_tokens, usage.completion_tokens),
    };
  }

  private async *streamOpenAI(messages: AIMessage[], model: string, options: AICompletionOptions): AsyncGenerator<StreamEvent> {
    if (!this.openai) throw new Error('OpenAI not configured');

    const params: any = {
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 4096,
      stream: true,
      stream_options: { include_usage: true },
    };
    if (options.tools?.length) params.tools = options.tools;

    const stream = await withRetry(
      () => this.openai!.chat.completions.create(params),
      `OpenAI stream ${model}`
    );
    const toolCalls: Map<number, AIToolCall> = new Map();
    let usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

    for await (const chunk of stream as any) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) {
        if (chunk.usage) {
          usage = {
            input_tokens: chunk.usage.prompt_tokens || 0,
            output_tokens: chunk.usage.completion_tokens || 0,
            total_tokens: chunk.usage.total_tokens || 0,
          };
        }
        continue;
      }

      // Text content
      if (delta.content) {
        yield { type: 'text_delta', content: delta.content };
      }

      // Tool calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (tc.id) {
            // New tool call starting
            const toolCall: AIToolCall = {
              id: tc.id,
              type: 'function',
              function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' },
            };
            toolCalls.set(idx, toolCall);
            yield { type: 'tool_call_start', tool_call: toolCall, tool_call_index: idx };
          } else {
            // Continuing tool call (argument streaming)
            const existing = toolCalls.get(idx);
            if (existing && tc.function?.arguments) {
              existing.function.arguments += tc.function.arguments;
              yield { type: 'tool_call_delta', tool_call: existing, tool_call_index: idx, content: tc.function.arguments };
            }
          }
        }
      }

      // Finish
      if (chunk.choices?.[0]?.finish_reason) {
        for (const [idx, tc] of toolCalls) {
          yield { type: 'tool_call_end', tool_call: tc, tool_call_index: idx };
        }
      }
    }

    yield { type: 'done', model, provider: 'openai', usage };
  }

  // ─── Anthropic Provider ────────────────────────────────────────────────────

  private async completeAnthropic(messages: AIMessage[], model: string, options: AICompletionOptions): Promise<AICompletionResult> {
    if (!this.anthropic) throw new Error('Anthropic not configured');

    const heliconeHeaders = this.buildHeliconeHeaders(options);

    // Separate system message from conversation
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const convMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => this.toAnthropicMessage(m));

    const params: any = {
      model,
      system: systemMsg,
      messages: convMessages,
      max_tokens: options.max_tokens ?? 4096,
      temperature: options.temperature ?? 0.7,
    };

    if (options.tools?.length) {
      params.tools = options.tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    const reqOpts = Object.keys(heliconeHeaders).length > 0 ? { headers: heliconeHeaders } : undefined;
    const response = await withRetry(
      () => this.anthropic!.messages.create(params, reqOpts as any),
      `Anthropic ${model}`
    );

    let content = '';
    const toolCalls: AIToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    return {
      content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      model,
      provider: 'anthropic',
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      estimated_cost_usd: estimateCost(model, response.usage.input_tokens, response.usage.output_tokens),
    };
  }

  private async *streamAnthropic(messages: AIMessage[], model: string, options: AICompletionOptions): AsyncGenerator<StreamEvent> {
    if (!this.anthropic) throw new Error('Anthropic not configured');

    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const convMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => this.toAnthropicMessage(m));

    const params: any = {
      model,
      system: systemMsg,
      messages: convMessages,
      max_tokens: options.max_tokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      stream: true,
    };

    if (options.tools?.length) {
      params.tools = options.tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    // For streaming, retry on rate limit by re-creating the stream
    const stream = await withRetry(
      () => Promise.resolve(this.anthropic!.messages.stream(params)),
      `Anthropic stream ${model}`
    );
    let currentToolCall: AIToolCall | null = null;
    let toolCallArgs = '';
    let usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const block = (event as any).content_block;
        if (block?.type === 'tool_use') {
          currentToolCall = {
            id: block.id,
            type: 'function',
            function: { name: block.name, arguments: '' },
          };
          toolCallArgs = '';
          yield { type: 'tool_call_start', tool_call: currentToolCall };
        }
      } else if (event.type === 'content_block_delta') {
        const delta = (event as any).delta;
        if (delta?.type === 'text_delta') {
          yield { type: 'text_delta', content: delta.text };
        } else if (delta?.type === 'input_json_delta' && currentToolCall) {
          toolCallArgs += delta.partial_json;
          yield { type: 'tool_call_delta', content: delta.partial_json, tool_call: currentToolCall };
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolCall) {
          currentToolCall.function.arguments = toolCallArgs;
          yield { type: 'tool_call_end', tool_call: currentToolCall };
          currentToolCall = null;
        }
      } else if (event.type === 'message_delta') {
        const msgUsage = (event as any).usage;
        if (msgUsage) {
          usage.output_tokens = msgUsage.output_tokens || 0;
        }
      } else if (event.type === 'message_start') {
        const msgUsage = (event as any).message?.usage;
        if (msgUsage) {
          usage.input_tokens = msgUsage.input_tokens || 0;
        }
      }
    }

    usage.total_tokens = usage.input_tokens + usage.output_tokens;
    yield { type: 'done', model, provider: 'anthropic', usage };
  }

  private toAnthropicMessage(msg: AIMessage): any {
    if (msg.role === 'tool') {
      return {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: msg.content,
        }],
      };
    }
    if (msg.role === 'assistant' && msg.tool_calls) {
      const content: any[] = [];
      if (msg.content) content.push({ type: 'text', text: msg.content });
      for (const tc of msg.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || '{}'),
        });
      }
      return { role: 'assistant', content };
    }
    return { role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content };
  }

  // ─── Google Provider ───────────────────────────────────────────────────────

  private async completeGoogle(messages: AIMessage[], model: string, options: AICompletionOptions): Promise<AICompletionResult> {
    if (!this.google) throw new Error('Google AI not configured');

    const genModel = this.google.getGenerativeModel({ model });

    // Convert messages to Google format
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const history = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    // Last message is the user prompt
    const lastMsg = history.pop();
    if (!lastMsg) throw new Error('No user message');

    const chat = genModel.startChat({
      history: history.length > 0 ? history : undefined,
      systemInstruction: systemMsg || undefined,
    });

    const result = await withRetry(
      () => chat.sendMessage(lastMsg.parts[0].text),
      `Google ${model}`
    );
    const response = result.response;
    const text = response.text();
    const usageMeta = response.usageMetadata;

    return {
      content: text,
      model,
      provider: 'google',
      usage: {
        input_tokens: usageMeta?.promptTokenCount || 0,
        output_tokens: usageMeta?.candidatesTokenCount || 0,
        total_tokens: usageMeta?.totalTokenCount || 0,
      },
      estimated_cost_usd: estimateCost(
        model,
        usageMeta?.promptTokenCount || 0,
        usageMeta?.candidatesTokenCount || 0,
      ),
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let instance: AIService | null = null;

export function getAIService(): AIService {
  if (!instance) instance = new AIService();
  return instance;
}

export function resetAIService(): void {
  instance = null;
}
