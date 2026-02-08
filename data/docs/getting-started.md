# Getting Started with DevTrack

> **Auto-generated** | Last refreshed: 2026-02-09 | Sources: systems, codebase

---

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** or compatible package manager
- **Git** installed and configured
- A code editor (Cursor recommended for AI integration)

---

## Installation & Setup

### 1. Clone and Install

```bash
# From the dev-track project root
npm install
```

### 2. Start the Dev Servers

```bash
npm run dev
```

This starts:
- **API Server** at `http://localhost:24680` (Hono)
- **UI Dev Server** at `http://localhost:24681` (Vite)

> **Note:** Port 24680 was chosen to avoid conflicts with common dev ports (3000, 5173, 8080).

### 3. Open the Dashboard

Navigate to `http://localhost:24681` in your browser. You'll see the full DevTrack UI with:
- Dashboard with project health overview
- Sidebar navigation to all 12 views
- AI chat sidebar (requires API keys)
- Project switcher (if multiple projects registered)

---

## Initialize a New Project

```bash
# Navigate to your project directory
cd /path/to/your-project

# Initialize dev-track
npx tsx /path/to/dev-track/cli/index.ts init
```

This creates:
- `.dev-track/config.json` in your project directory
- Data directory at `~/.dev-track/projects/<project-id>/data/`
- Cursor rule at `.cursor/rules/dev-track.mdc`
- Updates `.gitignore` to exclude credentials

### Start the Server for a Project

```bash
npx tsx /path/to/dev-track/cli/index.ts start
```

Or with flags:
```bash
npx tsx /path/to/dev-track/cli/index.ts start --port 24680 --data-dir ~/.dev-track/projects/my-project/data
```

### List All Projects

```bash
npx tsx /path/to/dev-track/cli/index.ts projects
```

---

## Configuring AI Providers

DevTrack supports three AI providers. Configure API keys in the UI:

1. Open **Settings** → **Integrations** tab
2. Under **AI Providers**, enter keys for:
   - **OpenAI** — GPT-4o, GPT-4o-mini, etc.
   - **Anthropic** — Claude Sonnet, Haiku, Opus
   - **Google** — Gemini Pro, Flash
3. Click **Test Connection** to verify each key
4. (Optional) Configure **Helicone** for AI cost tracking under Development Tools

The AI chat sidebar will auto-discover available models from your configured providers.

---

## Multi-Project Support

DevTrack supports multiple projects with a central registry:

- **Registry location:** `~/.dev-track/registry.json`
- **Per-project data:** `~/.dev-track/projects/<id>/data/`
- **Hot-swap:** Switch projects in the UI sidebar without restarting the server

### Switching Projects

1. Click the project name in the sidebar
2. Select a different project from the dropdown
3. The server hot-swaps data directories and reloads

---

## Key Concepts

### Horizons (Now / Next / Later)
- **Now** — Currently being worked on (max 3 items recommended)
- **Next** — Up next when Now items complete
- **Later** — Backlog for future consideration
- **Shipped** — Completed items (auto-moved on completion)

### Sessions
DevTrack tracks work in sessions. Start a session with an objective, ship items, end with a retrospective. The AI tracks velocity and suggests next priorities.

### Entity Model (v2)
14 entity types organized in a hierarchy:
```
Ideas → Roadmap Items → Epics → Milestones → Releases
Issues ↔ linked to Roadmap Items
Systems (live architecture map)
Sessions → Changelog entries
Docs (auto-generated + human-edited)
```

### AI Chat
The sidebar chat agent has ~40 tools across 16 domains. It can read and write every entity in DevTrack, scan codebases, read git history, manage files, and run automations. It's the primary interface for power users.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `dev-track init` | Initialize DevTrack in a project |
| `dev-track start` | Start the server |
| `dev-track status` | Show project status |
| `dev-track backlog` | List backlog items |
| `dev-track issues` | List issues |
| `dev-track changelog` | Show recent changelog |
| `dev-track context --platform cursor` | Generate AI context file |
| `dev-track projects` | List all registered projects |

> **Warning:** `npm link` may crash Cursor. Use `npx tsx path/to/cli/index.ts` for dogfooding.

---

## Known Issues

- **ISS-003:** Integration plugins (Vercel, Supabase, Sentry, etc.) are untested with real API keys. GitHub works zero-config via local `gh` CLI.
- **ISS-006:** AI context drift — the coding AI doesn't always follow DevTrack tracking rules. Structural enforcement (AI watcher) is planned.
- **ISS-012:** No bridge between external AI tools (Cursor, Claude) and DevTrack. Conversations in those tools are invisible to DevTrack unless manually logged.
- Server may crash on `tsx watch` reload with EADDRINUSE. Kill stale node processes before restart.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Server | Hono, TypeScript, Node.js |
| Frontend | React 18, Vite, Tailwind CSS |
| Data | JSON files, TypeScript interfaces |
| AI | OpenAI, Anthropic, Google AI SDKs |
| AI Proxy | Helicone (optional, for cost tracking) |
| File Watching | chokidar |
| Live Updates | WebSocket |
| Codebase Viz | react-flow, dagre |
| DnD | @dnd-kit |
| Markdown | react-markdown, remark-gfm |
| Icons | Lucide React |
