// ─── Integration Plugin Interface ───────────────────────────────────────────

export interface IntegrationHealth {
  status: 'healthy' | 'degraded' | 'down' | 'unconfigured';
  detail: string;
  metrics?: Record<string, string | number>;
}

export interface IntegrationEvent {
  title: string;
  time: string;
  severity: 'info' | 'warning' | 'error';
  url?: string;
}

export interface IntegrationAction {
  id: string;
  label: string;
  description: string;
  dangerous?: boolean;
}

export interface CredentialField {
  key: string;
  label: string;
  type: 'token' | 'url' | 'project_id' | 'text';
  required: boolean;
  placeholder: string;
  help: string;
}

export interface IntegrationPlugin {
  id: string;
  name: string;
  icon: string;
  description: string;
  docsUrl: string;

  // Setup
  credentialFields: CredentialField[];
  setupGuide: string; // Markdown instructions

  // Runtime
  testConnection(credentials: Record<string, string>): Promise<{ ok: boolean; message: string }>;
  getHealth(credentials: Record<string, string>): Promise<IntegrationHealth>;
  getRecentEvents(credentials: Record<string, string>): Promise<IntegrationEvent[]>;

  // Actions
  actions: IntegrationAction[];
  executeAction(actionId: string, credentials: Record<string, string>): Promise<{ ok: boolean; output: string }>;
}

// ─── Stored Configuration ───────────────────────────────────────────────────

export interface IntegrationConfig {
  id: string;
  enabled: boolean;
  credentials: Record<string, string>;
  last_tested: string | null;
  test_result: 'pass' | 'fail' | null;
}

export interface IntegrationsStore {
  integrations: IntegrationConfig[];
}
