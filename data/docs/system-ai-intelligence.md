# System: AI Intelligence Layer

> **Auto-generated** | Last refreshed: 2026-02-09 | Health: undefined/100

---

## Overview

The AI Intelligence Layer is DevTrack's core differentiator and intelligence engine — a sophisticated multi-provider AI system that transforms project management from manual data entry into a conversational, intelligent experience. It provides ~50 tools across 21 domain modules, enabling chat-first interaction, automated project analysis, and intelligent documentation generation.

**Key Capabilities:**
- **Multi-turn agent conversations** with streaming responses via Server-Sent Events (SSE)
- **Tool-calling architecture** with 50+ functions spanning roadmap management, codebase analysis, git operations, and documentation
- **Multi-provider support** with automatic model discovery (OpenAI, Anthropic, Google AI)
- **Task-aware routing** that selects optimal models based on task complexity and cost
- **Rate limiting protection** with exponential backoff and preemptive token tracking
- **Cost tracking** via Helicone proxy with custom property enrichment
- **State caching** for efficient context delivery (~2-5K tokens vs 130K+ raw data)
- **Headless agent runner** for automation and background tasks

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chat Interface                            │
│  (ChatSidebar UI → POST /api/v1/ai/chat → SSE streaming)        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                       ChatService                                │
│  • Multi-turn conversation loop (20 iterations max)              │
│  • System prompt injection (user profile, project state)         │
│  • Conversation persistence to data/ai/conversations/            │
│  • Parallel tool execution with result aggregation               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        AIService                                 │
│  • Provider abstraction layer                                    │
│  • Helicone proxy routing (optional)                             │
│  • Rate limiting (retry + preemptive token tracking)             │
│  • Cost estimation and usage tracking                            │
│  • Streaming and non-streaming completions                       │
└─────────────────────────────────────────────────────────────────┘
        ↓                      ↓                      ↓
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   OpenAI     │      │  Anthropic   │      │  Google AI   │
│   SDK        │      │   SDK        │      │    SDK       │
└──────────────┘      └──────────────┘      └──────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      ModelRouter                                 │
│  • Auto-discovery: queries provider APIs for available models    │
│  • Pattern-based classification (opus=premium, sonnet=standard)  │
│  • Task-aware routing with fallback chains                       │
│  • 58+ models discovered across 3 providers                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Tool Registry                                │
│  21 domain modules, 50+ tools:                                   │
│  • Roadmap/backlog (list, create, update, delete items)          │
│  • Epics & milestones (hierarchy management)                     │
│  • Issues (track, create, resolve bugs)                          │
│  • Ideas (capture, explore, promote)                             │
│  • Codebase (scan, search, analyze architecture)                 │
│  • Git (status, diff, log, branches)                             │
│  • Files (read, write, list directories)                         │
│  • Docs (list, get, create, update wiki)                         │
│  • Brain (notes, context recovery, preferences)                  │
│  • Session tracking & velocity metrics                           │
│  • Activity feed, audits, integrations, config, profiles         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Data Layer (Store)                            │
│  JSON files in data/: roadmap, issues, changelog, sessions, etc. │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. ChatService (`server/ai/chat.ts`)

**Purpose:** Orchestrates multi-turn agent conversations with tool calling and streaming.

**Key Features:**
- **Conversation persistence** to `data/ai/conversations/` (JSON files per conversation)
- **System prompt injection** with project state, user profile, recent brain notes
- **Multi-turn agent loop** with parallel tool execution (max 20 iterations)
- **Streaming via SSE** with granular event types (text_delta, tool_call_start, tool_call_progress, etc.)
- **User profile integration** — every chat loads the active user profile into system prompt

**Flow:**
1. User sends message via ChatSidebar UI
2. `POST /api/v1/ai/chat` → ChatService
3. Load or create conversation
4. Build system prompt (project state, user profile, brain notes)
5. Send to AIService → ModelRouter selects model
6. Model responds with text and/or tool calls
7. Execute tool calls in parallel
8. Feed results back to model
9. Repeat until no more tool calls (max 20 iterations)
10. Stream response to UI via SSE

