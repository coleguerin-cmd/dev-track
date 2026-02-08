# System: CLI

> **Auto-generated** | Last refreshed: 2026-02-09 | Health: undefined/100 | Status: Healthy

---

## Overview

The CLI is DevTrack's command-line interface and the primary entry point for project initialization, server management, and multi-project orchestration. It's a single TypeScript file (`cli/index.ts`, 649 lines) that handles everything from scaffolding new projects to launching the server and querying the API.

**Key characteristics:**
- **Single-file architecture**: All CLI logic lives in one file for portability
- **Multi-project registry**: Manages multiple DevTrack projects from a central `~/.dev-track/` directory
- **Zero-dependency initialization**: Can scaffold a complete project without a running server
- **Hybrid execution model**: Uses `npx tsx` for TypeScript execution, no build step required
- **Project isolation**: Each project gets its own data directory under `~/.dev-track/projects/<project-id>/data/`

## Architecture

### Directory Structure

```
~/.dev-track/                    # Central DevTrack home
├── projects.json                # Multi-project registry
├── settings.json                # Global settings (future)
└── projects/
    ├── my-app/
    │   └── data/                # Project-specific data
    │       ├── config.json
    │       ├── state.json
    │       ├── backlog/
    │       ├── changelog/
    │       ├── session/
    │       ├── issues/
    │       ├── metrics/
    │       ├── actions/
    │       ├── brain/
    │       ├── ideas/
    │       ├── ai/
    │       ├── codebase/
    │       ├── designs/
    │       ├── decisions/
    │       └── runs/
    └── another-project/
        └── data/
```

Each project also gets a local `.dev-track/` directory in its repository:

```
<project-root>/.dev-track/
├── config.json                  # Points to data directory
├── .port                        # Active server port (ephemeral)
├── rules/
│   └── dev-track.mdc           # Cursor rule for AI context
└── .credentials.json           # API keys (gitignored)
```

### Execution Model

The CLI uses **npx tsx** to run TypeScript directly without compilation:

```bash
# Direct execution (recommended for dogfooding)
npx tsx /path/to/dev-track/cli/index.ts <command>

# After npm link (may crash Cursor — ISS-006 related)
dev-track <command>
```

When starting the server, the CLI spawns a child process running `npx tsx server/index.ts` with environment variables for data directory and port configuration.

### Multi-Project Registry

The central registry (`~/.dev-track/projects.json`) tracks all initialized projects:

```json
{
  "projects": [
    {
      "id": "my-app",
      "name": "My App",
      "path": "/Users/dev/projects/my-app",
      "dataDir": "/Users/dev/.dev-track/projects/my-app/data",
      "port": 24680,
      "lastAccessed": "2026-02-09T01:00:00Z",
      "created": "2026-02-08T12:00:00Z"
    }
  ]
}
```

This enables:
- **Project switching**: Different terminals can run different projects simultaneously
- **Port management**: Each project can use a different port
- **History tracking**: See when projects were last accessed
- **Data isolation**: No cross-contamination between projects

## Commands

### Core Commands

#### `init`
Initialize DevTrack in the current directory.

```bash
dev-track init [--name "Project Name"]
```

**What it does:**
1. Creates `~/.dev-track/projects/<project-id>/data/` with full directory structure
2. Scaffolds 13 default data files (config, state, backlog, changelog, session, issues, metrics, actions, brain, ideas, AI config, profiles)
3. Creates `.dev-track/config.json` in project root (points to data directory)
4. Generates `.dev-track/rules/dev-track.mdc` from template (Cursor rule)
5. Creates `.credentials.json` for API keys (gitignored)
6. Updates `.gitignore` to exclude `.dev-track/` and `.credentials.json`
7. Registers project in central registry

**Example output:**
```
  Initializing dev-track for: my-app
  Project path: /Users/dev/projects/my-app
  Data directory: ~/.dev-track/projects/my-app/data

  ✓ Project initialized successfully!
  ✓ Data directory: ~/.dev-track/projects/my-app/data
  ✓ Config: /Users/dev/projects/my-app/.dev-track/config.json
  ✓ Cursor rule: /Users/dev/projects/my-app/.dev-track/rules/dev-track.mdc

  Next: run 'dev-track start' to launch the dashboard.
```

**Idempotency:** Running `init` again shows existing configuration without overwriting.

#### `start`
Start the DevTrack server for the current project.

