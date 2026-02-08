# System: AI Brain

> **Auto-generated** | Last refreshed: 2026-02-09 | Health: 85/100 ✅ Healthy

---

## Overview

The AI Brain is DevTrack's memory system — it stores observations, decisions, warnings, suggestions, user preferences, context recovery data, and user profiles. This data is loaded at the start of every AI chat conversation, giving the AI persistent memory across sessions and platforms.

## Key Stats

| Metric | Value |
|--------|-------|
| Health Score | 85/100 |
| Brain Notes | 14 (6 active, 4 dismissed) |
| Preferences | 4 learned preferences + 4 behavior patterns |
| Tech Stack | TypeScript, JSON |
| Dependencies | data-layer |

## Components

### Brain Notes (`brain/notes.json`)

Typed observations that persist across sessions:

| Type | Purpose | Example |
|------|---------|---------|
| **observation** | What the AI noticed | "All 11 views rendered on first test" |
| **decision** | Architectural/business choices | "NOT open source — building paid product" |
| **warning** | Active risks or concerns | "Passive AI instructions are unreliable" |
| **suggestion** | Recommendations | "Tool needs a real name before launch" |
| **preference** | User behavior patterns | "User prefers 'go big or fuck off' over MVP" |
| **reminder** | Time-sensitive items | — |

Notes can be dismissed, superseded, or have expiry dates. The Dashboard shows only active (non-dismissed) notes.

### User Preferences (`brain/preferences.json`)

Learned behavioral preferences:
- **auto_restart_servers** — Restart dev servers without asking
- **bias_toward_action** — Act first, report what you did
- **aesthetic_priority** — Clean, beautiful UI with Lucide icons
- **cross_platform_instructions** — Persist instructions across AI platforms

Plus learned patterns:
- User thinks in voice-note style (stream-of-consciousness)
- User rapidly ideates (5-10 ideas per message)
- User wants honest pushback, not agreement
- User wants to understand DevTrack's own workflow

### Context Recovery (`brain/context-recovery.json`)

Session handoff data for the next AI session:
- **briefing** — Summary paragraph of what happened
- **hot_context** — Key items to load immediately
- **warnings** — Active risks to be aware of
- **suggestions** — What to do next

### User Profiles (`ai/profiles.json`)

Rich AI-observed user profiles:
- **Intelligence score** — IQ-scale (127), AI-assessed
- **Cognitive profile** — 8 dimensions (systems thinking, product intuition, etc.)
- **Technical skills** — 8 dimensions (coding, architecture, design, etc.)
- **Behavior patterns** — Session length, context habits, communication pace
- **AI-to-AI guidance** — Operational instructions for any AI working with this user
- **Session observations** — Per-session behavioral observations from different AI platforms
- **Deep assessment** — Strengths, weaknesses, work style, calibration notes

## How It's Used

1. **Session start:** ChatService loads context recovery + user profile into system prompt
2. **During session:** AI reads/writes brain notes as observations surface
3. **Session end:** AI writes context recovery briefing + session observation
4. **Dashboard:** Shows active brain notes, context recovery summary
5. **Settings → Profile:** Displays AI-observed scores, radar charts, assessment

## Design Decisions

- Brain notes are append-only with dismissal (never deleted, just marked dismissed)
- User profile scores are AI-set, read-only (user can't inflate their own ratings)
- Context recovery is regenerated at every session end
- Preferences learned from explicit user statements (with confidence scores)
