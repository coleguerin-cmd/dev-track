import { useEffect, useState } from 'react';

interface PluginInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  docsUrl: string;
  setupGuide: string;
  credentialFields: { key: string; label: string; type: string; required: boolean; placeholder: string; help: string }[];
  actions: { id: string; label: string; description: string }[];
  enabled: boolean;
  configured: boolean;
  last_tested: string | null;
  test_result: 'pass' | 'fail' | null;
}

const BASE = '/api/v1';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Failed');
  return json.data as T;
}

export function Settings() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [editCreds, setEditCreds] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    apiFetch<{ plugins: PluginInfo[] }>('/integrations')
      .then(d => setPlugins(d.plugins))
      .catch(() => {});
  }, []);

  const selected = plugins.find(p => p.id === selectedId);

  useEffect(() => {
    if (selectedId) {
      apiFetch<{ plugin: PluginInfo; credentials: Record<string, string> }>(`/integrations/${selectedId}`)
        .then(d => {
          setCredentials(d.credentials);
          setEditCreds({});
          setTestResult(null);
          setShowGuide(false);
        })
        .catch(() => {});
    }
  }, [selectedId]);

  const saveCredentials = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await apiFetch(`/integrations/${selectedId}/credentials`, {
        method: 'POST',
        body: JSON.stringify({ credentials: editCreds }),
      });
      // Reload
      const d = await apiFetch<{ plugin: PluginInfo; credentials: Record<string, string> }>(`/integrations/${selectedId}`);
      setCredentials(d.credentials);
      setEditCreds({});
      // Refresh plugin list
      const pl = await apiFetch<{ plugins: PluginInfo[] }>('/integrations');
      setPlugins(pl.plugins);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!selectedId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch<{ ok: boolean; message: string }>(`/integrations/${selectedId}/test`, { method: 'POST' });
      setTestResult(result);
      // Refresh plugin list
      const pl = await apiFetch<{ plugins: PluginInfo[] }>('/integrations');
      setPlugins(pl.plugins);
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const toggleEnabled = async (pluginId: string, enabled: boolean) => {
    await apiFetch(`/integrations/${pluginId}/${enabled ? 'enable' : 'disable'}`, { method: 'POST' });
    const pl = await apiFetch<{ plugins: PluginInfo[] }>('/integrations');
    setPlugins(pl.plugins);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Settings & Integrations</h1>

      <div className="grid grid-cols-3 gap-6 items-start">
        {/* Plugin list */}
        <div className="space-y-2">
          <h2 className="label mb-2">Integrations</h2>
          {plugins.map(p => (
            <div
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`card-hover p-3 ${selectedId === p.id ? 'ring-1 ring-accent-blue/40' : ''}`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg w-6 text-center">{p.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    {p.enabled && p.configured && (
                      <span className={`w-2 h-2 rounded-full ${p.test_result === 'pass' ? 'bg-status-pass' : p.test_result === 'fail' ? 'bg-status-fail' : 'bg-status-neutral'}`} />
                    )}
                  </div>
                  <p className="text-2xs text-text-tertiary truncate">{p.description}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleEnabled(p.id, !p.enabled); }}
                  className={`w-9 h-5 rounded-full transition-colors flex items-center ${p.enabled ? 'bg-accent-blue justify-end' : 'bg-surface-4 justify-start'}`}
                >
                  <span className="w-4 h-4 rounded-full bg-white mx-0.5 transition-transform" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Plugin detail */}
        <div className="col-span-2">
          {selected ? (
            <div className="card p-5 space-y-5">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selected.icon}</span>
                <div>
                  <h2 className="text-lg font-semibold">{selected.name}</h2>
                  <p className="text-sm text-text-secondary">{selected.description}</p>
                </div>
                <a href={selected.docsUrl} target="_blank" rel="noreferrer" className="btn-ghost text-xs ml-auto">
                  Docs ↗
                </a>
              </div>

              {/* Setup guide toggle */}
              <div>
                <button
                  onClick={() => setShowGuide(!showGuide)}
                  className="btn-ghost text-xs"
                >
                  {showGuide ? '▾ Hide Setup Guide' : '▸ Setup Guide'}
                </button>
                {showGuide && (
                  <div className="mt-2 bg-surface-0 rounded-lg p-4 text-sm text-text-secondary whitespace-pre-wrap font-sans leading-relaxed animate-fade-in">
                    {selected.setupGuide}
                  </div>
                )}
              </div>

              {/* Credentials form */}
              <div>
                <h3 className="label mb-3">Credentials</h3>
                <div className="space-y-3">
                  {selected.credentialFields.map(field => (
                    <div key={field.key}>
                      <label className="text-xs font-medium text-text-secondary mb-1 flex items-center gap-1">
                        {field.label}
                        {field.required && <span className="text-accent-red">*</span>}
                      </label>
                      <input
                        type={field.type === 'token' ? 'password' : 'text'}
                        className="input font-mono text-xs"
                        placeholder={credentials[field.key] || field.placeholder}
                        value={editCreds[field.key] || ''}
                        onChange={e => setEditCreds({ ...editCreds, [field.key]: e.target.value })}
                      />
                      <p className="text-2xs text-text-tertiary mt-0.5">{field.help}</p>
                      {credentials[field.key] && !editCreds[field.key] && (
                        <p className="text-2xs text-status-pass mt-0.5">✓ Saved: {credentials[field.key]}</p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={saveCredentials}
                    disabled={saving || Object.keys(editCreds).length === 0}
                    className="btn-primary text-sm"
                  >
                    {saving ? 'Saving...' : 'Save Credentials'}
                  </button>
                  <button
                    onClick={testConnection}
                    disabled={testing}
                    className="btn-ghost text-sm"
                  >
                    {testing ? '⟳ Testing...' : '▶ Test Connection'}
                  </button>
                </div>

                {/* Test result */}
                {testResult && (
                  <div className={`mt-3 p-3 rounded-lg text-sm animate-fade-in ${
                    testResult.ok
                      ? 'bg-status-pass/10 text-status-pass border border-status-pass/20'
                      : 'bg-status-fail/10 text-status-fail border border-status-fail/20'
                  }`}>
                    <span className="font-medium">{testResult.ok ? '✓ Connected' : '✗ Failed'}</span>
                    <p className="text-xs mt-1 opacity-80">{testResult.message}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              {selected.actions.length > 0 && selected.enabled && (
                <div>
                  <h3 className="label mb-2">Quick Actions</h3>
                  <div className="flex flex-wrap gap-2">
                    {selected.actions.map(action => (
                      <button
                        key={action.id}
                        onClick={async () => {
                          const result = await apiFetch<{ ok: boolean; output: string }>(
                            `/integrations/${selected.id}/actions/${action.id}`,
                            { method: 'POST' }
                          );
                          if (result.ok && result.output.startsWith('http')) {
                            window.open(result.output, '_blank');
                          }
                        }}
                        className="btn-ghost text-xs"
                        title={action.description}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Status info */}
              <div className="pt-3 border-t border-border flex items-center gap-4 text-2xs text-text-tertiary">
                <span>Status: {selected.enabled ? (selected.configured ? 'Active' : 'Enabled (needs credentials)') : 'Disabled'}</span>
                {selected.last_tested && (
                  <span>Last tested: {new Date(selected.last_tested).toLocaleString()}</span>
                )}
                {selected.test_result && (
                  <span className={selected.test_result === 'pass' ? 'text-status-pass' : 'text-status-fail'}>
                    {selected.test_result === 'pass' ? '✓ Pass' : '✗ Fail'}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="card p-12 text-center text-text-tertiary">
              <p className="text-lg mb-2">Select an integration</p>
              <p className="text-sm">Configure your development stack tools.<br />Credentials are stored locally and never committed to git.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
