# dev-track

> A project intelligence system built for AI-assisted development.

## What is this?

dev-track is a local application that manages the entire lifecycle of AI-assisted software development: planning, execution tracking, debugging, documentation, and retrospectives. It's designed for a specific workflow — a solo developer (or small team) building rapidly with an AI coding assistant — and optimizes for two users simultaneously: the human and the AI.

## The Problem

AI-assisted development is fast. Unreasonably fast. You can ship 17 features in a single session. But the meta-layer around that development — knowing what's been built, what's broken, what's next, what decisions were made and why — can't keep up. The tools that exist (Jira, Linear, Notion, GitHub Projects) were designed for humans coordinating with humans. They don't solve the AI context problem:

- Every new AI chat window starts cold. No memory of what happened last session.
- Sprint docs grow to 700+ lines. The AI has to re-read everything to get oriented.
- Bugs discovered during testing have no structured home — they live in chat history that disappears.
- Architectural decisions are made in conversation and lost when the window closes.
- There's no way for the AI to cheaply know "where are we?" without loading massive context.

## The Solution

A lightweight local application with three layers:

1. **Data layer**: Structured files (JSON + Markdown) in a `.dev-track/` folder that commits with your project. This is the source of truth.

2. **Server layer**: A local Node.js server that provides an API, runs diagnostic scripts, watches for file changes, and serves the web UI. Runs on a high port (24680) that won't conflict with your actual dev servers.

3. **UI layer**: A proper React web application — dashboard, backlog board, issue tracker, action health monitor, session timeline, design doc viewer. Not a JSON file viewer. A real tool.

Plus a **cursor rule template** that teaches any AI assistant how to interact with the system using minimal context.

## Core Principles

1. **AI-first, human-friendly**: Every data structure is optimized for cheap AI reads/writes. The UI is for the human to see the big picture.

2. **Context-efficient**: The AI cursor rule is ~70 lines of instructions + 1 line of live status. It loads data on-demand via triggers, not on every message. Normal coding messages cost zero extra context.

3. **File-based source of truth**: All data lives in text files (JSON + MD) that commit with git. The server is a convenience layer, not a dependency. If the server isn't running, the AI can still read/write files directly.

4. **Portable**: Drop `.dev-track/` into any project. Add the cursor rule. Done. The tool works across any codebase.

5. **Opinionated workflow**: Session-based planning, three-horizon backlogs, action playbooks, structured diagnostics. Not a blank canvas — a system.

## For the Human

- Visual dashboard showing project health at a glance
- Backlog board with drag-and-drop prioritization
- Issue tracker linked to features and code
- One-click diagnostic runs with visual results
- Session history showing what was shipped and when
- Velocity metrics and trend charts
- Design doc browser with beautiful rendering

## For the AI

- Structured data files that are cheap to read (8-line JSON items, not 60-line markdown blocks)
- CLI commands for atomic operations (add item, resolve issue, log session)
- Trigger-based context loading (only reads what's needed for the current action)
- Action playbooks with step-by-step diagnostic instructions
- Quick Status line that fits in the cursor rule (~50 tokens of ambient awareness)

## Tech Stack

- **Server**: Node.js + Hono (ultra-lightweight HTTP framework)
- **Frontend**: React + Vite + Tailwind CSS
- **Data**: JSON + Markdown files (committed) + optional SQLite cache (not committed)
- **File watching**: chokidar (live reload when files change)
- **Live updates**: WebSocket (dashboard updates in real-time)
- **CLI**: Node.js scripts callable by AI or human
- **Port**: 24680 (single server, API + static frontend)

## Quick Start (once built)

```bash
# Install (from project root)
npx dev-track init

# Start the server + UI
npx dev-track serve
# → Dashboard at http://localhost:24680

# CLI (for AI or human)
dev-track session start "Working on conversation matching"
dev-track backlog list --horizon now
dev-track issue create "Extraction drops entities" --action new-entry --severity high
dev-track action run new-entry
```

## Project Structure

See [SPEC.md](./SPEC.md) for the complete technical specification.
See [PHASES.md](./PHASES.md) for the build plan.
