#!/usr/bin/env node

/**
 * dev-track CLI — designed for both human and AI use.
 * 
 * Usage:
 *   node cli/index.ts <resource> <action> [id] [--flags]
 * 
 * Resources: session, backlog, issue, action, changelog, state, metrics, status-line
 */

const BASE = process.env.DEV_TRACK_URL || 'http://127.0.0.1:24680';

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  const json = await res.json();
  if (!json.ok) {
    console.error(`Error: ${json.error}`);
    process.exit(1);
  }
  return json.data;
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace(/^--/, '');
      flags[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
    }
  }
  return flags;
}

const [,, resource, action, ...rest] = process.argv;
const flags = parseFlags(rest);
const id = rest.find(r => !r.startsWith('--'));

async function main() {
  if (!resource) {
    console.log(`
  dev-track CLI

  Usage: dev-track <resource> <action> [id] [--flags]

  Resources:
    session   start|status|end|log
    backlog   list|add|complete|move|update
    issue     list|create|resolve|update
    action    list|run|health
    changelog add|list
    state     get|update
    metrics   velocity|summary
    status    line|full
    config    get|update
`);
    return;
  }

  switch (resource) {
    // ── Session ────────────────────────────────────────────────
    case 'session': {
      if (action === 'start') {
        const objective = rest.filter(r => !r.startsWith('--')).join(' ');
        const data = await api('/session/start', {
          method: 'POST',
          body: JSON.stringify({
            objective,
            appetite: flags.appetite || '4h',
            developer: flags.developer || 'default',
          }),
        });
        console.log(`Session started: ${data.objective}`);
      } else if (action === 'status') {
        const data = await api('/session/current');
        if (!data) { console.log('No active session'); return; }
        console.log(`Session: ${data.status}`);
        console.log(`Objective: ${data.objective}`);
        console.log(`Appetite: ${data.appetite}`);
        console.log(`Items: ${data.items?.length || 0}`);
      } else if (action === 'end') {
        const retro = rest.filter(r => !r.startsWith('--')).join(' ');
        const data = await api('/session/end', {
          method: 'POST',
          body: JSON.stringify({
            next_session_suggestion: retro,
            handoff_message: flags.handoff,
          }),
        });
        console.log(`Session ended: ${data.duration_hours}h`);
      } else if (action === 'log') {
        const data = await api(`/session/log?limit=${flags.limit || 5}`);
        for (const s of data.sessions.reverse()) {
          console.log(`${s.date} | ${s.duration_hours}h | ${s.items_shipped} shipped | ${s.objective}`);
        }
      }
      break;
    }

    // ── Backlog ────────────────────────────────────────────────
    case 'backlog': {
      if (action === 'list') {
        const horizon = flags.horizon || '';
        const data = await api(`/backlog${horizon ? `?horizon=${horizon}` : ''}`);
        for (const item of data.items) {
          const status = item.status === 'in_progress' ? '●' : item.status === 'completed' ? '✓' : '○';
          console.log(`${status} [${item.horizon}] ${item.title} (${item.size}) — ${item.summary || ''}`);
        }
        console.log(`\nTotal: ${data.total} items`);
      } else if (action === 'add') {
        const title = rest.filter(r => !r.startsWith('--')).join(' ');
        const data = await api('/backlog', {
          method: 'POST',
          body: JSON.stringify({
            title,
            horizon: flags.horizon || 'later',
            size: flags.size || 'M',
            category: flags.category || 'general',
            summary: flags.summary || '',
          }),
        });
        console.log(`Created: ${data.id} — ${data.title} [${data.horizon}]`);
      } else if (action === 'complete') {
        if (!id) { console.error('Provide item ID'); process.exit(1); }
        await api(`/backlog/${id}/complete`, { method: 'POST' });
        console.log(`Completed: ${id}`);
      } else if (action === 'move') {
        if (!id) { console.error('Provide item ID'); process.exit(1); }
        const horizon = flags.horizon || flags.to;
        if (!horizon) { console.error('Provide --horizon'); process.exit(1); }
        await api(`/backlog/${id}/move`, {
          method: 'POST',
          body: JSON.stringify({ horizon }),
        });
        console.log(`Moved ${id} → ${horizon}`);
      } else if (action === 'update') {
        if (!id) { console.error('Provide item ID'); process.exit(1); }
        const updates: any = {};
        if (flags.status) updates.status = flags.status;
        if (flags.title) updates.title = flags.title;
        if (flags.size) updates.size = flags.size;
        if (flags.summary) updates.summary = flags.summary;
        if (flags.assignee) updates.assignee = flags.assignee;
        await api(`/backlog/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
        console.log(`Updated: ${id}`);
      }
      break;
    }

    // ── Issues ─────────────────────────────────────────────────
    case 'issue': {
      if (action === 'list') {
        const params = new URLSearchParams();
        if (flags.status) params.set('status', flags.status);
        if (flags.action) params.set('action_id', flags.action);
        const data = await api(`/issues?${params}`);
        for (const issue of data.issues) {
          const sev = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' }[issue.severity] || '⚪';
          console.log(`${sev} ${issue.id} ${issue.title} [${issue.status}]`);
        }
        console.log(`\nOpen: ${data.counts.open} | Critical: ${data.counts.critical}`);
      } else if (action === 'create') {
        const title = rest.filter(r => !r.startsWith('--')).join(' ');
        const data = await api('/issues', {
          method: 'POST',
          body: JSON.stringify({
            title,
            severity: flags.severity || 'medium',
            action_id: flags.action || null,
            symptoms: flags.symptoms || '',
            files: flags.files ? flags.files.split(',') : [],
          }),
        });
        console.log(`Created: ${data.id} — ${data.title}`);
      } else if (action === 'resolve') {
        if (!id) { console.error('Provide issue ID'); process.exit(1); }
        const resolution = flags.resolution || rest.filter(r => !r.startsWith('--') && r !== id).join(' ');
        await api(`/issues/${id}/resolve`, {
          method: 'POST',
          body: JSON.stringify({ resolution }),
        });
        console.log(`Resolved: ${id}`);
      }
      break;
    }

    // ── Actions ────────────────────────────────────────────────
    case 'action': {
      if (action === 'list' || action === 'health') {
        const data = await api('/actions');
        for (const a of data.actions) {
          const health = { green: '🟢', yellow: '🟡', red: '🔴', unknown: '⚪' }[a.health];
          console.log(`${health} ${a.name} — ${a.pass_rate.passed}/${a.pass_rate.total} pass — ${a.open_issues} issues`);
        }
      } else if (action === 'run') {
        if (!id) { console.error('Provide action ID'); process.exit(1); }
        console.log(`Running diagnostic for ${id}...`);
        const data = await api(`/actions/${id}/run`, {
          method: 'POST',
          body: JSON.stringify({ trigger: 'cli' }),
        });
        console.log(`Result: ${data.result}`);
        for (const o of data.outcomes) {
          console.log(`  ${o.pass ? '✓' : '✗'} ${o.id}: ${o.detail || 'no detail'}`);
        }
      }
      break;
    }

    // ── Changelog ──────────────────────────────────────────────
    case 'changelog': {
      if (action === 'add') {
        const title = rest.filter(r => !r.startsWith('--')).join(' ');
        const items = flags.items ? flags.items.split('|') : [];
        const data = await api('/changelog', {
          method: 'POST',
          body: JSON.stringify({
            title,
            category: flags.category || 'general',
            description: flags.description || '',
            items,
          }),
        });
        console.log(`Added: ${data.id} — ${data.title}`);
      } else if (action === 'list') {
        const data = await api(`/changelog?limit=${flags.limit || 10}`);
        for (const e of data.entries) {
          console.log(`${e.date} [${e.category}] ${e.title}`);
        }
      }
      break;
    }

    // ── State ──────────────────────────────────────────────────
    case 'state': {
      if (action === 'get') {
        const data = await api('/state');
        console.log(`Health: ${data.overall_completion}%`);
        console.log(`Summary: ${data.summary}`);
        for (const s of data.systems) {
          console.log(`  ${s.rating}/10 ${s.name} [${s.status}]`);
        }
      } else if (action === 'update') {
        if (!id) { console.error('Provide system ID'); process.exit(1); }
        const updates: any = {};
        if (flags.rating) updates.rating = parseInt(flags.rating);
        if (flags.notes) updates.notes = flags.notes;
        if (flags.status) updates.status = flags.status;
        await api(`/state/systems/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
        console.log(`Updated: ${id}`);
      }
      break;
    }

    // ── Metrics ────────────────────────────────────────────────
    case 'metrics': {
      if (action === 'velocity' || action === 'summary') {
        const data = await api('/metrics/summary');
        console.log(`Sessions: ${data.velocity.total_sessions}`);
        console.log(`Items shipped: ${data.velocity.total_items_shipped}`);
        console.log(`Total points: ${data.velocity.total_points}`);
        console.log(`Avg items/session: ${data.velocity.avg_items_per_session}`);
        console.log(`\nBacklog — Now: ${data.backlog.now} | Next: ${data.backlog.next} | Later: ${data.backlog.later}`);
        console.log(`Issues — Open: ${data.issues.open} | Critical: ${data.issues.critical}`);
      }
      break;
    }

    // ── Quick Status ───────────────────────────────────────────
    case 'status': {
      const data = await api('/config/quick-status');
      if (action === 'line') {
        console.log(data.status_line);
      } else {
        console.log(JSON.stringify(data.status, null, 2));
      }
      break;
    }

    default:
      console.error(`Unknown resource: ${resource}`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
