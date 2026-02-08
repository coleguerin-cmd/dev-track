# System: AI Intelligence Layer

> **Auto-generated** | Last refreshed: 2026-02-09 | Health: 75/100 ✅ Healthy

---

## Overview

The AI Intelligence Layer is DevTrack's core differentiator — a multi-provider AI system with ~40 tools across 16 domains, enabling a chat-first project management experience. It supports OpenAI, Anthropic, and Google AI with automatic model discovery, task-aware routing, and Helicone proxy for cost tracking.

## Key Stats

| Metric | Value |
|--------|-------|
| Health Score | 75/100 |
| AI Tools | ~40 across 16 domain modules |
| Providers | OpenAI, Anthropic, Google AI |
| Model Discovery | Auto-discovers 58+ models at startup |
| Streaming | SSE (Server-Sent Events) |
| Dependencies | server, data-layer |

## Architecture

```
ChatService (multi-turn agent loop)
  ├── AIService (provider abstraction)
  │   ├── OpenAI SDK
  │   ├── Anthropic SDK
  │   └── Google AI SDK
  ├── ModelRouter (task-aware routing)
  │   ├── Auto-discovery (queries provider APIs)
  │   └── Fallback chains (premium → standard → budget)
  ├── Tool Registry (modular)
  │   └── 16 domain modules (server/ai/tools/)
  └── Helicone Proxy (cost tracking, optional)
```

## Tool Registry (16 Domains, ~40 Tools)

| Domain Module | Tools | Description |
|---------------|-------|-------------|
| `backlog.ts` | list, create, update, delete | Roadmap item management |
| `issues.ts` | list, create, update, resolve | Issue tracking |
| `changelog.ts` | list, add_entry | Changelog management |
| `ideas.ts` | list, capture, update | Idea funnel |
| `state.ts` | get_project_state, get_quick_status, update_project_state | Project health |
| `brain.ts` | get_notes, add_note, get/write_context_recovery, get/update_preferences | AI memory |
| `session.ts` | get_session_info, start_session, end_session | Session lifecycle |
| `codebase.ts` | get_stats, get_modules, search, get_file_details, scan | Codebase analysis |
| `git.ts` | status, diff, log, branches | Git integration |
| `files.ts` | read_project_file, write_project_file, list_directory | File operations |
| `docs.ts` | list, get, create, update, delete | Documentation |
| `metrics.ts` | get_velocity, update_velocity | Metrics and analytics |
| `config.ts` | get/update_project_config, list_registered_projects | Configuration |
| `profiles.ts` | get/update_user_profile, add_session_observation | User profiling |
| `integrations.ts` | get_status, test_integration | Integration management |
| `actions.ts` | list, create, update | Action tracking |

### Adding New Tools

Create a new file in `server/ai/tools/` following the pattern:

```typescript
// server/ai/tools/my-domain.ts
export const tools = [
  {
    name: "my_tool",
    description: "What this tool does",
    parameters: { /* JSON Schema */ },
    execute: async (params) => { /* implementation */ }
  }
];
```

Add to the MODULES array in `server/ai/tools/index.ts`.

## Model Router

The ModelRouter auto-discovers models from provider APIs at startup:

- **Classification by pattern:** `sonnet` → standard, `haiku` → budget, `opus` → premium, `gpt-4o` → standard, `gpt-4o-mini` → budget
- **Task-aware routing:** Different tasks route to different model tiers
- **Fallback chains:** If preferred model unavailable, falls back to next tier
- **58+ models** discovered across 3 providers

## Chat Flow

1. User sends message via ChatSidebar UI
2. `POST /api/v1/ai/chat` → ChatService
3. ChatService builds system prompt (injects user profile, project context)
4. Sends to ModelRouter → selects best available model
5. Model responds with text and/or tool calls
6. Tool calls executed against DevTrack data
7. Results fed back to model for multi-turn reasoning
8. Response streamed to UI via SSE

## Key Design Decisions

- **Chat-first:** The chat IS the product. Everything else is automation of chat patterns (BN-011)
- **Auto-discovery over hardcoding:** Model IDs change frequently; discovery prevents breakage (BN-012)
- **Modular tools:** Replaced 718-line monolithic switch with 16 domain modules (ISS-016)
- **User profile injection:** Every chat session loads the user profile into the system prompt for personalized interaction

## Current Status

- Foundation built and functional
- **In progress:** Testing with real conversations in browser (ai-chat-agent backlog item)
- Chat duplicate bug fixed (ISS-008)
- Missing: conversation persistence, multi-conversation support
