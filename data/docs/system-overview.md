# System Architecture Overview

> **DevTrack** is an AI-native project intelligence system built for the human + AI development pair. It combines project management, codebase analysis, AI-powered automation, and real-time monitoring into a single local-first tool.

---

## What is DevTrack?

DevTrack is a local-first project management and intelligence platform that sits alongside your coding AI (Cursor, Claude, Copilot, etc.) and acts as the "memory" and "project manager" for your development workflow. Instead of relying on the coding AI to track what it's building, DevTrack independently monitors your project, maintains a living knowledge base, and uses its own AI agents to keep everything up to date.

Think of it as **Linear + Notion + an AI project manager**, all running locally on your machine, deeply integrated with your codebase.

### Key Differentiators

| Feature | Description |
|---------|-------------|
| **AI-Native** | Not a traditional PM tool with AI bolted on — AI is the core product. ~40 tools across 16 domains give the AI full CRUD access to every entity. |
| **Local-First** | All data lives in JSON files in your project's `data/` directory. No cloud dependency. Git-committable project state. |
| **Chat-First Architecture** | The primary interface is an AI chat agent that can investigate bugs, create issues, manage the roadmap, and hand off work to your coding AI. |
| **Multi-Provider AI** | Supports OpenAI, Anthropic, and Google AI with automatic model discovery (58+ models), task-aware routing, and Helicone proxy integration. |
| **Self-Healing** | Automation engine with scheduled and event-driven AI agents that audit data freshness, detect stale sessions, and maintain consistency. |
| **Type-Safe** | Single shared types file (`shared/types.ts`) ensures type safety across server, UI, and CLI. |

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER / DEVELOPER                                │
│                                                                             │
│   ┌────────────────┐    ┌────────────────┐    ┌────────────────┐           │
│   │    Web UI      │    │      CLI       │    │  Cursor/IDE    │           │
│   │   (React)      │    │  (TypeScript)  │    │   (External)   │           │
│   │  Port 24681    │    │                │    │                │           │
│   └───────┬────────┘    └───────┬────────┘    └───────┬────────┘           │
│           │                     │                     │                     │
└───────────┼─────────────────────┼─────────────────────┼─────────────────────┘
            │                     │                     │
            │    HTTP/REST        │                     │ File edits
            ▼                     ▼                     │