**System Prompt Structure:**
```
You are the dev-track AI assistant...

## Current Status
<project health, systems, roadmap, issues, sessions>

## User Profile
Name: <name> | Role: <role> | Technical level: <1-10>
<custom AI instructions>

## Recent AI Notes
- [observation] <note>
- [suggestion] <note>

## Your Capabilities
<full tool registry documentation>

## Scope & Boundaries
You can READ files, CREATE/UPDATE DevTrack entities, SEARCH code.
You CANNOT edit source code. Create rich issues and hand to Cursor.
```

### 2. AIService (`server/ai/service.ts`)

**Purpose:** Unified interface across OpenAI, Anthropic, and Google AI providers.

**Key Features:**
- **Multi-provider support** with automatic Helicone proxy routing
- **Streaming and non-streaming completions**
- **Tool calling** in OpenAI function-calling format (converted for Anthropic/Google)
- **Usage tracking** and cost estimation
- **Rate limiting** with retry + exponential backoff
- **Graceful degradation** when provider keys are missing

**Rate Limiting (3 layers):**

1. **Exponential Backoff Retry:**
   - `withRetry()` wrapper on all API calls
   - Catches 429 errors, retries 3 times
   - Delays: 5s, 15s, 45s (base × 3^attempt)
   - Respects `Retry-After` headers when available

2. **Preemptive Token Rate Tracking:**
   - `TokenRateTracker` class tracks input tokens per provider
   - 60-second sliding window
   - Known limits: Anthropic 400K/min (50K buffer), OpenAI 800K/min, Google 1M/min
   - Delays requests when approaching limit

3. **Token Estimation:**
   - Rough estimate: 4 characters ≈ 1 token
   - Used for preemptive checks before API calls

**Cost Estimation:**
```typescript
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-5.2':             { input: 3.00, output: 15.00 },
  'claude-opus-4-6':     { input: 15.00, output: 75.00 },
  'claude-sonnet-4-5':   { input: 3.00, output: 15.00 },
  'claude-haiku-4-5':    { input: 1.00, output: 5.00 },
  'gemini-3-pro':        { input: 1.25, output: 5.00 },
  'gemini-3-flash':      { input: 0.15, output: 0.60 },
};
```

**Helicone Enrichment:**
All AI requests include custom properties for tracking:
- **User-Id:** Active user name
- **Properties:** Source (chat/automation), Task, Project, ConversationId, AutomationId, Trigger
- Enables per-user cost tracking, session attribution, automation cost breakdown

### 3. ModelRouter (`server/ai/router.ts`)

**Purpose:** Task-aware model selection with auto-discovery.

**Key Insight:** Model IDs change frequently (especially Anthropic date-stamped versions). Instead of hardcoding IDs, we query provider APIs on startup and classify by pattern.

**Pattern-Based Classification:**
```typescript
// Anthropic patterns (priority = preference within tier)
/claude-opus-4-6/   → premium  (priority 0)
/claude-opus-4-5/   → premium  (priority 1)
/claude-sonnet-4-5/ → standard (priority 0)
/claude-haiku-4/    → budget   (priority 0)

// OpenAI patterns
/gpt-5-pro/         → premium  (priority 0)
/gpt-5\.3/          → premium  (priority 1)
/gpt-5\.2/          → standard (priority 0)
/gpt-4o-mini/       → budget   (priority 0)

// Google patterns
/gemini-3-pro/      → standard (priority 0)
/gemini-3-flash/    → budget   (priority 0)
```

**Task Routing:**
Each task specifies preferred tiers and providers:
```typescript
const TASK_ROUTES: Record<TaskType, TaskRoute> = {
  chat:                { tiers: ['standard', 'premium'],  providers: ['anthropic', 'openai', 'google'] },
  codebase_qa:         { tiers: ['standard', 'premium'],  providers: ['anthropic', 'openai', 'google'] },
  docs_generation:     { tiers: ['standard', 'premium'],  providers: ['anthropic', 'openai', 'google'] },
  project_init:        { tiers: ['premium', 'standard'],  providers: ['anthropic', 'openai', 'google'] },
  deep_audit:          { tiers: ['premium', 'standard'],  providers: ['anthropic', 'openai', 'google'] },
  quick_classification:{ tiers: ['budget', 'standard'],   providers: ['google', 'anthropic', 'openai'] },
  // ... 12 task types total
};
```

**Discovery Process:**
1. On startup, query each provider's API for available models
2. Classify each model by pattern → tier + priority
3. Cache discovered models in memory
4. Route tasks to best available model in preferred tier + provider
5. Fallback to next tier if preferred unavailable

