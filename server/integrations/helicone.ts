import type { IntegrationPlugin, IntegrationHealth, IntegrationEvent } from './types.js';

export const heliconePlugin: IntegrationPlugin = {
  id: 'helicone',
  name: 'Helicone',
  icon: '◎',
  description: 'AI cost tracking, latency monitoring, and model usage',
  docsUrl: 'https://docs.helicone.ai/rest/request/post-v1requestquery',

  credentialFields: [
    {
      key: 'api_key',
      label: 'Helicone API Key',
      type: 'token',
      required: true,
      placeholder: 'sk-helicone-xxxxxxxx',
      help: 'Dashboard → Settings → API Keys. Create a read-only key for dev-track.',
    },
  ],

  setupGuide: `## Helicone Integration Setup

1. Go to your [Helicone Dashboard](https://www.helicone.ai/dashboard)
2. Navigate to Settings → API Keys
3. Create a new key with **Read** permission
4. Copy and paste below

### What dev-track shows
- Total AI spend today
- Average request latency
- Model usage breakdown
- Recent requests with cost`,

  async testConnection(creds) {
    try {
      const res = await fetch('https://api.helicone.ai/v1/request/query', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: { created_at: { gte: new Date(Date.now() - 3600000).toISOString() } },
          limit: 1,
        }),
      });
      if (res.ok) return { ok: true, message: 'Connected to Helicone' };
      if (res.status === 401) return { ok: false, message: 'Invalid API key.' };
      return { ok: false, message: `Helicone returned ${res.status}` };
    } catch (err: any) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  },

  async getHealth(creds): Promise<IntegrationHealth> {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const res = await fetch('https://api.helicone.ai/v1/request/query', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: { created_at: { gte: todayStart.toISOString() } },
          limit: 100,
        }),
      });

      if (!res.ok) return { status: 'down', detail: 'Cannot reach Helicone' };
      const data = await res.json();
      const requests = data.data || [];

      let totalCost = 0;
      let totalLatency = 0;
      for (const req of requests) {
        totalCost += req.cost_usd || 0;
        totalLatency += req.latency || 0;
      }
      const avgLatency = requests.length > 0 ? Math.round(totalLatency / requests.length) : 0;

      return {
        status: 'healthy',
        detail: `$${totalCost.toFixed(2)} today · ${avgLatency}ms avg · ${requests.length} requests`,
        metrics: {
          cost_today: `$${totalCost.toFixed(2)}`,
          avg_latency_ms: avgLatency,
          requests_today: requests.length,
        },
      };
    } catch {
      return { status: 'down', detail: 'Cannot reach Helicone' };
    }
  },

  async getRecentEvents(creds): Promise<IntegrationEvent[]> {
    try {
      const res = await fetch('https://api.helicone.ai/v1/request/query', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: { created_at: { gte: new Date(Date.now() - 3600000).toISOString() } },
          limit: 5,
          sort: { created_at: 'desc' },
        }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.data || []).map((r: any) => ({
        title: `${r.model || 'unknown'} — $${(r.cost_usd || 0).toFixed(4)} · ${r.latency || 0}ms`,
        time: r.created_at,
        severity: (r.latency || 0) > 5000 ? 'warning' as const : 'info' as const,
      }));
    } catch {
      return [];
    }
  },

  actions: [
    { id: 'open_dashboard', label: 'Open Helicone', description: 'View AI usage dashboard' },
  ],

  async executeAction(actionId) {
    if (actionId === 'open_dashboard') return { ok: true, output: 'https://www.helicone.ai/dashboard' };
    return { ok: false, output: 'Unknown action' };
  },
};
