# System: Integration Plugins

> **Auto-generated** | Last refreshed: 2026-02-09 | Health: 60/100 ✅ Healthy

---

## Overview

DevTrack's integration system provides 8 plugins for connecting to external development tools and services. Each plugin follows a standard interface with credential management, connection testing, and data fetching. Managed by the `IntegrationManager` singleton.

## Key Stats

| Metric | Value |
|--------|-------|
| Health Score | 60/100 |
| Plugins | 8 |
| Files | 10 (8 plugins + manager + types) |
| Tech Stack | TypeScript |
| Dependencies | server |
| Open Issues | ISS-003 (untested with real credentials) |

## Plugins

| Plugin | File | Status | Notes |
|--------|------|--------|-------|
| **GitHub** | `github.ts` | ✅ Working | Zero-config via local `git`/`gh` CLI. No API key needed. |
| **Helicone** | `helicone.ts` | ⚠️ Configured | BYOK configured. Org ID field added. Credentials sync to AI proxy. |
| **Vercel** | `vercel.ts` | ❓ Untested | Has testConnection() but never called with real credentials |
| **Supabase** | `supabase.ts` | ❓ Untested | Has testConnection() but never called with real credentials |
| **Sentry** | `sentry.ts` | ❓ Untested | Has testConnection() but never called with real credentials |
| **Upstash** | `upstash.ts` | ❓ Untested | Has testConnection() but never called with real credentials |
| **AWS EC2** | `aws-ec2.ts` | ❓ Untested | Has testConnection() but never called with real credentials |
| **Cloudflare** | `cloudflare.ts` | ❓ Untested | Has testConnection() but never called with real credentials |

## Architecture

```
IntegrationManager (singleton)
  ├── Plugin Registry (8 plugins)
  ├── Credential Storage (.credentials.json)
  ├── Connection Testing (per-plugin testConnection())
  └── Helicone → AI proxy credential sync
```

### Plugin Interface

Each plugin implements:
- `id` — Unique identifier
- `name` — Display name
- `description` — What it does
- `credentials` — Required credential fields
- `testConnection(creds)` — Verify credentials work
- `getData(creds)` — Fetch data from the service

### Credential Management

- Credentials stored in `.credentials.json` (gitignored)
- UI: Settings → Integrations tab
- Helicone credentials auto-sync to AI proxy namespace when saved (ISS-015 fix)
- AI provider keys (OpenAI, Anthropic, Google) managed separately in AI Providers section

## GitHub Integration (Zero-Config)

The GitHub plugin is unique — it uses the local `git` and `gh` CLI tools instead of API keys:

| Function | Description |
|----------|-------------|
| `getGitStatus()` | Current branch, modified files, staged changes |
| `getGitLog()` | Commit history with full messages and dates |
| `getGitBranches()` | All branches with current indicated |
| `getGitDiffStats()` | Changed files with insertions/deletions |
| `getGhPullRequests()` | Open PRs (requires `gh` CLI) |
| `getGhCIStatus()` | CI/CD status (requires `gh` CLI) |
| `getGhIssues()` | GitHub Issues (requires `gh` CLI) |

## Health Notes

Scores 60/100 because:
- 7 of 8 plugins untested with real credentials (ISS-003)
- Only GitHub is confirmed working in production
- Helicone is configured but not fully validated
- No integration data routing into native views yet (IDEA-009)