**Result:** 58+ models discovered, resilient to model ID changes, optimal cost/quality routing.

### 4. Tool Registry (`server/ai/tools/`)

**Purpose:** Modular, auto-discovered tool system with 21 domain modules.

**Architecture:**
- Each domain is a separate file exporting a `ToolModule`
- Registry (`tools/index.ts`) imports all modules and builds flat arrays
- Tools follow OpenAI function-calling format
- `executeTool()` routes by name to correct handler

**21 Domain Modules:**

| Module | Tools | Description |
|--------|-------|-------------|
| `backlog.ts` | list, create, update, delete | Roadmap item management |
| `epics.ts` | list, create, update, delete | Epic hierarchy management |
| `milestones.ts` | list, create, update, delete | Milestone management |
| `releases.ts` | list, create, update, publish | Release management |
| `issues.ts` | list, create, update, resolve | Issue tracking |
| `changelog.ts` | list, add_entry | Changelog management |
| `ideas.ts` | list, capture, update | Idea funnel |
| `state.ts` | get_project_state, get_quick_status, update_project_state | Project health |
| `brain.ts` | get_notes, add_note, get/write_context_recovery, get/update_preferences | AI memory |
| `session.ts` | get_session_info, start_session, end_session | Session lifecycle |
| `actions.ts` | list, create, update | Action tracking |
| `codebase.ts` | get_stats, get_modules, search, get_file_details, scan | Codebase analysis |
| `git.ts` | status, diff, log, branches | Git integration |
| `files.ts` | read_project_file, write_project_file, list_directory | File operations |
| `docs.ts` | list, get, create, update, delete | Documentation |
| `metrics.ts` | get_velocity, update_velocity | Metrics and analytics |
| `config.ts` | get/update_project_config, list_registered_projects | Configuration |
| `profiles.ts` | get/update_user_profile, add_session_observation | User profiling |
| `integrations.ts` | get_status, test_integration | Integration management |
| `activity.ts` | list_activity | Activity feed queries |
| `audits.ts` | list_audit_runs, get_audit_run, get_audit_stats | Automation audit logs |

**Adding New Tools:**
1. Create `server/ai/tools/my-domain.ts`:
```typescript
import type { ToolModule } from './types.js';

export const myDomainTools: ToolModule = {
  domain: 'my-domain',
  tools: [
    {
      definition: {
        type: 'function',
        function: {
          name: 'my_tool',
          description: 'What this tool does',
          parameters: {
            type: 'object',
            properties: {
              param: { type: 'string', description: 'Param description' }
            },
            required: ['param']
          }
        }
      },
      label: 'My Tool',
      execute: async (args) => {
        // Implementation
        return JSON.stringify({ result: 'success' });
      }
    }
  ]
};
```

2. Import and add to `MODULES` array in `server/ai/tools/index.ts`
3. That's it — auto-discovered and available to all AI agents

### 5. State Cache (`server/ai/state-cache.ts`)

**Purpose:** Compressed project state summary for efficient AI context delivery.

**Problem:** Raw project data is 130K+ tokens (roadmap, issues, changelog, sessions, systems, docs). Sending this to every AI request is expensive (~$2 per request with Opus).

**Solution:** Pre-built, cached 2-5K token summary that captures essential state:
- Project identity and health
- Systems with health scores
- Current roadmap items (now horizon)
- Open issues by severity
- Recent changelog entries (last 8)
- Session velocity stats
- Doc registry status
- Active session info

**Cache Lifecycle:**
- **TTL:** 30 minutes
- **Storage:** Memory + disk (`data/ai/state-cache.json`)
- **Rebuild triggers:** Stale cache, manual invalidation, automation runs
- **Format:** JSON object + formatted text block for system prompts

**Usage:**
```typescript
import { getStateCache, formatStateCacheForPrompt } from './state-cache.js';

// Get cached state (rebuilds if stale)
const cache = getStateCache();

// Format for AI prompt
const contextBlock = formatStateCacheForPrompt(cache);
// → "## Project State (cached 2026-02-09T01:00:00Z)\n\ndev-track is at 80% health..."
```

**Impact:**
- Reduced context from 130K → 2-5K tokens (95%+ reduction)
- Enables budget models for automations
- Foundation for tiered audit system (IDEA-069)

