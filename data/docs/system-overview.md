# System Architecture Overview

> **Auto-generated** | Last refreshed: 2026-02-09 | Sources: systems, codebase, modules

---

## Overview

DevTrack is a **project intelligence system** built for AI-assisted development. It runs as a local application on the developer's machine, providing a chat-first interface with ~40 AI tools across 16 domains, a rich web UI with 12+ views, and a CLI for automation.

**Key stats:**
- **59 source files** | **~10,000 lines of code** | **16 API route files** | **12 UI views**
- **11 tracked systems** | **Overall health: 76%**
- **14 entity types** (v2 entity model) | **~40 AI tools**
- **8 integration plugins** | **3 AI providers** (OpenAI, Anthropic, Google)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Developer's Machine                          │
│                                                                     │
│  ┌──────────────┐    ┌─────────────────────────────────────────┐   │
│  │  Cursor/IDE   │    │  dev-track server (:24680)              │   │
│  │  AI reads/    │───▶│  ├─ Hono HTTP (22 route files)         │   │
│  │  writes data  │    │  ├─ WebSocket (live updates)            │   │
│  │  files        │    │  ├─ AI Intelligence Layer               │   │
│  └──────────────┘    │  │   ├─ Multi-provider (OpenAI/Anthro/  │   │
│                       │  │   │  Google) with Helicone proxy     │   │
│  ┌──────────────┐    │  │   ├─ ModelRouter (auto-discovery)    │   │
│  │  Browser UI   │    │  │   ├─ ChatService (multi-turn agent) │   │
│  │  :24681 (dev) │◀──│  │   └─ ~40 tools / 16 domains         │   │
│  │  12+ views    │    │  ├─ File watcher (chokidar)            │   │
│  │  AI chat      │    │  ├─ Codebase scanner                   │   │
│  │  sidebar      │    │  └─ Integration plugins (8)            │   │
│  └──────────────┘    └─────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Data Layer (JSON + TypeScript)                              │   │
│  │  ~/.dev-track/projects/<id>/data/                            │   │
│  │  ├─ roadmap/   systems/   releases/   activity/             │   │
│  │  ├─ issues/    ideas/     changelog/  docs/                 │   │
│  │  ├─ session/   brain/     ai/         metrics/              │   │
│  │  └─ labels/    automations/                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────┐                                                  │
│  │  CLI          │  dev-track init | start | status | projects     │
│  └──────────────┘                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## System Health Summary

| System | Health | Status | Tech Stack |
|--------|--------|--------|------------|
| **Data Layer** | 95/100 | ✅ Healthy | TypeScript, JSON |
| **Server (Hono API)** | 90/100 | ✅ Healthy | Hono, TypeScript, Node.js |
| **AI Brain System** | 85/100 | ✅ Healthy | TypeScript, JSON |
| **Codebase Visualizer** | 80/100 | ✅ Healthy | React, react-flow, dagre |
| **Codebase Scanner** | 80/100 | ✅ Healthy | TypeScript |
| **Web UI** | 75/100 | ✅ Healthy | React, Vite, Tailwind, TypeScript |
| **AI Intelligence Layer** | 75/100 | ✅ Healthy | OpenAI, Anthropic, Google AI, TypeScript |
| **Session Tracking** | 75/100 | ✅ Healthy | TypeScript |
| **Cursor Rule / AI Context** | 70/100 | ✅ Healthy | MDC |
| **Integration Plugins** | 60/100 | ✅ Healthy | TypeScript |
| **CLI** | 55/100 | ✅ Healthy | TypeScript, Node.js |

---

## System Dependencies

```
data-layer (foundation — no dependencies)
  ├── server ──────────────▶ web-ui
  │   ├── ai-intelligence   cli
  │   ├── integrations
  │   ├── codebase-visualizer ◀── codebase-scanner
  │   └── session-tracking
  ├── codebase-scanner
  └── brain
```

**Key relationships:**
- **Data Layer** is the foundation — all other systems depend on it directly or indirectly
- **Server** is the central hub — serves the API, hosts WebSocket, mounts all routes
- **Web UI** and **CLI** are consumer interfaces — both talk to the Server
- **AI Intelligence Layer** has full CRUD access to all data via ~40 tools
- **Codebase Visualizer** depends on **Codebase Scanner** for graph data

---

## Module Breakdown (from codebase scan)

| Module | Files | Description |
|--------|-------|-------------|
| Server Routes | 16 | API endpoints for all 14 entity types + git, codebase, config |
| UI Views | 12 | Dashboard, Roadmap, Systems, Issues, Ideas, Codebase, Sessions, Changelog, Docs, Metrics, Settings, Actions |
| UI Components | 5+ | Sidebar, StatusBadge, RadarChart, NotificationTray, graph components |
| Server Integrations | 10 | 8 plugins + manager + types |
| Server Core | 7 | index.ts, store.ts, watcher.ts, ws.ts, scanner, context-sync, script-runner |
| AI Tools | 16+ | Modular tool registry — one file per domain |
| Shared | 1 | types.ts — 14 entity types, ~500 lines |
| CLI | 1 | Full command set for project management |

---

## Key Architectural Decisions

1. **File-based data** — JSON + Markdown files committed to git. Human-readable, AI-writable, diffable. No database dependency.
2. **Chat-first architecture** — The AI chat with tool access IS the product. Everything else is automation of patterns established through conversation.
3. **Auto-discover models** — Provider APIs are queried at startup to discover available models. No hardcoded model IDs.
4. **Modular tool registry** — AI tools organized as 16 domain modules. Adding capabilities = adding a file.
5. **Multi-project hot-swap** — Single server instance, switch between projects without restart via POST /api/v1/projects/switch.
6. **NOT open source** — Building a paid product (local daemon + web platform).

---

## Current Focus

**Now:** AI chat agent with full tool access (chat-first architecture) — L, in_progress

**Next priorities:**
- Test AI chat in browser with real conversations
- Complete UI design overhaul (Phase 2)
- Build AI watcher for structural enforcement
- Session lifecycle with AI-driven closure prompting

**Open issues (3):**
- ISS-003: Integration plugins untested with real API keys (medium)
- ISS-006: AI context drift — structural enforcement needed (high)
- ISS-012: No bridge between external AI tools and DevTrack (high)
