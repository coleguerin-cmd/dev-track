/**
 * Phased Initialization Engine v2
 * 
 * Runs project initialization in 6 focused phases with intelligent model routing.
 * Each phase has: focused prompt, specific tools, model tier, and progress streaming.
 * NO hard iteration caps — each phase runs until the AI is done (cost cap optional).
 * NO docs generation — that's a separate operation.
 * 
 * Phases:
 *   0. Discovery    (budget)  — Quick analysis, produces a plan for subsequent phases
 *   1. Systems      (standard) — Create system entities from scanner + key file pre-reads
 *   2. Roadmap      (premium)  — Epics first, then roadmap items, issues, ideas
 *   3. Cross-Ref    (standard) — Link everything, wire counts, create milestones
 *   4. Git Import   (budget)   — Import git history as changelog entries
 *   5. Finalize     (premium)  — State, context recovery, brain notes, cursor rule
 * 
 * Opus is used for phases 2 and 5 (where writing quality is visible to the user).
 * Sonnet for phases 1 and 3 (structured creation and linking).
 * Haiku for phases 0 and 4 (mechanical/simple tasks).
 */

import { runAgent, type AgentResult, type ToolCallEvent } from '../ai/runner.js';
import { getStore } from '../store.js';
import { getProjectName } from '../project-config.js';
import { buildStateCache, formatStateCacheForPrompt } from '../ai/state-cache.js';
import { saveCheckpoint, type InitCheckpoint } from './checkpoint.js';
import type { ProjectMetadata, KeyFile } from './metadata-scanner.js';
import type { ModelTier } from '../ai/router.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PhaseProgress {
  type: 'phase_start' | 'phase_complete' | 'entity_created' | 'cost_update' | 'error' | 'done' | 'cancelled';
  phase?: string;
  phase_number?: number;
  total_phases?: number;
  phase_description?: string;
  entity_type?: string;
  entity_id?: string;
  entity_title?: string;
  count?: number;
  phase_cost?: number;
  total_cost?: number;
  total_entities?: number;
  duration_seconds?: number;
  error?: string;
  message?: string;
}

export type ProgressCallback = (event: PhaseProgress) => void;

export interface PhaseDefinition {
  id: string;
  name: string;
  description: string;
  /** Model tier: premium (Opus), standard (Sonnet), budget (Haiku) */
  tier: ModelTier;
  /** Tools available in this phase — small, focused subset */
  tools: string[];
  /** Maximum iterations — high ceiling, not a hard cap */
  maxIterations: number;
  /** Whether this phase should use state cache for prior context instead of raw prior output */
  useStateCache: boolean;
  /** Build the system + user prompt for this phase */
  buildPrompt: (ctx: PhaseContext) => { system: string; user: string };
}

export interface PhaseContext {
  projectName: string;
  metadata: ProjectMetadata;
  /** Output from prior phases (compressed) */
  priorContext: string;
  /** Discovery plan (from phase 0) */
  discoveryPlan: string;
  /** Fresh state cache (for later phases) */
  stateCache: string;
}

// ─── Entity Tracking ────────────────────────────────────────────────────────
// Maps tool names to entity types for progress reporting

const ENTITY_TOOL_MAP: Record<string, string> = {
  create_system: 'systems',
  create_backlog_item: 'roadmap_items',
  create_issue: 'issues',
  capture_idea: 'ideas',
  create_epic: 'epics',
  create_milestone: 'milestones',
  add_changelog_entry: 'changelog_entries',
  add_brain_note: 'brain_notes',
  update_project_state: 'state_updates',
  write_context_recovery: 'context_recovery',
};

// ─── Phase 0: Discovery ─────────────────────────────────────────────────────