┌───────────────────────────────────────────────────────┼─────────────────────┐
│                   HONO API SERVER (Port 24680)        │                     │
│                                                       │                     │
│  ┌─────────────────────────────────────────────────┐  │                     │
│  │            22 Route Files (REST API)            │  │                     │
│  │                                                 │  │                     │
│  │  • roadmap.ts    - Roadmap items CRUD           │  │                     │
│  │  • epics.ts      - Epic groupings               │  │                     │
│  │  • milestones.ts - Time-bound targets           │  │                     │
│  │  • releases.ts   - Version bundles              │  │                     │
│  │  • systems.ts    - Architecture components      │  │                     │
│  │  • issues.ts     - Bug/problem tracking         │  │                     │
│  │  • ideas.ts      - Idea capture                 │  │                     │
│  │  • changelog.ts  - Work history                 │  │                     │
│  │  • session.ts    - Session lifecycle            │  │                     │
│  │  • ai.ts         - Chat, models, config         │  │                     │
│  │  • docs.ts       - Documentation CRUD           │  │                     │
│  │  • automations.ts- Automation management        │  │                     │
│  │  • audits.ts     - Audit run history            │  │                     │
│  │  • codebase.ts   - Scan, search, files          │  │                     │
│  │  • git.ts        - Git status, diff, log        │  │                     │
│  │  • integrations.ts - Plugin management          │  │                     │
│  │  • brain.ts      - AI memory                    │  │                     │
│  │  • activity.ts   - Event timeline               │  │                     │
│  │  • state.ts      - Project state                │  │                     │
│  │  • metrics.ts    - Velocity tracking            │  │                     │
│  │  • labels.ts     - Tag management               │  │                     │
│  │  • config.ts     - Project configuration        │  │                     │
│  │  • init.ts       - Project initialization       │  │                     │
│  └─────────────────────────────────────────────────┘  │                     │
│                          │                            │                     │
│  ┌───────────────────────▼─────────────────────────┐  │                     │
│  │           AI INTELLIGENCE LAYER                 │  │                     │
│  │                                                 │  │                     │
│  │  ┌─────────────┐    ┌─────────────────────┐    │  │                     │
│  │  │ AIService   │───▶│    ModelRouter      │    │  │                     │
│  │  │ (service.ts)│    │ Auto-discovery      │    │  │                     │
│  │  └──────┬──────┘    │ Task-aware routing  │    │  │                     │
│  │         │           │ Fallback chains     │    │  │                     │
│  │         ▼           └─────────────────────┘    │  │                     │
│  │  ┌─────────────────────────────────────────┐   │  │                     │
│  │  │     Provider SDKs                       │   │  │                     │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │  │                     │
│  │  │  │ OpenAI  │ │Anthropic│ │ Google  │   │   │  │                     │
│  │  │  │  SDK    │ │   SDK   │ │   SDK   │   │   │  │                     │
│  │  │  └────┬────┘ └────┬────┘ └────┬────┘   │   │  │                     │
│  │  │       └───────────┼───────────┘        │   │  │                     │
│  │  │                   ▼                    │   │  │                     │
│  │  │        Helicone Proxy (optional)       │   │  │                     │
│  │  │        Cost tracking & observability   │   │  │                     │
│  │  └─────────────────────────────────────────┘   │  │                     │
│  │                                                │  │                     │
│  │  ┌─────────────────────────────────────────┐   │  │                     │
│  │  │   ChatService (chat.ts)                 │   │  │                     │
│  │  │   • SSE streaming                       │   │  │                     │
│  │  │   • Multi-turn agent loop               │   │  │                     │
│  │  │   • Tool call execution                 │   │  │                     │
│  │  │   • User profile injection              │   │  │                     │
│  │  └─────────────────────────────────────────┘   │  │                     │
│  │                                                │  │                     │
│  │  ┌─────────────────────────────────────────┐   │  │                     │
│  │  │   Headless Runner (runner.ts)           │   │  │                     │
│  │  │   • Programmatic agent execution        │   │  │                     │
│  │  │   • Used by automations                 │   │  │                     │
│  │  └─────────────────────────────────────────┘   │  │                     │
│  │                                                │  │                     │
│  │  ┌─────────────────────────────────────────┐   │  │                     │
│  │  │   ~40 Tools across 16 Modules           │   │  │                     │
│  │  │   backlog, epics, milestones, releases, │   │  │                     │
│  │  │   issues, ideas, changelog, session,    │   │  │                     │
│  │  │   state, brain, codebase, git, files,   │   │  │                     │
│  │  │   docs, metrics, config, profiles,      │   │  │                     │
│  │  │   integrations, activity, audits        │   │  │                     │
│  │  └─────────────────────────────────────────┘   │  │                     │
│  └────────────────────────────────────────────────┘  │                     │
│                                                      │                     │
│  ┌────────────────────────────────────────────────┐  │                     │
│  │         AUTOMATION ENGINE                      │  │                     │
│  │                                                │  │                     │
│  │  ┌──────────────┐  ┌────────────────────────┐  │  │                     │
│  │  │  Scheduler   │  │  Trigger Evaluator     │  │  │                     │
│  │  │  60s cron    │  │  • issue_created       │  │  │                     │
│  │  │              │  │  • item_completed      │  │  │                     │
│  │  └──────────────┘  │  • session_ended       │  │  │                     │
│  │                    │  • health_changed      │  │  │                     │
│  │  ┌──────────────┐  │  • file_changed        │  │  │                     │
│  │  │AuditRecorder │  │  • scheduled           │  │  │                     │
│  │  │Full trace    │  │  • manual              │  │  │                     │
│  │  └──────────────┘  └────────────────────────┘  │  │                     │
│  │                                                │  │                     │
│  │  5 Built-in Automations:                       │  │                     │
│  │  • nightly-health-audit (scheduled, 3AM)       │  │                     │
│  │  • context-refresh (scheduled, hourly)         │  │                     │
│  │  • session-stale-check (scheduled, 6h)         │  │                     │
│  │  • issue-triage (event, issue_created)         │  │                     │
│  │  • weekly-report (scheduled, Sunday)           │  │                     │
│  └────────────────────────────────────────────────┘  │                     │
│                                                      │                     │
│  ┌────────────────────────────────────────────────┐  │                     │
│  │         DATA LAYER (Store)                     │◀─┼─────────────────────┘
│  │                                                │  │   (file changes)
│  │  • 14 entity types                             │  │
│  │  • JSON file persistence                       │  │
│  │  • Typed interfaces in shared/types.ts         │  │
│  │  • Automatic write tracking (debounce)         │  │
│  │  • File watcher (chokidar) for external edits  │  │
│  │  • WebSocket broadcast on changes              │  │
│  │  • Data integrity validation on load           │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │         INTEGRATIONS                           │  │
│  │                                                │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐       │  │
│  │  │ GitHub   │ │ Helicone │ │ Vercel   │       │  │
│  │  │ ✅ Working│ │ ⚠️ Config │ │ ❌ Unconf │       │  │
│  │  └──────────┘ └──────────┘ └──────────┘       │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐       │  │
│  │  │ Supabase │ │ Sentry   │ │Cloudflare│       │  │
│  │  │ ❌ Unconf │ │ ❌ Unconf │ │ ❌ Unconf │       │  │
│  │  └──────────┘ └──────────┘ └──────────┘       │  │
│  │  ┌──────────┐ ┌──────────┐                    │  │
│  │  │ AWS EC2  │ │ Upstash  │                    │  │
│  │  │ ❌ Unconf │ │ ❌ Unconf │                    │  │
│  │  └──────────┘ └──────────┘                    │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │         WEBSOCKET (ws.ts)                      │  │
│  │         Real-time broadcast to all clients     │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────┐
│                  FILE SYSTEM (data/)                 │
│                                                      │
│  data/                                               │
│  ├── config.json           # Project configuration   │
│  ├── state.json            # Overall project state   │
│  ├── integrations.json     # Plugin credentials      │
│  │                                                   │
│  ├── roadmap/                                        │
│  │   ├── items.json        # Roadmap items           │
│  │   ├── epics.json        # Epic groupings          │
│  │   ├── milestones.json   # Time-bound targets      │
│  │   └── releases.json     # Version bundles         │
│  │                                                   │
│  ├── systems/                                        │
│  │   ├── systems.json      # Architecture components │
│  │   └── analysis.json     # AI analysis results     │
│  │                                                   │
│  ├── issues/                                         │
│  │   └── items.json        # Bugs and problems       │
│  │                                                   │
│  ├── ideas/                                          │
│  │   └── items.json        # Captured concepts       │
│  │                                                   │
│  ├── changelog/                                      │
│  │   ├── entries.json      # Work history            │
│  │   └── summaries.json    # Period summaries        │
│  │                                                   │
│  ├── session/                                        │
│  │   ├── log.json          # Session history         │
│  │   └── current.json      # Active session          │
│  │                                                   │
│  ├── activity/                                       │
│  │   └── feed.json         # Event timeline          │
│  │                                                   │
│  ├── brain/                                          │
│  │   ├── notes.json        # AI observations         │
│  │   ├── preferences.json  # User preferences        │
│  │   └── context-recovery.json # Session handoff     │
│  │                                                   │
│  ├── ai/                                             │
│  │   ├── config.json       # AI settings             │
│  │   ├── profiles.json     # User AI profiles        │
│  │   ├── state-cache.json  # Compressed state        │
│  │   └── conversations/    # Chat transcripts        │
│  │                                                   │
│  ├── automations/                                    │
│  │   ├── automations.json  # Automation definitions  │
│  │   └── audits/           # Audit run results       │
│  │       └── runs/         # Individual run files    │
│  │                                                   │
│  ├── docs/                                           │
│  │   ├── registry.json     # Doc metadata            │
│  │   └── *.md              # Wiki page content       │
│  │                                                   │
│  ├── metrics/                                        │
│  │   └── velocity.json     # Velocity tracking       │
│  │                                                   │
│  ├── labels/                                         │
│  │   └── labels.json       # Color-coded tags        │
│  │                                                   │
│  ├── local/                # Personal (gitignored)   │
│  │   └── profiles.json     # User profiles           │
│  │                                                   │
│  ├── codebase/                                       │
│  │   └── analysis.json     # Scan results            │
│  │                                                   │
│  └── designs/              # Design documents        │
│      ├── SPEC.md           # Full specification      │
│      ├── ENTITY-MODEL-V2.md# Entity model design     │
│      └── PHASES.md         # Development phases      │
│                                                      │
│  ~/.dev-track/             # Global registry         │
│  ├── projects.json         # Registered projects     │
│  ├── settings.json         # Global settings         │
│  └── credentials.json      # API keys (gitignored)   │
└──────────────────────────────────────────────────────┘
```

---

## System Components (11 Systems)

DevTrack is composed of 11 interconnected systems, each with its own health score and status:

| System | Health | Status | Tech Stack | Description |
|--------|--------|--------|------------|-------------|
| **Server (Hono API)** | 87/100 | ✅ Healthy | Hono, TypeScript, Node.js | 22+ route files, WebSocket, file watcher, multi-project hot-swap |
| **Web UI** | 70/100 | ✅ Healthy | React, Vite, Tailwind | 13+ views, AI chat sidebar, notification tray, project switcher |
| **AI Intelligence** | 65/100 | ✅ Healthy | OpenAI, Anthropic, Google | Multi-provider service, model router, ~40 tools, SSE streaming |
| **Data Layer** | 90/100 | ✅ Healthy | TypeScript, JSON | 14 entity types, ~778 lines of shared types, file-based persistence |
| **Session Tracking** | 80/100 | ✅ Healthy | TypeScript | Session lifecycle, velocity metrics, session observations |
| **AI Brain** | 78/100 | ✅ Healthy | TypeScript, JSON | Brain notes, preferences, context recovery, user profiles |
| **Codebase Visualizer** | 75/100 | ✅ Healthy | React, react-flow, dagre | Interactive architecture graph with 3 views |
| **Codebase Scanner** | 73/100 | ✅ Healthy | TypeScript | Module inference, description generation, auto-discovery |
| **Cursor Rule** | 62/100 | ⚠️ Degraded | — | AI context injection, session lifecycle instructions |
| **CLI** | 48/100 | ⚠️ Degraded | TypeScript, Node.js | Command set for init, start, status, projects |
| **Integrations** | 42/100 | ⚠️ Degraded | TypeScript | 8 plugins, only GitHub confirmed working |

---

## Data Flow Diagrams

### 1. User Interaction Flow

```
User clicks button in Web UI
         │
         ▼
