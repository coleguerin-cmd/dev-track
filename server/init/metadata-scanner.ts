/**
 * Enhanced Metadata Scanner
 * 
 * Wraps the codebase scanner with project-level metadata discovery:
 * - README.md content
 * - .cursor/rules/*.mdc (existing Cursor rules — DO NOT DELETE)
 * - CLAUDE.md, .github/copilot-instructions.md
 * - plans/, docs/ directories (sprint docs, architecture docs)
 * - package.json / pyproject.toml / Cargo.toml etc.
 * - Git history (commits + branches)
 * - File counts and language breakdown for pre-scan estimate
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { scanCodebase, type CodebaseAnalysis } from '../analyzer/scanner.js';

export interface KeyFile {
  /** Relative path from project root */
  path: string;
  /** Why this file was selected */
  reason: string;
  /** First N lines of the file */
  content: string;
  /** Total line count */
  total_lines: number;
}

export interface ProjectMetadata {
  /** Quick stats for pre-scan estimate */
  quick_stats: {
    total_files: number;
    total_lines: number;
    languages: Record<string, number>; // extension -> file count
    project_type: string; // 'nextjs' | 'express' | 'python' | 'rust' | 'unknown'
    has_existing_cursor_rules: boolean;
    has_claude_md: boolean;
    has_readme: boolean;
  };
  /** Full codebase scan results */
  scan: CodebaseAnalysis | null;
  /** Package manager metadata */
  package_info: any | null;
  /** README content (first 8000 chars) */
  readme: string;
  /** Existing cursor rules (filenames + first 500 chars each) — DO NOT DELETE THESE */
  existing_cursor_rules: { filename: string; content_preview: string }[];
  /** CLAUDE.md content if present */
  claude_md: string;
  /** Sprint/planning docs found */
  planning_docs: { path: string; content: string }[];
  /** Architecture/design docs found */
  design_docs: { path: string; content: string }[];
  /** Git history */
  git: {
    log: string; // last 80 commits
    branches: string;
    recent_tags: string;
    total_commits: number;
  };
  /** Pre-read key files — architecturally significant files included in prompt context */
  key_files: KeyFile[];
}

/**
 * Quick file count without full scan — for pre-scan estimate.
 */
export function quickEstimate(projectRoot: string): ProjectMetadata['quick_stats'] {
  const languages: Record<string, number> = {};
  let totalFiles = 0;
  let totalLines = 0;

  const SKIP = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.pglite', 'coverage', '__pycache__', '.cache', '.vercel', '.turbo']);
  const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.rb', '.php', '.vue', '.svelte', '.css', '.scss', '.html', '.sql', '.md']);

  function walk(dir: string, depth = 0) {
    if (depth > 8) return; // Don't go too deep
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.cursor') continue;
        if (SKIP.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (CODE_EXTS.has(ext)) {
            totalFiles++;
            languages[ext] = (languages[ext] || 0) + 1;
            try {
              const content = fs.readFileSync(full, 'utf-8');
              totalLines += content.split('\n').length;
            } catch { totalLines += 100; } // estimate
          }
        }
      }
    } catch {}
  }

  walk(projectRoot);

  // Detect project type
  let projectType = 'unknown';
  if (fs.existsSync(path.join(projectRoot, 'next.config.js')) || fs.existsSync(path.join(projectRoot, 'next.config.ts')) || fs.existsSync(path.join(projectRoot, 'next.config.mjs'))) {
    projectType = 'nextjs';
  } else if (languages['.ts'] || languages['.js']) {
    if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
        if (pkg.dependencies?.express || pkg.dependencies?.hono || pkg.dependencies?.fastify) projectType = 'node-server';
        else if (pkg.dependencies?.react || pkg.dependencies?.vue || pkg.dependencies?.svelte) projectType = 'frontend';
        else projectType = 'node';
      } catch { projectType = 'node'; }
    }
  } else if (languages['.py']) {
    projectType = 'python';
  } else if (languages['.rs']) {
    projectType = 'rust';
  } else if (languages['.go']) {
    projectType = 'go';
  }

  return {
    total_files: totalFiles,
    total_lines: totalLines,
    languages,
    project_type: projectType,
    has_existing_cursor_rules: fs.existsSync(path.join(projectRoot, '.cursor', 'rules')),
    has_claude_md: fs.existsSync(path.join(projectRoot, 'CLAUDE.md')),
    has_readme: fs.existsSync(path.join(projectRoot, 'README.md')),
  };
}

