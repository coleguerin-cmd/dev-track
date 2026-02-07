# dev-track — Complete Technical Specification

> **Version**: 0.1 (initial spec)
> **Date**: 2026-02-07
> **Status**: Design phase

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Data Model](#2-data-model)
3. [Server API](#3-server-api)
4. [Web UI](#4-web-ui)
5. [AI / Cursor Integration](#5-ai--cursor-integration)
6. [CLI Interface](#6-cli-interface)
7. [Diagnostic Engine](#7-diagnostic-engine)
8. [Cross-Project Portability](#8-cross-project-portability)
9. [Security & Privacy](#9-security--privacy)

---

## 1. System Architecture

### 1.1 Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    Developer's Machine                            │
│                                                                   │
│  ┌─────────────┐     ┌──────────────────────────────────────┐    │
│  │  Cursor IDE  │     │  dev-track server (:24680)           │    │
│  │             │     │                                       │    │
│  │  AI reads/  │────▶│  Hono HTTP server                    │    │
│  │  writes     │     │    ├─ REST API (/api/*)               │    │
│  │  .dev-track │     │    ├─ WebSocket (live updates)        │    │
│  │  files      │     │    ├─ Static file server (UI)         │    │
│  │             │     │    └─ Script runner (diagnostics)     │    │
│  │  AI calls   │     │                                       │    │
│  │  CLI cmds   │────▶│  File watcher (chokidar)             │    │
│  └─────────────┘     │    └─ Watches .dev-track/data/*      │    │
│                       │    └─ Reloads in-memory store        │    │
│  ┌─────────────┐     │    └─ Pushes WebSocket updates       │    │
│  │  Browser     │     │                                       │    │
│  │  :24680      │◀───│  In-memory data store                 │    │
│  │             │     │    └─ Hydrated from JSON/MD files    │    │
│  │  Dashboard  │     │    └─ Written back on mutations      │    │
│  │  Backlog    │     │                                       │    │
│  │  Issues     │     │  Optional: SQLite cache               │    │
│  │  Actions    │     │    └─ .dev-track/cache.db (gitignored)│    │
│  │  Timeline   │     │    └─ For complex queries/search     │    │
│  └─────────────┘     └──────────────────────────────────────┘    │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  .dev-track/ (committed to git)                           │    │
│  │    data/          ← JSON + MD files (source of truth)    │    │
│  │    server/        ← Server source code                    │    │
│  │    ui/            ← Frontend source code                  │    │
│  │    cli/           ← CLI source code                       │    │
│  │    package.json   ← Dependencies                          │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Design Decisions

**Why a local server instead of just files?**
- Browser can't read local files without a server (no File System Access API for this use case)
- Diagnostic scripts need a process to run in
- WebSocket enables live dashboard updates when AI changes files
- API provides validated, atomic operations (no half-written JSON)
- Server can run background tasks (file watching, health checks)

**Why JSON + Markdown files as source of truth (not SQLite)?**
- Text files are git-friendly (diffable, mergeable, reviewable)
- AI can read/write them directly without the server running
- Human-readable in any editor
- No binary files in the repo

**Why optional SQLite cache?**
- Complex queries (full-text search across issues, cross-referencing actions → issues → runs) are painful on flat JSON
- SQLite cache is rebuilt from files on server start (gitignored, disposable)
- Only needed when data volume grows — can skip in Phase 1

**Why port 24680?**
- Far from common dev ports (3000, 4000, 5000, 5173, 8000, 8080)
- Easy to remember (2-4-6-8-0)
- Single port serves both API and frontend (no CORS issues)

### 1.3 Directory Structure

```
.dev-track/
├── package.json                  ← Tool dependencies
├── tsconfig.json                 ← TypeScript config
├── dev-track.config.json         ← Tool configuration (ports, project name, etc.)
│
├── data/                         ← ALL project tracking data (committed to git)
│   ├── config.json               ← Project metadata
│   ├── state.json                ← System health ratings & scores
│   │
│   ├── session/
│   │   ├── current.json          ← Current session plan
│   │   └── log.json              ← Session history (array of retros)
│   │
│   ├── backlog/
│   │   └── items.json            ← All backlog items (now/next/later)
│   │
│   ├── changelog/
│   │   └── entries.json          ← Structured changelog entries
│   │
│   ├── actions/
│   │   ├── registry.json         ← All tracked actions/features
│   │   └── playbooks/            ← Diagnostic playbook files
│   │       ├── new-entry.md
│   │       ├── email-upload.md
│   │       └── extraction.md
│   │
│   ├── issues/
│   │   └── items.json            ← All issues (open + resolved)
│   │
│   ├── runs/                     ← Diagnostic run results
│   │   └── *.json                ← Timestamped run files
│   │
│   ├── designs/                  ← Architecture & design documents
│   │   ├── conversation-chains.md
│   │   └── email-pipeline.md
│   │
│   ├── decisions/                ← Architecture Decision Records (ADRs)
│   │   └── *.md
│   │
│   └── metrics/
│       └── velocity.json         ← Velocity tracking data
│
├── server/                       ← Backend source
│   ├── index.ts                  ← Entry point
│   ├── routes/                   ← API route handlers
│   │   ├── session.ts
│   │   ├── backlog.ts
│   │   ├── issues.ts
│   │   ├── actions.ts
│   │   ├── changelog.ts
│   │   ├── state.ts
│   │   ├── runs.ts
│   │   └── metrics.ts
│   ├── store.ts                  ← In-memory data store
│   ├── file-sync.ts              ← Read/write JSON + MD files
│   ├── watcher.ts                ← chokidar file watching
│   ├── ws.ts                     ← WebSocket handler
│   └── script-runner.ts          ← Diagnostic script execution
│
├── ui/                           ← Frontend source
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/                  ← API client + WebSocket hook
│   │   ├── components/           ← Shared components
│   │   ├── views/                ← Page views
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Backlog.tsx
│   │   │   ├── Issues.tsx
│   │   │   ├── Actions.tsx
│   │   │   ├── Sessions.tsx
│   │   │   ├── Changelog.tsx
│   │   │   ├── Designs.tsx
│   │   │   └── Metrics.tsx
│   │   └── styles/
│   └── vite.config.ts
│
├── cli/                          ← CLI source
│   └── index.ts                  ← CLI entry point
│
├── templates/                    ← Cursor rule templates
│   └── dev-track.mdc             ← The cursor rule
│
├── cache.db                      ← SQLite cache (gitignored)
└── .gitignore                    ← Ignores cache.db, node_modules, dist
```

---

## 2. Data Model

All data files live in `.dev-track/data/`. Every file has a defined JSON schema.

### 2.1 config.json — Project Metadata

```json
{
  "project": "pillar",
  "description": "Personal productivity & work management platform with AI",
  "created": "2026-02-07",
  "version": "0.1",
  "settings": {
    "doc_verbosity": "detailed",
    "max_now_items": 3,
    "max_session_history": 50,
    "max_run_history": 100,
    "auto_archive_resolved_issues_after_days": 30
  }
}
```

### 2.2 state.json — System Health & Ratings

The bird's-eye view of the project. Replaces CURRENT_STATE.md with structured data.

```json
{
  "last_updated": "2026-02-07",
  "overall_completion": 85,
  "summary": "Work v1.0 ~85% complete. Brain is built. Polish and daily-driver testing remain.",
  "systems": [
    {
      "id": "core-crm",
      "name": "Core CRM (extraction, entities, events)",
      "status": "production",
      "rating": 9,
      "notes": "Extraction works well, proactive fuzzy dedup, conversation chains link events"
    },
    {
      "id": "email-ingestion",
      "name": "Email Ingestion (EML/MSG)",
      "status": "production",
      "rating": 8,
      "notes": "Text/body parsing solid, Tier 1 attachment metadata, email chain headers extracted"
    },
    {
      "id": "entity-continuity",
      "name": "Entity Continuity",
      "status": "v1_complete",
      "rating": 8,
      "notes": "Conversation chains implemented. AI-assisted matching for voice/chat still pending."
    }
  ],
  "remaining": {
    "must_have": [
      { "item": "Enum dropdown selects for stage/type fields", "done": false },
      { "item": "Date pickers for date fields", "done": false },
      { "item": "Daily-driver testing with real deals", "done": false },
      { "item": "Artifact-event-entity linking", "done": false },
      { "item": "Proactive entity dedup", "done": true, "completed": "2026-02-06" }
    ],
    "important": [
      { "item": "Source indicators in timelines", "done": false },
      { "item": "Session tray persistence (localStorage)", "done": false },
      { "item": "Chat history attachments survive refresh", "done": false }
    ]
  }
}
```

### 2.3 session/current.json — Current Session Plan

Written at the start of each session. Read by the AI to orient.

```json
{
  "date": "2026-02-07",
  "started_at": "2026-02-07T10:00:00Z",
  "ended_at": null,
  "status": "active",
  "objective": "Ship AI-assisted conversation matching for voice/chat inputs",
  "appetite": "4h",
  "items": [
    {
      "backlog_id": "conv-matching-ai",
      "title": "Add conversation hints to extraction prompt",
      "status": "in_progress"
    },
    {
      "backlog_id": "conv-matching-context",
      "title": "Return conversation summaries in enterprise context",
      "status": "pending"
    },
    {
      "backlog_id": "conv-matching-test",
      "title": "Test voice note → existing conversation matching",
      "status": "pending"
    }
  ],
  "wont_do": [
    "Graph view (next session)",
    "Design pass (separate session)"
  ],
  "notes": ""
}
```

### 2.4 session/log.json — Session History

Append-only log of completed sessions. AI reads the last entry at session start.

```json
{
  "sessions": [
    {
      "date": "2026-02-06",
      "started_at": "2026-02-06T14:00:00Z",
      "ended_at": "2026-02-06T23:30:00Z",
      "duration_hours": 9.5,
      "objective": "Ship conversation chains + entity dedup + performance overhaul",
      "items_planned": 8,
      "items_shipped": 17,
      "shipped": [
        { "title": "Pipeline/Insights crash fix", "size": "S", "category": "bugfix" },
        { "title": "Conversation chains infrastructure", "size": "L", "category": "core" },
        { "title": "Entity dedup hardening (pg_trgm)", "size": "M", "category": "core" },
        { "title": "Threaded timeline UI", "size": "M", "category": "ui" },
        { "title": "Performance overhaul (region co-location)", "size": "L", "category": "infra" }
      ],
      "discovered": [
        "Multi-entity extraction drops entities when 6+ contacts",
        "Entity overlap matching needs minimum threshold to avoid false positives"
      ],
      "next_session_suggestion": "AI-assisted conversation matching + artifact storage"
    }
  ]
}
```

### 2.5 backlog/items.json — Three-Horizon Backlog

Every trackable item. Structured for cheap AI reads (filter by horizon).

```json
{
  "items": [
    {
      "id": "conv-matching-ai",
      "title": "AI-Assisted Conversation Matching",
      "horizon": "now",
      "size": "L",
      "status": "in_progress",
      "category": "core-pipeline",
      "summary": "Voice/chat entries matched to existing conversations via entity + topic overlap",
      "design_doc": "designs/conversation-chains.md#phase-3",
      "depends_on": ["conv-chains-schema"],
      "created": "2026-02-06",
      "updated": "2026-02-07",
      "completed": null
    },
    {
      "id": "artifact-linking",
      "title": "Artifact Storage & Entity Linking",
      "horizon": "now",
      "size": "M",
      "status": "pending",
      "category": "core-pipeline",
      "summary": "Uploaded files linked to events in conversations, shown on detail pages",
      "design_doc": "designs/artifact-storage.md",
      "depends_on": [],
      "created": "2026-02-06",
      "updated": "2026-02-06",
      "completed": null
    },
    {
      "id": "design-pass",
      "title": "App-Wide Design Pass",
      "horizon": "now",
      "size": "M",
      "status": "pending",
      "category": "ui",
      "summary": "Contrast, spacing, typography, dark theme readability improvements",
      "design_doc": null,
      "depends_on": [],
      "created": "2026-02-06",
      "updated": "2026-02-06",
      "completed": null
    },
    {
      "id": "email-pipeline",
      "title": "Bulk Input Chunking & Email Pipeline",
      "horizon": "later",
      "size": "XL",
      "status": "pending",
      "category": "core-pipeline",
      "summary": "Tiered email processing: filter → triage → extract → knowledge. $1-3/day target.",
      "design_doc": "designs/email-pipeline.md",
      "depends_on": ["conv-matching-ai", "artifact-linking", "multi-target-extraction"],
      "created": "2026-02-06",
      "updated": "2026-02-06",
      "completed": null
    }
  ]
}
```

**Field reference:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique slug identifier |
| `title` | string | Human-readable title |
| `horizon` | `"now"` \| `"next"` \| `"later"` | Priority horizon |
| `size` | `"S"` \| `"M"` \| `"L"` \| `"XL"` | S: <30min, M: 1-3h, L: 4-8h, XL: multi-session |
| `status` | `"pending"` \| `"in_progress"` \| `"completed"` \| `"cancelled"` | Current status |
| `category` | string | Grouping tag (core-pipeline, ui, infra, bugfix, etc.) |
| `summary` | string | One-line description (AI context-friendly) |
| `design_doc` | string \| null | Path to design doc, optional with anchor |
| `depends_on` | string[] | IDs of prerequisite items |
| `created` | ISO date | When added |
| `updated` | ISO date | Last modified |
| `completed` | ISO date \| null | When completed |

**WIP rule**: Maximum `settings.max_now_items` (default 3) items in `horizon: "now"` at any time. Server enforces this on writes.

### 2.6 changelog/entries.json — Structured Changelog

Replaces the markdown changelog. Each entry is a dated record of what shipped.

```json
{
  "entries": [
    {
      "id": "chg-20260206-conv-chains",
      "date": "2026-02-06",
      "session_date": "2026-02-06",
      "category": "core-pipeline",
      "title": "Conversation Chains Infrastructure",
      "description": "3 new columns on events table (parent_event_id, conversation_id, conversation_root_id). Matching algorithm with 3 strategies: email chain, deal overlap, entity+topic. Email dedup by Message-ID.",
      "items": [
        "Migration with 4 indexes on remote + local",
        "conversation-matching.ts with 3 strategies",
        "Full pipeline wiring through extraction",
        "Multi-event conversation sharing"
      ],
      "files_touched": [
        "src/lib/work/conversation-matching.ts",
        "src/lib/tools/capture.ts",
        "src/lib/ai/chat/stream/route.ts"
      ],
      "backlog_item": "conv-chains-schema",
      "breaking": false
    }
  ]
}
```

### 2.7 actions/registry.json — Tracked Actions & Feature Health

Each "action" is a user-facing feature with a diagnostic playbook.

```json
{
  "actions": [
    {
      "id": "new-entry",
      "name": "Voice Entry → Extraction",
      "description": "User makes voice entry, AI extracts entities/events/links",
      "playbook": "playbooks/new-entry.md",
      "scripts": [
        { "name": "Session Replay", "command": "node apps/web/scripts/session-replay.js" },
        { "name": "Recent Diagnostic", "command": "node apps/web/scripts/prod-diagnostic.js --recent 10" }
      ],
      "expected_outcomes": [
        { "id": "entities-created", "description": "All mentioned entities created with correct names" },
        { "id": "entities-linked", "description": "All entities linked to events via event_entities" },
        { "id": "companies-linked", "description": "Persons linked to mentioned companies" },
        { "id": "no-duplicates", "description": "No duplicate entities created (fuzzy dedup working)" },
        { "id": "conversation-chain", "description": "Events linked to existing conversation if related" }
      ],
      "health": "yellow",
      "pass_rate": { "passed": 8, "total": 10 },
      "open_issues": 2,
      "last_run": "2026-02-07T14:30:00Z",
      "created": "2026-02-06"
    },
    {
      "id": "email-upload",
      "name": "EML/MSG → Extraction",
      "description": "User uploads email file, AI parses headers/body and extracts",
      "playbook": "playbooks/email-upload.md",
      "scripts": [
        { "name": "Session Replay", "command": "node apps/web/scripts/session-replay.js" },
        { "name": "Recent Diagnostic", "command": "node apps/web/scripts/prod-diagnostic.js --recent 10" }
      ],
      "expected_outcomes": [
        { "id": "headers-parsed", "description": "From/To/CC/Subject/Date headers extracted" },
        { "id": "thread-split", "description": "Email chain split into individual messages" },
        { "id": "message-id-dedup", "description": "Duplicate emails skipped by Message-ID" },
        { "id": "attachment-metadata", "description": "Attachment filenames/types/sizes in digest" },
        { "id": "conversation-chain", "description": "Events linked via In-Reply-To chain" }
      ],
      "health": "green",
      "pass_rate": { "passed": 5, "total": 5 },
      "open_issues": 0,
      "last_run": "2026-02-06T23:15:00Z",
      "created": "2026-02-06"
    }
  ]
}
```

### 2.8 actions/playbooks/*.md — Diagnostic Playbooks

Each playbook is a step-by-step guide for the AI to diagnose an action. Written in markdown so the AI can read and follow it naturally.

Example: `playbooks/new-entry.md`

```markdown
# New Entry Diagnostic Playbook

## Trigger
User says: "new entry", "check my entry", "how'd that go", "test entry"

## Step 1: Capture the Session
Run: `node apps/web/scripts/session-replay.js`
This gives: raw transcript, AI conversation, tool calls, entities created, events, approvals.

## Step 2: Analyze Intent vs Reality
Read the transcript. Identify:
- What entities were mentioned? (people, companies, deals)
- What relationships were implied? ("John from AJH" → works_at)
- What events occurred? (meetings, calls, tasks, emails)
- What metadata was stated? (titles, amounts, dates, statuses)

Compare against extraction output:
- Were ALL entities created?
- Are names correct?
- Are companies linked?
- Are events linked to entities?
- Was metadata captured?

## Step 3: Deep Entity Inspection
For suspicious entities: `node apps/web/scripts/prod-diagnostic.js --entity "Name"`

## Step 4: Systemic Check
Run: `node apps/web/scripts/prod-diagnostic.js --recent 10`
Look for: duplicates, orphaned events, missing metadata, broken links.

## Step 5: Conversation Chain Validation
Check: Did events get assigned to correct conversation_id?
Check: Is parent_event_id set correctly?
Check: Were duplicates prevented by Message-ID dedup?

## Step 6: Report
Structure as:
- **Correct**: What worked
- **Issues**: What failed (create issues in dev-track)
- **Fix plan**: Code changes needed

## Step 7: Update dev-track
- Create issues for any problems found
- Update action health (pass/fail outcomes)
- Write diagnostic run to runs/
```

### 2.9 issues/items.json — Issue Tracker

```json
{
  "issues": [
    {
      "id": "ISS-001",
      "title": "Multi-entity extraction drops entities when 6+ contacts",
      "action_id": "new-entry",
      "status": "open",
      "severity": "high",
      "discovered": "2026-02-06",
      "discovered_in_run": null,
      "symptoms": "AI text response mentions entities but tool call omits them",
      "root_cause": "convertToLegacyFormat PLACEHOLDER matching fails silently",
      "files": [
        "src/lib/ai/extraction/integration.ts",
        "src/lib/ai/extraction/multi-target-extract.ts"
      ],
      "backlog_item": "fix-multi-target-extraction",
      "resolution": null,
      "resolved": null,
      "notes": ""
    }
  ],
  "next_id": 2
}
```

**Field reference:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Auto-incrementing `ISS-NNN` format |
| `title` | string | Brief description |
| `action_id` | string \| null | Which tracked action this relates to |
| `status` | `"open"` \| `"in_progress"` \| `"resolved"` \| `"wont_fix"` | Current state |
| `severity` | `"critical"` \| `"high"` \| `"medium"` \| `"low"` | Impact level |
| `discovered` | ISO date | When found |
| `discovered_in_run` | string \| null | Diagnostic run ID that found this |
| `symptoms` | string | What the user/AI observed |
| `root_cause` | string \| null | Technical explanation (filled after investigation) |
| `files` | string[] | Related source files |
| `backlog_item` | string \| null | Linked backlog item (if fix needs tracked work) |
| `resolution` | string \| null | How it was fixed |
| `resolved` | ISO date \| null | When resolved |
| `notes` | string | Free-form notes |

### 2.10 runs/*.json — Diagnostic Run Results

Each file is a timestamped diagnostic run.

```json
{
  "id": "run-20260207-143000",
  "action_id": "new-entry",
  "timestamp": "2026-02-07T14:30:00Z",
  "trigger": "manual",
  "duration_seconds": 45,
  "result": "partial_pass",
  "outcomes": [
    { "id": "entities-created", "pass": true, "detail": "6/6 entities created" },
    { "id": "entities-linked", "pass": true, "detail": "All linked to events" },
    { "id": "companies-linked", "pass": false, "detail": "Doug Leohr missing company link" },
    { "id": "no-duplicates", "pass": true, "detail": "0 duplicates detected" },
    { "id": "conversation-chain", "pass": true, "detail": "Linked to conv-8f3a" }
  ],
  "issues_created": ["ISS-044"],
  "issues_resolved": [],
  "script_outputs": {
    "session-replay": "... (truncated output) ...",
    "prod-diagnostic": "... (truncated output) ..."
  },
  "notes": "Doug Leohr was mentioned as Pride One contact but company link not created"
}
```

### 2.11 metrics/velocity.json — Velocity Tracking

```json
{
  "sessions": [
    {
      "date": "2026-02-06",
      "duration_hours": 9.5,
      "items_shipped": 17,
      "by_size": { "S": 8, "M": 6, "L": 3, "XL": 0 },
      "by_category": { "core": 5, "ui": 4, "infra": 3, "bugfix": 3, "docs": 2 },
      "points": 29,
      "issues_found": 4,
      "issues_resolved": 2
    }
  ],
  "totals": {
    "total_sessions": 15,
    "total_items_shipped": 142,
    "total_points": 287,
    "avg_items_per_session": 9.5,
    "avg_points_per_session": 19.1,
    "total_issues_found": 23,
    "total_issues_resolved": 18
  },
  "point_values": {
    "S": 1,
    "M": 2,
    "L": 5,
    "XL": 8
  }
}
```

### 2.12 designs/*.md — Design Documents

Rich markdown files for architecture and design decisions. These are the one place where verbose prose is appropriate. Linked from backlog items via `design_doc` field.

Format is freeform markdown — no JSON schema. But recommended structure:

```markdown
# [Feature Name]

## Status
[Draft | Accepted | Implemented | Superseded]

## Problem
What problem does this solve?

## Design
Architecture, data model, algorithms, trade-offs.

## Implementation Plan
Phases, files to touch, dependencies.

## Test Cases
How to validate this works.

## Open Questions
Unresolved decisions.
```

### 2.13 decisions/*.md — Architecture Decision Records

ADRs capture significant technical decisions. Format:

```markdown
# ADR-001: [Decision Title]

**Date**: 2026-02-07
**Status**: Accepted
**Context**: What situation led to this decision?
**Decision**: What did we decide?
**Consequences**: What are the trade-offs?
**Alternatives Considered**: What else was on the table?
```

---

## 3. Server API

### 3.1 REST Endpoints

All endpoints prefixed with `/api/v1/`. Server runs on port 24680.

#### Session

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/session/current` | Get current session plan |
| `POST` | `/api/v1/session/start` | Start a new session |
| `PATCH` | `/api/v1/session/current` | Update current session (add notes, update item status) |
| `POST` | `/api/v1/session/end` | End session (write retro, update velocity) |
| `GET` | `/api/v1/session/log` | Get session history |
| `GET` | `/api/v1/session/log/latest` | Get most recent completed session |

#### State

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/state` | Get full system state |
| `PATCH` | `/api/v1/state/systems/:id` | Update a system's rating/notes |
| `GET` | `/api/v1/state/summary` | Get one-line summary (for Quick Status) |

#### Backlog

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/backlog` | Get all items (supports `?horizon=now` filter) |
| `POST` | `/api/v1/backlog` | Create new item |
| `PATCH` | `/api/v1/backlog/:id` | Update item (status, horizon, etc.) |
| `DELETE` | `/api/v1/backlog/:id` | Delete item |
| `POST` | `/api/v1/backlog/:id/complete` | Mark complete (sets status + completed date, appends changelog) |
| `POST` | `/api/v1/backlog/:id/move` | Move to different horizon |

#### Changelog

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/changelog` | Get entries (supports `?limit=N&since=DATE`) |
| `POST` | `/api/v1/changelog` | Create new entry |

#### Actions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/actions` | Get all actions with health status |
| `GET` | `/api/v1/actions/:id` | Get action detail + recent runs |
| `POST` | `/api/v1/actions` | Register new action |
| `PATCH` | `/api/v1/actions/:id` | Update action |
| `POST` | `/api/v1/actions/:id/run` | Execute diagnostic (runs scripts, returns results) |
| `GET` | `/api/v1/actions/:id/playbook` | Get playbook markdown content |

#### Issues

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/issues` | Get issues (supports `?status=open&severity=high&action_id=X`) |
| `POST` | `/api/v1/issues` | Create issue |
| `PATCH` | `/api/v1/issues/:id` | Update issue |
| `POST` | `/api/v1/issues/:id/resolve` | Resolve issue (sets resolution + date) |

#### Runs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/runs` | Get recent runs (supports `?action_id=X&limit=N`) |
| `GET` | `/api/v1/runs/:id` | Get run detail |

#### Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/metrics/velocity` | Get velocity data |
| `GET` | `/api/v1/metrics/summary` | Get aggregate stats |

#### Quick Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/quick-status` | Get the one-line status string for cursor rule |

### 3.2 WebSocket Events

Connection at `ws://localhost:24680/ws`

**Server → Client events:**

```typescript
interface WSEvent {
  type: 'state_updated' | 'backlog_updated' | 'session_updated' | 
        'issue_created' | 'issue_resolved' | 'run_completed' | 
        'action_health_changed' | 'file_changed';
  data: any;
  timestamp: string;
}
```

**Client → Server events:**

```typescript
interface WSCommand {
  type: 'subscribe' | 'unsubscribe';
  channel: 'all' | 'backlog' | 'issues' | 'actions' | 'session';
}
```

### 3.3 File Watcher

The server watches `.dev-track/data/` for changes using chokidar:

- When a file changes on disk (e.g., AI edited it directly), the server:
  1. Reloads the file into the in-memory store
  2. Pushes a WebSocket event to all connected clients
  3. Dashboard updates in real-time without refresh

- When the API receives a mutation:
  1. Updates the in-memory store
  2. Writes the file to disk
  3. Debounces the file watcher to avoid echo events

### 3.4 Script Runner

The `/api/v1/actions/:id/run` endpoint:

1. Reads the action's `scripts` array
2. Spawns each script as a child process
3. Captures stdout/stderr
4. Streams output via WebSocket (for live terminal display in UI)
5. Writes results to a new run file in `data/runs/`
6. Updates the action's health and pass_rate

```typescript
interface ScriptExecution {
  command: string;
  cwd: string;           // Defaults to project root
  env: Record<string, string>;  // Inherits process.env + can override
  timeout: number;        // Default 120 seconds
  output: string;
  exitCode: number;
  duration_ms: number;
}
```

---

## 4. Web UI

### 4.1 Layout

```
┌─────────────────────────────────────────────────────────────┐
│  dev-track · Pillar                           [Session: 4h] │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                   │
│ ◉ Dash   │  [Active View Content]                           │
│ ☰ Backlog│                                                   │
│ ⚡Actions │                                                   │
│ 🐛 Issues │                                                   │
│ 📋 Log    │                                                   │
│ 📄 Docs   │                                                   │
│ 📊 Stats  │                                                   │
│          │                                                   │
│          │                                                   │
│          │                                                   │
├──────────┴──────────────────────────────────────────────────┤
│  Quick Status: 85% | Now: 3 items | Session: active (2.5h) │
└─────────────────────────────────────────────────────────────┘
```

Sidebar navigation. Dark theme (matches Cursor aesthetic). Clean, dense information display.

### 4.2 Dashboard View

The landing page. Everything important at a glance.

```
┌───────────────────────────────────────────────────────────┐
│  Dashboard                                                 │
├───────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────┐ │
│  │ Health: 85%      │  │ Session: 2.5h   │  │ Issues: 5│ │
│  │ ████████████░░   │  │ 1/3 items done  │  │ 2 crit   │ │
│  └─────────────────┘  └─────────────────┘  └──────────┘ │
│                                                            │
│  ── Now ──────────────────────────────────────────────── │
│  🔵 AI Conv Matching (L) ████████░░ in_progress           │
│  ⚪ Artifact Linking (M)            pending                │
│  ⚪ Design Pass (M)                 pending                │
│                                                            │
│  ── Action Health ────────────────────────────────────── │
│  🟡 Voice Entry         8/10   2 issues    [Run]         │
│  🟢 Email Upload        5/5    0 issues    [Run]         │
│  🔴 Multi-Entity        1/4    3 issues    [Run]         │
│                                                            │
│  ── Recent ───────────────────────────────────────────── │
│  14:30  Ran diagnostic: new-entry (partial pass)          │
│  12:00  Completed: Threaded Timeline UI                    │
│  11:30  Created issue ISS-044: Doug missing company       │
│  10:00  Session started: "Ship AI conv matching"          │
│                                                            │
│  ── Last Session ─────────────────────────────────────── │
│  Feb 6 · 9.5h · 17 items shipped · 29 points             │
│  Discovered: multi-entity drops, threshold issue          │
│                                                            │
└───────────────────────────────────────────────────────────┘
```

### 4.3 Backlog View

Three-column Kanban board.

```
┌─────────────────────────────────────────────────────────────┐
│  Backlog                                    [+ New Item]    │
├───────────────────┬──────────────────┬──────────────────────┤
│  NOW (3/3)        │  NEXT (5)        │  LATER (8)           │
│                   │                  │                      │
│  ┌──────────────┐│  ┌─────────────┐ │  ┌────────────────┐ │
│  │🔵 AI Conv    ││  │ Graph View  │ │  │ Email Pipeline  │ │
│  │ Matching     ││  │ M · core    │ │  │ XL · core       │ │
│  │ L · in_prog  ││  │             │ │  │ depends: 3 items│ │
│  │ 📄 design doc ││  └─────────────┘ │  └────────────────┘ │
│  └──────────────┘│  ┌─────────────┐ │  ┌────────────────┐ │
│  ┌──────────────┐│  │ Turnaround  │ │  │ Bulk Chunking  │ │
│  │⚪ Artifact   ││  │ Tracking    │ │  │ XL · core       │ │
│  │ Linking      ││  │ M · core    │ │  └────────────────┘ │
│  │ M · pending  ││  └─────────────┘ │                      │
│  └──────────────┘│  ┌─────────────┐ │  ... more items     │
│  ┌──────────────┐│  │ Stream      │ │                      │
│  │⚪ Design     ││  │ Persistence │ │                      │
│  │ Pass         ││  │ S · ux      │ │                      │
│  │ M · pending  ││  └─────────────┘ │                      │
│  └──────────────┘│                  │                      │
└───────────────────┴──────────────────┴──────────────────────┘
```

Cards are draggable between columns. Click to expand with full detail. WIP limit enforced on Now column.

### 4.4 Actions View

Feature health monitor.

```
┌─────────────────────────────────────────────────────────────┐
│  Actions                                   [+ New Action]   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  🟡  Voice Entry → Extraction                          │ │
│  │                                                         │ │
│  │  Pass Rate: ████████░░ 8/10        Open Issues: 2      │ │
│  │  Last Run: 2h ago — partial pass                        │ │
│  │                                                         │ │
│  │  Expected Outcomes:                                     │ │
│  │  ✅ Entities created    ✅ Entities linked               │ │
│  │  ❌ Companies linked    ✅ No duplicates                 │ │
│  │  ✅ Conversation chain                                  │ │
│  │                                                         │ │
│  │  [▶ Run Diagnostic]  [📋 View Playbook]  [🐛 Issues]   │ │
│  │                                                         │ │
│  │  Recent Runs:                                           │ │
│  │  14:30 🟡 4/5 pass · "Doug missing company"            │ │
│  │  12:00 🟢 5/5 pass                                     │ │
│  │  Feb 6 🔴 2/5 pass · "Keith entities dropped"          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  🟢  EML/MSG → Extraction                              │ │
│  │  Pass Rate: ██████████ 5/5          Open Issues: 0     │ │
│  │  Last Run: 15h ago — all pass                           │ │
│  │  [▶ Run Diagnostic]  [📋 View Playbook]                │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

"Run Diagnostic" button:
1. Spawns the action's scripts on the server
2. Shows live terminal output in a modal/drawer
3. When scripts complete, prompts for outcome marking (pass/fail per expected outcome)
4. Creates a run record
5. Optionally generates a clipboard prompt for Cursor to investigate failures

### 4.5 Issues View

```
┌─────────────────────────────────────────────────────────────┐
│  Issues                          [+ New Issue] [Filters ▾]  │
├─────────────────────────────────────────────────────────────┤
│  Filter: All Open (5)  │ By Action ▾ │ By Severity ▾       │
│                                                              │
│  🔴 ISS-001  Multi-entity drops entities (6+ contacts)     │
│     new-entry · high · integration.ts, multi-target...      │
│     Discovered: Feb 6 · Root cause identified               │
│     → Linked to: fix-multi-target-extraction                │
│                                                              │
│  🟡 ISS-044  Doug Leohr missing company link                │
│     new-entry · medium · capture.ts                         │
│     Discovered: today · From run-20260207-143000            │
│                                                              │
│  🔴 ISS-045  PLACEHOLDER format mismatch                    │
│     multi-entity · high · integration.ts                    │
│     Discovered: Feb 6 · Root cause: name normalization      │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Recently Resolved (3)                          [Show ▾]    │
│  ✅ ISS-043  extract_work_items not receiving digest         │
│     Resolved: Feb 7 · Fix: wired digest through pipeline    │
└─────────────────────────────────────────────────────────────┘
```

### 4.6 Sessions / Timeline View

Visual history of development sessions.

```
┌─────────────────────────────────────────────────────────────┐
│  Sessions                                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ● ACTIVE — Feb 7, 10:00 AM (2.5h)                         │
│  │ Objective: Ship AI-assisted conversation matching         │
│  │ Progress: 1/3 items · AI Conv Matching in progress        │
│  │                                                           │
│  ○ Feb 6, 2:00 PM — 11:30 PM (9.5h)                        │
│  │ Shipped 17 items · 29 points                              │
│  │ ├── Conversation chains (L)                               │
│  │ ├── Entity dedup hardening (M)                            │
│  │ ├── Threaded timeline UI (M)                              │
│  │ ├── Performance overhaul (L)                              │
│  │ └── +13 more                                              │
│  │ Discovered: multi-entity drops, threshold issue           │
│  │                                                           │
│  ○ Feb 5, ...                                                │
│  │ Shipped 8 items · 14 points                               │
│  │ ├── Unified Schema Registry (L)                           │
│  │ └── +7 more                                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.7 Docs View

Rendered markdown viewer for design docs and ADRs.

```
┌─────────────────────────────────────────────────────────────┐
│  Docs                                                        │
├────────────────┬────────────────────────────────────────────┤
│  Designs       │                                             │
│  ├ conversation│  # Conversation Chains                      │
│  │  chains     │                                             │
│  ├ email       │  ## Status                                  │
│  │  pipeline   │  Phases 1-2 implemented. Phase 3 in         │
│  ├ artifact    │  progress.                                  │
│  │  storage    │                                             │
│  │             │  ## Problem                                  │
│  Decisions     │  Events are flat. They link to entities     │
│  ├ ADR-001     │  but not to each other...                   │
│  └ ADR-002     │                                             │
│                │  ## Design                                   │
│                │  ### Schema Change                           │
│                │  ```sql                                      │
│                │  ALTER TABLE events ADD COLUMN ...           │
│                │  ```                                         │
└────────────────┴────────────────────────────────────────────┘
```

### 4.8 Metrics View

Velocity charts and project health over time.

```
┌─────────────────────────────────────────────────────────────┐
│  Metrics                                                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Velocity (items shipped per session)                        │
│  30│          ╭─                                             │
│  20│     ╭────╯                                              │
│  10│╭────╯                                                   │
│   0│─────────────────                                        │
│    Feb 1  Feb 3  Feb 5  Feb 7                                │
│                                                              │
│  Points per session                                          │
│  40│               ╭─                                        │
│  20│     ╭─────────╯                                         │
│   0│─────╯                                                   │
│    Feb 1  Feb 3  Feb 5  Feb 7                                │
│                                                              │
│  ┌──────────┬──────────┬──────────┬──────────┐              │
│  │ Sessions │ Items    │ Points   │ Issues   │              │
│  │ 15       │ 142      │ 287      │ 23 found │              │
│  │          │ 9.5/sess │ 19.1/ses │ 18 fixed │              │
│  └──────────┴──────────┴──────────┴──────────┘              │
│                                                              │
│  Category Breakdown (last 30 days)                           │
│  core ████████████████ 45%                                   │
│  ui   ████████ 22%                                           │
│  infra ██████ 17%                                            │
│  bugfix ████ 11%                                             │
│  docs  ██ 5%                                                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. AI / Cursor Integration

### 5.1 The Cursor Rule

This is the core integration point. The rule is loaded on every message in Cursor but is designed to be tiny (~70 lines) and instructional (tells the AI what to do, not what the data is).

```markdown
# dev-track — Project Intelligence

## Quick Status (auto-updated)
Pillar | 85% health | Now: AI conv matching (L, in_progress), Artifact linking (M), Design pass (M) | Session: active 2.5h | Last: Feb 6, 17 shipped | Open issues: 5 (2 crit)

## System
Project tracking data lives in `.dev-track/data/`. Server runs at http://localhost:24680.
CLI available as `node .dev-track/cli/index.ts` (or `dev-track` if globally linked).

## File Map
- `data/state.json` — System health ratings
- `data/session/current.json` — Current session plan  
- `data/session/log.json` — Session history
- `data/backlog/items.json` — All items (filter by horizon: now/next/later)
- `data/changelog/entries.json` — What shipped, when
- `data/actions/registry.json` — Tracked features + health
- `data/actions/playbooks/*.md` — Diagnostic step-by-step guides
- `data/issues/items.json` — Bug tracker
- `data/runs/*.json` — Diagnostic results
- `data/designs/*.md` — Architecture docs
- `data/metrics/velocity.json` — Velocity data

## Interaction Triggers

### Session lifecycle
- User starts session / "let's go" / "what should we work on":
  1. Read data/session/current.json
  2. Read data/state.json  
  3. Read data/backlog/items.json (filter horizon=now)
  4. Present plan and current state
- User ends session / "wrap up" / "done for today":
  1. Update completed items in backlog
  2. Append changelog entries for shipped work
  3. Write session retro to session/log.json
  4. Update metrics/velocity.json
  5. Regenerate the Quick Status line above

### During work
- Completing a feature → Update backlog item status, append changelog entry
- Discovering new work → Add to backlog (horizon=later, estimate size)
- Architecture decision → Create data/decisions/NNN-title.md
- Starting work on item with design_doc → Read that specific design doc

### Debugging
- "new entry" / "check my entry" / "how'd that go":
  Read data/actions/playbooks/new-entry.md, execute the playbook
- "debug [action-name]":
  Find action in registry, read its playbook, execute
- When finding bugs during diagnostics:
  Create issue in data/issues/items.json with action_id, symptoms, severity, files
- After fixing a bug:
  Update issue status=resolved, add resolution text

### On request
- "status" / "where are we" → Read data/state.json
- "backlog" / "what's next" → Read data/backlog/items.json
- "issues" / "bugs" → Read data/issues/items.json
- "velocity" / "how are we doing" → Read data/metrics/velocity.json
- "changelog" / "what shipped" → Read data/changelog/entries.json

## Rules
- NEVER load all data files at once (unless user explicitly asks for full review)
- When reading backlog, default to horizon=now only
- Max 3 items in horizon=now (WIP limit). If promoting a 4th, ask which to demote.
- Changelog is append-only. Never rewrite history.
- Design docs: only read the one relevant to current work.
- Sizes: S (<30min), M (1-3h), L (4-8h), XL (multi-session, must be broken down)
- After any session-end, regenerate the Quick Status line at the top of this rule.
- When creating issues, auto-increment from the next_id in issues/items.json.
```

### 5.2 Context Budget Analysis

| Scenario | Files loaded | Approx tokens |
|----------|-------------|---------------|
| Normal coding message | Just the cursor rule | ~150 tokens |
| Session start | Rule + session plan + state + now items | ~400 tokens |
| "What's the backlog?" | Rule + items.json | ~300 tokens |
| "New entry" diagnostic | Rule + playbook + run scripts + write results | ~500 tokens (+ script output) |
| "Show me issues" | Rule + issues/items.json | ~250 tokens |
| Working on a specific feature | Rule + that feature's design doc | varies by doc |
| Full project review (rare) | Everything | ~1500 tokens |

Compare to current state: every message implicitly needs the AI to process 700+ lines of NEXT_SPRINT.md (~2000 tokens) just to know where things stand.

### 5.3 Quick Status Line

The most important single line in the system. It's the only piece of project data that loads on every message. Format:

```
{project} | {health}% health | Now: {item1} ({size}, {status}), {item2}... | Session: {status} {duration} | Last: {date}, {N} shipped | Open issues: {N} ({N} crit)
```

Auto-regenerated by the AI at session end. The AI updates this line in the cursor rule file itself (the only mutable part of the rule).

### 5.4 Two Interaction Paths

The AI can interact with dev-track in two ways:

**Path 1: Direct file access (simple, always works)**
```
AI reads: .dev-track/data/backlog/items.json
AI writes: .dev-track/data/backlog/items.json (modified)
Server detects change via chokidar, updates in-memory store, pushes to dashboard
```

**Path 2: CLI commands (structured, validated)**
```
AI runs: node .dev-track/cli/index.ts backlog complete conv-matching
CLI calls server API: POST /api/v1/backlog/conv-matching/complete
Server updates file + in-memory store + pushes to dashboard
```

Path 1 is simpler and works even if the server isn't running. Path 2 provides validation (e.g., WIP limits, auto-incrementing issue IDs) and is atomic.

---

## 6. CLI Interface

### 6.1 Commands

The CLI is a Node.js script that calls the local server API. It's designed for both human and AI use.

```bash
# ── Session ──────────────────────────────────────────────
dev-track session start "Working on conversation matching" --appetite 4h
dev-track session status
dev-track session update --notes "Discovered threshold issue"
dev-track session end --retro "Shipped matching, found threshold bug"

# ── Backlog ──────────────────────────────────────────────
dev-track backlog list                    # All items
dev-track backlog list --horizon now      # Just current items
dev-track backlog add "Fix entity threshold" --horizon next --size M --category core
dev-track backlog move conv-matching --horizon now
dev-track backlog complete conv-matching
dev-track backlog update conv-matching --status in_progress

# ── Issues ───────────────────────────────────────────────
dev-track issue list                      # All open issues
dev-track issue list --action new-entry   # Issues for specific action
dev-track issue create "Entity overlap false positive" \
  --action new-entry --severity medium --files "capture.ts"
dev-track issue resolve ISS-044 --resolution "Added minimum threshold"
dev-track issue update ISS-044 --root-cause "Threshold too low"

# ── Actions ──────────────────────────────────────────────
dev-track action list                     # All actions with health
dev-track action run new-entry            # Execute diagnostic
dev-track action health                   # Summary of all action health

# ── Changelog ────────────────────────────────────────────
dev-track changelog add "AI conversation matching" --category core \
  --items "extraction prompt hints" "enterprise context summaries"

# ── State ────────────────────────────────────────────────
dev-track state get                       # Full state
dev-track state update core-crm --rating 9 --notes "AI matching shipped"

# ── Quick Status ─────────────────────────────────────────
dev-track status-line                     # Print the Quick Status string
dev-track status-line --update            # Regenerate and write to cursor rule

# ── Metrics ──────────────────────────────────────────────
dev-track metrics velocity               # Velocity summary
dev-track metrics summary                # Aggregate stats
```

### 6.2 CLI Design for AI

Commands are designed to be:
- **Predictable**: Consistent pattern of `dev-track {resource} {action} [id] [--flags]`
- **Atomic**: Each command does one thing
- **Idempotent where possible**: `complete` on an already-completed item is a no-op
- **Output JSON**: `--json` flag on any command for machine-readable output
- **Low-token**: Human-readable output by default, but concise

---

## 7. Diagnostic Engine

### 7.1 How Diagnostics Work

The diagnostic engine bridges the gap between the dashboard and Cursor:

```
┌──────────────────────────────────────────────────────────┐
│  User clicks "Run Diagnostic" on dashboard                │
│  OR AI runs "dev-track action run new-entry"              │
├──────────────────────────────────────────────────────────┤
│  1. Server reads action from registry                     │
│  2. Server spawns each script in action.scripts[]         │
│  3. Script output streamed to:                            │
│     - WebSocket (dashboard shows live terminal)           │
│     - Captured in memory for run record                   │
│  4. Scripts complete                                      │
│  5. Server creates run record in data/runs/               │
│  6. Dashboard shows outcome checkboxes:                   │
│     ☑ Entities created   ☑ Entities linked                │
│     ☐ Companies linked   ☑ No duplicates                  │
│  7. User/AI marks pass/fail on each outcome               │
│  8. Server updates action health + pass_rate              │
│  9. If failures: offer to create issues + copy prompt     │
│     for Cursor to investigate                             │
└──────────────────────────────────────────────────────────┘
```

### 7.2 Diagnostic → Cursor Bridge

When a diagnostic run has failures, the dashboard generates a **Cursor-ready prompt**:

```
Diagnostic run on "Voice Entry → Extraction" found issues:
❌ Companies linked: Doug Leohr missing company link

Run details saved to .dev-track/data/runs/run-20260207-143000.json

Please investigate:
1. Read the run file for full script output
2. Check why Doug Leohr's company link wasn't created
3. If you find a bug, create an issue: dev-track issue create "..." --action new-entry
4. If you fix it, resolve the issue and re-run the diagnostic
```

This prompt is:
- Copied to clipboard with one click
- Pasted into Cursor
- The AI has full context via the run file (not bloated — just the relevant diagnostic output)

### 7.3 Automated Diagnostics (Future)

Post-deploy health checks that run without human intervention:

```
Vercel deploy completes
  → Deploy hook calls: POST /api/v1/actions/new-entry/run?trigger=deploy
  → Scripts run, results written
  → If failures: notification (email/Slack/push)
  → Next Cursor session: AI sees new issues automatically
```

This requires the dev-track server to be running (or a lightweight cloud endpoint). Future phase.

---

## 8. Cross-Project Portability

### 8.1 Project Template

To add dev-track to a new project:

```bash
# Option 1: npx (when published)
cd my-new-project
npx dev-track init

# Option 2: Copy from existing project
cp -r /path/to/pillar/.dev-track ./
# Edit .dev-track/data/config.json with new project name
# Clear data files (keep structure)
# Update cursor rule
```

### 8.2 What's Project-Specific vs Generic

| Component | Project-Specific | Generic |
|-----------|-----------------|---------|
| `data/config.json` | ✅ Project name, settings | |
| `data/state.json` | ✅ Systems and ratings | |
| `data/backlog/` | ✅ All items | |
| `data/actions/` | ✅ Playbooks for this project's features | |
| `data/issues/` | ✅ Bugs in this project | |
| `server/` | | ✅ Identical across projects |
| `ui/` | | ✅ Identical across projects |
| `cli/` | | ✅ Identical across projects |
| `templates/dev-track.mdc` | Partially (Quick Status line) | ✅ Template is generic |

### 8.3 Multi-Project Dashboard (Future)

A meta-dashboard that reads `.dev-track/data/` from multiple project directories:

```bash
dev-track dashboard --projects ~/pillar ~/landmark ~/other-project
# → Opens dashboard at :24680 with project switcher
```

Each project's data stays in its own directory. The dashboard aggregates views.

---

## 9. Security & Privacy

### 9.1 Local-Only by Default

- Server binds to `127.0.0.1` only (not `0.0.0.0`)
- No cloud sync, no external API calls
- All data in local files committed to your repo
- You control what's in git (can gitignore sensitive data)

### 9.2 Sensitive Data

- Diagnostic script output may contain production data (entity names, email addresses)
- `data/runs/` files should be gitignored if they contain sensitive output
- OR: truncate/redact script output before writing to run files
- Config option: `"redact_run_output": true` strips anything matching email/phone patterns

### 9.3 .gitignore

```
# .dev-track/.gitignore
node_modules/
dist/
cache.db
data/runs/*.json    # Optional: gitignore if runs contain sensitive data
```

---

## 10. External Tool Integrations

### 10.1 Plugin Architecture

dev-track integrates with the tools in your development stack via a standard plugin interface. Each integration is self-contained and optional.

```typescript
interface Integration {
  id: string;
  name: string;
  icon: string;
  // Health & status
  getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'down'; detail: string }>;
  getRecentEvents(): Promise<{ title: string; time: string; severity: string }[]>;
  // Actions the user/AI can trigger
  actions: { id: string; label: string; dangerous?: boolean }[];
  executeAction(actionId: string): Promise<{ ok: boolean; output: string }>;
}
```

### 10.2 Built-in Integrations

| Integration | Status Data | Actions |
|-------------|-----------|---------|
| **GitHub** | Open PRs, CI status, recent commits | Create PR, view diff, merge |
| **Vercel** | Deploy status, recent errors, function stats | Redeploy, view logs, promote |
| **Supabase** | DB health, migration status, table count | Run migration, start/stop local, open dashboard |
| **Sentry** | Error count (24h), crash-free rate, new issues | View errors, resolve issue |
| **Helicone** | AI cost (today), avg latency, model breakdown | View dashboard |
| **Upstash** | Redis health, memory usage, request count | Flush cache, view keys |
| **Local Dev** | Dev server status, port health | Start/stop/restart dev servers |

### 10.3 Configuration

```json
// data/config.json → settings.integrations
"integrations": [
  {
    "id": "vercel",
    "enabled": true,
    "config": {
      "project": "pillar-web",
      "env_file": "apps/web/.env.local",
      "token_env_var": "VERCEL_TOKEN"
    }
  },
  {
    "id": "supabase",
    "enabled": true,
    "config": {
      "project_id": "oqkljicdagbdileupldl",
      "local_port": 54322,
      "env_file": "apps/web/.env.remote"
    }
  },
  {
    "id": "sentry",
    "enabled": true,
    "config": {
      "org": "pillar-9y",
      "project": "pillar",
      "env_file": "apps/web/.env.remote"
    }
  }
]
```

API keys are NEVER stored in dev-track data files. They're referenced from existing env files in the project (which are already gitignored).

### 10.4 Dashboard Integration Panel

The dashboard renders an Infrastructure section showing all active integrations:

```
── Infrastructure ──────────────────────────────────────
🟢 Vercel     Last deploy: 2h ago (success)     [Logs] [Redeploy]
🟢 Supabase   DB healthy, 47 tables             [Dashboard] [Migrations]
🟡 Sentry     3 new errors (24h)                [View Errors]
🟢 Helicone   $2.47 today, avg 340ms            [Dashboard]

── Local Dev ───────────────────────────────────────────
⚪ Supabase Local  Stopped                       [Start] [Status]
⚪ Dev Server      Not running                   [npm run dev]
```

### 10.5 Extensibility

Custom integrations follow the same interface. Add a new file to `integrations/` implementing the Integration interface and register it in config. This scales to any stack — Cloudflare, AWS, Railway, Fly.io, PlanetScale, Neon, whatever the project uses.

---

## 11. Multi-AI Platform Support

### 11.1 The Problem

The AI context file (cursor rule) is Cursor-specific. But developers use different AI tools — Claude Code, GitHub Copilot, Windsurf, Aider, and whatever comes next. The project intelligence data should be portable across all of them.

### 11.2 Platform Context Files

| Platform | File Location | Format |
|----------|--------------|--------|
| Cursor | `.cursor/rules/dev-track.mdc` | MDC (frontmatter + markdown) |
| Claude Code | `CLAUDE.md` (append section) | Markdown |
| GitHub Copilot | `.github/copilot-instructions.md` | Markdown |
| Windsurf | `.windsurfrules` | Markdown |
| Aider | `.aider.conf.yml` + `.aiderconventions.md` | YAML + Markdown |
| Generic | `AI_CONTEXT.md` | Universal markdown |

### 11.3 Context Generation

All platforms get the same information, rendered in their format:
- Quick Status line
- File map (where everything lives)
- Interaction triggers (when to read what)
- AI autonomy permissions
- Self-tuning rules

```bash
# Generate context for your platform
dev-track context --platform cursor
dev-track context --platform claude
dev-track context --platform copilot
dev-track context --platform generic

# Auto-detect from project (looks for .cursor/, CLAUDE.md, etc.)
dev-track context --auto
```

### 11.4 Configuration

```json
// data/config.json
"ai_platform": "cursor"    // or "claude", "copilot", "windsurf", "generic"
```

When the Quick Status is regenerated (at session end), the context file for the configured platform is automatically updated.

### 11.5 Universal Data Layer

The data files (JSON + Markdown in `dev-track/data/`) are platform-agnostic. Any AI that can read files can interact with dev-track, regardless of what context file format it uses. The context file just tells the AI *how* to interact — the data itself is universal.

---

## 12. Data Lifecycle & Archival

### 12.1 Rolling Window Architecture

Active data files only contain recent data. Older data is automatically archived.

| Data Type | Active Window | Archive Location |
|-----------|--------------|-----------------|
| Changelog entries | Last 14 days | `changelog/archive/YYYY-MM.json` |
| Session log | Last 10 sessions | `session/archive/YYYY-MM.json` |
| Resolved issues | Last 7 days | `issues/archive/resolved-YYYY-MM.json` |
| Completed backlog | Last 14 days | `backlog/archive/completed-YYYY-MM.json` |
| Diagnostic runs | Last 20 per action | Older runs deleted (or archived) |

### 12.2 Period Summaries

Each archive period gets a compressed summary in `changelog/summaries.json`:

```json
{
  "period": "2026-01",
  "focus": "Core CRM infrastructure, knowledge layer, intelligence layer",
  "items_shipped": 89,
  "points": 178,
  "highlights": ["Knowledge layer 8 phases", "Intelligence scoring", "64 AI tools"],
  "issues_found": 12,
  "issues_resolved": 9,
  "key_decisions": ["ADR-001: pgvector over Pinecone"]
}
```

The AI reads summaries (~30 lines for a month) instead of full archives (~500 lines). Detail is always available by reading the specific archive file.

### 12.3 Auto-Archival

Runs automatically on session end:
1. Move changelog entries older than `changelog_window_days` to archive
2. Move resolved issues older than `auto_archive_resolved_issues_after_days` to archive
3. Trim session log to `max_session_history`
4. Move completed backlog items older than `completed_backlog_window_days` to archive
5. Clean diagnostic runs to `max_run_history_per_action`
6. Generate/update period summaries

### 12.4 Context Budget Over Time

| What the AI reads | Month 1 | Month 12 | Month 24 |
|---|---|---|---|
| Quick Status line | ~50 tokens | ~50 tokens | ~50 tokens |
| Session plan | ~100 tokens | ~100 tokens | ~100 tokens |
| Now items (3 max) | ~75 tokens | ~75 tokens | ~75 tokens |
| Open issues | ~150 tokens | ~200 tokens | ~200 tokens |
| Period summaries | ~100 tokens | ~300 tokens | ~500 tokens |

The context budget stays roughly constant. Only period summaries grow, and those are compressed.

---

## Summary

dev-track is a local-first, file-based, AI-native project intelligence system. It replaces scattered markdown docs with structured, queryable data. It gives the human a visual dashboard and the AI a cheap, trigger-based interface. It tracks not just tasks but features, bugs, diagnostics, decisions, and velocity — the full lifecycle of rapid AI-assisted development.

The system is designed around three core insights:

1. **The AI needs ambient awareness (1 line) plus on-demand depth (specific file reads), not everything loaded all the time.** This makes the context file tiny, efficient, and natural.

2. **The data layer is universal, the context layer is platform-specific.** JSON files don't care if Cursor, Claude, or Copilot reads them. The context file is generated per platform, the data is the same everywhere.

3. **Integrations are plugins, not hardcoded.** Whether your stack is Vercel + Supabase or AWS + Cloudflare, you enable the integrations you need. The dashboard renders whatever's active. The interface is standard.