const PHASE_DISCOVERY: PhaseDefinition = {
  id: 'discovery',
  name: 'Analyzing Project',
  description: 'Quick analysis to produce an initialization plan',
  tier: 'budget',
  tools: [],  // No tools — pure analysis, just produce a plan
  maxIterations: 1,  // Single call, no tool loop
  useStateCache: false,
  buildPrompt: (ctx) => ({
    system: `You are a project analyst preparing an initialization plan for "${ctx.projectName}".

Your job is to analyze the project metadata and produce a structured plan that will guide subsequent initialization phases. Do NOT create any entities — just analyze and plan.

## Output Format
Produce a structured plan in this exact format:

### Systems Plan
List each system/module to create with a 1-line description:
- [system-id]: Name — what it does
(target: 8-20 systems for a production codebase)

### Epics Plan
List the major workstreams/themes:
- Epic Name — what it encompasses
(target: 3-8 epics)

### Key Observations
- Code quality signals (large files, missing tests, TODOs)
- Architecture patterns (monolith, microservices, modular)
- Technology decisions worth noting
- Risk areas or concerns

### Roadmap Themes
What kinds of roadmap items should be created:
- Feature gaps or incomplete implementations
- Tech debt and refactoring needs
- Testing/quality improvements
- Performance or security concerns

### Issue Signals
Specific bugs or problems to flag as issues:
- Missing error handling, hardcoded values, deprecated APIs, etc.

### Ideas to Explore
Forward-looking opportunities the project could pursue:
- Architectural improvements (e.g., caching layers, event-driven patterns)
- Feature possibilities suggested by the tech stack
- Integration opportunities with external services
- Performance or developer experience improvements
- Business model or user experience ideas
(target: 5-10 ideas)

Be specific — reference actual file paths and patterns from the scan data.`,

    user: buildDiscoveryContext(ctx.projectName, ctx.metadata),
  }),
};

// ─── Phase 1: Systems ───────────────────────────────────────────────────────

const PHASE_SYSTEMS: PhaseDefinition = {
  id: 'systems',
  name: 'Creating Systems',
  description: 'Analyzing codebase architecture and creating system entities',
  tier: 'standard',
  tools: ['create_system', 'read_project_file', 'list_directory'],
  maxIterations: 35,
  useStateCache: false,
  buildPrompt: (ctx) => ({
    system: `You are analyzing the architecture of "${ctx.projectName}" to create system entities.

## Discovery Plan
A prior analysis identified these systems to create:
${ctx.discoveryPlan}

Follow this plan but use your own judgment — the discovery phase had limited context. You have access to the actual files now.

## Your Task
Create one system entity per major module/service/subsystem. Use create_system with:
- **id**: kebab-case identifier
- **name**: Human-readable name
- **description**: 2-4 sentences. What it does, key files, tech used, current state. Be SPECIFIC — reference actual filenames, line counts, patterns.
- **health_score**: 0-100 based on observable signals (code size, complexity, TODO density, test coverage)
- **tech_stack**: Array of technologies used
- **dependencies**: Array of other system IDs this depends on

## Quality Bar
- Descriptions MUST reference specific files and patterns — "handles user authentication via src/auth/service.ts (450 lines)" not "manages authentication"
- Health scores must be justified by evidence
- Dependencies should form a coherent directed graph
- Don't create systems for trivial things (single config files, etc.)
- A production codebase typically has 8-20 systems

## Pre-Read Key Files
The following architecturally significant files have been pre-read for you. Use this context — you don't need to call read_project_file for these unless you need to see more lines:

${formatKeyFiles(ctx.metadata.key_files)}

Use read_project_file and list_directory to explore further if needed. When all systems are created, write a brief architecture summary.`,

    user: buildScanContext(ctx.projectName, ctx.metadata),
  }),
};

// ─── Phase 2: Roadmap + Issues (PREMIUM — quality matters here) ─────────

