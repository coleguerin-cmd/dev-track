# System: Cursor Rule / AI Context

> **Auto-generated** | Last refreshed: 2026-02-09 | Health: 70/100 ✅ Healthy

---

## Overview

The Cursor Rule is the bridge between DevTrack and AI coding assistants. It's a `.mdc` file installed in `.cursor/rules/dev-track.mdc` that teaches the AI how to interact with DevTrack's data, follow session protocols, and maintain project tracking discipline.

## Key Stats

| Metric | Value |
|--------|-------|
| Health Score | 70/100 |
| File | `.cursor/rules/dev-track.mdc` |
| Template | `templates/dev-track.mdc` |
| Open Issues | ISS-006 (AI drift — structural enforcement needed) |

## Structure

1. **Frontmatter** — `alwaysApply: true` ensures the rule loads on every conversation
2. **Mandatory Checklist** — Pre/post session checklist at the top (highest visibility)
3. **Quick Status** — One-line project status (auto-regenerated)
4. **Last Session Briefing** — Context recovery from previous session
5. **File Map** — Where all data files live
6. **Session Lifecycle** — How to start/end sessions
7. **AI Autonomy Permissions** — What the AI can do without asking
8. **Standing Instructions** — Persistent behavioral instructions

## The AI Drift Problem (ISS-006)

**Core issue:** Text instructions in cursor rules are fundamentally unreliable for enforcing AI behavior. The coding AI's attention is consumed by coding tasks — asking it to also remember tracking duties fails.

**Root causes:**
1. Cursor rule had no frontmatter (may not have loaded)
2. Behavioral instructions buried at line 74
3. AI attention is finite — tracking competes with coding

**Partial fixes applied:**
- Added `alwaysApply: true` frontmatter
- Moved mandatory checklist to top of file
- Established create-before-fix discipline

**Real fix needed:** Structural enforcement via background AI watcher (IDEA-014) or tool-level validation. The system must be self-enforcing — neither the human nor the AI can be trusted to remember tracking duties.

## Context Sync

The `server/context-sync.ts` module can generate AI context files for different platforms:
- Cursor (`.cursor/rules/dev-track.mdc`)
- Claude (planned: `CLAUDE.md`)
- Copilot (planned: `copilot-instructions`)

Planned: `dev-track context --platform cursor` CLI command for auto-sync.

## Health Notes

Scores 70/100 because:
- ISS-006 partially addressed but structural enforcement still needed
- Context sync to other platforms not yet implemented
- Rule content needs to be regenerated when project state changes significantly
