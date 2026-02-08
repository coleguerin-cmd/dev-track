# Data Model & Entity Reference

> **Auto-generated** | Last refreshed: 2026-02-09 | Sources: codebase, systems

---

## Overview

DevTrack v2 uses a **14-entity model** defined in `shared/types.ts` (~500 lines). All data is stored as JSON files in the project's data directory, organized by entity type.

**Data location:** `~/.dev-track/projects/<project-id>/data/`

---

## Entity Hierarchy

```
Ideas (funnel — anything goes)
  ↓ promote
Roadmap Items (committed work — we're building this)
  ↓ group into
Epics (themes — "Auth System", "Payment Flow")
  ↓ target
Milestones (delivery checkpoints — "v0.2", "MVP Launch")
  ↓ bundle into
Releases (shipped versions with release notes)

Issues (bugs/problems — separate from features)
  ↔ linked to Roadmap Items

Systems (live architecture map — health, ownership, dependencies)
Sessions → produce Changelog entries
Docs (wiki — auto-generated + human-edited)
```

---

## Data Directory Structure

```
data/
├── roadmap/
│   └── items.json          # Roadmap items (was backlog/)
├── systems/
│   └── items.json          # System definitions + health
├── releases/
│   └── items.json          # Release bundles
├── activity/
│   └── feed.json           # Activity feed events
├── labels/
│   └── items.json          # Cross-cutting labels
├── automations/
│   └── items.json          # Automation rules
├── issues/
│   └── items.json          # Bug/problem tracking
├── ideas/
│   └── items.json          # Idea capture funnel
├── changelog/
│   └── entries.json        # What shipped and when
├── docs/
│   ├── registry.json       # Doc metadata registry
│   └── content/            # Markdown doc files
├── session/
│   ├── current.json        # Active session
│   └── log.json            # Session history
├── brain/
│   ├── notes.json          # AI observations/decisions
│   ├── preferences.json    # User preferences
│   └── context-recovery.json # Session handoff data
├── ai/
│   └── profiles.json       # User behavior profiles
├── metrics/
│   └── velocity.json       # Velocity tracking
└── config.json             # Project configuration
```

---

## Core Entities

### 1. Roadmap Items (replaces Backlog)

**File:** `roadmap/items.json` | **ID format:** kebab-case (e.g., `ai-chat-agent`)

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique kebab-case identifier |
| title | string | Item title |
| summary | string | Detailed description (markdown) |
| type | enum | feature, enhancement, infrastructure, research, chore |
| horizon | enum | now, next, later, shipped |
| priority | enum | P0 (critical), P1 (high), P2 (medium), P3 (low) |
| size | enum | S (1pt), M (2pt), L (5pt), XL (8pt) |
| status | enum | pending, in_progress, in_review, completed, cancelled |
| category | string | core, ui, backend, integrations, etc. |
| epic_id | string? | Parent Epic |
| milestone_id | string? | Target Milestone |
| depends_on | string[] | Blocking item IDs |
| related_issues | string[] | Linked issue IDs |
| tags | string[] | Cross-cutting labels |

**Current stats:** 22 items (6 shipped, 1 in_progress, 15 pending)

### 2. Issues

**File:** `issues/items.json` | **ID format:** ISS-NNN (e.g., `ISS-003`)

| Field | Type | Description |
|-------|------|-------------|
| id | string | Auto-incremented ISS-NNN |
| title | string | Issue title |
| status | enum | open, in_progress, resolved |
| severity | enum | critical, high, medium, low |
| type | enum | bug, security, performance, ux, tech_debt |
| symptoms | string | What is happening |
| root_cause | string? | Why it's happening |
| resolution | string? | How it was fixed |
| files | string[] | Affected files |
| roadmap_item | string? | Related feature |
| discovered_by | string | Who/what found it |

**Current stats:** 19 total (3 open, 16 resolved)

### 3. Ideas

**File:** `ideas/items.json` | **ID format:** IDEA-NNN (e.g., `IDEA-015`)

| Field | Type | Description |
|-------|------|-------------|
| id | string | Auto-incremented IDEA-NNN |
| title | string | Idea title |
| description | string | Full description |
| category | enum | feature, architecture, ux, business, integration, core, security |
| status | enum | captured, exploring, validated, promoted, dismissed |
| priority | enum | low, medium, high, critical |
| pros | string[] | Arguments for |
| cons | string[] | Arguments against |
| open_questions | string[] | Unresolved questions |
| promoted_to | string? | Roadmap item ID if promoted |

**Current stats:** 37 ideas captured

### 4. Systems

**File:** `systems/items.json` | **ID format:** kebab-case (e.g., `server`)

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique system identifier |
| name | string | Display name |
| description | string | AI-generated plain-English description |
| status | enum | healthy, degraded, critical, unknown, planned |
| health_score | number | 0-100 health rating |
| tech_stack | string[] | Technologies used |
| dependencies | string[] | System IDs this depends on |
| dependents | string[] | Systems that depend on this |

**Current stats:** 11 systems tracked

### 5. Changelog

**File:** `changelog/entries.json` | **ID format:** CL-NNN (e.g., `CL-043`)

| Field | Type | Description |
|-------|------|-------------|
| id | string | Auto-incremented CL-NNN |
| date | string | Date shipped |
| title | string | What shipped |
| description | string | Detailed description |
| type | enum | feature, enhancement, fix, refactor, docs, chore |
| scope | string | Area affected |
| files_changed | string[] | Files modified |
| roadmap_item | string? | Related roadmap item |
| breaking | boolean | Breaking change flag |

**Current stats:** 43 changelog entries

### 6. Sessions

**File:** `session/log.json` | **ID format:** auto-increment number

| Field | Type | Description |
|-------|------|-------------|
| id | number | Session number |
| date | string | Session date |
| objective | string | What to accomplish |
| appetite | string | Time budget (e.g., "4h") |
| status | enum | active, completed |
| items_shipped | number | Items completed |
| points | number | Story points earned |
| retro | string? | Retrospective notes |

**Current stats:** 7 sessions logged, 54+ items shipped, 161+ points

### 7. Docs

**File:** `docs/registry.json` + `docs/content/*.md`

| Field | Type | Description |
|-------|------|-------------|
| id | string | Slug identifier |
| title | string | Document title |
| type | enum | design, decision, adr, rfc, wiki, auto-generated |
| auto_generated | boolean | Whether AI maintains this doc |
| generation_sources | string[] | Data sources feeding this doc |
| systems | string[] | Related system IDs |
| status | enum | draft, published, archived |

### 8. Brain Notes

**File:** `brain/notes.json` | **ID format:** BN-NNN

Types: observation, suggestion, warning, decision, preference, reminder

### 9–14. Additional Entities

- **Epics** — Group roadmap items into themes
- **Milestones** — Delivery checkpoints with target dates
- **Releases** — Shipped versions with bundled changelog
- **Labels** — Cross-cutting tags
- **Automations** — Rule-based triggers
- **Activity Feed** — Unified timeline of all events

---

## Point Values

| Size | Points | Typical Scope |
|------|--------|---------------|
| S | 1 | Config change, one-line fix |
| M | 2 | Single feature, moderate bug fix |
| L | 5 | Multi-file feature, significant refactor |
| XL | 8 | Architecture change, major new system |

---

## Velocity Summary

| Metric | Value |
|--------|-------|
| Total sessions | 5+ |
| Total items shipped | 54+ |
| Total points | 161+ |
| Avg items/session | 10.8 |
| Avg points/session | 32.2 |
| Issues found | 10+ |
| Issues resolved | 7+ |