### 6. Headless Agent Runner (`server/ai/runner.ts`)

**Purpose:** Run AI tasks programmatically without chat UI or SSE streaming.

**Use Cases:**
- Project initialization
- Automation engine tasks
- Documentation generation
- Background analysis

**Key Features:**
- Uses `AIService.complete()` + tool execution loop
- Max iterations configurable (default: 20)
- Tool allowlist support (restrict to subset)
- Audit recording integration
- Custom Helicone properties for tracking
- Configurable max_tokens (default: 4096, increase for doc generation)

**API:**
```typescript
import { runAgent } from './runner.js';

const result = await runAgent(
  systemPrompt,
  userMessage,
  {
    task: 'deep_audit',           // Model routing hint
    maxIterations: 20,            // Max tool-calling loops
    allowedTools: ['list_issues', 'create_issue'], // Optional subset
    model: 'claude-opus-4-5',     // Override routing
    recorder: auditRecorder,      // Capture every step
    heliconeProperties: {         // Custom tracking
      Source: 'automation',
      AutomationId: 'nightly-audit'
    },
    maxTokens: 8192               // For large outputs
  }
);

// Result:
// {
//   content: "Final response",
//   tool_calls_made: [{ name, args, result_preview }],
//   iterations: 8,
//   tokens_used: 45000,
//   cost: 0.82
// }
```

**Difference from ChatService:**
- No conversation persistence
- No streaming
- Returns complete result object
- Designed for automation, not interactive chat

## API Endpoints

### Chat

**POST /api/v1/ai/chat** — Stream a chat message (SSE)
```json
{
  "conversation_id": "chat-123",  // Optional, creates new if null
  "message": "What issues are blocking the roadmap?",
  "model": "claude-sonnet-4-5"    // Optional override
}
```
Response: Server-Sent Events stream
```
event: status
data: {"type":"status","content":"Thinking..."}

event: tool_call_start
data: {"type":"tool_call_start","tool_call":{"id":"call_1","name":"list_issues"}}

event: tool_call_result
data: {"type":"tool_call_result","tool_call":{"id":"call_1","result":"..."}}

event: text_delta
data: {"type":"text_delta","content":"Based on the issues..."}

event: done
data: {"type":"done","usage":{...}}
```

**GET /api/v1/ai/conversations** — List all conversations

**GET /api/v1/ai/conversations/:id** — Get conversation with full message history

**DELETE /api/v1/ai/conversations/:id** — Delete a conversation

### Models & Config

**GET /api/v1/ai/models** — List available models
```json
{
  "ok": true,
  "data": {
    "models": [
      { "id": "claude-opus-4-6", "provider": "anthropic", "tier": "premium", ... },
      { "id": "gpt-5.2", "provider": "openai", "tier": "standard", ... }
    ],
    "configured": true
  }
}
```

**GET /api/v1/ai/config** — Get AI configuration

**PUT /api/v1/ai/config** — Update AI configuration (deep merge)
```json
{
  "providers": {
    "helicone": { "enabled": true }
  },
  "defaults": {
    "temperature": 0.7
  }
}
```

### Credentials

**PUT /api/v1/ai/credentials** — Update provider credentials (write-only)
```json
{
  "openai": "sk-...",
  "anthropic": "sk-ant-...",
  "google": "AIza...",
  "helicone": "sk-helicone-...",
  "helicone_org_id": "org-..."
}
```

**GET /api/v1/ai/credentials** — Get masked credentials (for UI display)
```json
{
  "openai": "sk-proj-1••••••••2abc",
  "has_openai": true,
  "has_anthropic": true,
  "has_helicone": false
}
```

## Configuration

### AI Config (`data/ai/config.json`)

```json
{
  "providers": {
    "helicone": {
      "enabled": true
    }
  },
  "defaults": {
    "temperature": 0.7,
    "max_tokens": 4096
  },
  "budget": {
    "daily_limit_usd": 50.0,
    "alert_threshold_usd": 40.0
  },
  "features": {
    "auto_changelog": true,
    "session_summaries": true
  }
}
```

### Credentials (`.credentials.json`, gitignored)

```json
{
  "ai": {
    "openai": "sk-proj-...",
    "anthropic": "sk-ant-...",
    "google": "AIza...",
    "helicone": "sk-helicone-...",
    "helicone_org_id": "org-..."
  }
}
```