const PHASE_ROADMAP: PhaseDefinition = {
  id: 'roadmap',
  name: 'Building Roadmap & Issues',
  description: 'Creating epics, roadmap items, issues, and ideas',
  tier: 'premium',
  tools: [
    'create_epic', 'create_backlog_item', 'create_issue', 'capture_idea',
    'read_project_file', 'list_directory',
  ],
  maxIterations: 70,
  useStateCache: false,
  buildPrompt: (ctx) => ({
    system: `You are building the full project backlog for "${ctx.projectName}". This is the MOST IMPORTANT phase — every item you create will be visible to the user. Quality over quantity.

## Prior Context
${ctx.priorContext}

## Your Tasks (IN THIS ORDER)

### 1. Create Epics FIRST (create_epic)
Epics define the workstreams. Create 3-8 epics that represent the major themes:
${ctx.discoveryPlan ? extractSection(ctx.discoveryPlan, 'Epics Plan') : '- Analyze the systems and create logical groupings'}

Each epic needs: title, description (1-2 sentences), and status (planning/active/completed).

### 2. Create Roadmap Items (create_backlog_item)
For each epic, create specific, actionable roadmap items. Sources:
- Sprint/planning docs (highest priority — these are the team's actual priorities)
- TODO/FIXME comments in the codebase
- Incomplete features (placeholder code, half-built systems)
- README roadmap sections
- Feature branches in git

Each item needs:
- **title**: Clear, specific action ("Add rate limiting to API endpoints", not "Improve API")
- **description**: 2-3 sentences of context and approach
- **size**: S (<30min), M (1-3h), L (4-8h), XL (multi-session, must be broken down)
- **priority**: P1 (critical) through P4 (nice-to-have)
- **horizon**: "now" for urgent/sprint, "next" for planned, "later" for backlog
- **epic_id**: Link to the parent epic
- **acceptance_criteria**: Specific conditions for "done" (when the item is concrete enough)

### 3. Create Issues (create_issue)
Issues are bugs, quality problems, and risks. Create issues for:
- Known bugs or broken functionality
- Missing tests or dangerously low test coverage  
- Code quality problems (files >500 lines, duplicated logic, missing error handling)
- Security concerns (hardcoded secrets, missing auth, SQL injection risks)
- Stale dependencies or deprecated API usage
- Performance problems visible in the code

Each issue needs:
- **title**: Specific problem description
- **severity**: critical/high/medium/low
- **symptoms**: What is happening (observable behavior)
- **root_cause**: Why it's happening (if known)
- **files**: Affected file paths
- **system_id**: Which system this issue belongs to (MUST match a system ID created in the prior phase)
- **roadmap_item**: ID of a roadmap item that would fix this (if one exists)

### 4. Capture Ideas (capture_idea) — MINIMUM 5 ideas
Ideas are forward-looking opportunities — things worth exploring but not yet committed to the roadmap. You MUST create at least 5 ideas. Sources:
- **Architecture ideas**: Caching layers, event-driven patterns, microservice extraction, database optimizations
- **Feature opportunities**: Capabilities the tech stack enables but aren't built yet
- **Integration possibilities**: Third-party services, APIs, or tools that could add value
- **Developer experience**: Better testing, CI/CD improvements, code generation, dev tooling
- **Performance ideas**: Lazy loading, connection pooling, CDN usage, query optimization
- **Business/UX ideas**: User onboarding, analytics, A/B testing, accessibility improvements

Each idea needs: title, description, category (feature/architecture/ux/business/integration/core/security), and at least 1-2 pros and 1-2 open_questions. Include cons where relevant.

Don't just capture vague ideas — make them specific and actionable: "Add Redis caching for /api/users endpoint (currently 200ms, could be <10ms)" not "Add caching".

## Quality Bar
- Every item must be SPECIFIC and ACTIONABLE — reference files, functions, patterns
- Don't create vague items like "Improve testing" — say "Add unit tests for auth/service.ts (0% coverage, 450 lines)"
- Roadmap items under epics should be logically grouped
- Use the planning/design docs as primary input for priorities — they contain the team's actual intent
- Severity assessments must cite evidence from the code

When done, summarize: how many items created per category and the top 3 priorities.`,

    user: buildRoadmapContext(ctx.projectName, ctx.metadata),
  }),
};

// ─── Phase 3: Cross-Reference ───────────────────────────────────────────────