```bash
dev-track start [--port 24680] [--no-browser]
```

**What it does:**
1. Reads `.dev-track/config.json` to find data directory
2. Validates data directory exists
3. Writes `.dev-track/.port` file for CLI API discovery
4. Updates registry with current port and lastAccessed timestamp
5. Spawns `npx tsx server/index.ts` with environment variables:
   - `DEV_TRACK_DATA_DIR`: Path to data directory
   - `DEV_TRACK_PORT`: Server port
6. Opens browser to `http://localhost:<port>` after 2-second delay (unless `--no-browser`)
7. Handles graceful shutdown on Ctrl+C

**Port discovery:** The CLI writes the active port to `.dev-track/.port` so other CLI commands can auto-discover the API endpoint.

**Example output:**
```
  Starting dev-track for: my-app
  Data: ~/.dev-track/projects/my-app/data
  Port: 24680
  Server: /path/to/dev-track/server/index.ts

  [Server logs follow...]
```

#### `projects`
List all registered DevTrack projects.

```bash
dev-track projects
```

**Example output:**
```
  Registered projects:

  ✓ my-app (my-app)
    Path: /Users/dev/projects/my-app
    Data: ~/.dev-track/projects/my-app/data
    Port: 24680
    Last: 2026-02-09T01:00:00Z

  ✗ old-project (old-project)
    Path: /Users/dev/projects/old-project
    Data: ~/.dev-track/projects/old-project/data
    Last: 2026-01-15T10:30:00Z
```

The `✓` or `✗` indicates whether both the project path and data directory still exist.

#### `dev`
Run DevTrack itself in development mode (server + UI concurrently).

```bash
dev-track dev
```

This is **only for DevTrack development**, not for using DevTrack on other projects. It runs `npm run dev` in the DevTrack repository, which starts:
- Server on port 24680 with hot reload
- Vite dev server on port 24681 with React Fast Refresh

### Resource Commands (Legacy API)

These commands require a running server and interact with the REST API.

#### Session Management
```bash
dev-track session start <objective> [--appetite 4h] [--developer name]
dev-track session status
dev-track session end <retro> [--handoff "message"]
dev-track session log [--limit 5]
```

#### Backlog Management
```bash
dev-track backlog list [--horizon now|next|later]
dev-track backlog add <title> [--horizon later] [--size M] [--category general] [--summary "..."]
dev-track backlog complete <id>
dev-track backlog move <id> --horizon next
dev-track backlog update <id> [--status in_progress] [--title "..."] [--size L] [--assignee name]
```

#### Issue Tracking
```bash
dev-track issue list [--status open|in_progress|resolved] [--action action-id]
dev-track issue create <title> [--severity medium] [--symptoms "..."] [--files file1,file2]
dev-track issue resolve <id> --resolution "How it was fixed"
```

#### Diagnostics
```bash
dev-track action list
dev-track action health
dev-track action run <id>
```

#### Changelog
```bash
dev-track changelog list [--limit 10]
dev-track changelog add <title> [--category feature] [--description "..."] [--items "item1|item2"]
```

#### State & Metrics
```bash
dev-track state get
dev-track state update <system-id> [--rating 8] [--status healthy] [--notes "..."]
dev-track metrics velocity
dev-track metrics summary
dev-track status line      # One-line status
dev-track status full      # Full status JSON
```

## Key Files

### `cli/index.ts` (649 lines)

The entire CLI implementation. Key sections:

**Lines 1-75: Helpers & Setup**
- `ensureDir()`, `readJSON()`, `writeJSON()`, `slugify()` — utility functions
- Path constants: `DEVTRACK_HOME`, `REGISTRY_PATH`, `SETTINGS_PATH`

**Lines 77-100: API Client**
- `getBaseUrl()` — discovers server port from `.dev-track/.port` or env var
- `api()` — fetch wrapper with error handling
- `parseFlags()` — command-line flag parser

**Lines 102-250: Init Command**
- `initProject()` — scaffolds new project (lines 102-247)
- `generateCursorRule()` — creates AI context file from template (lines 249-276)
- `findDevTrackRoot()` — locates DevTrack installation (lines 278-289)

**Lines 291-375: Start Command**
- `startServer()` — launches server with tsx, handles port management, opens browser

**Lines 377-392: Projects Command**
- `listProjects()` — displays registry with validation

**Lines 394-407: Dev Command**
- `devMode()` — runs DevTrack in development mode