/**
 * Estimate initialization cost based on project size.
 * Returns cost range and time estimate for user acceptance.
 */
export function estimateCost(stats: ProjectMetadata['quick_stats']): {
  cost_low: number;
  cost_high: number;
  time_minutes_low: number;
  time_minutes_high: number;
  size_category: 'small' | 'medium' | 'large' | 'xl';
  estimated_systems: number;
  estimated_phases: number;
} {
  const files = stats.total_files;
  const lines = stats.total_lines;

  let size_category: 'small' | 'medium' | 'large' | 'xl';
  let cost_low: number, cost_high: number;
  let time_low: number, time_high: number;
  let estimated_systems: number;

  // Cost estimates account for 6-phase engine with Opus on phases 2+5
  // Opus ($15/$75 per 1M tokens) for Roadmap + Finalize
  // Sonnet ($3/$15) for Systems + Cross-ref
  // Haiku ($1/$5) for Discovery + Git Import
  if (files < 50) {
    size_category = 'small';
    cost_low = 5; cost_high = 12;
    time_low = 3; time_high = 6;
    estimated_systems = Math.max(2, Math.ceil(files / 10));
  } else if (files < 200) {
    size_category = 'medium';
    cost_low = 10; cost_high = 25;
    time_low = 5; time_high = 10;
    estimated_systems = Math.max(4, Math.ceil(files / 25));
  } else if (files < 500) {
    size_category = 'large';
    cost_low = 18; cost_high = 40;
    time_low = 8; time_high = 18;
    estimated_systems = Math.max(6, Math.ceil(files / 40));
  } else {
    size_category = 'xl';
    cost_low = 30; cost_high = 60;
    time_low = 15; time_high = 30;
    estimated_systems = Math.max(8, Math.ceil(files / 60));
  }

  // Adjust for rich metadata (planning docs, README = more context = slightly more cost)
  if (stats.has_readme) { cost_high += 1; }

  return {
    cost_low,
    cost_high,
    time_minutes_low: time_low,
    time_minutes_high: time_high,
    size_category,
    estimated_systems: Math.min(estimated_systems, 25),
    estimated_phases: 6,
  };
}

/**
 * Full metadata scan — runs codebase scanner + reads all project metadata.
 */
