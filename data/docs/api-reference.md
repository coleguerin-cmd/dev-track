# API Reference

> **Auto-generated** | Last refreshed: 2026-02-09 | Sources: codebase, modules

---

## Base URL

```
http://localhost:24680/api/v1
```

All endpoints return JSON. WebSocket available at `ws://localhost:24680/ws`.

---

## Roadmap / Backlog

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/backlog` | List all roadmap items (filter: `?horizon=now&status=pending`) |
| POST | `/backlog` | Create a new roadmap item |
| PUT | `/backlog/:id` | Update a roadmap item |
| DELETE | `/backlog/:id` | Delete a roadmap item |
| POST | `/backlog/:id/move` | Move item to different horizon |
| POST | `/backlog/:id/complete` | Mark item as completed |
| POST | `/backlog/:id/reopen` | Reopen a completed item |

## Issues

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/issues` | List all issues (filter: `?status=open&severity=high`) |
| POST | `/issues` | Create a new issue |
| PUT | `/issues/:id` | Update an issue |
| POST | `/issues/:id/resolve` | Resolve an issue with resolution text |
| POST | `/issues/:id/reopen` | Reopen a resolved issue |

## Ideas

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ideas` | List all ideas (filter: `?status=captured&category=feature`) |
| POST | `/ideas` | Capture a new idea |
| PUT | `/ideas/:id` | Update an idea |
| POST | `/ideas/:id/promote` | Promote idea to roadmap item |

## Changelog

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/changelog` | List changelog entries (filter: `?limit=20`) |
| POST | `/changelog` | Add a new changelog entry |

## Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/session` | Get current session + recent history |
| POST | `/session/start` | Start a new session |
| POST | `/session/end` | End current session with retro |

## Project State

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/state` | Get full project state (health, systems) |
| GET | `/state/quick` | Get one-line status summary |
| PUT | `/state` | Update project state |

## Brain / AI Memory

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/brain/notes` | Get brain notes (filter: `?type=warning`) |
| POST | `/brain/notes` | Add a brain note |
| GET | `/brain/context-recovery` | Get session handoff data |
| PUT | `/brain/context-recovery` | Write context recovery |
| GET | `/brain/preferences` | Get user preferences |
| PUT | `/brain/preferences` | Update preferences |

## AI / Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ai/chat` | Send chat message (SSE streaming response) |
| GET | `/ai/profile` | Get user profile |
| PUT | `/ai/profile` | Update user profile |
| POST | `/ai/profile/observations` | Add session observation |
| PUT | `/ai/credentials` | Save AI provider credentials |
| POST | `/ai/providers/:id/test` | Test AI provider connection |

## Codebase

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/codebase/stats` | Get codebase statistics |
| GET | `/codebase/modules` | Get module definitions |
| GET | `/codebase/search?q=...` | Search files, functions, routes |
| GET | `/codebase/file?path=...` | Get file details (exports, imports) |
| POST | `/codebase/scan` | Trigger fresh codebase scan |

## Git

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/git/status` | Current branch, modified files |
| GET | `/git/diff` | Unstaged changes (`?staged=true` for staged) |
| GET | `/git/log` | Commit history (`?count=20&since=2026-01-01`) |
| GET | `/git/branches` | All branches |

## Docs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/docs` | List all documents |
| GET | `/docs/:id` | Get document content |
| POST | `/docs` | Create a document |
| PUT | `/docs/:id` | Update a document |
| DELETE | `/docs/:id` | Delete a document |

## Integrations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/integrations` | Get all integration statuses |
| POST | `/integrations/:id/test` | Test integration connection |
| PUT | `/integrations/:id/credentials` | Save integration credentials |

## Systems

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/systems` | List all systems |
| POST | `/systems` | Create a system |
| PUT | `/systems/:id` | Update a system |

## Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/project` | Current project info |
| GET | `/projects` | All registered projects |
| POST | `/projects/switch` | Hot-swap to different project |

## Config

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/config` | Get project configuration |
| PUT | `/config` | Update project configuration |

## Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/metrics/velocity` | Velocity data per session |

## WebSocket

Connect to `ws://localhost:24680/ws` for real-time updates.

**Events pushed:**
- `file_changed` — A data file was modified (includes file path and entity type)

The UI uses these events to refresh views and trigger toast notifications.