React component calls API client
         │
         ▼
fetch('http://localhost:24680/api/v1/...')
         │
         ▼
Hono route handler processes request
         │
         ▼
Store reads/writes JSON file
         │
         ▼
File watcher detects change
         │
         ▼
WebSocket broadcasts to all clients
         │
         ▼
React components re-render
```

### 2. AI Chat Flow

```
User types message in ChatSidebar
         │
         ▼
POST /api/v1/ai/chat (SSE connection)
         │
         ▼
ChatService builds system prompt
  • Inject user profile (intelligence scores, preferences)
  • Inject project state summary
  • Include tool definitions (~40 tools)
         │
         ▼
AIService.stream() called
         │
         ▼
ModelRouter selects best model for task
  • Check provider availability
  • Match task to tier (premium/standard/budget)
  • Apply fallback chain if needed
         │
         ▼
Provider SDK (OpenAI/Anthropic/Google)
  • Optional: Route through Helicone proxy
  • Stream response chunks
         │
         ▼
For each tool call in response:
  • Parse tool name and arguments
  • executeTool() from tools/index.ts
  • Tool modifies Store data
  • Return result to AI
         │
         ▼
SSE events sent to client:
  • text_delta (streaming text)
  • tool_call_start (tool invoked)
  • tool_call_result (tool output)
  • message_complete (full response)
  • done (usage stats)
