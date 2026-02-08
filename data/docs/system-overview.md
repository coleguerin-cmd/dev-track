# System Architecture Overview

> **DevTrack** is an AI-native project intelligence system built for the human + AI development pair. It combines project management, codebase analysis, AI-powered automation, and real-time monitoring into a single local-first tool.

---

## What is DevTrack?

DevTrack is a local-first project management and intelligence platform that sits alongside your coding AI (Cursor, Claude, Copilot, etc.) and acts as the "memory" and "project manager" for your development workflow. Instead of relying on the coding AI to track what it's building, DevTrack independently monitors your project, maintains a living knowledge base, and uses its own AI agents to keep everything up to date.

Think of it as **Linear + Notion + an AI project manager**, all running locally on your machine, deeply integrated with your codebase.

### Key Differentiators

- **AI-Native**: Not a traditional PM tool with AI bolted on — AI is the core product. ~40 tools across 16 domains give the AI full CRUD access to every entity.
- **Local-First**: All data lives in JSON files in your project's `data/` directory. No cloud dependency. Git-committable project state.
- **Chat-First Architecture**: The primary interface is an AI chat agent that can investigate bugs, create issues, manage the roadmap, and hand off work to your coding AI.
- **Multi-Provider AI**: Supports OpenAI, Anthropic, and Google AI with automatic model discovery (58+ models), task-aware routing, and Helicone proxy integration.
- **Self-Healing**: Automation engine with scheduled and event-driven AI agents that audit data freshness, detect stale sessions, and maintain consistency.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER / DEVELOPER                         │
│                                                                 │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│   │  Web UI       │    │  CLI         │    │  Cursor/IDE  │     │
│   │  (React)      │    │  (TypeScript)│    │  (External)  │     │
│   │  Port 24681   │    │              │    │              │     │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘     │
│          │                   │                   │              │
└──────────┼───────────────────┼───────────────────┼──────────────┘
           │                   │                   │
           ▼                   ▼                   │
