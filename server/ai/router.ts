/**
 * ModelRouter — Task-aware model selection with AUTO-DISCOVERY.
 * 
 * Instead of hardcoding model IDs (which change constantly, especially Anthropic),
 * we query each provider's API on startup to get actual available models,
 * then match them to task tiers by pattern (opus = premium, sonnet = standard, etc.).
 * 
 * Refreshes on demand or when credentials change.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// ─── Task Types ──────────────────────────────────────────────────────────────

export type TaskType =
  | 'chat'
  | 'codebase_qa'
  | 'change_analysis'
  | 'changelog_update'
  | 'module_description'
  | 'docs_generation'
  | 'quick_classification'
  | 'context_generation'
  | 'dashboard_insights'
  | 'project_init'
  | 'deep_audit'
  | 'incremental_update'
  | 'doc_generation';

export type ModelTier = 'premium' | 'standard' | 'budget';

// ─── Model Info ──────────────────────────────────────────────────────────────

export interface ModelInfo {
  id: string;
  provider: 'openai' | 'anthropic' | 'google';
  tier: ModelTier;
  name: string;           // Human-friendly name
  costPer1kInput: number;
  costPer1kOutput: number;
}

// ─── Pattern-Based Tier Classification ───────────────────────────────────────
// Instead of hardcoding exact model IDs, we classify by pattern.
// This survives model name changes (e.g., claude-sonnet-4-5-20250929 vs 20250514).

interface TierPattern {
  pattern: RegExp;
  tier: ModelTier;
  friendlyName: string;
  costPer1kInput: number;
  costPer1kOutput: number;
  priority: number;  // Lower = preferred within tier
}

const ANTHROPIC_PATTERNS: TierPattern[] = [
  { pattern: /claude-opus-4-6/,   tier: 'premium',  friendlyName: 'Claude Opus 4.6',   costPer1kInput: 0.015, costPer1kOutput: 0.075, priority: 0 },
  { pattern: /claude-opus-4-5/,   tier: 'premium',  friendlyName: 'Claude Opus 4.5',   costPer1kInput: 0.015, costPer1kOutput: 0.075, priority: 1 },
  { pattern: /claude-opus-4-1/,   tier: 'premium',  friendlyName: 'Claude Opus 4.1',   costPer1kInput: 0.015, costPer1kOutput: 0.075, priority: 2 },
  { pattern: /claude-opus-4(?![\d.-])/,    tier: 'premium',  friendlyName: 'Claude Opus 4',   costPer1kInput: 0.015, costPer1kOutput: 0.075, priority: 3 },
  { pattern: /claude-sonnet-4-5/, tier: 'standard', friendlyName: 'Claude Sonnet 4.5', costPer1kInput: 0.003, costPer1kOutput: 0.015, priority: 0 },
  { pattern: /claude-sonnet-4/,   tier: 'standard', friendlyName: 'Claude Sonnet 4',   costPer1kInput: 0.003, costPer1kOutput: 0.015, priority: 1 },
  { pattern: /claude-haiku-4/,    tier: 'budget',   friendlyName: 'Claude Haiku 4.5',  costPer1kInput: 0.001, costPer1kOutput: 0.005, priority: 0 },
  { pattern: /claude-3-haiku/,    tier: 'budget',   friendlyName: 'Claude Haiku 3',    costPer1kInput: 0.0008, costPer1kOutput: 0.004, priority: 1 },
];

const OPENAI_PATTERNS: TierPattern[] = [
  { pattern: /gpt-5-pro/,     tier: 'premium',  friendlyName: 'GPT-5 Pro',      costPer1kInput: 0.015, costPer1kOutput: 0.060, priority: 0 },
  { pattern: /gpt-5\.3/,      tier: 'premium',  friendlyName: 'GPT-5.3 Codex',  costPer1kInput: 0.003, costPer1kOutput: 0.015, priority: 1 },
  { pattern: /gpt-5\.2/,      tier: 'standard', friendlyName: 'GPT-5.2',        costPer1kInput: 0.003, costPer1kOutput: 0.015, priority: 0 },
  { pattern: /gpt-5\.1/,      tier: 'standard', friendlyName: 'GPT-5.1',        costPer1kInput: 0.003, costPer1kOutput: 0.015, priority: 1 },
  { pattern: /gpt-5(?![\d.])/,tier: 'standard', friendlyName: 'GPT-5',          costPer1kInput: 0.003, costPer1kOutput: 0.015, priority: 2 },
  { pattern: /gpt-4o-mini/,   tier: 'budget',   friendlyName: 'GPT-4o Mini',    costPer1kInput: 0.00015, costPer1kOutput: 0.0006, priority: 0 },
  { pattern: /gpt-4o/,        tier: 'standard', friendlyName: 'GPT-4o',         costPer1kInput: 0.005, costPer1kOutput: 0.015, priority: 3 },
];

const GOOGLE_PATTERNS: TierPattern[] = [
  { pattern: /gemini-3-pro/,   tier: 'standard', friendlyName: 'Gemini 3 Pro',   costPer1kInput: 0.00125, costPer1kOutput: 0.005, priority: 0 },
  { pattern: /gemini-3-flash/, tier: 'budget',   friendlyName: 'Gemini 3 Flash', costPer1kInput: 0.00015, costPer1kOutput: 0.0006, priority: 0 },
  { pattern: /gemini-2.*pro/,  tier: 'standard', friendlyName: 'Gemini 2 Pro',   costPer1kInput: 0.00125, costPer1kOutput: 0.005, priority: 1 },
  { pattern: /gemini-2.*flash/,tier: 'budget',   friendlyName: 'Gemini 2 Flash', costPer1kInput: 0.00015, costPer1kOutput: 0.0006, priority: 1 },
];

function classifyModel(id: string, provider: 'openai' | 'anthropic' | 'google'): ModelInfo | null {
  const patterns = provider === 'anthropic' ? ANTHROPIC_PATTERNS
    : provider === 'openai' ? OPENAI_PATTERNS
    : GOOGLE_PATTERNS;

  for (const p of patterns) {
    if (p.pattern.test(id)) {
      return {
        id,
        provider,
        tier: p.tier,
        name: p.friendlyName,
        costPer1kInput: p.costPer1kInput,
        costPer1kOutput: p.costPer1kOutput,
      };
    }
  }
  return null;
}

// ─── Task Routing ────────────────────────────────────────────────────────────
// Each task specifies preferred tiers (in order) and preferred providers

interface TaskRoute {
  tiers: ModelTier[];         // Preferred tiers in order
  providers: string[];        // Preferred providers in order
}

const TASK_ROUTES: Record<TaskType, TaskRoute> = {
  chat:                 { tiers: ['standard', 'premium'],  providers: ['anthropic', 'openai', 'google'] },
  codebase_qa:          { tiers: ['standard', 'premium'],  providers: ['anthropic', 'openai', 'google'] },
  change_analysis:      { tiers: ['standard', 'budget'],   providers: ['openai', 'anthropic', 'google'] },
  changelog_update:     { tiers: ['budget', 'standard'],   providers: ['anthropic', 'google', 'openai'] },
  module_description:   { tiers: ['standard', 'premium'],  providers: ['anthropic', 'openai', 'google'] },
  docs_generation:      { tiers: ['standard', 'premium'],  providers: ['anthropic', 'openai', 'google'] },
  quick_classification: { tiers: ['budget', 'standard'],   providers: ['google', 'anthropic', 'openai'] },
  context_generation:   { tiers: ['budget', 'standard'],   providers: ['anthropic', 'google', 'openai'] },
  dashboard_insights:   { tiers: ['budget', 'standard'],   providers: ['anthropic', 'google', 'openai'] },
  // Premium-first tasks for automation + init (depth over cost)
  project_init:         { tiers: ['premium', 'standard'],  providers: ['anthropic', 'openai', 'google'] },
  deep_audit:           { tiers: ['premium', 'standard'],  providers: ['anthropic', 'openai', 'google'] },
  doc_generation:       { tiers: ['premium', 'standard'],  providers: ['anthropic', 'openai', 'google'] },
  incremental_update:   { tiers: ['standard', 'budget'],   providers: ['anthropic', 'openai', 'google'] },
};

// ─── Router ──────────────────────────────────────────────────────────────────

export class ModelRouter {
  private config: any;
  private availableProviders: Set<string>;
  private discoveredModels: ModelInfo[] = [];
  private lastDiscovery: number = 0;

  constructor(config: any, availableProviders: Set<string>) {
    this.config = config;
    this.availableProviders = availableProviders;
  }

  /** Discover models from provider APIs. Call on startup + when keys change. */
  async discoverModels(clients: {
    openai?: OpenAI;
    anthropic?: Anthropic;
    googleApiKey?: string;
  }): Promise<ModelInfo[]> {
    const models: ModelInfo[] = [];
    const promises: Promise<void>[] = [];

    // Anthropic — has a clean models.list() API
    if (clients.anthropic) {
      promises.push(
        clients.anthropic.models.list({ limit: 30 })
          .then(response => {
            for (const m of response.data) {
              const info = classifyModel(m.id, 'anthropic');
              if (info) models.push(info);
            }
          })
          .catch(err => console.warn('[ai-router] Failed to discover Anthropic models:', err.message))
      );
    }

    // OpenAI — models.list() returns many models, filter to chat-capable
    if (clients.openai) {
      promises.push(
        clients.openai.models.list()
          .then(response => {
            for (const m of response.data) {
              // Only include GPT models (skip embeddings, whisper, dall-e, etc.)
              if (m.id.startsWith('gpt-')) {
                const info = classifyModel(m.id, 'openai');
                if (info) models.push(info);
              }
            }
          })
          .catch(err => console.warn('[ai-router] Failed to discover OpenAI models:', err.message))
      );
    }

    // Google — hardcode known models for now (their list API is different)
    if (clients.googleApiKey) {
      for (const id of ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro-preview-06-05', 'gemini-2.5-flash-preview-05-20']) {
        const info = classifyModel(id, 'google');
        if (info) models.push(info);
      }
    }

    await Promise.all(promises);

    // Sort: within each tier, by priority (from pattern match order)
    this.discoveredModels = models;
    this.lastDiscovery = Date.now();

    console.log(`[ai-router] Discovered ${models.length} models: ${models.map(m => m.id).join(', ')}`);
    return models;
  }

  /** Route a task to the best available model */
  route(task: TaskType): string {
    // Check for feature-level model override
    const featureConfig = this.config.features?.[task];
    if (featureConfig?.model_override) {
      return featureConfig.model_override;
    }

    // Check for default overrides in config
    const defaults = this.config.defaults || {};
    if (task === 'chat' && defaults.chat_model) {
      // Verify the model exists in discovered models
      if (this.discoveredModels.find(m => m.id === defaults.chat_model)) {
        return defaults.chat_model;
      }
    }

    // Find best model by task preferences
    const route = TASK_ROUTES[task] || TASK_ROUTES.chat;

    for (const tier of route.tiers) {
      for (const provider of route.providers) {
        if (!this.availableProviders.has(provider)) continue;
        const candidates = this.discoveredModels
          .filter(m => m.tier === tier && m.provider === provider);
        if (candidates.length > 0) {
          return candidates[0].id; // First match (highest priority from pattern ordering)
        }
      }
    }

    // Fallback — any available model
    if (this.discoveredModels.length > 0) {
      return this.discoveredModels[0].id;
    }

    throw new Error('No AI models available. Add API keys in Settings → AI.');
  }

  /** Get all discovered models */
  getAvailableModels(): ModelInfo[] {
    return this.discoveredModels;
  }

  /** Get models by tier */
  getModelsByTier(tier: ModelTier): ModelInfo[] {
    return this.discoveredModels.filter(m => m.tier === tier);
  }

  /** Check if models have been discovered */
  isDiscovered(): boolean {
    return this.discoveredModels.length > 0;
  }

  /** Get time since last discovery */
  getDiscoveryAge(): number {
    return Date.now() - this.lastDiscovery;
  }

  /** Update available providers */
  updateProviders(providers: Set<string>) {
    this.availableProviders = providers;
  }
}
