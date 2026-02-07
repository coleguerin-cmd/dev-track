import type { IntegrationPlugin, IntegrationHealth, IntegrationEvent } from './types.js';

export const upstashPlugin: IntegrationPlugin = {
  id: 'upstash',
  name: 'Upstash',
  icon: '↗',
  description: 'Redis health, memory usage, and request monitoring',
  docsUrl: 'https://docs.upstash.com/redis/rest/getstarted',

  credentialFields: [
    {
      key: 'redis_url',
      label: 'Redis REST URL',
      type: 'url',
      required: true,
      placeholder: 'https://us1-xxxxx.upstash.io',
      help: 'Found in your Upstash Redis database details → REST API → URL',
    },
    {
      key: 'redis_token',
      label: 'Redis REST Token',
      type: 'token',
      required: true,
      placeholder: 'Axxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      help: 'Found in your Upstash Redis database details → REST API → Token',
    },
  ],

  setupGuide: `## Upstash Integration Setup

1. Go to your [Upstash Console](https://console.upstash.com/)
2. Select your Redis database
3. Scroll to "REST API" section
4. Copy:
   - **UPSTASH_REDIS_REST_URL** (the endpoint URL)
   - **UPSTASH_REDIS_REST_TOKEN** (the auth token)

### What dev-track shows
- Redis connectivity status
- Basic PING health check
- Database info (memory, keys)`,

  async testConnection(creds) {
    try {
      const res = await fetch(`${creds.redis_url}/ping`, {
        headers: { Authorization: `Bearer ${creds.redis_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        return { ok: true, message: `Connected — PING returned: ${data.result || 'PONG'}` };
      }
      if (res.status === 401) return { ok: false, message: 'Invalid token. Check your REST API token.' };
      return { ok: false, message: `Upstash returned ${res.status}` };
    } catch (err: any) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  },

  async getHealth(creds): Promise<IntegrationHealth> {
    try {
      const res = await fetch(`${creds.redis_url}/info`, {
        headers: { Authorization: `Bearer ${creds.redis_token}` },
      });
      if (!res.ok) return { status: 'down', detail: 'Cannot reach Upstash Redis' };

      return { status: 'healthy', detail: 'Redis online' };
    } catch {
      return { status: 'down', detail: 'Cannot reach Upstash' };
    }
  },

  async getRecentEvents(): Promise<IntegrationEvent[]> {
    return []; // Redis doesn't have an event stream API
  },

  actions: [
    { id: 'open_console', label: 'Open Console', description: 'Open Upstash console' },
  ],

  async executeAction(actionId) {
    if (actionId === 'open_console') return { ok: true, output: 'https://console.upstash.com/' };
    return { ok: false, output: 'Unknown action' };
  },
};