**Lines 409-600: Resource Commands**
- `handleResourceCommand()` — legacy API interaction for session, backlog, issue, action, changelog, state, metrics, status

**Lines 602-649: Main Entry Point**
- Command routing and help text

### Template: `templates/dev-track.mdc`

The Cursor rule template that gets copied to `.dev-track/rules/dev-track.mdc` during init. This is the **AI context file** that loads automatically in Cursor and other AI tools.

**Key sections:**
- **Mandatory checklist**: After every code change, write changelog + update backlog + create issues
- **Quick Status**: Auto-updated placeholder for project health
- **Last Session Briefing**: Auto-updated context handoff
- **File Map**: Complete reference to all data files
- **Session Lifecycle**: How to start/during/end sessions
- **AI Brain**: Persistent memory system instructions
- **AI Autonomy Permissions**: What the AI can do proactively
- **Standing Instructions**: User preferences (learned over time)

This template is the **bridge between DevTrack and AI tools**. It's what makes the AI aware of DevTrack's existence and conventions.

## Configuration

### `.dev-track/config.json` (Project-local)

```json
{
  "projectId": "my-app",
  "name": "My App",
  "dataDir": "~/.dev-track/projects/my-app/data",
  "projectPath": "/Users/dev/projects/my-app",
  "port": null
}
```

This file is the **link** between the project repository and the central data directory. The CLI reads this to find where data lives.

### `.dev-track/.port` (Ephemeral)

Written by `start` command, deleted on shutdown. Contains just the port number:

```
24680
```

The CLI reads this file to auto-discover the API endpoint for resource commands.

### `~/.dev-track/projects.json` (Central Registry)

