const BASE = '/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'API request failed');
  return json.data as T;
}

// ─── State ──────────────────────────────────────────────────────────────────

export const state = {
  get: () => request<any>('/state'),
  update: (data: any) => request<any>('/state', { method: 'PATCH', body: JSON.stringify(data) }),
  updateSystem: (id: string, data: any) =>
    request<any>(`/state/systems/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

// ─── Session ────────────────────────────────────────────────────────────────

export const session = {
  getCurrent: () => request<any>('/session/current'),
  start: (data: any) => request<any>('/session/start', { method: 'POST', body: JSON.stringify(data) }),
  updateCurrent: (data: any) => request<any>('/session/current', { method: 'PATCH', body: JSON.stringify(data) }),
  end: (data: any) => request<any>('/session/end', { method: 'POST', body: JSON.stringify(data) }),
  getLog: (limit = 10) => request<any>(`/session/log?limit=${limit}`),
  getLatest: () => request<any>('/session/log/latest'),
};

// ─── Backlog ────────────────────────────────────────────────────────────────

export const backlog = {
  list: (params?: { horizon?: string; status?: string; category?: string }) => {
    const qs = new URLSearchParams();
    if (params?.horizon) qs.set('horizon', params.horizon);
    if (params?.status) qs.set('status', params.status);
    if (params?.category) qs.set('category', params.category);
    return request<any>(`/backlog?${qs}`);
  },
  get: (id: string) => request<any>(`/backlog/${id}`),
  create: (data: any) => request<any>('/backlog', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    request<any>(`/backlog/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  complete: (id: string) => request<any>(`/backlog/${id}/complete`, { method: 'POST' }),
  reopen: (id: string) => request<any>(`/backlog/${id}/reopen`, { method: 'POST' }),
  move: (id: string, horizon: string) =>
    request<any>(`/backlog/${id}/move`, { method: 'POST', body: JSON.stringify({ horizon }) }),
  remove: (id: string) => request<any>(`/backlog/${id}`, { method: 'DELETE' }),
};

// ─── Issues ─────────────────────────────────────────────────────────────────

export const issues = {
  list: (params?: { status?: string; severity?: string; action_id?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.severity) qs.set('severity', params.severity);
    if (params?.action_id) qs.set('action_id', params.action_id);
    return request<any>(`/issues?${qs}`);
  },
  get: (id: string) => request<any>(`/issues/${id}`),
  create: (data: any) => request<any>('/issues', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    request<any>(`/issues/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  resolve: (id: string, resolution: string) =>
    request<any>(`/issues/${id}/resolve`, { method: 'POST', body: JSON.stringify({ resolution }) }),
  reopen: (id: string) => request<any>(`/issues/${id}/reopen`, { method: 'POST' }),
};

// ─── Actions ────────────────────────────────────────────────────────────────

export const actions = {
  list: () => request<any>('/actions'),
  get: (id: string) => request<any>(`/actions/${id}`),
  create: (data: any) => request<any>('/actions', { method: 'POST', body: JSON.stringify(data) }),
  run: (id: string, trigger = 'manual') =>
    request<any>(`/actions/${id}/run`, { method: 'POST', body: JSON.stringify({ trigger }) }),
  updateRun: (actionId: string, runId: string, data: any) =>
    request<any>(`/actions/${actionId}/runs/${runId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getPlaybook: (id: string) => request<any>(`/actions/${id}/playbook`),
};

// ─── Changelog ──────────────────────────────────────────────────────────────

export const changelog = {
  list: (params?: { limit?: number; since?: string; category?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.since) qs.set('since', params.since);
    if (params?.category) qs.set('category', params.category);
    return request<any>(`/changelog?${qs}`);
  },
  create: (data: any) => request<any>('/changelog', { method: 'POST', body: JSON.stringify(data) }),
  getSummaries: () => request<any>('/changelog/summaries'),
};

// ─── Runs ───────────────────────────────────────────────────────────────────

export const runs = {
  list: (params?: { action_id?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.action_id) qs.set('action_id', params.action_id);
    if (params?.limit) qs.set('limit', String(params.limit));
    return request<any>(`/runs?${qs}`);
  },
  get: (id: string) => request<any>(`/runs/${id}`),
};

// ─── Metrics ────────────────────────────────────────────────────────────────

export const metrics = {
  velocity: () => request<any>('/metrics/velocity'),
  summary: () => request<any>('/metrics/summary'),
};

// ─── Docs ───────────────────────────────────────────────────────────────────

export const docs = {
  listDesigns: () => request<any>('/docs/designs'),
  getDesign: (filename: string) => request<any>(`/docs/designs/${filename}`),
  listDecisions: () => request<any>('/docs/decisions'),
  getDecision: (filename: string) => request<any>(`/docs/decisions/${filename}`),
};

// ─── Git ────────────────────────────────────────────────────────────────────

export const git = {
  status: () => request<any>('/git/status'),
  log: (limit = 20) => request<any>(`/git/log?limit=${limit}`),
  branches: () => request<any>('/git/branches'),
  diff: () => request<any>('/git/diff'),
  prs: () => request<any>('/git/prs'),
  ci: () => request<any>('/git/ci'),
  summary: () => request<any>('/git/summary'),
};

// ─── Config ─────────────────────────────────────────────────────────────────

export const config = {
  get: () => request<any>('/config'),
  update: (data: any) => request<any>('/config', { method: 'PATCH', body: JSON.stringify(data) }),
  quickStatus: () => request<any>('/config/quick-status'),
};