┌──────────────────────────────────────────┐       │
│         HONO API SERVER (Port 24680)     │       │
│                                          │       │
│  ┌────────────────────────────────────┐  │       │
│  │     22 Route Files (REST API)      │  │       │
│  │  roadmap, epics, milestones,       │  │       │
│  │  releases, systems, issues,        │  │       │
│  │  ideas, changelog, session,        │  │       │
│  │  ai, docs, automations, audits,    │  │       │
│  │  codebase, git, integrations...    │  │       │
│  └────────────┬───────────────────────┘  │       │
│               │                          │       │
│  ┌────────────▼───────────────────────┐  │       │
│  │        AI INTELLIGENCE LAYER       │  │       │
│  │                                    │  │       │
│  │  AIService ──► ModelRouter         │  │       │
│  │      │           │                 │  │       │
│  │      ▼           ▼                 │  │       │
│  │  OpenAI    Anthropic    Google     │  │       │
│  │      │           │         │       │  │       │
│  │      └─────┬─────┘─────────┘       │  │       │
│  │            ▼                       │  │       │
│  │    Helicone Proxy (optional)       │  │       │
│  │                                    │  │       │
│  │  ChatService (SSE streaming)       │  │       │
│  │  Headless Runner (programmatic)    │  │       │
│  │  ~40 Tools across 16 modules       │  │       │
│  └────────────────────────────────────┘  │       │
│                                          │       │
│  ┌────────────────────────────────────┐  │       │
│  │      AUTOMATION ENGINE             │  │       │
│  │  Scheduler (60s cron)              │  │       │
│  │  Trigger evaluator                 │  │       │
│  │  AuditRecorder                     │  │       │
│  │  5 built-in automations            │  │       │
│  └────────────────────────────────────┘  │       │
│                                          │       │
│  ┌────────────────────────────────────┐  │       │
│  │      DATA LAYER (Store)            │  │       │
│  │  14 entity types                   │  │       │
│  │  JSON file persistence             │  │       │
│  │  File watcher (chokidar)           │◄─┼───────┘
│  │  WebSocket broadcast               │  │  (file changes)
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │      INTEGRATIONS                  │  │
│  │  GitHub, Helicone, Vercel,         │  │
│  │  Supabase, Sentry, Cloudflare,    │  │
│  │  AWS EC2, Upstash                  │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│         FILE SYSTEM (data/)              │
│                                          │
│  data/                                   │
│  ├── roadmap/     (items, epics,         │
│  │                 milestones, releases)  │
│  ├── systems/     (systems.json)         │
│  ├── issues/      (items.json)           │
│  ├── ideas/       (items.json)           │
│  ├── changelog/   (entries.json)         │
│  ├── session/     (log.json)             │
│  ├── activity/    (feed.json)            │
│  ├── brain/       (notes, prefs,         │
│  │                 context-recovery)      │
│  ├── ai/          (config, conversations)│
│  ├── automations/ (automations.json,     │
│  │                 audit runs)            │
│  ├── docs/        (registry + .md files) │
│  ├── metrics/     (velocity.json)        │
│  ├── labels/      (labels.json)          │
│  ├── local/       (profiles - gitignored)│
│  └── codebase/    (scan results)         │
│                                          │
│  ~/.dev-track/    (global registry)      │
└──────────────────────────────────────────┘
```

---

## System Components (11 Systems)

DevTrack is composed of 11 interconnected systems, each with its own health score and status:

| System | Health | Status | Tech Stack | Description |
|--------|--------|--------|------------|-------------|
| **Server (Hono API)** | 87/100 | ✅ Healthy | Hono, TypeScript, Node.js | 22+ route files, WebSocket, file watcher, multi-project hot-swap |
| **Web UI** | 70/100 | ✅ Healthy | React, Vite, Tailwind | 13+ views, AI chat sidebar, notification tray, project switcher |
| **AI Intelligence** | 65/100 | ✅ Healthy | OpenAI, Anthropic, Google | Multi-provider service, model router, ~40 tools, SSE streaming |
| **Data Layer** | 90/100 | ✅ Healthy | TypeScript, JSON | 14 entity types, ~500 lines of shared types, file-based persistence |
| **Session Tracking** | 80/100 | ✅ Healthy | TypeScript | Session lifecycle, velocity metrics, session observations |
| **AI Brain** | 78/100 | ✅ Healthy | TypeScript, JSON | Brain notes, preferences, context recovery, user profiles |
| **Codebase Visualizer** | 75/100 | ✅ Healthy | React, react-flow, dagre | Interactive architecture graph with 3 views |
| **Codebase Scanner** | 73/100 | ✅ Healthy | TypeScript | Module inference, description generation, auto-discovery |
| **Cursor Rule** | 62/100 | ⚠️ Degraded | — | AI context injection, session lifecycle instructions |
| **CLI** | 48/100 | ⚠️ Degraded | TypeScript, Node.js | Command set for init, start, status, projects |
| **Integrations** | 42/100 | ⚠️ Degraded | TypeScript | 8 plugins, only GitHub confirmed working |

---

## Data Flow

### 1. User Interaction Flow
```
User types in Web UI → React component → API Client (fetch) → Hono Route
→ Store (read/write JSON) → File System → File Watcher detects change
→ WebSocket broadcast → All connected clients update
```

### 2. AI Chat Flow
```
User message → POST /api/v1/ai/chat (SSE) → ChatService
→ Build system prompt (inject user profile, project state)
→ AIService.stream() → ModelRouter selects model
→ Provider API (OpenAI/Anthropic/Google via Helicone)
→ Stream response with tool calls
→ executeTool() for each tool call → Store mutations
→ SSE events back to client (text_delta, tool_call_start, tool_call_result, done)
```

### 3. Automation Flow
```
Trigger event (file change, session end, schedule)
→ AutomationEngine.fire() → Check kill switch, budget, cooldown
→ Find matching automations → Build AI prompt with context
→ runAgent() (headless) → AI makes tool calls
→ AuditRecorder captures every step
→ Save audit run to data/automations/audits/
→ Broadcast completion via WebSocket
```

### 4. Codebase Scan Flow
```
POST /api/v1/codebase/scan → scanCodebase()
→ Walk project directory (respecting ignores)
→ Parse TypeScript/JavaScript files for exports, imports, functions
→ Infer modules from directory structure
→ generateModuleDescription() for each module
→ generateEdgeLabel() for each dependency
→ Save to data/codebase/analysis.json
→ Serve to react-flow graph in UI
```

---

## Entity Model (v2)

DevTrack manages **14 entity types** defined in `shared/types.ts` (~500 lines):

1. **Ideas** — Captured concepts with pros, cons, open questions. Status: captured → exploring → validated → promoted → dismissed
2. **Roadmap Items** — Features/tasks with horizons (now/next/later/shipped), priorities (P0-P3), sizes (S/M/L/XL)
3. **Epics** — Strategic groupings of roadmap items with progress tracking
4. **Milestones** — Time-bound delivery targets with version numbers
5. **Releases** — Versioned bundles of shipped work with release notes
6. **Issues** — Bugs and problems with severity, root cause analysis, resolution tracking
7. **Systems** — Architecture components with AI-assessed health scores
8. **Changelog** — Detailed record of completed work
9. **Sessions** — Development sessions with objectives, velocity, retrospectives
10. **Docs** — Wiki pages with auto-generation support
11. **Activity Feed** — Timeline of all events with actor attribution
12. **Labels** — Color-coded tags for cross-entity categorization
13. **Automations** — Trigger-based AI-driven tasks
14. **Brain** — AI memory (notes, preferences, context recovery, user profiles)

See [Data Model Reference](data-model-reference) for complete field definitions.

---

## Codebase Statistics

| Metric | Value |
|--------|-------|
| Total Files | 96 |
| Total Lines | 19,107 |
| Functions | 49 |
| React Components | 28 |
| API Routes | 22 |
| Pages/Views | 13 |
| External Services | 8 |
| AI Tool Modules | 16 |
| AI Tools | ~40 |

---

## Key Design Decisions

1. **JSON over Database**: All data stored as JSON files for simplicity, git-committability, and AI readability. No database dependency.
2. **Chat-First Architecture**: The AI chat agent is the primary product — not just a feature. All 14 entity types are accessible through natural language.
3. **Multi-Provider AI**: Direct SDK integration with OpenAI, Anthropic, and Google (not LiteLLM) for maximum control over streaming, tool calling, and error handling.
4. **Local-First**: No cloud dependency for core functionality. Helicone is optional for cost tracking.
5. **Structural Enforcement over Behavioral Instructions**: Instead of telling the coding AI to track changes (unreliable), DevTrack uses its own automation engine to detect and record changes independently.
6. **NOT Open Source**: DevTrack is a paid product. Free tier: 1 project, 50 AI calls/day. Pro: $25-40/seat/mo.

---

## Project Health

- **Overall Health**: 80/100
- **Items Shipped**: 111 across 9 sessions
- **Story Points**: 362
- **Average Velocity**: 12.3 items/session, 40.2 points/session
- **Open Issues**: 5 (1 critical, 2 high, 2 low)
- **Active Epics**: 4 (AI Intelligence, Automation, UI &amp; Views, Codebase Intelligence)
- **Completed Epics**: 2 (Entity Model v2, Automation Audits)

---

## Related Documentation

- [Getting Started Guide](getting-started) — How to install, configure, and run DevTrack
- [API Reference](api-reference) — Complete REST API documentation
- [Data Model Reference](data-model-reference) — All 14 entity types with field definitions
- [System: Server](system-server) — Hono API server deep dive
- [System: Web UI](system-web-ui) — React frontend architecture
- [System: AI Intelligence](system-ai-intelligence) — Multi-provider AI layer
- [System: Data Layer](system-data-layer) — JSON persistence and store
- [System: Integrations](system-integrations) — Plugin system for external services