```

### 3. Automation Flow

```
Trigger event occurs
  • File change detected
  • Session ended
  • Scheduled time reached
  • Manual "Run Now" clicked
         │
         ▼
AutomationEngine.fire(context)
         │
         ▼
Check master kill switch (ai/config.json)
         │
         ▼
Check budget limit (daily_limit_usd)
         │
         ▼
Find matching automations
  • Filter by trigger type
  • Check enabled flag
         │
         ▼
For each automation:
  • Check cooldown (default 60 min)
  • Evaluate conditions (if not AI-driven)
         │
         ▼
If AI-driven:
  • Create AuditRecorder
  • Build context from state cache
  • runAgent() with ai_prompt
         │
         ▼
AI agent executes tool calls
  • Each tool call recorded in audit
  • Changes tracked
         │
         ▼
Finalize audit run
  • Save to data/audits/runs/run-XXXX.json
  • Update audit index
  • Track cost in budget
         │
         ▼
Broadcast completion via WebSocket
```

### 4. Codebase Scan Flow

```
POST /api/v1/codebase/scan
         │
         ▼
scanCodebase(projectRoot)
         │
         ▼
Walk directory tree
  • Respect .gitignore patterns
  • Skip node_modules, dist, etc.
         │
         ▼
For each TypeScript/JavaScript file:
  • Parse with regex (not full AST)
  • Extract exports, imports, functions
  • Identify file type (route, component, utility)
         │
         ▼
Infer modules from directory structure
  • server/ai/ → AI Intelligence module
  • server/routes/ → API Routes module
  • ui/src/views/ → Views module
         │
         ▼
Generate descriptions:
  • generateModuleDescription() for each module
  • generateEdgeLabel() for each dependency
         │
         ▼
Save to data/codebase/analysis.json
         │
         ▼
