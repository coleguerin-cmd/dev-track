# Getting Started with DevTrack

> This guide walks you through installing, configuring, and running DevTrack for the first time. By the end, you'll have a fully operational project intelligence system with an AI chat agent, real-time dashboard, and automated project tracking.

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js** v18 or later (`node --version`)
- **npm** v9 or later (`npm --version`)
- **Git** installed and configured
- At least one AI provider API key:
  - [OpenAI API Key](https://platform.openai.com/api-keys)
  - [Anthropic API Key](https://console.anthropic.com/)
  - [Google AI API Key](https://aistudio.google.com/app/apikey)

Optional but recommended:
- [Helicone Account](https://helicone.ai/) for AI cost tracking and observability

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/dev-track.git
cd dev-track
```

### 2. Install Dependencies

```bash
npm install
```

This installs all dependencies for the server, UI, and CLI. Key packages include:

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

### 3. Configure API Keys

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

> **Security Note**: `.credentials.json` is automatically gitignored. Never commit API keys to version control.

You only need **one** AI provider key to get started. The system gracefully degrades when providers are unavailable.

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
```

> **Note**: `npm link` may cause issues with some editors. Use `npx tsx` as the workaround.

---

## Project Structure

After starting DevTrack, your project will have this structure:

```
your-project/
├── data/                    # All DevTrack data (git-committed)
│   ├── roadmap/
│   │   ├── items.json       # Roadmap items (features, tasks)
│   │   ├── epics.json       # Strategic groupings
│   │   ├── milestones.json  # Time-bound targets
│   │   └── releases.json    # Versioned releases
│   ├── systems/
│   │   └── systems.json     # Architecture components
│   ├── issues/
│   │   └── items.json       # Bugs and problems
│   ├── ideas/
│   │   └── items.json       # Captured concepts
│   ├── changelog/
│   │   └── entries.json     # Completed work log
│   ├── session/
│   │   └── log.json         # Development sessions
│   ├── activity/
│   │   └── feed.json        # Timeline of all events
│   ├── brain/
│   │   ├── notes.json       # AI observations
│   │   ├── preferences.json # User preferences
│   │   └── context-recovery.json
│   ├── ai/
│   │   ├── config.json      # AI settings, automation config
│   │   └── conversations/   # Chat transcripts
│   ├── automations/
│   │   ├── automations.json # Automation definitions
│   │   └── audits/          # Audit run results
│   ├── docs/
│   │   ├── registry.json    # Doc metadata
│   │   └── *.md             # Wiki pages
│   ├── metrics/
│   │   └── velocity.json    # Velocity tracking
│   ├── labels/
│   │   └── labels.json      # Color-coded tags
│   ├── local/               # Personal data (gitignored)
│   │   └── profiles.json    # User profiles
│   └── codebase/
│       └── analysis.json    # Scan results
├── .credentials.json        # API keys (gitignored)
├── .cursor/rules/
│   └── dev-track.mdc        # AI context rules
└── server/                  # DevTrack source code
```

---

## First Steps After Installation

### 1. Explore the Dashboard

The Dashboard (`http://localhost:24681`) shows:
- **Overall project health** as a ring chart
- **Quick stats** (items shipped, issues, velocity)
- **System health** for each component
- **Recent changelog** entries
- **Active brain notes** from the AI

### 2. Configure AI Settings

Navigate to **Settings → AI Configuration**:
- Toggle AI providers on/off
- Set default models for chat and automation
- Configure automation controls (kill switch, budget, cooldown)
- Set model tier (premium/standard/budget)

Navigate to **Settings → Integrations**:
- Enter API keys for AI providers
- Configure integration plugins (GitHub, Helicone, etc.)
- Test connections

### 3. Chat with the AI Agent

Click the **chat icon** in the right sidebar to open the AI chat agent. Try:

- *"What's the current project status?"*
- *"Show me all open issues"*
- *"Create an idea for improving the login flow"*
- *"What files are in the server directory?"*

The chat agent has access to ~40 tools and can read files, create entities, manage the roadmap, and investigate bugs.

### 4. Scan Your Codebase

Navigate to **Codebase** and click **Scan**. This analyzes your project structure and generates:
- Module descriptions in plain English
- Dependency relationships
- An interactive architecture graph

### 5. Generate Documentation

Navigate to **Docs** and click **Initialize Docs**. This triggers an AI agent that:
- Scans the entire codebase
- Reads all project data
- Generates comprehensive wiki pages for every system
- Creates a getting-started guide, API reference, and data model docs

---

## Multi-Project Support

DevTrack supports managing multiple projects from a single installation:

```bash
# Initialize DevTrack in a new project
cd ~/Projects/my-other-project
npx tsx ~/Projects/dev-track/cli/index.ts init

# Switch projects in the UI
# Use the project dropdown in the sidebar
```

Projects are registered in `~/.dev-track/registry.json`. Each project has its own isolated data directory.

---

## Configuration

### Project Config (`data/config.json`)

```json
{
  "project": "my-project",
  "description": "My awesome project",
  "version": "0.1.0",
  "settings": {
    "max_now_items": 3,
    "max_session_history": 10,
    "auto_archive_resolved_issues_after_days": 7,
    "changelog_window_days": 14,
    "verbosity": {
      "changelog_entries": "detailed",
      "session_retros": "detailed",
      "ai_context_loading": "efficient"
    },
    "developers": [
      { "id": "user", "name": "Lead", "role": "lead" }
    ]
  }
}
```

### AI Config (`data/ai/config.json`)

Controls the AI intelligence layer:
- **Provider toggles**: Enable/disable OpenAI, Anthropic, Google
- **Model defaults**: Default models for chat and tasks
- **Automations**: Master kill switch, scheduler, triggers, budget
- **Budget**: Daily spending limit with auto-pause

---

## Troubleshooting

### Server won't start
- Check that port 24680 is available: `lsof -i :24680`
- Ensure `data/` directory exists (created on first run)
- Check Node.js version: `node --version` (need v18+)

### UI shows blank page
- Ensure the API server is running on port 24680
- Check browser console for CORS errors
- Try `npm run dev:ui` separately to see Vite errors

### AI chat not responding
- Verify API keys in `.credentials.json`
- Check Settings → Integrations for connection status
- Ensure at least one provider is enabled in Settings → AI Configuration

### File watcher not detecting changes
- The watcher monitors `data/` for JSON changes
- External file edits (from Cursor/IDE) are detected automatically
- Changes from the API are tracked to avoid feedback loops

---

## What's Next?

- Read the [API Reference](api-reference) to understand all available endpoints
- Explore the [Data Model Reference](data-model-reference) to understand entity types
- Dive into individual system docs for architecture details
- Set up [Helicone](system-integrations) for AI cost tracking
- Configure [automations](system-ai-intelligence) for self-healing data management