const PHASE_CROSSREF: PhaseDefinition = {
  id: 'crossref',
  name: 'Cross-Referencing',
  description: 'Linking entities, wiring epics, creating milestones',
  tier: 'standard',
  tools: [
    'list_backlog', 'list_issues', 'list_ideas', 'list_systems', 'list_epics', 'list_milestones',
    'update_backlog_item', 'update_issue', 'update_epic', 'update_milestone',
    'create_milestone',
  ],
  maxIterations: 40,
  useStateCache: true,
  buildPrompt: (ctx) => ({
    system: `You are cross-referencing all entities in "${ctx.projectName}" to ensure everything is properly linked.

## Current State
${ctx.stateCache}

## Your Tasks (IN ORDER)

### 1. Verify Epic Linkage
- List all epics and all roadmap items
- Ensure EVERY roadmap item has an epic_id — update orphaned items to the most relevant epic
- If an item truly fits no epic, create a new epic for it

### 2. Link Issues to Systems and Roadmap Items
- For EACH issue, set system_id to the most relevant system (use update_issue with system_id)
- For each issue that describes a fixable problem, link it to a roadmap_item that would address it
- Every issue MUST have a system_id — this is required for proper tracking

### 3. Link Epics to Milestones
- If milestones exist, ensure each epic has a milestone_id set
- If no milestones exist yet, create 2-3 milestones based on natural project phases (MVP/v1.0, v1.1, etc.)
- Link epics to milestones using update_epic with milestone_id

### 4. Set Roadmap Item milestone_id
- For roadmap items that belong to a specific milestone (beyond the epic linkage), set milestone_id directly

### 5. Gap Analysis
Check for and fix:
- Systems with zero roadmap items (stale? or need an item created)
- Epics with only 1 item (merge with another epic?)
- Critical/high issues with no corresponding roadmap item to fix them
- Roadmap items with no epic_id
- Issues with no system_id

NOTE: Epic item_count and milestone total_items are computed dynamically from linkages — you do NOT need to update those numbers manually. Focus on making sure epic_id, system_id, milestone_id, and roadmap_item linkages are correct.

Start by listing ALL entities (use list commands for each type), analyze gaps, then make updates.`,

    user: `Cross-reference all entities for "${ctx.projectName}". Start by listing everything, then fix every linkage gap. Every issue needs a system_id. Every roadmap item needs an epic_id. Every epic should have a milestone_id.`,
  }),
};

// ─── Phase 4: Git Import ────────────────────────────────────────────────────

const PHASE_GIT_IMPORT: PhaseDefinition = {
  id: 'git_import',
  name: 'Importing Git History',
  description: 'Creating changelog entries from recent git commits',
  tier: 'budget',
  tools: ['add_changelog_entry', 'get_git_log'],
  maxIterations: 15,
  useStateCache: false,
  buildPrompt: (ctx) => ({
    system: `You are importing git history into the changelog for "${ctx.projectName}".

## Your Task
Create changelog entries from the most important recent git commits. DON'T create one per commit — group related commits into logical changelog entries.

For each entry, use add_changelog_entry with:
- **title**: Clear description of what changed
- **description**: 1-2 sentences of detail
- **type**: feature | fix | enhancement | chore | infrastructure
- **scope**: Which part of the codebase (e.g., "server", "ui", "api", "database")
- **files_changed**: Key files affected

## Guidelines
- Focus on the last 20-30 meaningful commits (skip merge commits, version bumps, typo fixes)
- Group related commits (e.g., 5 commits for "auth system" → 1 changelog entry)
- Create 8-15 changelog entries representing the recent development arc
- Use the git log below — only call get_git_log if you need more detail on specific commits

## Git History
\`\`\`
${ctx.metadata.git.log || 'No git history available'}
\`\`\`
Total commits: ${ctx.metadata.git.total_commits}
${ctx.metadata.git.recent_tags ? `Recent tags: ${ctx.metadata.git.recent_tags}` : ''}`,

    user: `Import recent git history into changelog entries for "${ctx.projectName}". Group related commits into 8-15 logical entries.`,
  }),
};

// ─── Phase 5: Finalize (PREMIUM — first-impression artifacts) ───────────

