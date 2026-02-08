# Getting Started with DevTrack

> This guide walks you through installing, configuring, and running DevTrack for the first time. By the end, you'll have a fully operational project intelligence system with an AI chat agent, real-time dashboard, and automated project tracking.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Running DevTrack](#running-devtrack)
5. [Project Structure](#project-structure)
6. [First Steps After Installation](#first-steps-after-installation)
7. [Multi-Project Support](#multi-project-support)
8. [Configuration Reference](#configuration-reference)
9. [Troubleshooting](#troubleshooting)
10. [What's Next?](#whats-next)

---

## Prerequisites

Before you begin, make sure you have:

| Requirement | Minimum Version | Check Command |
|-------------|-----------------|---------------|
| **Node.js** | v18.0.0 | `node --version` |
| **npm** | v9.0.0 | `npm --version` |
| **Git** | Any recent | `git --version` |

You'll also need at least one AI provider API key:

| Provider | Get API Key | Models |
|----------|-------------|--------|
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | GPT-4o, GPT-4o-mini |
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com/) | Claude Opus, Sonnet, Haiku |
| **Google AI** | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | Gemini Pro, Flash |

**Optional but recommended:**
- [Helicone Account](https://helicone.ai/) — AI cost tracking and observability

---

## Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-org/dev-track.git
cd dev-track
```

### Step 2: Install Dependencies

```bash
npm install
```

This installs all dependencies for the server, UI, and CLI. The installation takes about 1-2 minutes.

**Key packages installed:**

| Package | Purpose |
|---------|---------|
| `hono` | HTTP server framework (like Express, but faster) |
| `react` + `vite` | Frontend UI framework and build tool |
| `tailwindcss` | Utility-first CSS framework |
| `openai` | OpenAI SDK for GPT models |
| `@anthropic-ai/sdk` | Anthropic SDK for Claude models |
| `@google/generative-ai` | Google AI SDK for Gemini models |
| `chokidar` | File system watcher for real-time sync |
| `ws` | WebSocket server for live updates |
| `reactflow` + `dagre` | Interactive graph visualization |
| `lucide-react` | Icon library |
| `@dnd-kit/core` | Drag-and-drop for kanban board |
| `tsx` | TypeScript execution without compilation |

### Step 3: Verify Installation

```bash
# Check that the server can start
npm run dev:server

# You should see:
#   ╔══════════════════════════════════════╗
#   ║         dev-track server v2           ║
#   ╚══════════════════════════════════════╝
#
#   Project:  dev-track
#   Data:     /path/to/dev-track/data
#   Health:   80%
#   Status:   dev-track is at 80% health...
```

Press `Ctrl+C` to stop the server.

---

## Configuration

### Step 1: Configure API Keys

Create a `.credentials.json` file in your project root:

```json
{
  "ai": {
    "openai": "sk-...",
    "anthropic": "sk-ant-...",
    "google": "AIza...",
    "helicone": "sk-helicone-...",
    "helicone_org_id": "org-..."
  }
}
```

> ⚠️ **Security Note**: `.credentials.json` is automatically gitignored. Never commit API keys to version control.

**You only need ONE provider key to get started.** The system gracefully degrades when providers are unavailable.

### Step 2: Configure AI Settings (Optional)

Edit `data/ai/config.json` to customize AI behavior:

```json
{
  "providers": {
    "openai": { "enabled": true },
    "anthropic": { "enabled": true },
    "google": { "enabled": true },
    "helicone": { "enabled": false }
  },
  "features": {
    "planning_chat": {
      "enabled": true,
      "model_override": null
    }
  },
  "budget": {
    "daily_limit_usd": 5.0,
    "warn_at_usd": 3.0,
    "pause_on_limit": true,
    "total_spent_usd": 0
  },
  "automations": {
    "enabled": true,
    "scheduler_enabled": true,
    "triggers_enabled": true,
    "cooldown_minutes": 60,
    "default_model_tier": "standard"
  },
  "defaults": {
    "chat_model": "",
    "fast_model": "",
    "reasoning_model": ""
  }
}
```

### Step 3: Configure Project Settings (Optional)

Edit `data/config.json` to customize project behavior:

```json
{
  "project": "my-project",
  "description": "My awesome project",
  "created": "2026-02-01",
  "version": "0.1.0",
  "settings": {
    "max_now_items": 3,
    "max_session_history": 20,
    "auto_archive_resolved_issues_after_days": 7,
    "changelog_window_days": 14,
    "completed_items_window_days": 14,
    "summary_period": "monthly",
    "verbosity": {
      "changelog_entries": "detailed",
      "session_retros": "summary",
      "issue_commentary": "detailed",
      "design_docs": "detailed",
      "diagnostic_output": "summary",
      "roadmap_descriptions": "detailed",
      "ai_context_loading": "efficient"
    },
    "developers": [
      { "id": "lead", "name": "Lead Developer", "role": "lead" }
    ]
  }
}
```

---

## Running DevTrack

### Development Mode (Recommended)

Start both the API server and UI dev server with hot reload:

```bash
npm run dev
```

This runs two processes concurrently:
- **API Server** on `http://localhost:24680` (via `tsx watch server/index.ts`)
- **UI Dev Server** on `http://localhost:24681` (via `vite ui`)

Open your browser to **http://localhost:24681** to see the dashboard.

### Individual Commands

```bash
# Server only (with file watching/hot reload)
npm run dev:server

# UI only (Vite dev server)
npm run dev:ui

# Production server (no hot reload)
npm run serve

# Build for production
npm run build

# Build UI only
npm run build:ui

# Build server only
npm run build:server

# Start production build
npm run start
```

### CLI Usage

The CLI provides command-line access to DevTrack:

```bash
# Initialize DevTrack in a new project
npx tsx cli/index.ts init

# Start the server for the current project
npx tsx cli/index.ts start

# Check project status
npx tsx cli/index.ts status

# List all registered projects
npx tsx cli/index.ts projects list

# Get quick status summary
npx tsx cli/index.ts quick-status
```

> **Note**: `npm link` may cause issues with some editors (particularly Cursor). Use `npx tsx cli/index.ts` as the reliable workaround.

### Server Startup Output

When the server starts successfully, you'll see:

```
  ╔══════════════════════════════════════╗
  ║         dev-track server v2           ║
  ╚══════════════════════════════════════╝

  Project:  dev-track
  Data:     /Users/you/Projects/dev-track/data
  Health:   80%
  Status:   dev-track is at 80% health. 11 tracked systems...

  API:     http://127.0.0.1:24680/api/v1/
  Health:  http://127.0.0.1:24680/api/health
  WS:      ws://127.0.0.1:24680/ws

[store] Loaded: 46 roadmap items, 41 issues, 11 systems, 8 epics
[ai] Initializing providers (helicone: ON)
[ai]   OpenAI: configured
[ai]   Anthropic: configured
[ai]   Google: configured
[ai-router] Discovered 58 models: claude-opus-4-6, claude-sonnet-4-5-20250929...
[watcher] Watching data/ for changes
[scheduler] Started (60s interval)
```

---

## Project Structure

After starting DevTrack, your project will have this structure:

```
your-project/
├── data/                        # All DevTrack data (git-committed)
│   │
│   ├── config.json              # Project configuration
│   ├── state.json               # Overall project state
│   ├── integrations.json        # Plugin credentials
│   │
│   ├── roadmap/                 # Planning entities
│   │   ├── items.json           # Roadmap items (features, tasks)
│   │   ├── epics.json           # Strategic groupings
│   │   ├── milestones.json      # Time-bound targets
│   │   └── releases.json        # Versioned releases
│   │
│   ├── systems/                 # Architecture tracking
│   │   ├── systems.json         # System components
│   │   └── analysis.json        # AI analysis results
│   │
│   ├── issues/                  # Problem tracking
│   │   └── items.json           # Bugs and issues
│   │
│   ├── ideas/                   # Idea capture
│   │   └── items.json           # Captured concepts
│   │
│   ├── changelog/               # Work history
│   │   ├── entries.json         # Completed work log
│   │   └── summaries.json       # Period summaries
│   │
│   ├── session/                 # Session tracking
│   │   ├── log.json             # Session history
│   │   └── current.json         # Active session
│   │
│   ├── activity/                # Event timeline
│   │   └── feed.json            # All events
│   │
│   ├── brain/                   # AI memory
│   │   ├── notes.json           # AI observations
│   │   ├── preferences.json     # User preferences
│   │   └── context-recovery.json# Session handoff
│   │
│   ├── ai/                      # AI configuration
│   │   ├── config.json          # AI settings
│   │   ├── profiles.json        # User AI profiles
│   │   ├── state-cache.json     # Compressed state
│   │   ├── usage.json           # Usage tracking
│   │   ├── docs-generation-status.json
│   │   └── conversations/       # Chat transcripts
│   │
│   ├── automations/             # Automation system
│   │   ├── automations.json     # Automation definitions
│   │   └── audits/              # Audit run results
│   │       ├── index.json       # Run index
│   │       └── runs/            # Individual run files
│   │
│   ├── docs/                    # Documentation
│   │   ├── registry.json        # Doc metadata
│   │   └── *.md                 # Wiki page content
│   │
│   ├── metrics/                 # Performance tracking
│   │   └── velocity.json        # Velocity metrics
│   │
│   ├── labels/                  # Tagging system
│   │   └── labels.json          # Color-coded tags
│   │
│   ├── local/                   # Personal data (gitignored)
│   │   └── profiles.json        # User profiles
│   │
│   ├── codebase/                # Code analysis
│   │   └── analysis.json        # Scan results
│   │
│   ├── designs/                 # Design documents
│   │   ├── SPEC.md              # Full specification
│   │   ├── ENTITY-MODEL-V2.md   # Entity model design
│   │   ├── PHASES.md            # Development phases
│   │   └── README.md            # Design docs overview
│   │
│   └── decisions/               # Decision records
│
├── server/                      # API server source
│   ├── index.ts                 # Server entry point
│   ├── store.ts                 # Data layer
│   ├── routes/                  # API route handlers
│   ├── ai/                      # AI intelligence layer
│   ├── automation/              # Automation engine
│   └── integrations/            # Plugin implementations
│
├── ui/                          # React frontend
│   ├── src/
│   │   ├── App.tsx              # Main application
│   │   ├── views/               # Page components
│   │   ├── components/          # Shared components
│   │   └── api/                 # API client
│   └── vite.config.ts           # Vite configuration
│
├── shared/                      # Shared code
│   └── types.ts                 # TypeScript types
│
├── cli/                         # CLI tool
│   └── index.ts                 # CLI entry point
│
├── .credentials.json            # API keys (gitignored)
├── .cursor/rules/               # AI context rules
│   └── dev-track.mdc            # DevTrack rules
├── package.json                 # Dependencies
└── tsconfig.json                # TypeScript config
```

---

## First Steps After Installation

### 1. Explore the Dashboard

Open `http://localhost:24681` in your browser. The Dashboard shows:

- **Health Ring** — Overall project health as a percentage
- **Quick Stats** — Items shipped, issues, velocity
- **System Health** — Status of each component
- **Recent Changelog** — Latest completed work
- **Active Brain Notes** — AI observations and suggestions

### 2. Configure AI Settings

Navigate to **Settings → AI Configuration**:

| Setting | Description |
|---------|-------------|
| Provider toggles | Enable/disable OpenAI, Anthropic, Google |
| Default models | Set preferred models for chat and tasks |
| Automation controls | Master kill switch, scheduler, triggers |
| Budget | Daily spending limit with auto-pause |
| Model tier | Premium/standard/budget for automations |

Navigate to **Settings → Integrations**:

| Setting | Description |
|---------|-------------|
| API keys | Enter keys for AI providers |
| Integration plugins | Configure GitHub, Helicone, etc. |
| Connection tests | Verify integrations work |

### 3. Chat with the AI Agent

Click the **chat icon** (💬) in the right sidebar to open the AI chat agent.

**Try these commands:**

```
"What's the current project status?"
"Show me all open issues"
"Create an idea for improving the login flow"
"What files are in the server directory?"
"List the recent changelog entries"
"Start a new session with objective: Fix mobile bugs"
"Add a brain note about the performance issue I noticed"
```

The chat agent has access to **~40 tools** and can:
- Read and search files in your codebase
- Create, update, and delete any entity
- Manage the roadmap (move items, complete tasks)
- Investigate bugs and create issues
- Generate documentation
- Track sessions and velocity

### 4. Scan Your Codebase

Navigate to **Codebase** and click **Scan**. This analyzes your project structure and generates:

- **Module descriptions** in plain English
- **Dependency relationships** between modules
- **File metadata** (exports, imports, functions)
- **Interactive architecture graph**

The scan takes 10-30 seconds depending on project size.

### 5. Generate Documentation

Navigate to **Docs** and click **Initialize Docs**. This triggers an AI agent that:

1. Scans the entire codebase
2. Reads all project data (systems, roadmap, issues)
3. Generates comprehensive wiki pages for every system
4. Creates getting-started guide, API reference, data model docs

This takes 2-5 minutes and uses the premium AI tier (Claude Opus or GPT-5-Pro).

### 6. Start a Working Session

Navigate to **Sessions** and click **Start Session**:

```
Objective: "Fix mobile login issues and add error handling"
Appetite: "2h"
```

During the session, DevTrack tracks:
- Items you complete
- Issues you resolve
- Ideas you capture
- Changelog entries

When done, click **End Session** to record a retrospective.

---

## Multi-Project Support

DevTrack supports managing multiple projects from a single installation.

### Initialize a New Project

```bash
# Go to your other project
cd ~/Projects/my-other-project

# Initialize DevTrack
npx tsx ~/Projects/dev-track/cli/index.ts init

# Start the server for this project
npx tsx ~/Projects/dev-track/cli/index.ts start
```

### Switch Projects in the UI

Use the **project dropdown** in the sidebar to switch between registered projects. The server hot-swaps the data directory without restarting.

### Project Registry

Projects are registered in `~/.dev-track/projects.json`:

```json
{
  "projects": [
    {
      "id": "dev-track",
      "name": "dev-track",
      "path": "/Users/you/Projects/dev-track",
      "dataDir": "~/.dev-track/projects/dev-track/data",
      "lastAccessed": "2026-02-08T14:30:00Z"
    },
    {
      "id": "my-other-project",
      "name": "My Other Project",
      "path": "/Users/you/Projects/my-other-project",
      "dataDir": "~/.dev-track/projects/my-other-project/data",
      "lastAccessed": "2026-02-07T10:00:00Z"
    }
  ]
}
```

---

## Configuration Reference

### Project Config (`data/config.json`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `project` | string | — | Project name |
| `description` | string | — | Project description |
| `version` | string | `"0.1"` | Config version |
| `settings.max_now_items` | number | `3` | Max items in "Now" horizon (WIP limit) |
| `settings.max_session_history` | number | `20` | Sessions to keep in history |
| `settings.auto_archive_resolved_issues_after_days` | number | `7` | Days before archiving resolved issues |
| `settings.changelog_window_days` | number | `14` | Days of changelog to show |
| `settings.verbosity.*` | string | varies | Output verbosity levels |
| `settings.developers` | array | `[]` | Team members |

### AI Config (`data/ai/config.json`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `providers.*.enabled` | boolean | `true` | Enable/disable provider |
| `providers.helicone.enabled` | boolean | `false` | Route through Helicone proxy |
| `budget.daily_limit_usd` | number | `5.0` | Daily spending limit |
| `budget.warn_at_usd` | number | `3.0` | Warning threshold |
| `budget.pause_on_limit` | boolean | `true` | Stop automations at limit |
| `automations.enabled` | boolean | `true` | Master kill switch |
| `automations.scheduler_enabled` | boolean | `true` | Enable scheduled automations |
| `automations.triggers_enabled` | boolean | `true` | Enable event-triggered automations |
| `automations.cooldown_minutes` | number | `60` | Min time between automation runs |
| `automations.default_model_tier` | string | `"standard"` | Model tier for automations |
| `defaults.chat_model` | string | `""` | Override default chat model |

---

## Troubleshooting

### Server won't start

**Symptom**: Error on `npm run dev:server`

**Solutions**:
1. Check port availability: `lsof -i :24680` — kill any process using the port
2. Ensure `data/` directory exists (created on first run)
3. Check Node.js version: `node --version` (need v18+)
4. Check for syntax errors: `npx tsc --noEmit`

### UI shows blank page

**Symptom**: Browser shows white screen at localhost:24681

**Solutions**:
1. Ensure API server is running on port 24680
2. Check browser console (F12) for errors
3. Check for CORS errors — server should allow localhost origins
4. Try `npm run dev:ui` separately to see Vite errors

### AI chat not responding

**Symptom**: Chat messages hang or show errors

**Solutions**:
1. Verify API keys in `.credentials.json`
2. Check Settings → Integrations for connection status
3. Ensure at least one provider is enabled in Settings → AI Configuration
4. Check server logs for API errors
5. Verify budget hasn't been exceeded (`data/ai/config.json`)

### File watcher not detecting changes

**Symptom**: External edits don't trigger UI updates

**Solutions**:
1. The watcher monitors `data/` for JSON changes only
2. Check server logs for `[watcher]` messages
3. Verify `chokidar` is installed: `npm ls chokidar`
4. On macOS, check file system permissions

### WebSocket disconnects

**Symptom**: "Disconnected" indicator in sidebar, no live updates

**Solutions**:
1. Refresh the browser page
2. Check server is still running
3. Check for firewall blocking WebSocket connections
4. Try a different browser

### Automations not running

**Symptom**: Scheduled automations don't fire

**Solutions**:
1. Check master kill switch: `data/ai/config.json` → `automations.enabled`
2. Check scheduler: `automations.scheduler_enabled`
3. Check cooldown: automation may be within cooldown period
4. Check budget: `budget.total_spent_usd` vs `budget.daily_limit_usd`
5. Check server logs for `[automation]` messages

---

## What's Next?

Now that you have DevTrack running, explore these resources:

| Document | Description |
|----------|-------------|
| [System Overview](system-overview) | Full architecture documentation |
| [API Reference](api-reference) | All REST endpoints |
| [Data Model Reference](data-model-reference) | Entity type definitions |
| [System: Server](system-server) | Server implementation details |
| [System: AI Intelligence](system-ai-intelligence) | AI layer deep dive |
| [System: Web UI](system-web-ui) | Frontend architecture |

### Recommended Next Steps

1. **Scan your codebase** to generate the architecture graph
2. **Initialize documentation** to create wiki pages
3. **Configure Helicone** for AI cost tracking
4. **Set up automations** for self-healing data management
5. **Start a session** and track your first day of work
6. **Explore the chat agent** — it's the most powerful feature!
