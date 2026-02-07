import type { IntegrationPlugin, IntegrationHealth, IntegrationEvent } from './types.js';

export const vercelPlugin: IntegrationPlugin = {
  id: 'vercel',
  name: 'Vercel',
  icon: '▲',
  description: 'Deployments, serverless logs, and runtime errors',
  docsUrl: 'https://vercel.com/docs/rest-api',

  credentialFields: [
    {
      key: 'token',
      label: 'Vercel Token',
      type: 'token',
      required: true,
      placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx',
      help: 'Vercel Dashboard → Settings → Tokens. Use a TEAM-scoped token (not user) to get full runtime log access.',
    },
    {
      key: 'project_id',
      label: 'Project ID or Name',
      type: 'project_id',
      required: true,
      placeholder: 'pillar-web',
      help: 'Your Vercel project name or ID. Found in Project Settings → General.',
    },
    {
      key: 'team_id',
      label: 'Team ID (optional)',
      type: 'text',
      required: false,
      placeholder: 'team_xxxxxxxx',
      help: 'Only needed if the project is under a team. Found in Team Settings → General. IMPORTANT: Team-scoped tokens expose more data (runtime logs, function stats).',
    },
  ],

  setupGuide: `## Vercel Integration Setup

1. Go to [Vercel Dashboard → Settings → Tokens](https://vercel.com/account/tokens)
2. Click "Create Token"
3. **IMPORTANT**: If your project is under a team, select that team's scope (not "Full Account")
   - Team-scoped tokens get runtime log access
   - User-scoped tokens only get deployment data (no runtime logs)
4. Set expiration to "No expiration" or your preference
5. Copy the token and paste below

### Finding your Project ID
- Go to your project in Vercel dashboard
- Settings → General → "Project ID" is listed there
- Or just use the project name (e.g., "pillar-web")

### Team ID (if applicable)
- Team Settings → General → "Team ID"
- Only needed if the project is under a team account
- Without this, some API calls may fail silently

### Common Issues
- **"Not authorized"**: Your token scope doesn't match. If project is under a team, the token must be team-scoped.
- **No runtime logs**: User-scoped tokens don't have runtime log access. Create a team-scoped token.
- **404 on project**: Check project name/ID and team_id.`,

  async testConnection(creds) {
    try {
      const teamParam = creds.team_id ? `&teamId=${creds.team_id}` : '';
      const res = await fetch(
        `https://api.vercel.com/v9/projects/${creds.project_id}?${teamParam}`,
        { headers: { Authorization: `Bearer ${creds.token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        return { ok: true, message: `Connected to ${data.name} (framework: ${data.framework || 'unknown'})` };
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: 'Not authorized. If project is under a team, ensure token is team-scoped and team_id is set.' };
      }
      if (res.status === 404) {
        return { ok: false, message: `Project "${creds.project_id}" not found. Check the project name/ID${creds.team_id ? '' : ' and try adding a Team ID'}.` };
      }
      return { ok: false, message: `Vercel API returned ${res.status}` };
    } catch (err: any) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  },

  async getHealth(creds): Promise<IntegrationHealth> {
    try {
      const teamParam = creds.team_id ? `&teamId=${creds.team_id}` : '';
      const res = await fetch(
        `https://api.vercel.com/v6/deployments?projectId=${creds.project_id}&limit=3${teamParam}`,
        { headers: { Authorization: `Bearer ${creds.token}` } }
      );
      if (!res.ok) return { status: 'down', detail: 'Cannot reach Vercel API' };

      const data = await res.json();
      const deployments = data.deployments || [];
      if (deployments.length === 0) return { status: 'healthy', detail: 'No deployments yet' };

      const latest = deployments[0];
      const state = latest.state || latest.readyState;
      const age = Math.round((Date.now() - latest.created) / 3600000);

      return {
        status: state === 'READY' ? 'healthy' : state === 'ERROR' ? 'down' : 'degraded',
        detail: `Last deploy: ${age}h ago (${state.toLowerCase()})`,
        metrics: {
          last_deploy_state: state,
          last_deploy_age_hours: age,
          last_deploy_url: latest.url ? `https://${latest.url}` : '',
        },
      };
    } catch {
      return { status: 'down', detail: 'Cannot reach Vercel' };
    }
  },

  async getRecentEvents(creds): Promise<IntegrationEvent[]> {
    try {
      const teamParam = creds.team_id ? `&teamId=${creds.team_id}` : '';
      const res = await fetch(
        `https://api.vercel.com/v6/deployments?projectId=${creds.project_id}&limit=5${teamParam}`,
        { headers: { Authorization: `Bearer ${creds.token}` } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.deployments || []).map((d: any) => ({
        title: `Deploy ${d.state || d.readyState} — ${d.meta?.githubCommitMessage?.substring(0, 60) || d.url || ''}`,
        time: new Date(d.created).toISOString(),
        severity: (d.state || d.readyState) === 'ERROR' ? 'error' as const : 'info' as const,
        url: d.url ? `https://${d.url}` : undefined,
      }));
    } catch {
      return [];
    }
  },

  actions: [
    { id: 'open_dashboard', label: 'Open Dashboard', description: 'Open Vercel project dashboard' },
    { id: 'open_deployments', label: 'Deployments', description: 'View deployment history' },
    { id: 'open_logs', label: 'Runtime Logs', description: 'View function runtime logs' },
  ],

  async executeAction(actionId, creds) {
    const base = `https://vercel.com/${creds.team_id || ''}/${creds.project_id}`;
    if (actionId === 'open_dashboard') return { ok: true, output: base };
    if (actionId === 'open_deployments') return { ok: true, output: `${base}/deployments` };
    if (actionId === 'open_logs') return { ok: true, output: `${base}/logs` };
    return { ok: false, output: 'Unknown action' };
  },
};