## Key Design Decisions

### 1. Chat-First Architecture
**Decision:** The chat IS the product. Everything else is automation of chat patterns.

**Rationale:** Users want to talk to their project, not fill out forms. The chat interface provides natural language access to all DevTrack capabilities. Automations are just pre-scripted conversations.

**Reference:** Brain note BN-011

### 2. Auto-Discovery Over Hardcoding
**Decision:** Discover models from provider APIs instead of hardcoding IDs.

**Rationale:** Model IDs change frequently (Anthropic date-stamps versions). Hardcoded lists break silently. Auto-discovery is resilient and self-updating.

**Implementation:** Query provider APIs on startup, classify by pattern, cache in memory.

**Reference:** Brain note BN-012

### 3. Modular Tool Registry
**Decision:** Replaced 718-line monolithic switch with 21 domain modules.

**Rationale:** 
- **Maintainability:** Each domain is self-contained
- **Discoverability:** New developers can find tools easily
- **Extensibility:** Add new tools by creating a file and importing
- **Type safety:** Each module exports typed definitions

**Migration:** ISS-016 resolved

### 4. State Cache for Context Efficiency
**Decision:** Pre-build compressed state summaries instead of sending raw data.

**Rationale:**
- Raw data is 130K+ tokens (~$2 per Opus request)
- Most automations don't need full detail
- Cache reduces to 2-5K tokens (95%+ reduction)
- Enables budget models for routine tasks

**Implementation:** CL-085 (session 10)

### 5. User Profile Injection
**Decision:** Every chat session loads the active user profile into system prompt.

**Rationale:** Personalized AI interaction — technical level, role, custom instructions. Enables adaptive responses based on user expertise.

**Storage:** `data/local/profiles.json` (gitignored, personal data)

### 6. Helicone for Cost Tracking
**Decision:** Optional Helicone proxy for all AI requests.

**Rationale:**
- Real-time cost tracking per user, session, automation
- Request logs with full context
- Custom properties for attribution
- No code changes required (proxy-based)

**Configuration:** Enable in AI config, provide credentials

## Current Status

### ✅ Implemented
- Multi-provider support (OpenAI, Anthropic, Google)
- Model auto-discovery and task-aware routing
- Multi-turn chat with tool calling and streaming
- 50+ tools across 21 domains
- Rate limiting (retry + preemptive tracking)
- Cost estimation and Helicone enrichment
- State cache for efficient context
- Headless agent runner for automation
- Conversation persistence
- User profile integration

### 🚧 In Progress
- **Chat agent testing** in browser (ai-chat-agent backlog item)
- **Anthropic prompt caching** (ISS-043) — 0 cache reads despite 130K token prompts
- **Multi-conversation support** — UI currently shows single active chat

### ❌ Missing
- **Conversation bridge** (ISS-012, IDEA-027) — no way to pass Cursor/Claude conversations back to DevTrack
- **Semantic file watcher** (ISS-034) — automations only fire on API changes, not direct file edits
- **Multi-user support** — profiles separated, but no auth/permissions

## Known Issues

### ISS-043: Anthropic Prompt Caching Not Working (HIGH)
**Symptoms:** Helicone shows 0 cache reads on repeated 130K token system prompts. Should be reducing costs by 90%.

**Impact:** Docs generation cost $36 instead of ~$8. Every automation run pays full input token cost.

**Possible Causes:**
1. Helicone proxy may interfere with Anthropic cache headers
2. System prompt changes slightly between iterations
3. Cache requires specific API parameters not being set
4. Helicone may not report cache metrics correctly

**Next Steps:** Test direct Anthropic API (bypass Helicone), verify cache headers, check prompt stability.

### ISS-012: No Conversation Bridge to External AI Tools (HIGH)
**Symptoms:** Conversations in Cursor, Claude, Gemini are invisible to DevTrack. Issues, decisions, ideas discussed there are lost unless manually written to data files.

**Impact:** Root cause of ISS-006 (AI context drift). Tracking AI and coding AI are separate systems with no bridge.

**Solution:** Extension/CLI that captures external AI conversations and syncs to DevTrack. See IDEA-027.

**Estimate:** 2-3 sessions, L-XL size. Should not start until chat agent is validated.

