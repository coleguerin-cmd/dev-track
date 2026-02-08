# System: Server (Hono API)

> **Auto-generated** | Last refreshed: 2026-02-09 | Health: 90/100 ✅ Healthy

---

## Overview

The Server is the central hub of DevTrack. Built on **Hono** (ultra-lightweight HTTP framework), it serves the REST API, manages WebSocket connections for live updates, hosts the AI intelligence layer, runs the file watcher, and coordinates all data operations.

## Key Stats

| Metric | Value |
|--------|-------|
| Health Score | 90/100 |
| Status | Healthy |
| Route Files | 16 (v2: + roadmap, epics, milestones, releases, systems, labels, automations) |
| Tech Stack | Hono, TypeScript, Node.js |
| Port | 24680 |
| Dependencies | data-layer |
| Dependents | web-ui, cli |

## Core Files

| File | Purpose |
|------|---------|
| `server/index.ts` | Entry point — mounts routes, starts server, WebSocket setup |
| `server/store.ts` | In-memory data store — reads JSON files, provides typed access |
| `server/watcher.ts` | chokidar file watcher — syncs file changes to store, broadcasts via WebSocket |
| `server/ws.ts` | WebSocket handler — broadcasts file_changed events to connected clients |
| `server/project-config.ts` | Centralized project config — all server files use this instead of hardcoded paths |
| `server/script-runner.ts` | Diagnostic script execution with stdout/stderr capture |
| `server/context-sync.ts` | Generates AI context files for different platforms (Cursor, Claude, etc.) |

## API Routes (16 files)

| Route File | Endpoints | Description |
|------------|-----------|-------------|
| `routes/backlog.ts` | CRUD + move/complete/reopen | Roadmap item management |
| `routes/issues.ts` | CRUD + resolve/reopen | Issue tracking |
| `routes/ideas.ts` | CRUD + promote | Idea capture and promotion |
| `routes/changelog.ts` | List + create | Changelog entries |
| `routes/session.ts` | Start/end/list | Session lifecycle |
| `routes/state.ts` | Get/update project state | Overall health and system statuses |
| `routes/brain.ts` | Notes, preferences, context recovery | AI memory system |
| `routes/codebase.ts` | Scan, stats, modules, search, file details | Codebase analysis |
| `routes/git.ts` | Status, diff, log, branches | Git integration |
| `routes/docs.ts` | CRUD for wiki documents | Documentation management |
| `routes/integrations.ts` | Status, test, credentials | Integration plugin management |
| `routes/config.ts` | Get/update project config | Project settings |
| `routes/metrics.ts` | Velocity, session stats | Metrics and analytics |
| `routes/actions.ts` | CRUD for tracked actions | Action/feature health |
| `routes/activity.ts` | Activity feed | Unified event timeline |
| `routes/runs.ts` | Diagnostic run results | Script execution results |

## Multi-Project Architecture

The server supports multiple projects via centralized configuration:

- **Project registry:** `~/.dev-track/registry.json`
- **Per-project data:** `~/.dev-track/projects/<id>/data/`
- **Hot-swap:** `POST /api/v1/projects/switch` repoints data directory, reloads store, restarts file watcher — no server restart needed
- **Config module:** `server/project-config.ts` provides `getDataDir()`, `getProjectRoot()`, etc.

## Design Decisions

1. **Hono over Express** — Lighter, faster, modern TypeScript-first framework
2. **In-memory store with file sync** — Fast reads, atomic writes, file watcher keeps in sync
3. **Single port** — API + static frontend served from one port (no CORS issues)
4. **WebSocket for live updates** — Dashboard updates in real-time when AI changes files
5. **No database** — JSON files are the source of truth (git-friendly, AI-readable)

## Known Issues

- Server may crash on `tsx watch` reload with EADDRINUSE (port held by stale process)
- No authentication — local-only tool, trusts all connections
