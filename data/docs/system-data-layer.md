# System: Data Layer (JSON + TypeScript)

> **Auto-generated** | Last refreshed: 2026-02-09 | Health: 95/100 ✅ Healthy

---

## Overview

The Data Layer is DevTrack's foundation — the highest-health system at 95/100. It provides typed JSON file storage for all 14 entity types, with an in-memory store for fast reads and atomic file writes for persistence. All data is human-readable, git-friendly, and directly accessible by AI tools.

## Key Stats

| Metric | Value |
|--------|-------|
| Health Score | 95/100 |
| Entity Types | 14 |
| Type Definitions | ~500 lines in shared/types.ts |
| Data Directories | 14 (roadmap, systems, releases, activity, labels, automations, docs, issues, ideas, session, brain, ai, metrics, changelog) |
| Dependencies | None (foundation layer) |
| Dependents | server, codebase-scanner, brain |

## Core Design Principles

1. **Files are the source of truth** — Not a database. JSON files committed to git.
2. **Human-readable** — Any developer can open and understand the data files.
3. **AI-writable** — AI can read/write files directly without the server running.
4. **Git-friendly** — Text files are diffable, mergeable, reviewable.
5. **Typed interfaces** — All entities have TypeScript interfaces in shared/types.ts.

## Store Architecture

```
shared/types.ts (14 entity interfaces, ~500 lines)
  ↓ imported by
server/store.ts (in-memory store)
  ├── Reads JSON files on startup → hydrates memory
  ├── Provides typed getters for all entities
  ├── Writes mutations atomically to disk
  └── File watcher re-reads on external changes

server/watcher.ts (chokidar)
  ├── Watches data/ directory for changes
  ├── Debounces to avoid echo from own writes
  ├── Reloads affected files into store
  └── Broadcasts changes via WebSocket
```

## Data Migration

The v2 entity model was shipped with a migration script (`scripts/migrate-v2.ts`) that:
- Moved `backlog/items.json` → `roadmap/items.json`
- Extracted systems from `state.json` → `systems/items.json`
- Created new directories: roadmap/, systems/, releases/, activity/, labels/, automations/
- Preserved all existing data with backward compatibility

## Why Not a Database?

This is a core architectural decision (BN-002):
- **Git integration** — Text files diff cleanly, merge naturally, appear in PRs
- **AI access** — AI tools can read/write files directly without the server running
- **Portability** — No database setup, no migrations, no connection strings
- **Transparency** — Open a file, see the data. No query language needed.
- **Optional SQLite cache** planned for complex queries when data volume grows