const PHASE_FINALIZE: PhaseDefinition = {
  id: 'finalize',
  name: 'Finalizing',
  description: 'Writing state summary, context recovery, brain notes, and cursor rule',
  tier: 'premium',
  tools: [
    'update_project_state', 'write_context_recovery',
    'add_brain_note', 'write_project_file', 'capture_idea',
    'list_backlog', 'list_issues', 'list_systems', 'list_epics',
  ],
  maxIterations: 30,
  useStateCache: true,
  buildPrompt: (ctx) => ({
    system: `You are finalizing the initialization of "${ctx.projectName}". These artifacts define the user's FIRST IMPRESSION of the tool — make them excellent.

## Current State
${ctx.stateCache}

## Your Tasks

### 1. Project State (update_project_state)
Write an accurate overall_health score (0-100) and a comprehensive summary paragraph covering:
- What this project is and what stage it's at
- Key strengths and concerns
- How many systems, items, and issues were found

### 2. Context Recovery (write_context_recovery)
Write comprehensive context recovery — this is what the AI reads at the start of every future session:
- **briefing**: What this project is, its architecture, current state, and active priorities (2-3 paragraphs)
- **hot_context**: 8-12 key things any AI working on this codebase MUST know (specific, actionable facts)
- **warnings**: Active risks, technical debt landmines, or concerns
- **suggestions**: Prioritized list of what to work on next, with reasoning

### 3. Brain Notes (add_brain_note)
Write 3-5 brain notes capturing:
- Key architectural patterns and decisions
- Code quality observations with evidence
- Technology choices and their implications
- Potential improvement opportunities

### 4. AI Original Ideas (capture_idea) — YOUR OWN THINKING
You've now analyzed this entire codebase deeply. Share your TOP 5 original ideas for this project — things the team might not have thought of. These should NOT be obvious ("add tests") but genuinely insightful suggestions that come from your unique cross-project perspective:
- Architectural patterns from other projects that would help here
- Non-obvious feature opportunities the tech stack enables
- Potential pivots or strategic directions worth exploring
- Creative solutions to the hardest problems you identified
- Integrations or approaches the team likely hasn't considered

Use capture_idea for each one. Mark them category="architecture" or "feature" with priority="high". Include detailed pros, cons, and open_questions. These ideas should demonstrate genuine AI insight — the kind of thing that makes a developer say "huh, I hadn't thought of that."

### 5. Cursor Rule (write_project_file) — CRITICAL
Generate a dev-track cursor rule file at \`.cursor/rules/dev-track.mdc\`.

The rule MUST:
- Start with frontmatter: \`---\\ndescription: "dev-track project intelligence"\\nalwaysApply: true\\n---\`
- Include a "Quick Status" section with project health and current priorities
- Include a "Session Lifecycle" section explaining session start/end procedures
- Include an "After Every Code Change" checklist (changelog, roadmap update, issue resolution)
- Reference the dev-track API at the correct port
- Be ADDITIVE — existing cursor rules stay untouched. This file goes alongside them.

${ctx.metadata.existing_cursor_rules.length > 0 ? `
**EXISTING CURSOR RULES (DO NOT DELETE OR MODIFY THESE):**
${ctx.metadata.existing_cursor_rules.map(r => `- ${r.filename}: ${r.content_preview.substring(0, 200)}...`).join('\n')}
` : ''}

List all entities first to write accurate summaries.`,

    user: `Finalize initialization for "${ctx.projectName}". Create state, context recovery, brain notes, and cursor rule. Make them excellent — this is the user's first impression.`,
  }),
};

// ─── Phase Registry ─────────────────────────────────────────────────────────

export const ALL_PHASES: PhaseDefinition[] = [
  PHASE_DISCOVERY,
  PHASE_SYSTEMS,
  PHASE_ROADMAP,
  PHASE_CROSSREF,
  PHASE_GIT_IMPORT,
  PHASE_FINALIZE,
];

// ─── Phase Executor ─────────────────────────────────────────────────────────

/**
 * Run all initialization phases with progress streaming.
 * Skips phases already completed (from checkpoint).
 * Calls onProgress for every event (phase + entity level).
 * Supports cancellation via AbortSignal.
 */
