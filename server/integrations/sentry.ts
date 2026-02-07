import type { IntegrationPlugin, IntegrationHealth, IntegrationEvent } from './types.js';

export const sentryPlugin: IntegrationPlugin = {
  id: 'sentry',
  name: 'Sentry',
  icon: '🛡',
  description: 'Error tracking, crash-free rate, and issue monitoring',
  docsUrl: 'https://docs.sentry.io/api/',

  credentialFields: [
    {
      key: 'token',
      label: 'Auth Token',
      type: 'token',
      required: true,
      placeholder: 'sntrys_xxxxxxxxxxxxxxxxxxxxxxxx',
      help: 'Settings → Auth Tokens → Create New Token. Needs project:read and event:read scopes.',
    },
    {
      key: 'org',
      label: 'Organization Slug',
      type: 'text',
      required: true,
      placeholder: 'my-org',
      help: 'Your Sentry organization slug. Found in the URL: sentry.io/organizations/{slug}/',
    },
    {
      key: 'project',
      label: 'Project Slug',
      type: 'text',
      required: true,
      placeholder: 'my-project',
      help: 'Your Sentry project slug. Found in Project Settings → General.',
    },
  ],

  setupGuide: `## Sentry Integration Setup

1. Go to [Sentry → Settings → Auth Tokens](https://sentry.io/settings/auth-tokens/)
2. Click "Create New Token"
3. Select scopes: **project:read**, **event:read**, **org:read**
4. Copy the token

### Finding your Org and Project slugs
- Organization: Look at your Sentry URL → sentry.io/organizations/**{org-slug}**/
- Project: Settings → Projects → click your project → the slug is in the URL

### What dev-track shows
- Error count in the last 24 hours
- New unresolved issues
- Crash-free session rate (if available)`,

  async testConnection(creds) {
    try {
      const res = await fetch(
        `https://sentry.io/api/0/projects/${creds.org}/${creds.project}/`,
        { headers: { Authorization: `Bearer ${creds.token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        return { ok: true, message: `Connected to ${data.name} (platform: ${data.platform || 'unknown'})` };
      }
      if (res.status === 401) return { ok: false, message: 'Invalid token. Check your Auth Token and scopes.' };
      if (res.status === 404) return { ok: false, message: `Project ${creds.org}/${creds.project} not found.` };
      return { ok: false, message: `Sentry API returned ${res.status}` };
    } catch (err: any) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  },

  async getHealth(creds): Promise<IntegrationHealth> {
    try {
      const since = new Date(Date.now() - 86400000).toISOString();
      const res = await fetch(
        `https://sentry.io/api/0/projects/${creds.org}/${creds.project}/issues/?query=is:unresolved&sort=date&limit=25&start=${since}`,
        { headers: { Authorization: `Bearer ${creds.token}` } }
      );
      if (!res.ok) return { status: 'down', detail: 'Cannot reach Sentry API' };

      const issues = await res.json();
      const errorCount = issues.length;

      return {
        status: errorCount === 0 ? 'healthy' : errorCount <= 5 ? 'degraded' : 'down',
        detail: `${errorCount} unresolved issues (24h)`,
        metrics: { unresolved_24h: errorCount },
      };
    } catch {
      return { status: 'down', detail: 'Cannot reach Sentry' };
    }
  },

  async getRecentEvents(creds): Promise<IntegrationEvent[]> {
    try {
      const res = await fetch(
        `https://sentry.io/api/0/projects/${creds.org}/${creds.project}/issues/?query=is:unresolved&sort=date&limit=5`,
        { headers: { Authorization: `Bearer ${creds.token}` } }
      );
      if (!res.ok) return [];
      const issues = await res.json();
      return issues.map((i: any) => ({
        title: i.title?.substring(0, 80) || 'Unknown error',
        time: i.lastSeen || i.firstSeen,
        severity: i.level === 'fatal' || i.level === 'error' ? 'error' as const : 'warning' as const,
        url: i.permalink,
      }));
    } catch {
      return [];
    }
  },

  actions: [
    { id: 'open_dashboard', label: 'Open Sentry', description: 'Open project dashboard' },
    { id: 'open_issues', label: 'View Issues', description: 'Open issues list' },
  ],

  async executeAction(actionId, creds) {
    const base = `https://sentry.io/organizations/${creds.org}/issues/?project=${creds.project}`;
    if (actionId === 'open_dashboard') return { ok: true, output: `https://sentry.io/organizations/${creds.org}/projects/${creds.project}/` };
    if (actionId === 'open_issues') return { ok: true, output: base };
    return { ok: false, output: 'Unknown action' };
  },
};
