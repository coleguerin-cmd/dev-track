# System: Session Tracking & Velocity

> **Auto-generated** | Last refreshed: 2026-02-09 | Health: 75/100 ✅ Healthy

---

## Overview

Session Tracking manages the work lifecycle in DevTrack — planning objectives, tracking what ships, and measuring velocity over time. Sessions are the fundamental unit of work, producing changelog entries and feeding velocity metrics.

## Key Stats

| Metric | Value |
|--------|-------|
| Health Score | 75/100 |
| Sessions Logged | 7 (v2 unified Session type) |
| Changelog Entries | 43+ |
| Total Items Shipped | 54+ |
| Total Points | 161+ |
| Dependencies | data-layer |

## Session Lifecycle

```
Start Session (objective + appetite)
  ↓
Work (ship items, resolve issues, capture ideas)
  ↓
End Session (retro + items_shipped + points)
  ↓
Velocity Updated (metrics/velocity.json)
  ↓
Context Recovery Written (brain/context-recovery.json)
```

## Velocity Metrics

| Metric | Value |
|--------|-------|
| Avg items/session | 10.8 |
| Avg points/session | 32.2 |
| Issues found | 10+ |
| Issues resolved | 7+ |

### Point Values

| Size | Points |
|------|--------|
| S | 1 |
| M | 2 |
| L | 5 |
| XL | 8 |

## Session History Highlights

| Session | Date | Items | Points | Focus |
|---------|------|-------|--------|-------|
| 1 | Feb 7 | 15 | 43 | Initial build — server, UI, CLI, integrations |
| 2 | Feb 7 | 6 | 13 | Boot UI, fix rendering, TypeScript build |
| 3 | Feb 7 | 11 | 32 | Graph descriptions, docs wiki, AI chat foundation |
| 4 | Feb 7 | 10 | 34 | AI tool registry, model router, business model |
| 5 | Feb 8 | 12 | 39 | UI overhaul, user profiling, notifications |

## Data Files

- `session/current.json` — Active session plan
- `session/log.json` — Session history (v2 unified format)
- `metrics/velocity.json` — Per-session velocity data
- `changelog/entries.json` — What shipped per session
