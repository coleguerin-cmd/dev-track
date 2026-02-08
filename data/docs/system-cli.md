# System: CLI

> **Auto-generated** | Last refreshed: 2026-02-09 | Health: 55/100 ✅ Healthy

---

## Overview

The CLI provides command-line access to DevTrack for project initialization, server management, and data queries. It's the primary interface for setting up new projects and can be used by AI tools or humans directly from the terminal.

## Key Stats

| Metric | Value |
|--------|-------|
| Health Score | 55/100 |
| File | `cli/index.ts` (single file) |
| Tech Stack | TypeScript, Node.js |
| Dependencies | server |
| Status | Never fully tested against live server |

## Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize DevTrack in current project directory. Creates `.dev-track/config.json`, data directory at `~/.dev-track/projects/<id>/data/`, cursor rule, gitignore update. |
| `start` | Start the DevTrack server. Accepts `--port`, `--data-dir`, `--project-root` flags. |
| `status` | Show current project status summary |
| `backlog` | List backlog/roadmap items |
| `issues` | List issues |
| `changelog` | Show recent changelog entries |
| `context` | Generate AI context file (`--platform cursor`) |
| `projects` | List all registered projects |

## Usage

```bash
# Using npx (recommended for dogfooding)
npx tsx /path/to/dev-track/cli/index.ts <command>

# After npm link (may crash Cursor — use with caution)
dev-track <command>
```

## Multi-Project Support

The CLI manages the central project registry at `~/.dev-track/registry.json`:

- `init` registers the project and creates isolated data directory
- `start` launches server pointed at the correct data directory
- `projects` lists all registered projects with paths

## Health Notes

The CLI scores 55/100 because:
- Never fully tested against a live server
- `npm link` causes crashes in Cursor (known issue)
- Limited error handling and user feedback
- No interactive prompts or rich terminal output