export async function fullMetadataScan(projectRoot: string): Promise<ProjectMetadata> {
  const quick_stats = quickEstimate(projectRoot);

  // Run the code scanner
  let scan: CodebaseAnalysis | null = null;
  try {
    scan = await scanCodebase(projectRoot);
  } catch (err: any) {
    console.warn('[init:scanner] Codebase scan failed:', err.message);
  }

  // Read package.json / pyproject.toml etc.
  let package_info: any = null;
  for (const pkgFile of ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod']) {
    try {
      const p = path.join(projectRoot, pkgFile);
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        if (pkgFile === 'package.json') {
          const pkg = JSON.parse(raw);
          package_info = {
            file: pkgFile,
            name: pkg.name,
            description: pkg.description,
            version: pkg.version,
            scripts: Object.keys(pkg.scripts || {}),
            dependencies: Object.keys(pkg.dependencies || {}),
            devDependencies: Object.keys(pkg.devDependencies || {}),
          };
        } else {
          package_info = { file: pkgFile, content: raw.substring(0, 3000) };
        }
        break;
      }
    } catch {}
  }

  // Read README
  let readme = '';
  for (const name of ['README.md', 'readme.md', 'README.txt', 'README']) {
    try {
      const p = path.join(projectRoot, name);
      if (fs.existsSync(p)) {
        readme = fs.readFileSync(p, 'utf-8').substring(0, 8000);
        break;
      }
    } catch {}
  }

  // Read existing cursor rules (NON-DESTRUCTIVE — we just read, never delete)
  const existing_cursor_rules: ProjectMetadata['existing_cursor_rules'] = [];
  try {
    const rulesDir = path.join(projectRoot, '.cursor', 'rules');
    if (fs.existsSync(rulesDir)) {
      const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.mdc') || f.endsWith('.md'));
      for (const f of files) {
        // Skip our own rule if it exists already
        if (f === 'dev-track.mdc') continue;
        try {
          const content = fs.readFileSync(path.join(rulesDir, f), 'utf-8');
          existing_cursor_rules.push({ filename: f, content_preview: content.substring(0, 500) });
        } catch {}
      }
    }
  } catch {}

  // Read CLAUDE.md
  let claude_md = '';
  try {
    const p = path.join(projectRoot, 'CLAUDE.md');
    if (fs.existsSync(p)) {
      claude_md = fs.readFileSync(p, 'utf-8').substring(0, 5000);
    }
  } catch {}

  // Find planning docs (plans/, sprint docs, etc.)
  const planning_docs: ProjectMetadata['planning_docs'] = [];
  for (const planDir of ['plans', 'docs/plans', '.github']) {
    try {
      const d = path.join(projectRoot, planDir);
      if (fs.existsSync(d) && fs.statSync(d).isDirectory()) {
        const files = fs.readdirSync(d).filter(f => f.endsWith('.md'));
        for (const f of files.slice(0, 5)) { // Max 5 planning docs
          const content = fs.readFileSync(path.join(d, f), 'utf-8');
          planning_docs.push({ path: `${planDir}/${f}`, content: content.substring(0, 5000) });
        }
      }
    } catch {}
  }

  // Find design/architecture docs
  const design_docs: ProjectMetadata['design_docs'] = [];
  for (const docDir of ['docs', 'docs/reference', 'docs/architecture', 'architecture']) {
    try {
      const d = path.join(projectRoot, docDir);
      if (fs.existsSync(d) && fs.statSync(d).isDirectory()) {
        const files = fs.readdirSync(d).filter(f => f.endsWith('.md'));
        for (const f of files.slice(0, 8)) { // Max 8 design docs
          const content = fs.readFileSync(path.join(d, f), 'utf-8');
          design_docs.push({ path: `${docDir}/${f}`, content: content.substring(0, 5000) });
        }
      }
    } catch {}
  }

  // Git history
  const git = { log: '', branches: '', recent_tags: '', total_commits: 0 };
  try {
    git.log = execSync('git log --oneline --no-decorate -80', { cwd: projectRoot, encoding: 'utf-8', timeout: 15000 });
    git.branches = execSync('git branch -a', { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 });
    git.recent_tags = execSync('git tag --sort=-creatordate | head -10', { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }).trim();
    const countStr = execSync('git rev-list --count HEAD', { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }).trim();
    git.total_commits = parseInt(countStr) || 0;
  } catch {}

  // Pre-read key files (architecturally significant, saves AI iterations)
  const key_files = identifyAndReadKeyFiles(projectRoot, scan);

  return { quick_stats, scan, package_info, readme, existing_cursor_rules, claude_md, planning_docs, design_docs, git, key_files };
}

/**
 * Identify and read the most architecturally significant files in the codebase.
 * These get included directly in the prompt context so the AI doesn't waste iterations
 * calling read_file on obvious files.
 * 
 * Strategy:
 * 1. Entry points (index.ts, main.ts, app.ts, server.ts) — the "front door"
 * 2. Schema/model files — reveal data model
 * 3. Config files — reveal architecture decisions
 * 4. Hub files (most imported) — the connective tissue
 * 5. Largest code files — the most complex modules
 * 
 * Caps at 15 files, ~150 lines each, to keep prompt size manageable (~12K tokens).
 */
