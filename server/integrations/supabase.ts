import type { IntegrationPlugin, IntegrationHealth, IntegrationEvent } from './types.js';

export const supabasePlugin: IntegrationPlugin = {
  id: 'supabase',
  name: 'Supabase',
  icon: '⚡',
  description: 'Database health, storage, and local dev management',
  docsUrl: 'https://supabase.com/docs/reference/api/introduction',

  credentialFields: [
    {
      key: 'project_ref',
      label: 'Project Reference ID',
      type: 'project_id',
      required: true,
      placeholder: 'oqkljicdagbdileupldl',
      help: 'Found in Supabase Dashboard → Settings → General. The random string in your project URL.',
    },
    {
      key: 'service_role_key',
      label: 'Service Role Key',
      type: 'token',
      required: true,
      placeholder: 'eyJhbGciOiJIUzI...',
      help: 'Settings → API → service_role key. This is a secret key — never expose in client code.',
    },
    {
      key: 'supabase_url',
      label: 'Supabase URL',
      type: 'url',
      required: true,
      placeholder: 'https://oqkljicdagbdileupldl.supabase.co',
      help: 'Your project URL. Found in Settings → API.',
    },
    {
      key: 'local_port',
      label: 'Local Supabase Port',
      type: 'text',
      required: false,
      placeholder: '54322',
      help: 'Port for local Supabase instance (default 54322). Used for local start/stop.',
    },
  ],

  setupGuide: `## Supabase Integration Setup

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings → API**
4. Copy:
   - **Project URL** (e.g., https://xxxx.supabase.co)
   - **service_role key** (the secret one, not the anon key)
5. Go to **Settings → General**
6. Copy the **Reference ID** (the random string)

### Local Development
If you use Supabase CLI locally:
- Default port is 54322 (Studio on 54323)
- dev-track can start/stop your local instance
- Make sure \`supabase\` CLI is installed globally

### Security Note
The service_role key bypasses RLS. It's stored locally in dev-track/.env (gitignored) and never committed.`,

  async testConnection(creds) {
    try {
      const res = await fetch(`${creds.supabase_url}/rest/v1/`, {
        headers: {
          apikey: creds.service_role_key,
          Authorization: `Bearer ${creds.service_role_key}`,
        },
      });
      if (res.ok || res.status === 200) {
        return { ok: true, message: `Connected to Supabase project ${creds.project_ref}` };
      }
      if (res.status === 401) return { ok: false, message: 'Invalid service_role key.' };
      return { ok: false, message: `Supabase returned ${res.status}` };
    } catch (err: any) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  },

  async getHealth(creds): Promise<IntegrationHealth> {
    try {
      // Check REST API health
      const res = await fetch(`${creds.supabase_url}/rest/v1/`, {
        headers: {
          apikey: creds.service_role_key,
          Authorization: `Bearer ${creds.service_role_key}`,
        },
      });

      if (!res.ok) return { status: 'down', detail: 'REST API unreachable' };

      return {
        status: 'healthy',
        detail: `Project ${creds.project_ref} online`,
        metrics: { project_ref: creds.project_ref },
      };
    } catch {
      return { status: 'down', detail: 'Cannot reach Supabase' };
    }
  },

  async getRecentEvents(): Promise<IntegrationEvent[]> {
    // Supabase doesn't have a simple events API — would need management API access
    return [];
  },

  actions: [
    { id: 'open_dashboard', label: 'Open Dashboard', description: 'Open Supabase project dashboard' },
    { id: 'open_sql', label: 'SQL Editor', description: 'Open SQL editor in browser' },
    { id: 'open_storage', label: 'Storage', description: 'Open storage browser' },
  ],

  async executeAction(actionId, creds) {
    const base = `https://supabase.com/dashboard/project/${creds.project_ref}`;
    if (actionId === 'open_dashboard') return { ok: true, output: base };
    if (actionId === 'open_sql') return { ok: true, output: `${base}/sql` };
    if (actionId === 'open_storage') return { ok: true, output: `${base}/storage` };
    return { ok: false, output: 'Unknown action' };
  },
};
