import { Hono } from 'hono';
import { getStore } from '../store.js';
import { getProjectRoot } from '../project-config.js';
import { runAgent } from '../ai/runner.js';
import { scanCodebase } from '../analyzer/scanner.js';
import { execSync } from 'child_process';

const app = new Hono();

// POST /api/v1/init — AI-powered project initialization
app.post('/', async (c) => {
  const store = getStore();
  const body = await c.req.json().catch(() => ({}));
  const projectRoot = body.project_root || getProjectRoot();

  console.log(`[init] Starting AI project initialization for: ${projectRoot}`);

  try {
    // Step 1: Run codebase scanner
    console.log('[init] Step 1: Scanning codebase...');
    let scanResult: any = null;
    try {
      scanResult = await scanCodebase(projectRoot);
    } catch (err: any) {
      console.warn('[init] Scanner failed, continuing without scan:', err.message);
    }

    // Step 2: Get git info
    console.log('[init] Step 2: Reading git history...');
    let gitLog = '';
    let gitBranches = '';
    try {
      gitLog = execSync('git log --oneline --no-decorate -50', { cwd: projectRoot, encoding: 'utf-8', timeout: 10000 });
      gitBranches = execSync('git branch -a', { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 });
    } catch { /* git not available or not a repo */ }

    // Step 3: Read package info
    console.log('[init] Step 3: Reading project metadata...');
    let packageInfo = '';
    try {
      const fs = await import('fs');
      const path = await import('path');
      const pkgPath = path.join(projectRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        packageInfo = JSON.stringify({ name: pkg.name, description: pkg.description, scripts: Object.keys(pkg.scripts || {}), dependencies: Object.keys(pkg.dependencies || {}), devDependencies: Object.keys(pkg.devDependencies || {}) }, null, 2);
      }
    } catch { /* no package.json */ }

    // Step 4: Read README
    let readme = '';
    try {
      const fs = await import('fs');
      const path = await import('path');
      for (const name of ['README.md', 'readme.md', 'README.txt']) {
        const p = path.join(projectRoot, name);
        if (fs.existsSync(p)) { readme = fs.readFileSync(p, 'utf-8').substring(0, 5000); break; }
      }
    } catch { /* no readme */ }

    // Step 5: Run AI agent
    console.log('[init] Step 4: Running AI agent for deep analysis...');
    const systemPrompt = buildInitSystemPrompt(store.config.project);
    const userMessage = buildInitUserMessage({ scanResult, gitLog, gitBranches, packageInfo, readme });

    const result = await runAgent(systemPrompt, userMessage, {
      task: 'project_init',
      maxIterations: 20,
    });

    console.log(`[init] Entity population complete: ${result.iterations} iterations, ${result.tool_calls_made.length} tool calls, $${result.cost.toFixed(4)}`);

    // Step 6: Trigger docs generation (async — don't wait)
    console.log('[init] Step 5: Triggering docs generation...');
    try {
      // Import dynamically to avoid circular deps
      const { default: fetch } = await import('node-fetch' as any).catch(() => ({ default: globalThis.fetch }));
      // Fire docs generation in the background via internal API
      fetch(`http://127.0.0.1:${process.env.PORT || 24680}/api/v1/docs/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'initialize' }),
      }).catch(() => { /* fire and forget */ });
    } catch { /* ignore — docs will be generated on next manual trigger */ }

    return c.json({
      ok: true,
      data: {
        message: result.content,
        tool_calls: result.tool_calls_made.length,
        iterations: result.iterations,
        cost: result.cost,
        docs_generation: 'started',
      },
    });
  } catch (err: any) {
    console.error('[init] Failed:', err.message);
    return c.json({ ok: false, error: err.message }, 500);
  }
});

function buildInitSystemPrompt(projectName: string): string {
  return `You are the DevTrack initialization agent. Your job is to deeply analyze a codebase and populate DevTrack with comprehensive, high-quality project data.

You have full access to all DevTrack tools. Use them aggressively — create every entity that makes sense.

## Your Mission
Analyze the provided codebase data and populate ALL of these DevTrack entities:

### Systems (create_system)
Create one system per major module/service. Include:
- Rich description of what the system does
- Accurate health_score (0-100) based on code quality signals
- tech_stack array from detected technologies
- dependencies between systems

### Roadmap Items (create_backlog_item)
Create roadmap items from:
- TODO/FIXME comments in the codebase
- Incomplete features visible in the code
- README "planned" or "roadmap" sections
- Feature branches in git
Set appropriate horizons: "now" for urgent, "next" for planned, "later" for someday.

### Issues (create_issue)
Create issues for:
- Known bugs or code smells
- Missing tests or documentation
- Stale dependencies
- Security concerns
- Performance problems visible in the code

### Docs (create_doc)
Generate these auto-generated docs:
1. **System Overview** — architecture summary of all systems, how they connect, tech stack
2. **Onboarding Guide** — how to set up, run, and develop the project
3. **Architecture Decisions** — key design choices visible in the codebase
Mark all as auto_generated: true with generation_sources.

### State (update_project_state)
Write:
- overall_health: computed from system health scores
- summary: one-paragraph project assessment

### Context Recovery (write_context_recovery)
Write initial context recovery with:
- briefing: what this project is and its current state
- hot_context: key things any AI working on this project should know
- warnings: risks or concerns
- suggestions: what to work on next

### Ideas (create_idea)
Capture interesting patterns, opportunities, or improvements you notice.

## Quality Bar
- Every description should be detailed and specific, not generic
- Health scores should be justified by observable signals
- Roadmap items need clear acceptance criteria when possible
- Docs should be comprehensive enough to onboard a new developer
- Think like a senior engineering manager doing a thorough project audit

## Project: ${projectName}`;
}

function buildInitUserMessage(context: {
  scanResult: any;
  gitLog: string;
  gitBranches: string;
  packageInfo: string;
  readme: string;
}): string {
  const parts: string[] = ['## Codebase Analysis Results\n'];

  if (context.scanResult) {
    const scan = context.scanResult;
    parts.push(`### Scanner Output`);
    parts.push(`Files scanned: ${scan.files_scanned || 'unknown'}`);
    parts.push(`Lines of code: ${scan.total_lines || 'unknown'}`);
    if (scan.modules) {
      parts.push(`\nModules detected (${scan.modules.length}):`);
      for (const mod of scan.modules.slice(0, 20)) {
        parts.push(`- **${mod.name || mod.id}**: ${mod.description || mod.file_count + ' files'}`);
      }
    }
    if (scan.external_services) {
      parts.push(`\nExternal services: ${JSON.stringify(scan.external_services)}`);
    }
  } else {
    parts.push('Scanner did not produce results. Use available tools to inspect the project.');
  }

  if (context.packageInfo) {
    parts.push(`\n### Package Info\n${context.packageInfo}`);
  }

  if (context.readme) {
    parts.push(`\n### README (first 5000 chars)\n${context.readme}`);
  }

  if (context.gitLog) {
    parts.push(`\n### Recent Git History (last 50 commits)\n\`\`\`\n${context.gitLog}\n\`\`\``);
  }

  if (context.gitBranches) {
    parts.push(`\n### Git Branches\n\`\`\`\n${context.gitBranches}\n\`\`\``);
  }

  parts.push('\n## Instructions\nAnalyze everything above. Create all relevant DevTrack entities. Be thorough and detailed.');

  return parts.join('\n');
}

export default app;
