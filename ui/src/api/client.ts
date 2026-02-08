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
};

// ─── Session ────────────────────────────────────────────────────────────────

export const session = {
  getCurrent: () => request<any>('/session/current'),
  start: (data: any) => request<any>('/session/start', { method: 'POST', body: JSON.stringify(data) }),
  updateCurrent: (data: any) => request<any>('/session/current', { method: 'PATCH', body: JSON.stringify(data) }),
  end: (data: any) => request<any>('/session/end', { method: 'POST', body: JSON.stringify(data) }),
  getLog: (limit = 20) => request<any>(`/session/log?limit=${limit}`),
  getLatest: () => request<any>('/session/log/latest'),
};

// ─── Roadmap (v2, also accessible as backlog) ───────────────────────────────

export const roadmap = {
  list: (params?: { horizon?: string; status?: string; category?: string; epic_id?: string; milestone_id?: string }) => {
    const qs = new URLSearchParams();
    if (params?.horizon) qs.set('horizon', params.horizon);
    if (params?.status) qs.set('status', params.status);
    if (params?.category) qs.set('category', params.category);
    if (params?.epic_id) qs.set('epic_id', params.epic_id);
    if (params?.milestone_id) qs.set('milestone_id', params.milestone_id);
    return request<any>(`/roadmap?${qs}`);
  },
  get: (id: string) => request<any>(`/roadmap/${id}`),
  create: (data: any) => request<any>('/roadmap', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    request<any>(`/roadmap/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  complete: (id: string) => request<any>(`/roadmap/${id}/complete`, { method: 'POST' }),
  reopen: (id: string) => request<any>(`/roadmap/${id}/reopen`, { method: 'POST' }),
  move: (id: string, horizon: string) =>
    request<any>(`/roadmap/${id}/move`, { method: 'POST', body: JSON.stringify({ horizon }) }),
  remove: (id: string) => request<any>(`/roadmap/${id}`, { method: 'DELETE' }),
};

/** @deprecated Use roadmap */
export const backlog = roadmap;

// ─── Epics ──────────────────────────────────────────────────────────────────

export const epics = {
  list: (params?: { status?: string; milestone_id?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.milestone_id) qs.set('milestone_id', params.milestone_id);
    return request<any>(`/epics?${qs}`);
  },
  get: (id: string) => request<any>(`/epics/${id}`),
  create: (data: any) => request<any>('/epics', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    request<any>(`/epics/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => request<any>(`/epics/${id}`, { method: 'DELETE' }),
};

// ─── Milestones ─────────────────────────────────────────────────────────────

export const milestones = {
  list: (params?: { status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    return request<any>(`/milestones?${qs}`);
  },
  get: (id: string) => request<any>(`/milestones/${id}`),
  create: (data: any) => request<any>('/milestones', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    request<any>(`/milestones/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => request<any>(`/milestones/${id}`, { method: 'DELETE' }),
};

// ─── Releases ───────────────────────────────────────────────────────────────

export const releases = {
  list: (params?: { status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    return request<any>(`/releases?${qs}`);
  },
  get: (id: string) => request<any>(`/releases/${id}`),
  create: (data: any) => request<any>('/releases', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    request<any>(`/releases/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  publish: (id: string) => request<any>(`/releases/${id}/publish`, { method: 'POST' }),
};

// ─── Systems (replaces Actions) ─────────────────────────────────────────────

export const systems = {
  list: (params?: { status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    return request<any>(`/systems?${qs}`);
  },
  get: (id: string) => request<any>(`/systems/${id}`),
  create: (data: any) => request<any>('/systems', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    request<any>(`/systems/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => request<any>(`/systems/${id}`, { method: 'DELETE' }),
  health: () => request<any>('/systems/health'),
};

// ─── Issues ─────────────────────────────────────────────────────────────────

export const issues = {
  list: (params?: { status?: string; severity?: string; type?: string; milestone_id?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.severity) qs.set('severity', params.severity);
    if (params?.type) qs.set('type', params.type);
    if (params?.milestone_id) qs.set('milestone_id', params.milestone_id);
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

// ─── Changelog ──────────────────────────────────────────────────────────────

export const changelog = {
  list: (params?: { limit?: number; since?: string; type?: string; scope?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.since) qs.set('since', params.since);
    if (params?.type) qs.set('type', params.type);
    if (params?.scope) qs.set('scope', params.scope);
    return request<any>(`/changelog?${qs}`);
  },
  create: (data: any) => request<any>('/changelog', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── Labels ─────────────────────────────────────────────────────────────────

export const labels = {
  list: () => request<any>('/labels'),
  create: (data: any) => request<any>('/labels', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    request<any>(`/labels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => request<any>(`/labels/${id}`, { method: 'DELETE' }),
};

// ─── Automations ────────────────────────────────────────────────────────────

export const automations = {
  list: () => request<any>('/automations'),
  create: (data: any) => request<any>('/automations', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    request<any>(`/automations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  toggle: (id: string) => request<any>(`/automations/${id}/toggle`, { method: 'POST' }),
  remove: (id: string) => request<any>(`/automations/${id}`, { method: 'DELETE' }),
};

// ─── Audits ─────────────────────────────────────────────────────────────

export const audits = {
  list: (params?: { trigger_type?: string; status?: string; automation_id?: string; since?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.trigger_type) qs.set('trigger_type', params.trigger_type);
    if (params?.status) qs.set('status', params.status);
    if (params?.automation_id) qs.set('automation_id', params.automation_id);
    if (params?.since) qs.set('since', params.since);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    return request<any>(`/audits?${qs}`);
  },
  get: (id: string) => request<any>(`/audits/${id}`),
  stats: () => request<any>('/audits/stats'),
  updateSuggestion: (runId: string, suggestionId: string, status: 'approved' | 'dismissed') =>
    request<any>(`/audits/${runId}/suggestions/${suggestionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};

// ─── Activity Feed ──────────────────────────────────────────────────────────

export const activity = {
  list: (params?: { limit?: number; type?: string; entity_type?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.type) qs.set('type', params.type);
    if (params?.entity_type) qs.set('entity_type', params.entity_type);
    return request<any>(`/activity?${qs}`);
  },
};

// ─── Metrics ────────────────────────────────────────────────────────────────

export const metrics = {
  velocity: () => request<any>('/metrics/velocity'),
  summary: () => request<any>('/metrics/summary'),
};

// ─── Docs ───────────────────────────────────────────────────────────────────

export const docs = {
  // Registry-based (v2)
  list: (params?: { type?: string; status?: string; system?: string }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set('type', params.type);
    if (params?.status) qs.set('status', params.status);
    if (params?.system) qs.set('system', params.system);
    return request<any>(`/docs?${qs}`);
  },
  get: (id: string) => request<any>(`/docs/${id}`),
  create: (data: any) => request<any>('/docs', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    request<any>(`/docs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => request<any>(`/docs/${id}`, { method: 'DELETE' }),
  regenerate: (id: string) => request<any>(`/docs/${id}/regenerate`, { method: 'POST' }),
  // Legacy (backward compat)
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

// ─── AI Config ─────────────────────────────────────────────────────────────

export const aiConfig = {
  get: () => request<any>('/ai/config'),
  update: (data: any) => request<any>('/ai/config', { method: 'PATCH', body: JSON.stringify(data) }),
};