See [Multi-Project Registry](#multi-project-registry) above.

### `.credentials.json` (Project-local, gitignored)

API keys for AI providers and integrations:

```json
{
  "ai": {
    "openai": "sk-...",
    "anthropic": "sk-ant-...",
    "google": "..."
  }
}
```

Created by `init` as an empty stub. User fills in keys as needed.

## Integration with Other Systems

### → Server
The CLI **spawns the server** as a child process. It doesn't import server code — it just runs `npx tsx server/index.ts` with environment variables.

### → Data Layer
The CLI **writes directly to data files** during `init` to scaffold the project. After that, it only reads `.dev-track/config.json` and `.dev-track/.port`.

### → AI Tools (Cursor, Claude, etc.)
The CLI **generates the Cursor rule** (`dev-track.mdc`) that loads into AI tools. This is the primary integration point — the rule file is what makes AI tools aware of DevTrack.

### → Web UI
The CLI **opens the browser** to the UI after starting the server. No direct code integration.

## Known Issues

### ISS-006: AI Context Drift (High Severity)
**Symptom:** AI doesn't reliably follow DevTrack rules (e.g., forgot to write changelog entries in session 3).

**Root cause:** Three factors:
1. Cursor rule had no frontmatter initially (may not have loaded)
2. Behavioral instructions were buried at line 74, not at the top
3. Passive text instructions are unreliable for AI behavior enforcement

**Status:** Partial mitigations applied (frontmatter, checklist moved to top). Deeper fix requires automation engine to actively monitor and enforce (ISS-034, ISS-012).

**Impact on CLI:** The template generation (`generateCursorRule()`) now includes proper frontmatter and checklist positioning, but the structural issue remains.

### ISS-034: File Watcher Semantic Triggers (Critical)
**Symptom:** Automations only fire when changes go through API routes, not when data is edited directly (e.g., Cursor editing JSON).

**Root cause:** File watcher sees changes but doesn't diff before/after state to determine semantic meaning.

**Impact on CLI:** When users edit data files directly (bypassing the server API), automations don't fire. This affects session-end workflows where the CLI might write session data directly.

**Workaround:** Always use API routes for state changes, or manually trigger automations.

### npm link Crashes Cursor (Undocumented)
**Symptom:** Running `npm link` in the DevTrack repo causes Cursor to crash or hang.

**Root cause:** Unknown. Possibly related to symlink handling or TypeScript resolution.

**Workaround:** Use `npx tsx /path/to/dev-track/cli/index.ts` instead of linking.

## Usage Patterns

### First-Time Setup (New Project)

```bash
cd ~/projects/my-app
npx tsx /path/to/dev-track/cli/index.ts init
npx tsx /path/to/dev-track/cli/index.ts start
```

Browser opens to dashboard. Start working.

### Daily Workflow (Returning to Project)

```bash
cd ~/projects/my-app
npx tsx /path/to/dev-track/cli/index.ts start
```

That's it. Data persists in `~/.dev-track/projects/my-app/data/`.

### Multi-Project Switching

```bash
# Terminal 1
cd ~/projects/app-a
npx tsx /path/to/dev-track/cli/index.ts start --port 24680

# Terminal 2
cd ~/projects/app-b
npx tsx /path/to/dev-track/cli/index.ts start --port 24681
```

Both projects run simultaneously on different ports. Data is isolated.

### Checking All Projects

```bash
npx tsx /path/to/dev-track/cli/index.ts projects
```

Shows all registered projects with paths and last accessed times.

### Querying Without UI (API Commands)

```bash
# Start server in background
npx tsx /path/to/dev-track/cli/index.ts start --no-browser &

# Query from CLI
npx tsx /path/to/dev-track/cli/index.ts backlog list --horizon now
npx tsx /path/to/dev-track/cli/index.ts issue list --status open
npx tsx /path/to/dev-track/cli/index.ts status line
```

This is useful for scripting or AI tool integrations.

## API Discovery

The CLI uses a **three-tier fallback** for finding the server:

1. **`.dev-track/.port` file** — written by `start` command, most reliable
2. **`DEV_TRACK_URL` environment variable** — for custom setups
3. **Default port 24680** — fallback

This allows resource commands to work without knowing the port in advance.

## Future Enhancements

### Planned (No Roadmap Items Yet)

- **Interactive prompts**: Use inquirer or similar for guided setup
- **Rich terminal output**: Colors, progress bars, tables (using chalk, ora, cli-table3)
- **Global install support**: Publish to npm, install with `npm i -g dev-track`
- **Shell completions**: Bash/zsh autocomplete for commands and flags
- **Project templates**: `init --template react-app` to scaffold with presets
- **Migration tools**: `dev-track migrate` to upgrade data format between versions
- **Health checks**: `dev-track doctor` to diagnose common issues
- **Backup/restore**: `dev-track backup` and `dev-track restore <backup-id>`

### Related Ideas

- **IDEA-027: Conversation Bridge** (exploring, critical) — Capture Cursor/Claude conversations and sync to DevTrack. This would make the CLI aware of AI conversations happening outside the dashboard.

## Testing Status

**Current state:** Never fully tested against a live server (contributes to 55/100 health score).

**What's been tested:**
- ✓ `init` command — scaffolds projects successfully
- ✓ `projects` command — lists registry
- ✓ `start` command — launches server (manual testing only)
- ✓ Template generation — creates valid Cursor rules

**What hasn't been tested:**
- ✗ Resource commands (session, backlog, issue, etc.) — no automated tests
- ✗ Multi-project port management — edge cases unknown
- ✗ Error handling — many failure modes unexplored
- ✗ Cross-platform compatibility — only tested on macOS/Windows

**Blockers for testing:**
- No test suite exists yet
- Server must be running for resource commands (integration test complexity)
- Manual testing is tedious and incomplete

## Dependencies

**Runtime:**
- `fs`, `path`, `os` — Node.js built-ins for file system operations
- `child_process` — for spawning server process
- `fetch` — for API calls (Node 18+ built-in)

**Execution:**
- `tsx` — TypeScript execution (via npx)
- `npx` — npm package runner

**No production dependencies.** The CLI is intentionally dependency-free for portability.

## Cross-References

### Related Systems
- **[Server](system-server)** — spawned by CLI, receives environment variables
- **[Data Layer](system-data-layer)** — CLI scaffolds data files during init
- **[Cursor Rule / AI Context](system-cursor-rule)** — CLI generates the rule file from template

### Related Docs
- **[Getting Started](getting-started)** — user-facing guide to init and start
- **[Architecture Overview](system-overview)** — how CLI fits into the overall system
- **[Multi-Project Setup](multi-project-setup)** — detailed guide to registry and isolation (if exists)

### Related Issues
- **ISS-006** — AI context drift (affects Cursor rule generation)
- **ISS-034** — File watcher semantic triggers (affects direct data edits)

---

**Last updated:** 2026-02-09  
**Health score:** undefined/100 (never fully tested against live server)  
**Status:** Healthy (functional but under-tested)  
**Tech stack:** TypeScript, Node.js  
**Lines of code:** 649  
**Test coverage:** 0%