### ISS-034: File Watcher Only Fires Generic Triggers (CRITICAL)
**Symptoms:** Direct file edits (Cursor, manual JSON) only fire `file_changed` trigger, not semantic triggers like `session_ended` or `issue_created`.

**Impact:** Automations only work when changes go through API routes. Session 8 was closed by editing JSON directly — session-end-audit never fired.

**Solution:** Semantic file watcher that diffs entity state before/after changes and fires typed triggers. Makes automation code-path-independent.

### ISS-006: AI Context Drift (HIGH)
**Symptoms:** Coding AI doesn't reliably follow dev-track rules. Shipped 7 features without writing changelog entries.

**Root Cause:** Passive text instructions are unreliable. Automation engine exists but hasn't been tested end-to-end.

**Mitigation:** Partial (frontmatter, checklist, create-before-fix discipline). Structural fix is automation pipeline + conversation bridge (ISS-012).

## Performance & Cost

### Token Usage (typical chat session)
- **System prompt:** 2-5K tokens (with state cache) or 130K tokens (raw data)
- **User message:** 50-500 tokens
- **Tool results:** 1-10K tokens per tool call
- **Assistant response:** 500-2K tokens

**Total per message:** ~5-20K tokens with cache, ~135-150K without

### Cost Estimates (per 1M tokens)

| Model | Input | Output | Use Case |
|-------|-------|--------|----------|
| Claude Opus 4.6 | $15.00 | $75.00 | Deep analysis, project init |
| Claude Sonnet 4.5 | $3.00 | $15.00 | Chat, docs, standard tasks |
| Claude Haiku 4.5 | $1.00 | $5.00 | Quick classification, summaries |
| GPT-5.2 | $3.00 | $15.00 | Alternative to Sonnet |
| GPT-4o Mini | $0.15 | $0.60 | Budget tasks |
| Gemini 3 Flash | $0.15 | $0.60 | Budget tasks |

### Real-World Costs (Session 10)
- **Docs initialization:** $36 (17 requests, 130K system prompt × 17 = 2.2M input tokens)
- **With prompt caching:** ~$8 (90% cache hit rate on system prompt)
- **Typical chat message:** $0.01-0.05 (with state cache)
- **Automation run:** $0.10-0.50 (depends on task complexity)

### Rate Limits
- **Anthropic:** 450K tokens/min (400K enforced with 50K buffer)
- **OpenAI:** 800K tokens/min
- **Google:** 1M tokens/min

**Protection:** Preemptive delays when approaching limits + exponential backoff on 429 errors.

## Future Improvements

### 1. Prompt Caching (ISS-043)
Fix Anthropic prompt caching to reduce costs by 90% on repeated context. Investigate Helicone proxy interference.

### 2. Conversation Bridge (ISS-012, IDEA-027)
Build extension/CLI to capture external AI conversations (Cursor, Claude, Gemini) and sync to DevTrack. Transforms DevTrack from manual tracking to intelligent observer.

**Estimate:** 2-3 sessions, L-XL size

### 3. Semantic File Watcher (ISS-034)
Diff entity state before/after file changes to fire typed triggers. Makes automations work regardless of change source (API, Cursor, manual edit).

### 4. Tiered Audit System (IDEA-069)
- **Quick scan:** Budget model, state cache, 5 iterations → daily
- **Deep audit:** Premium model, full context, 20 iterations → weekly
- **Targeted analysis:** On-demand, specific subsystem

### 5. Multi-User Support
- Auth/permissions layer
- Per-user conversation history
- Team collaboration features
- Shared vs personal data separation (already started in CL-082)

### 6. Model Fine-Tuning
Train custom models on DevTrack patterns:
- Issue triage and classification
- Changelog generation
- Code-to-roadmap-item mapping
- Automated test generation

## Code Examples

### Using ChatService
```typescript
import { runChat } from './ai/chat.js';

// Stream a chat message
const generator = runChat(
  'chat-123',                          // conversation_id (null = new)
  'What issues are blocking v0.3?',   // user message
  'claude-sonnet-4-5'                  // optional model override
);

for await (const event of generator) {
  if (event.type === 'text_delta') {
    process.stdout.write(event.content);
  } else if (event.type === 'tool_call_start') {
    console.log(`\nCalling: ${event.tool_call?.name}`);
  }
}
```

