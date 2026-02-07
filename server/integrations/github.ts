import type { IntegrationPlugin, IntegrationHealth, IntegrationEvent } from './types.js';

export const githubPlugin: IntegrationPlugin = {
  id: 'github',
  name: 'GitHub',
  icon: '⬡',
  description: 'Repository status, PRs, commits, and CI/CD',
  docsUrl: 'https://docs.github.com/en/rest',

  credentialFields: [
    {
      key: 'token',
      label: 'Personal Access Token',
      type: 'token',
      required: true,
      placeholder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
      help: 'Settings → Developer settings → Personal access tokens → Fine-grained tokens. Needs repo read access.',
    },
    {
      key: 'owner',
      label: 'Repo Owner',
      type: 'text',
      required: true,
      placeholder: 'your-username',
      help: 'GitHub username or organization name.',
    },
    {
      key: 'repo',
      label: 'Repo Name',
      type: 'text',
      required: true,
      placeholder: 'my-project',
      help: 'Repository name (not the full URL).',
    },
  ],

  setupGuide: `## GitHub Integration Setup

1. Go to [GitHub Settings → Developer Settings → Personal Access Tokens](https://github.com/settings/tokens?type=beta)
2. Click "Generate new token" (Fine-grained)
3. Give it a name like "dev-track"
4. Select your repository under "Repository access"
5. Under Permissions → Repository:
   - **Contents**: Read
   - **Pull requests**: Read
   - **Commit statuses**: Read
   - **Actions**: Read (for CI status)
6. Click "Generate token" and paste it below

The token only needs read access. dev-track never writes to your repo.`,

  async testConnection(creds) {
    try {
      const res = await fetch(`https://api.github.com/repos/${creds.owner}/${creds.repo}`, {
        headers: { Authorization: `Bearer ${creds.token}`, Accept: 'application/vnd.github.v3+json' },
      });
      if (res.ok) {
        const data = await res.json();
        return { ok: true, message: `Connected to ${data.full_name} (${data.default_branch})` };
      }
      if (res.status === 401) return { ok: false, message: 'Invalid token. Check your Personal Access Token.' };
      if (res.status === 404) return { ok: false, message: `Repository ${creds.owner}/${creds.repo} not found. Check owner and repo name.` };
      return { ok: false, message: `GitHub API returned ${res.status}` };
    } catch (err: any) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  },

  async getHealth(creds): Promise<IntegrationHealth> {
    try {
      const [repoRes, prsRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${creds.owner}/${creds.repo}`, {
          headers: { Authorization: `Bearer ${creds.token}`, Accept: 'application/vnd.github.v3+json' },
        }),
        fetch(`https://api.github.com/repos/${creds.owner}/${creds.repo}/pulls?state=open&per_page=10`, {
          headers: { Authorization: `Bearer ${creds.token}`, Accept: 'application/vnd.github.v3+json' },
        }),
      ]);

      if (!repoRes.ok) return { status: 'down', detail: 'Cannot reach GitHub API' };

      const repo = await repoRes.json();
      const prs = prsRes.ok ? await prsRes.json() : [];

      return {
        status: 'healthy',
        detail: `${repo.default_branch} · ${prs.length} open PRs`,
        metrics: {
          open_prs: prs.length,
          default_branch: repo.default_branch,
          stars: repo.stargazers_count,
        },
      };
    } catch {
      return { status: 'down', detail: 'Cannot reach GitHub' };
    }
  },

  async getRecentEvents(creds): Promise<IntegrationEvent[]> {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${creds.owner}/${creds.repo}/commits?per_page=5`,
        { headers: { Authorization: `Bearer ${creds.token}`, Accept: 'application/vnd.github.v3+json' } }
      );
      if (!res.ok) return [];
      const commits = await res.json();
      return commits.map((c: any) => ({
        title: c.commit.message.split('\n')[0].substring(0, 80),
        time: c.commit.author.date,
        severity: 'info' as const,
        url: c.html_url,
      }));
    } catch {
      return [];
    }
  },

  actions: [
    { id: 'open_repo', label: 'Open in GitHub', description: 'Open the repository in browser' },
    { id: 'open_prs', label: 'View PRs', description: 'Open pull requests page' },
  ],

  async executeAction(actionId, creds) {
    const baseUrl = `https://github.com/${creds.owner}/${creds.repo}`;
    if (actionId === 'open_repo') return { ok: true, output: baseUrl };
    if (actionId === 'open_prs') return { ok: true, output: `${baseUrl}/pulls` };
    return { ok: false, output: 'Unknown action' };
  },
};
