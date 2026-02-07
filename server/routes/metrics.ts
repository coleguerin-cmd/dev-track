import { Hono } from 'hono';
import { getStore } from '../store.js';

const app = new Hono();

// GET /api/v1/metrics/velocity
app.get('/velocity', (c) => {
  const store = getStore();
  return c.json({ ok: true, data: store.velocity });
});

// GET /api/v1/metrics/summary
app.get('/summary', (c) => {
  const store = getStore();
  const { totals } = store.velocity;
  const backlogCounts = {
    now: store.backlog.items.filter(i => i.horizon === 'now').length,
    next: store.backlog.items.filter(i => i.horizon === 'next').length,
    later: store.backlog.items.filter(i => i.horizon === 'later').length,
    completed: store.backlog.items.filter(i => i.status === 'completed').length,
  };
  const issueCounts = {
    open: store.issues.issues.filter(i => i.status === 'open' || i.status === 'in_progress').length,
    resolved: store.issues.issues.filter(i => i.status === 'resolved').length,
    critical: store.issues.issues.filter(i => i.severity === 'critical' && i.status !== 'resolved').length,
  };

  return c.json({
    ok: true,
    data: { velocity: totals, backlog: backlogCounts, issues: issueCounts },
  });
});

export default app;
