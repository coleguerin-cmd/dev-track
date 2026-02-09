import fs from 'fs';
import path from 'path';
import { getDataDir, getCredentialsPath, getCredentialsSavePath, getProjectRoot } from '../project-config.js';
import type { IntegrationPlugin, IntegrationConfig, IntegrationsStore } from './types.js';
import { githubPlugin } from './github.js';
import { vercelPlugin } from './vercel.js';
import { supabasePlugin } from './supabase.js';
import { sentryPlugin } from './sentry.js';
import { heliconePlugin } from './helicone.js';
import { upstashPlugin } from './upstash.js';
import { ec2Plugin } from './aws-ec2.js';
import { cloudflarePlugin } from './cloudflare.js';

// ─── Plugin Registry ────────────────────────────────────────────────────────

const PLUGINS: Record<string, IntegrationPlugin> = {
  github: githubPlugin,
  vercel: vercelPlugin,
  supabase: supabasePlugin,
  sentry: sentryPlugin,
  helicone: heliconePlugin,
  upstash: upstashPlugin,
  'aws-ec2': ec2Plugin,
  cloudflare: cloudflarePlugin,
};

// ─── Credential Storage (.env file, gitignored) ────────────────────────────

const ENV_PATH = path.join(getProjectRoot(), '.env');
function loadCredentials(): Record<string, Record<string, string>> {
  try {
    const credsPath = getCredentialsPath();
    if (fs.existsSync(credsPath)) {
      return JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveCredentials(creds: Record<string, Record<string, string>>): void {
  const savePath = getCredentialsSavePath();
  const saveDir = path.dirname(savePath);
  if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
  fs.writeFileSync(savePath, JSON.stringify(creds, null, 2) + '\n', 'utf-8');
}

// ─── Config Storage ─────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(getDataDir(), 'integrations.json');

function loadConfig(): IntegrationsStore {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch {}
  return { integrations: [] };
}

function saveConfig(config: IntegrationsStore): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

// ─── Manager Class ──────────────────────────────────────────────────────────

export class IntegrationManager {
  private plugins = PLUGINS;
  private config: IntegrationsStore;
  private credentials: Record<string, Record<string, string>>;

  constructor() {
    this.config = loadConfig();
    this.credentials = loadCredentials();
  }

  // Get all available plugins (installed + their config status)
  getAvailablePlugins() {
    return Object.values(this.plugins).map(plugin => {
      const config = this.config.integrations.find(c => c.id === plugin.id);
      const hasCreds = !!this.credentials[plugin.id];
      return {
        id: plugin.id,
        name: plugin.name,
        icon: plugin.icon,
        description: plugin.description,
        docsUrl: plugin.docsUrl,
        credentialFields: plugin.credentialFields,
        setupGuide: plugin.setupGuide,
        actions: plugin.actions,
        enabled: config?.enabled ?? false,
        configured: hasCreds,
        last_tested: config?.last_tested ?? null,
        test_result: config?.test_result ?? null,
      };
    });
  }

  // Get only enabled + configured plugins
  getActivePlugins() {
    return this.getAvailablePlugins().filter(p => p.enabled && p.configured);
  }

  // Save credentials for a plugin
  setCredentials(pluginId: string, creds: Record<string, string>) {
    this.credentials[pluginId] = creds;

    // Sync Helicone credentials to the AI proxy namespace
    // The AI service reads from .credentials.json → ai.helicone + ai.helicone_org_id
    if (pluginId === 'helicone') {
      if (!this.credentials.ai) this.credentials.ai = {} as any;
      const aiCreds = this.credentials.ai as Record<string, string>;
      if (creds.api_key) aiCreds.helicone = creds.api_key;
      if (creds.org_id) aiCreds.helicone_org_id = creds.org_id;
    }

    saveCredentials(this.credentials);
  }

  // Get credentials (masked for UI display)
  getCredentialsMasked(pluginId: string): Record<string, string> {
    const creds = this.credentials[pluginId] || {};
    const masked: Record<string, string> = {};
    for (const [key, value] of Object.entries(creds)) {
      if (!value) {
        masked[key] = '';
      } else if (value.length > 8) {
        masked[key] = value.substring(0, 4) + '•'.repeat(Math.min(value.length - 8, 20)) + value.substring(value.length - 4);
      } else {
        masked[key] = '•'.repeat(value.length);
      }
    }
    return masked;
  }

  // Get raw credentials (for API calls)
  getRawCredentials(pluginId: string): Record<string, string> {
    return this.credentials[pluginId] || {};
  }

  // Enable/disable a plugin
  setEnabled(pluginId: string, enabled: boolean) {
    const existing = this.config.integrations.find(c => c.id === pluginId);
    if (existing) {
      existing.enabled = enabled;
    } else {
      this.config.integrations.push({
        id: pluginId,
        enabled,
        credentials: {},
        last_tested: null,
        test_result: null,
      });
    }
    saveConfig(this.config);
  }

  // Test connection for a plugin
  async testConnection(pluginId: string): Promise<{ ok: boolean; message: string }> {
    const plugin = this.plugins[pluginId];
    if (!plugin) return { ok: false, message: `Plugin ${pluginId} not found` };

    const creds = this.credentials[pluginId] || {};
    const result = await plugin.testConnection(creds);

    // Update config with test result
    const config = this.config.integrations.find(c => c.id === pluginId);
    if (config) {
      config.last_tested = new Date().toISOString();
      config.test_result = result.ok ? 'pass' : 'fail';
    }
    saveConfig(this.config);

    return result;
  }

  // Get health for a plugin
  async getHealth(pluginId: string) {
    const plugin = this.plugins[pluginId];
    if (!plugin) return { status: 'down' as const, detail: 'Plugin not found' };

    const creds = this.credentials[pluginId];
    if (!creds) return { status: 'unconfigured' as const, detail: 'Not configured' };

    return plugin.getHealth(creds);
  }

  // Get recent events for a plugin
  async getRecentEvents(pluginId: string) {
    const plugin = this.plugins[pluginId];
    if (!plugin) return [];

    const creds = this.credentials[pluginId];
    if (!creds) return [];

    return plugin.getRecentEvents(creds);
  }

  // Execute an action on a plugin
  async executeAction(pluginId: string, actionId: string) {
    const plugin = this.plugins[pluginId];
    if (!plugin) return { ok: false, output: 'Plugin not found' };

    const creds = this.credentials[pluginId] || {};
    return plugin.executeAction(actionId, creds);
  }

  // Get health for all active plugins (for dashboard)
  async getAllHealth() {
    const active = this.getActivePlugins();
    const results = await Promise.allSettled(
      active.map(async (p) => ({
        id: p.id,
        name: p.name,
        icon: p.icon,
        health: await this.getHealth(p.id),
        actions: p.actions,
      }))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value);
  }
}

// Singleton
let _manager: IntegrationManager | null = null;

export function getIntegrationManager(): IntegrationManager {
  if (!_manager) _manager = new IntegrationManager();
  return _manager;
}