### Using Headless Agent Runner
```typescript
import { runAgent } from './ai/runner.js';
import { formatStateCacheForPrompt } from './ai/state-cache.js';

const systemPrompt = `You are a nightly audit agent.
${formatStateCacheForPrompt()}

Analyze the project state and identify:
1. Stale roadmap items (no updates in 7+ days)
2. Issues that should be closed
3. Missing changelog entries
`;

const result = await runAgent(
  systemPrompt,
  'Run nightly audit',
  {
    task: 'deep_audit',
    maxIterations: 15,
    allowedTools: ['list_backlog', 'list_issues', 'list_changelog', 'add_brain_note'],
    heliconeProperties: {
      Source: 'automation',
      AutomationId: 'nightly-audit',
      Trigger: 'scheduled'
    }
  }
);

console.log(`Audit complete: ${result.iterations} iterations, ${result.cost.toFixed(2)} USD`);
```

### Adding a Custom Tool
```typescript
// server/ai/tools/my-analysis.ts
import type { ToolModule } from './types.js';
import { getStore } from '../../store.js';

export const myAnalysisTools: ToolModule = {
  domain: 'analysis',
  tools: [
    {
      definition: {
        type: 'function',
        function: {
          name: 'analyze_velocity_trends',
          description: 'Analyze velocity trends over the last N sessions',
          parameters: {
            type: 'object',
            properties: {
              session_count: {
                type: 'number',
                description: 'Number of recent sessions to analyze'
              }
            },
            required: ['session_count']
          }
        }
      },
      label: 'Analyze Velocity Trends',
      execute: async ({ session_count }) => {
        const store = getStore();
        const sessions = store.velocity?.sessions.slice(-session_count) || [];
        
        const avgItems = sessions.reduce((sum, s) => sum + s.items_shipped, 0) / sessions.length;
        const avgPoints = sessions.reduce((sum, s) => sum + s.points, 0) / sessions.length;
        
        return JSON.stringify({
          sessions_analyzed: sessions.length,
          avg_items_per_session: avgItems.toFixed(1),
          avg_points_per_session: avgPoints.toFixed(1),
          trend: avgItems > 10 ? 'increasing' : 'stable'
        }, null, 2);
      }
    }
  ]
};
```

Then import and add to `MODULES` in `server/ai/tools/index.ts`:
```typescript
import { myAnalysisTools } from './my-analysis.js';

const MODULES: ToolModule[] = [
  // ... existing modules
  myAnalysisTools,
];
```

## Related Documentation

- **[System: Data Layer](system-data-layer)** — JSON storage backing all AI tools
- **[System: Server (Hono API)](system-server)** — HTTP endpoints for AI chat and config
- **[Automation Engine](automation-engine)** — Uses headless agent runner for scheduled tasks
- **[User Profiles](user-profiles)** — Injected into chat system prompts
- **[Helicone Integration](integration-helicone)** — Cost tracking and request logging

## Dependencies

**External:**
- `openai` — OpenAI SDK
- `@anthropic-ai/sdk` — Anthropic SDK
- `@google/generative-ai` — Google AI SDK

**Internal:**
- `server/store.js` — Data layer access
- `server/project-config.js` — Project paths and config
- `server/automation/engine.ts` — Automation execution
- `server/automation/recorder.ts` — Audit logging

## Testing

### Manual Testing
1. Configure credentials in `.credentials.json`
2. Start server: `npm run dev`
3. Open browser to http://localhost:5173
4. Click chat icon in sidebar
5. Send message: "List all open issues"
6. Verify tool calls execute and response streams

### Integration Testing
```bash
# Test model discovery
curl http://localhost:3000/api/v1/ai/models

# Test chat (SSE)
curl -N -H "Content-Type: application/json" \
  -d '{"message":"What is the project health?"}' \
  http://localhost:3000/api/v1/ai/chat

# Test headless runner (via automation)
curl -X POST http://localhost:3000/api/v1/automations/nightly-audit/fire \
  -H "Content-Type: application/json" \
  -d '{"force":true}'
```

### Cost Monitoring
Check Helicone dashboard for:
- Cost per user
- Cost per automation
- Token usage trends
- Cache hit rates (should be 90%+ with prompt caching)

---

**Last updated:** 2026-02-09 (Session 10)  
**Status:** Core functionality complete, chat agent testing in progress  
**Health:** undefined/100  
**Owner:** AI team