function identifyAndReadKeyFiles(projectRoot: string, scan: CodebaseAnalysis | null): KeyFile[] {
  const MAX_FILES = 15;
  const MAX_LINES = 150;
  const selected = new Map<string, string>(); // path -> reason

  if (!scan) return [];

  const allFiles = scan.files || [];
  if (allFiles.length === 0) return [];

  // 1. Entry points — files that are the "front door" of the app
  const entryPatterns = [
    /^(src\/)?(index|main|app|server)\.(ts|tsx|js|jsx)$/,
    /^(src\/)?pages\/_app\.(ts|tsx|js|jsx)$/,
    /^(src\/)?app\/layout\.(ts|tsx|js|jsx)$/,
    /^(src\/)?app\/page\.(ts|tsx|js|jsx)$/,
  ];
  for (const file of allFiles) {
    for (const pattern of entryPatterns) {
      if (pattern.test(file.path) && !selected.has(file.path)) {
        selected.set(file.path, 'entry point');
      }
    }
  }

  // 2. Schema/model/type files — reveal data model
  const schemaFiles = allFiles.filter(f =>
    f.type === 'schema' ||
    /schema|model|types|entities|prisma\.schema/i.test(f.path)
  );
  // Sort by size (larger = more comprehensive)
  schemaFiles.sort((a, b) => b.lines - a.lines);
  for (const f of schemaFiles.slice(0, 3)) {
    if (!selected.has(f.path)) {
      selected.set(f.path, 'schema/data model');
    }
  }

  // 3. Config files — reveal architecture decisions
  const configFiles = allFiles.filter(f =>
    f.type === 'config' &&
    !/node_modules|\.d\.ts|lock/i.test(f.path)
  );
  for (const f of configFiles.slice(0, 2)) {
    if (!selected.has(f.path)) {
      selected.set(f.path, 'configuration');
    }
  }

  // 4. Hub files — most imported by other files (connective tissue)
  const importCounts = new Map<string, number>();
  for (const file of allFiles) {
    for (const imp of file.imports || []) {
      if (!imp.isExternal) {
        // Resolve relative import to a normalized key
        const key = imp.source.replace(/^\.\//, '').replace(/\.\.\//g, '');
        importCounts.set(key, (importCounts.get(key) || 0) + 1);
      }
    }
  }
  const hubEntries = [...importCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [importKey, count] of hubEntries.slice(0, 5)) {
    if (count < 3) continue; // Only files imported 3+ times
    // Find the actual file matching this import key
    const matchFile = allFiles.find(f =>
      f.path.includes(importKey) || f.path.replace(/\.(ts|tsx|js|jsx)$/, '') === importKey
    );
    if (matchFile && !selected.has(matchFile.path)) {
      selected.set(matchFile.path, `hub file (imported by ${count} files)`);
    }
  }

  // 5. Largest code files — the most complex/important modules
  const codeFiles = allFiles.filter(f =>
    !selected.has(f.path) &&
    !['test', 'style', 'config'].includes(f.type) &&
    !/\.d\.ts$|\.test\.|\.spec\.|__test__|__mock__/i.test(f.path)
  );
  codeFiles.sort((a, b) => b.lines - a.lines);
  const remaining = MAX_FILES - selected.size;
  for (const f of codeFiles.slice(0, remaining)) {
    if (!selected.has(f.path)) {
      selected.set(f.path, `large file (${f.lines} lines)`);
    }
  }

  // Read the selected files
  const keyFiles: KeyFile[] = [];
  for (const [relPath, reason] of selected) {
    if (keyFiles.length >= MAX_FILES) break;
    try {
      const fullPath = path.join(projectRoot, relPath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      const truncated = lines.slice(0, MAX_LINES).join('\n');
      const suffix = lines.length > MAX_LINES ? `\n// ... (${lines.length - MAX_LINES} more lines)` : '';
      keyFiles.push({
        path: relPath,
        reason,
        content: truncated + suffix,
        total_lines: lines.length,
      });
    } catch {
      // File might have moved or be unreadable — skip
    }
  }

  console.log(`[init:scanner] Pre-read ${keyFiles.length} key files: ${keyFiles.map(f => f.path).join(', ')}`);
  return keyFiles;
}
