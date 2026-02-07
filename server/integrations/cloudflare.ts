import type { IntegrationPlugin, IntegrationHealth, IntegrationEvent } from './types.js';

export const cloudflarePlugin: IntegrationPlugin = {
  id: 'cloudflare',
  name: 'Cloudflare',
  icon: '🔶',
  description: 'Workers, Pages, DNS, and edge network health',
  docsUrl: 'https://developers.cloudflare.com/api/',

  credentialFields: [
    {
      key: 'api_token',
      label: 'API Token',
      type: 'token',
      required: true,
      placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      help: 'My Profile → API Tokens → Create Token. Use "Read all resources" template for monitoring.',
    },
    {
      key: 'account_id',
      label: 'Account ID',
      type: 'text',
      required: true,
      placeholder: '023e105f4ecef8ad9ca31a8372d0c353',
      help: 'Found on any zone\'s overview page in the right sidebar under "API".',
    },
    {
      key: 'zone_id',
      label: 'Zone ID (optional)',
      type: 'text',
      required: false,
      placeholder: '023e105f4ecef8ad9ca31a8372d0c353',
      help: 'For domain-specific monitoring. Found on the zone overview page. Leave blank for account-level only.',
    },
  ],

  setupGuide: `## Cloudflare Integration Setup

### Create an API Token
1. Go to [Cloudflare Dashboard → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use the **"Read all resources"** template (or customize):
   - Zone: Read
   - Analytics: Read
   - Workers: Read (if using Workers/Pages)
4. Copy the token

### Finding your Account ID
- Go to any zone in your Cloudflare dashboard
- Right sidebar → "API" section → **Account ID**

### Finding your Zone ID
- Same location as Account ID, but specific to each domain
- Only needed if you want domain-specific analytics

### What dev-track shows
- Zone/domain health (active, paused, etc.)
- Workers deployment status
- Pages project deployments
- Analytics: requests, bandwidth, threats blocked
- DNS record count`,

  async testConnection(creds) {
    try {
      const res = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
        headers: { Authorization: `Bearer ${creds.api_token}` },
      });
      const data = await res.json();
      if (data.success) {
        return { ok: true, message: `Token valid. Status: ${data.result?.status || 'active'}` };
      }
      return { ok: false, message: `Token verification failed: ${data.errors?.[0]?.message || 'Unknown error'}` };
    } catch (err: any) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  },

  async getHealth(creds): Promise<IntegrationHealth> {
    try {
      // Get account details
      const accountRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${creds.account_id}`,
        { headers: { Authorization: `Bearer ${creds.api_token}` } }
      );

      if (!accountRes.ok) return { status: 'down', detail: 'Cannot reach Cloudflare API' };
      const accountData = await accountRes.json();

      // Get zones count
      const zonesRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones?account.id=${creds.account_id}&per_page=5`,
        { headers: { Authorization: `Bearer ${creds.api_token}` } }
      );
      const zonesData = zonesRes.ok ? await zonesRes.json() : { result_info: { total_count: 0 } };

      // Get Workers (if any)
      const workersRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${creds.account_id}/workers/scripts`,
        { headers: { Authorization: `Bearer ${creds.api_token}` } }
      );
      const workersData = workersRes.ok ? await workersRes.json() : { result: [] };

      const zoneCount = zonesData.result_info?.total_count || 0;
      const workerCount = workersData.result?.length || 0;

      return {
        status: 'healthy',
        detail: `${accountData.result?.name || 'Account'} · ${zoneCount} zones · ${workerCount} workers`,
        metrics: {
          account: accountData.result?.name || creds.account_id,
          zones: zoneCount,
          workers: workerCount,
        },
      };
    } catch {
      return { status: 'down', detail: 'Cannot reach Cloudflare' };
    }
  },

  async getRecentEvents(creds): Promise<IntegrationEvent[]> {
    try {
      // Get Pages deployments if any
      const pagesRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${creds.account_id}/pages/projects`,
        { headers: { Authorization: `Bearer ${creds.api_token}` } }
      );

      if (!pagesRes.ok) return [];
      const pagesData = await pagesRes.json();
      const events: IntegrationEvent[] = [];

      for (const project of (pagesData.result || []).slice(0, 3)) {
        if (project.latest_deployment) {
          const d = project.latest_deployment;
          events.push({
            title: `Pages: ${project.name} — ${d.environment || 'production'}`,
            time: d.created_on || d.modified_on,
            severity: d.latest_stage?.status === 'failure' ? 'error' : 'info',
            url: d.url ? `https://${d.url}` : undefined,
          });
        }
      }

      return events;
    } catch {
      return [];
    }
  },

  actions: [
    { id: 'open_dashboard', label: 'Dashboard', description: 'Open Cloudflare dashboard' },
    { id: 'open_workers', label: 'Workers', description: 'View Workers & Pages' },
    { id: 'open_analytics', label: 'Analytics', description: 'View zone analytics' },
  ],

  async executeAction(actionId, creds) {
    const base = `https://dash.cloudflare.com/${creds.account_id}`;
    if (actionId === 'open_dashboard') return { ok: true, output: base };
    if (actionId === 'open_workers') return { ok: true, output: `${base}/workers-and-pages` };
    if (actionId === 'open_analytics') {
      if (creds.zone_id) return { ok: true, output: `https://dash.cloudflare.com/${creds.account_id}/${creds.zone_id}/analytics` };
      return { ok: true, output: `${base}/analytics` };
    }
    return { ok: false, output: 'Unknown action' };
  },
};