export async function runInitPhases(
  metadata: ProjectMetadata,
  checkpoint: InitCheckpoint,
  onProgress: ProgressCallback,
  abortSignal?: AbortSignal,
): Promise<InitCheckpoint> {
  const projectName = getProjectName();
  const startTime = Date.now();
  let priorContext = '';
  let discoveryPlan = '';

  for (let i = 0; i < ALL_PHASES.length; i++) {
    const phase = ALL_PHASES[i];

    // Skip completed phases (resume support)
    if (checkpoint.completed_phases.includes(phase.id)) {
      // Recover discovery plan from checkpoint if available
      if (phase.id === 'discovery' && checkpoint.scan_data?.discoveryPlan) {
        discoveryPlan = checkpoint.scan_data.discoveryPlan;
      }
      continue;
    }

    // Check for cancellation
    if (abortSignal?.aborted) {
      checkpoint.cancelled = true;
      saveCheckpoint(checkpoint);
      onProgress({
        type: 'cancelled',
        message: `Initialization paused after ${checkpoint.completed_phases.length} of ${ALL_PHASES.length} phases. You can resume anytime.`,
        total_cost: checkpoint.total_cost,
        total_entities: countTotalEntities(checkpoint),
      });
      return checkpoint;
    }

    // Start phase
    checkpoint.current_phase = phase.id;
    saveCheckpoint(checkpoint);
    onProgress({
      type: 'phase_start',
      phase: phase.id,
      phase_number: i + 1,
      total_phases: ALL_PHASES.length,
      phase_description: phase.description,
      message: phase.name,
    });

    try {
      // Build state cache for phases that need it
      let stateCache = '';
      if (phase.useStateCache) {
        const cache = buildStateCache();
        stateCache = formatStateCacheForPrompt(cache);
      }

      // Build prompts
      const ctx: PhaseContext = {
        projectName,
        metadata,
        priorContext,
        discoveryPlan,
        stateCache,
      };
      const { system, user } = phase.buildPrompt(ctx);

      // Run the agent with tier routing
      const phaseStart = Date.now();
      const result = await runAgent(system, user, {
        task: 'project_init',
        tier: phase.tier,
        maxIterations: phase.maxIterations,
        allowedTools: phase.tools,  // Empty array = no tools (Discovery phase); specific tools = subset
        maxTokens: 8192,
        signal: abortSignal,
        heliconeProperties: {
          User: 'devtrack-init',
          Source: 'initialization',
          Project: projectName,
          Phase: phase.id,
          Tier: phase.tier,
        },
        onToolCall: (event: ToolCallEvent) => {
          // Stream entity-level progress
          const entityType = ENTITY_TOOL_MAP[event.toolName];
          if (entityType) {
            // Try to extract entity title from args
            let title = '';
            try {
              const args = typeof event.args === 'string' ? JSON.parse(event.args) : event.args;
              title = args.title || args.name || args.id || '';
            } catch {}

            checkpoint.entities_created[entityType] = (checkpoint.entities_created[entityType] || 0) + 1;
            
            onProgress({
              type: 'entity_created',
              phase: phase.id,
              entity_type: entityType,
              entity_title: title,
              total_entities: countTotalEntities(checkpoint),
              total_cost: checkpoint.total_cost + event.totalCost,
            });
          }

          // Periodic cost updates (every tool call)
          onProgress({
            type: 'cost_update',
            phase: phase.id,
            total_cost: checkpoint.total_cost + event.totalCost,
          });
        },
      });

      // Update checkpoint
      const phaseDuration = (Date.now() - phaseStart) / 1000;
      checkpoint.total_cost += result.cost;
      checkpoint.completed_phases.push(phase.id);
      checkpoint.current_phase = null;

      // Save discovery plan for future phases
      if (phase.id === 'discovery') {
        discoveryPlan = result.content;
        // Persist in checkpoint for resume
        checkpoint.scan_data = checkpoint.scan_data || {};
        checkpoint.scan_data.discoveryPlan = discoveryPlan;
      }

      // Build compressed prior context for next phase (only from discovery + systems)
      if (phase.id === 'discovery' || phase.id === 'systems') {
        // Keep prior context small — just a compressed summary of what was done
        priorContext += `\n\n### ${phase.name}\n${result.content.substring(0, 2000)}`;
      }
      // Later phases use state cache instead of growing prior context

      // Save checkpoint after each phase
      saveCheckpoint(checkpoint);

      // Report completion
      onProgress({
        type: 'phase_complete',
        phase: phase.id,
        phase_number: i + 1,
        total_phases: ALL_PHASES.length,
        phase_cost: result.cost,
        total_cost: checkpoint.total_cost,
        count: result.tool_calls_made.length,
        total_entities: countTotalEntities(checkpoint),
        duration_seconds: phaseDuration,
        message: `${phase.name} complete — ${result.tool_calls_made.length} tool calls, $${result.cost.toFixed(2)}, ${Math.round(phaseDuration)}s`,
      });

    } catch (err: any) {
      onProgress({
        type: 'error',
        phase: phase.id,
        error: err.message,
        message: `Error in ${phase.name}: ${err.message}`,
        total_cost: checkpoint.total_cost,
      });
      saveCheckpoint(checkpoint);
      // Don't mark phase as complete — allows resume
      break;
    }
  }

  // All phases done
  const elapsed = (Date.now() - startTime) / 1000;
  if (!checkpoint.cancelled && checkpoint.completed_phases.length === ALL_PHASES.length) {
    checkpoint.completed = true;
    saveCheckpoint(checkpoint);
    onProgress({
      type: 'done',
      total_cost: checkpoint.total_cost,
      total_entities: countTotalEntities(checkpoint),
      duration_seconds: elapsed,
      message: `Initialization complete! ${countTotalEntities(checkpoint)} entities created, $${checkpoint.total_cost.toFixed(2)} total cost, ${Math.round(elapsed)}s`,
    });
  }

  return checkpoint;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function countTotalEntities(checkpoint: InitCheckpoint): number {
  return Object.values(checkpoint.entities_created).reduce((a, b) => a + b, 0);
}

function extractSection(text: string, heading: string): string {
  const regex = new RegExp(`###\\s*${heading}\\n([\\s\\S]*?)(?=\\n###|$)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

function formatKeyFiles(keyFiles: KeyFile[]): string {
  if (!keyFiles || keyFiles.length === 0) return '(no key files pre-read)';
  
  return keyFiles.map(f => 
    `#### ${f.path} (${f.total_lines} lines, ${f.reason})\n\`\`\`\n${f.content}\n\`\`\``
  ).join('\n\n');
}

function buildDiscoveryContext(projectName: string, metadata: ProjectMetadata): string {
  const parts: string[] = [`## Project: ${projectName}\n`];

  // Quick stats
  parts.push(`### Quick Stats`);
  parts.push(`- Files: ${metadata.quick_stats.total_files}`);
  parts.push(`- Lines: ${metadata.quick_stats.total_lines.toLocaleString()}`);
  parts.push(`- Type: ${metadata.quick_stats.project_type}`);
  parts.push(`- Languages: ${Object.entries(metadata.quick_stats.languages).map(([ext, n]) => `${ext} (${n})`).join(', ')}`);

  // Package info
  if (metadata.package_info) {
    parts.push(`\n### Package Info\n${JSON.stringify(metadata.package_info, null, 2)}`);
  }

  // Scanner results (module list — critical for planning)
  if (metadata.scan) {
    const s = metadata.scan;
    parts.push(`\n### Codebase Modules (${s.modules.length})`);
    for (const mod of s.modules) {
      parts.push(`- **${mod.name}**: ${mod.shortDescription} (${mod.files.length} files, deps: [${mod.dependencies.join(', ')}])`);
      if (mod.externalServices.length > 0) parts.push(`  External: ${mod.externalServices.join(', ')}`);
    }
    
    // Large files (quality signals)
    const bigFiles = s.files.filter(f => f.lines > 300).sort((a, b) => b.lines - a.lines).slice(0, 15);
    if (bigFiles.length > 0) {
      parts.push(`\n### Largest Files`);
      for (const f of bigFiles) {
        parts.push(`- ${f.path}: ${f.lines} lines (${f.type})`);
      }
    }

    parts.push(`\n### Stats: ${s.stats.total_functions} functions, ${s.stats.total_components} components, ${s.stats.total_api_routes} API routes, ${s.stats.total_pages} pages`);
    
    if (s.external_services.length > 0) {
      parts.push(`\n### External Services: ${s.external_services.map((svc: any) => `${svc.name} (${svc.usage_count}x)`).join(', ')}`);
    }
  }

  // README (key for understanding project purpose)
  if (metadata.readme) {
    parts.push(`\n### README\n${metadata.readme.substring(0, 4000)}`);
  }

  // Planning docs (critical for roadmap planning)
  if (metadata.planning_docs.length > 0) {
    parts.push(`\n### Planning Documents`);
    for (const doc of metadata.planning_docs) {
      parts.push(`\n#### ${doc.path}\n${doc.content.substring(0, 2000)}`);
    }
  }

  return parts.join('\n');
}

function buildScanContext(projectName: string, metadata: ProjectMetadata): string {
  const parts: string[] = [`## Project: ${projectName}\n`];

  // Quick stats
  parts.push(`### Quick Stats`);
  parts.push(`- Files: ${metadata.quick_stats.total_files}`);
  parts.push(`- Lines: ${metadata.quick_stats.total_lines.toLocaleString()}`);
  parts.push(`- Type: ${metadata.quick_stats.project_type}`);
  parts.push(`- Languages: ${Object.entries(metadata.quick_stats.languages).map(([ext, n]) => `${ext} (${n})`).join(', ')}`);

  // Package info
  if (metadata.package_info) {
    parts.push(`\n### Package Info\n${JSON.stringify(metadata.package_info, null, 2)}`);
  }

  // Scanner results
  if (metadata.scan) {
    const s = metadata.scan;
    parts.push(`\n### Codebase Scanner Results`);
    parts.push(`Files scanned: ${s.stats.total_files}`);
    parts.push(`Functions: ${s.stats.total_functions}, Components: ${s.stats.total_components}`);
    parts.push(`API routes: ${s.stats.total_api_routes}, Pages: ${s.stats.total_pages}`);
    if (s.modules.length > 0) {
      parts.push(`\nModules detected (${s.modules.length}):`);
      for (const mod of s.modules) {
        parts.push(`- **${mod.name}**: ${mod.shortDescription} (${mod.files.length} files)`);
        if (mod.dependencies.length > 0) parts.push(`  Depends on: ${mod.dependencies.join(', ')}`);
        if (mod.externalServices.length > 0) parts.push(`  External: ${mod.externalServices.join(', ')}`);
      }
    }
    if (s.external_services.length > 0) {
      parts.push(`\nExternal services: ${s.external_services.map((svc: any) => `${svc.name} (${svc.usage_count}x)`).join(', ')}`);
    }
  }

  // README
  if (metadata.readme) {
    parts.push(`\n### README\n${metadata.readme}`);
  }

  // CLAUDE.md
  if (metadata.claude_md) {
    parts.push(`\n### CLAUDE.md\n${metadata.claude_md}`);
  }

  return parts.join('\n');
}

function buildRoadmapContext(projectName: string, metadata: ProjectMetadata): string {
  const parts: string[] = [`## Project: ${projectName}\n`];

  // Planning docs are GOLD for roadmap creation
  if (metadata.planning_docs.length > 0) {
    parts.push(`### Sprint/Planning Documents (PRIMARY SOURCE)`);
    for (const doc of metadata.planning_docs) {
      parts.push(`\n#### ${doc.path}\n${doc.content}`);
    }
  }

  // Design docs
  if (metadata.design_docs.length > 0) {
    parts.push(`\n### Architecture/Design Documents`);
    for (const doc of metadata.design_docs) {
      parts.push(`\n#### ${doc.path}\n${doc.content}`);
    }
  }

  // README (may contain roadmap section)
  if (metadata.readme) {
    parts.push(`\n### README\n${metadata.readme}`);
  }

  // Git branches (feature branches suggest in-progress work)
  if (metadata.git.branches) {
    parts.push(`\n### Git Branches\n\`\`\`\n${metadata.git.branches}\n\`\`\``);
  }

  // Key file previews for code quality signals
  if (metadata.key_files.length > 0) {
    parts.push(`\n### Key File Previews (for code quality signals)`);
    // Just list file info, don't include full content (too much context)
    for (const f of metadata.key_files) {
      parts.push(`- ${f.path}: ${f.total_lines} lines (${f.reason})`);
    }
  }

  // Large files from scan
  if (metadata.scan) {
    const bigFiles = metadata.scan.files
      .filter(f => f.lines > 500)
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 10);
    if (bigFiles.length > 0) {
      parts.push(`\n### Large Files (potential tech debt)`);
      for (const f of bigFiles) {
        parts.push(`- ${f.path}: ${f.lines} lines (${f.type})`);
      }
    }
  }

  parts.push(`\n## Instructions\nCreate epics FIRST, then roadmap items under each epic, then issues, then ideas. Be thorough and specific.`);

  return parts.join('\n');
}