Serve to react-flow graph in UI
  • Nodes = modules/files
  • Edges = dependencies
  • Layout with dagre
```

---

## Entity Model (v2)

DevTrack manages **14 entity types** defined in `shared/types.ts` (~778 lines):

| # | Entity | File | ID Format | Description |
|---|--------|------|-----------|-------------|
| 1 | **Ideas** | `ideas/items.json` | `IDEA-001` | Captured concepts with pros, cons, open questions |
| 2 | **Roadmap Items** | `roadmap/items.json` | kebab-case | Features/tasks with horizons, priorities, sizes |
| 3 | **Epics** | `roadmap/epics.json` | kebab-case | Strategic groupings with progress tracking |
| 4 | **Milestones** | `roadmap/milestones.json` | kebab-case | Time-bound delivery targets |
| 5 | **Releases** | `releases/releases.json` | `v0.2.0` | Versioned bundles of shipped work |
| 6 | **Issues** | `issues/items.json` | `ISS-001` | Bugs with severity, root cause, resolution |
| 7 | **Systems** | `systems/systems.json` | kebab-case | Architecture components with health scores |
| 8 | **Changelog** | `changelog/entries.json` | `CL-001` | Detailed record of completed work |
| 9 | **Sessions** | `session/log.json` | numeric | Development sessions with velocity |
| 10 | **Docs** | `docs/registry.json` | kebab-case | Wiki pages with auto-generation |
| 11 | **Activity** | `activity/feed.json` | `ACT-001` | Timeline of all events |
| 12 | **Labels** | `labels/labels.json` | kebab-case | Color-coded tags |
| 13 | **Automations** | `automations/automations.json` | kebab-case | Trigger-based AI tasks |
| 14 | **Brain** | `brain/notes.json` | `BN-001` | AI memory and observations |

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

### File Type Breakdown

| Type | Count |
|------|-------|
| API Routes | 22 |
| Components | 9 |
| Pages/Views | 13 |
| Utilities | 9 |
| Config | 3 |
| Schema | 3 |
| Hooks | 1 |
| Other | 36 |

---

## Key Design Decisions

### 1. JSON over Database

All data is stored as JSON files for:
- **Simplicity**: No database setup, migrations, or connection management
- **Git-committability**: Project state can be version-controlled
- **AI readability**: JSON is easily parsed and understood by AI models
- **Portability**: Copy the `data/` folder to move a project

### 2. Chat-First Architecture

The AI chat agent is the **primary product**, not just a feature:
- All 14 entity types are accessible through natural language
- The agent can investigate bugs, create issues, and manage the roadmap
- Tool definitions describe every possible action in JSON Schema format

### 3. Multi-Provider AI

Direct SDK integration with OpenAI, Anthropic, and Google:
- **Not using LiteLLM** — gives maximum control over streaming, tool calling, and error handling
- **Auto-discovery**: Queries provider APIs on startup to find available models
- **Task-aware routing**: Different tasks route to different model tiers
- **Fallback chains**: If preferred provider fails, falls back to alternatives

### 4. Local-First

No cloud dependency for core functionality:
- Server runs on localhost:24680
- All data stored locally in `data/`
- Helicone is optional (for cost tracking)
- Can work completely offline (if models are cached)

### 5. Structural Enforcement over Behavioral Instructions

Instead of telling the coding AI to track changes (unreliable), DevTrack:
- Uses its own automation engine to detect and record changes
- File watcher monitors `data/` for external edits
- Scheduled audits verify data consistency
- AI agents run independently of coding sessions

### 6. Type Safety Across Stack

Single source of truth for types:
- `shared/types.ts` defines all entity interfaces
- Imported by server, UI, and CLI
- TypeScript ensures compile-time safety
- No runtime type mismatches

---

## Project Health Summary

| Metric | Value |
|--------|-------|
| **Overall Health** | 80/100 |
| **Items Shipped** | 111 across 10 sessions |
| **Story Points** | 362 |
| **Average Velocity** | 12.3 items/session, 40.2 points/session |
| **Open Issues** | 6 (1 critical, 3 high, 2 low) |
| **Active Epics** | 4 |
| **Pending Ideas** | 68 |

---

## Related Documentation

- [Getting Started Guide](getting-started) — Installation and first steps
- [API Reference](api-reference) — All REST endpoints
- [Data Model Reference](data-model-reference) — Entity type definitions
- [System: Server](system-server) — Server architecture deep dive
- [System: Web UI](system-web-ui) — Frontend architecture
- [System: AI Intelligence](system-ai-intelligence) — AI layer details
