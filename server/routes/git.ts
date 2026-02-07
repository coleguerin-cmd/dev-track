import { Hono } from 'hono';
import {
  getGitStatus,
  getGitLog,
  getGitBranches,
  getGitDiffStats,
  getGhPullRequests,
  getGhCIStatus,
  getGhIssues,
} from '../integrations/github.js';

const app = new Hono();

// GET /api/v1/git/status — Current repo status (zero config)
app.get('/status', (c) => {
  const status = getGitStatus();
  if (!status) return c.json({ ok: false, error: 'Not a git repository' }, 400);
  return c.json({ ok: true, data: status });
});

// GET /api/v1/git/log — Commit history (zero config)
app.get('/log', (c) => {
  const limit = parseInt(c.req.query('limit') || '20');
  const commits = getGitLog(Math.min(limit, 100));
  return c.json({ ok: true, data: { commits } });
});

// GET /api/v1/git/branches — Branch list (zero config)
app.get('/branches', (c) => {
  const branches = getGitBranches();
  return c.json({ ok: true, data: { branches } });
});

// GET /api/v1/git/diff — Working tree changes (zero config)
app.get('/diff', (c) => {
  const diff = getGitDiffStats();
  return c.json({ ok: true, data: diff });
});

// GET /api/v1/git/prs — Pull requests (needs gh CLI or PAT)
app.get('/prs', (c) => {
  const prs = getGhPullRequests();
  if (prs === null) {
    return c.json({ ok: true, data: { prs: [], available: false, reason: 'GitHub CLI not available or not authenticated' } });
  }
  return c.json({ ok: true, data: { prs, available: true } });
});

// GET /api/v1/git/ci — CI run status (needs gh CLI or PAT)
app.get('/ci', (c) => {
  const runs = getGhCIStatus();
  if (runs === null) {
    return c.json({ ok: true, data: { runs: [], available: false, reason: 'GitHub CLI not available or not authenticated' } });
  }
  return c.json({ ok: true, data: { runs, available: true } });
});

// GET /api/v1/git/issues — GitHub Issues (needs gh CLI or PAT)
app.get('/issues', (c) => {
  const issues = getGhIssues();
  if (issues === null) {
    return c.json({ ok: true, data: { issues: [], available: false, reason: 'GitHub CLI not available or not authenticated' } });
  }
  return c.json({ ok: true, data: { issues, available: true } });
});

// GET /api/v1/git/summary — Everything in one call (for dashboard)
app.get('/summary', (c) => {
  const status = getGitStatus();
  if (!status) return c.json({ ok: false, error: 'Not a git repository' }, 400);

  const log = getGitLog(5);
  const branches = getGitBranches();
  const diff = getGitDiffStats();
  const prs = getGhPullRequests();
  const ci = getGhCIStatus();

  return c.json({
    ok: true,
    data: {
      status,
      recent_commits: log,
      branches,
      working_tree: diff,
      pull_requests: prs,
      ci_runs: ci,
      capabilities: {
        git: true,
        gh_cli: prs !== null,
      },
    },
  });
});

export default app;
