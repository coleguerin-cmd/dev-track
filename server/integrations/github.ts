import { execSync } from 'child_process';
import type { IntegrationPlugin, IntegrationHealth, IntegrationEvent } from './types.js';

// ─── Local Git Helpers (zero config) ─────────────────────────────────────────

function git(cmd: string, cwd?: string): string {
  try {
    return execSync(`git ${cmd}`, {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function gh(cmd: string, cwd?: string): string {
  try {
    return execSync(`gh ${cmd}`, {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function isGitRepo(): boolean {
  return git('rev-parse --is-inside-work-tree') === 'true';
}

function hasGhCli(): boolean {
  try {
    execSync('gh --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

function isGhAuthenticated(): boolean {
  return gh('auth status') !== '' || gh('auth token') !== '';
}

// ─── Local Git Data Functions ────────────────────────────────────────────────

export function getGitStatus() {
  if (!isGitRepo()) return null;

  const branch = git('branch --show-current');
  const remoteUrl = git('config --get remote.origin.url');
  const lastCommitHash = git('log -1 --format=%h');
  const lastCommitMsg = git('log -1 --format=%s');
  const lastCommitDate = git('log -1 --format=%ci');
  const lastCommitAuthor = git('log -1 --format=%an');
  const totalCommits = git('rev-list --count HEAD');
  const statusShort = git('status --porcelain');
  const unpushed = git(`log origin/${branch}..HEAD --oneline 2>/dev/null`);

  // Parse remote URL to get owner/repo
  let owner = '';
  let repo = '';
  if (remoteUrl) {
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (match) {
      owner = match[1];
      repo = match[2];
    }
  }

  return {
    is_git_repo: true,
    branch,
    remote_url: remoteUrl,
    owner,
    repo,
    last_commit: {
      hash: lastCommitHash,
      message: lastCommitMsg,
      date: lastCommitDate,
      author: lastCommitAuthor,
    },
    total_commits: parseInt(totalCommits) || 0,
    dirty_files: statusShort ? statusShort.split('\n').length : 0,
    unpushed_commits: unpushed ? unpushed.split('\n').length : 0,
  };
}

export function getGitLog(limit = 20) {
  if (!isGitRepo()) return [];

  const log = git(`log --format={"hash":"%h","message":"%s","author":"%an","date":"%ci"}, -n ${limit}`);
  if (!log) return [];

  // Parse the git log output
  const lines = git(`log --format=%h|||%s|||%an|||%ci -n ${limit}`);
  return lines.split('\n').filter(Boolean).map(line => {
    const [hash, message, author, date] = line.split('|||');
    return { hash, message, author, date };
  });
}

export function getGitBranches() {
  if (!isGitRepo()) return [];

  const current = git('branch --show-current');
  const branches = git('branch --format=%(refname:short)|||%(committerdate:relative)|||%(objectname:short)');
  return branches.split('\n').filter(Boolean).map(line => {
    const [name, lastActivity, hash] = line.split('|||');
    return { name, lastActivity, hash, current: name === current };
  });
}

export function getGitDiffStats() {
  if (!isGitRepo()) return null;

  const diffStat = git('diff --stat');
  const stagedStat = git('diff --cached --stat');
  const status = git('status --porcelain');

  const modified = status.split('\n').filter(l => l.startsWith(' M') || l.startsWith('M ')).length;
  const added = status.split('\n').filter(l => l.startsWith('A ') || l.startsWith('??')).length;
  const deleted = status.split('\n').filter(l => l.startsWith(' D') || l.startsWith('D ')).length;

  return {
    modified,
    added,
    deleted,
    diff_summary: diffStat || 'Clean working tree',
    staged_summary: stagedStat || 'Nothing staged',
  };
}

// ─── GitHub-specific via gh CLI (zero config if authenticated) ───────────────

export function getGhPullRequests() {
  if (!hasGhCli() || !isGhAuthenticated()) return null;

  const prs = gh('pr list --json number,title,state,author,createdAt,headRefName,url --limit 10');
  try { return JSON.parse(prs); } catch { return null; }
}

export function getGhCIStatus() {
  if (!hasGhCli() || !isGhAuthenticated()) return null;

  const runs = gh('run list --json status,conclusion,name,createdAt,headBranch,url --limit 5');
  try { return JSON.parse(runs); } catch { return null; }
}

export function getGhIssues() {
  if (!hasGhCli() || !isGhAuthenticated()) return null;

  const issues = gh('issue list --json number,title,state,author,createdAt,url --limit 10');
  try { return JSON.parse(issues); } catch { return null; }
}

// ─── Integration Plugin (legacy interface compatibility) ─────────────────────

export const githubPlugin: IntegrationPlugin = {
  id: 'github',
  name: 'GitHub',
  icon: '⬡',
  description: 'Git history, branches, PRs, and CI status — auto-detected from local repo',
  docsUrl: 'https://docs.github.com/en/rest',

  credentialFields: [
    {
      key: 'token',
      label: 'Personal Access Token (Optional)',
      type: 'token',
      required: false,
      placeholder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
      help: 'Optional. Git history works without this. Only needed if gh CLI is not installed and you want PR/CI data from the GitHub API.',
    },
  ],

  setupGuide: `## GitHub Integration

**Most features work automatically with zero configuration.**

### What works immediately (no setup needed):
- ✅ Commit history (from local git)
- ✅ Branch information
- ✅ Working tree status (modified/added/deleted files)
- ✅ Unpushed commits

### What needs \`gh\` CLI (recommended):
If you have [GitHub CLI](https://cli.github.com/) installed and authenticated:
- ✅ Pull request list and status
- ✅ CI/CD run status
- ✅ GitHub Issues

Most developers already have this. Check: run \`gh auth status\` in your terminal.

### Optional: Personal Access Token
Only needed as a fallback if you don't have \`gh\` CLI and want PR/CI data.
1. Go to [GitHub Settings → Developer Settings → Personal Access Tokens](https://github.com/settings/tokens?type=beta)
2. Generate a fine-grained token with read access to your repo
3. Paste it below`,

  async testConnection(_creds) {
    const results: string[] = [];

    // Test local git
    if (isGitRepo()) {
      const status = getGitStatus();
      results.push(`✅ Git repo detected: ${status?.branch} branch, ${status?.total_commits} commits`);
      if (status?.owner && status?.repo) {
        results.push(`✅ Remote: ${status.owner}/${status.repo}`);
      }
    } else {
      results.push('❌ Not a git repository');
      return { ok: false, message: results.join('\n') };
    }

    // Test gh CLI
    if (hasGhCli()) {
      if (isGhAuthenticated()) {
        results.push('✅ GitHub CLI authenticated — PRs and CI status available');
      } else {
        results.push('⚠ GitHub CLI found but not authenticated. Run: gh auth login');
      }
    } else {
      results.push('ℹ GitHub CLI not installed — install from https://cli.github.com/ for PRs and CI');
    }

    // Test PAT if provided
    if (_creds.token) {
      try {
        const status = getGitStatus();
        const res = await fetch(`https://api.github.com/repos/${status?.owner}/${status?.repo}`, {
          headers: { Authorization: `Bearer ${_creds.token}`, Accept: 'application/vnd.github.v3+json' },
        });
        if (res.ok) {
          results.push('✅ Personal Access Token valid');
        } else {
          results.push(`⚠ PAT invalid (${res.status})`);
        }
      } catch {
        results.push('⚠ Could not verify PAT');
      }
    }

    return { ok: true, message: results.join('\n') };
  },

  async getHealth(_creds): Promise<IntegrationHealth> {
    if (!isGitRepo()) {
      return { status: 'down', detail: 'Not a git repository' };
    }

    const status = getGitStatus();
    if (!status) return { status: 'down', detail: 'Cannot read git status' };

    const parts: string[] = [];
    parts.push(status.branch);
    parts.push(`${status.total_commits} commits`);
    if (status.dirty_files > 0) parts.push(`${status.dirty_files} dirty`);
    if (status.unpushed_commits > 0) parts.push(`${status.unpushed_commits} unpushed`);

    return {
      status: 'healthy',
      detail: parts.join(' · '),
      metrics: {
        branch: status.branch,
        total_commits: status.total_commits,
        dirty_files: status.dirty_files,
        unpushed_commits: status.unpushed_commits,
        has_gh_cli: hasGhCli() ? 'yes' : 'no',
      },
    };
  },

  async getRecentEvents(_creds): Promise<IntegrationEvent[]> {
    const log = getGitLog(10);
    return log.map(entry => ({
      title: `${entry.hash} ${entry.message}`,
      time: entry.date,
      severity: 'info' as const,
    }));
  },

  actions: [
    { id: 'open_repo', label: 'Open in GitHub', description: 'Open the repository in browser' },
    { id: 'open_prs', label: 'View PRs', description: 'Open pull requests page' },
    { id: 'git_status', label: 'Git Status', description: 'Show current working tree status' },
  ],

  async executeAction(actionId, _creds) {
    const status = getGitStatus();
    const baseUrl = status?.owner && status?.repo
      ? `https://github.com/${status.owner}/${status.repo}`
      : '';

    if (actionId === 'open_repo') return { ok: true, output: baseUrl || 'No remote URL found' };
    if (actionId === 'open_prs') return { ok: true, output: baseUrl ? `${baseUrl}/pulls` : 'No remote URL found' };
    if (actionId === 'git_status') {
      const diff = getGitDiffStats();
      return { ok: true, output: JSON.stringify({ status, diff }, null, 2) };
    }
    return { ok: false, output: 'Unknown action' };
  },
};
