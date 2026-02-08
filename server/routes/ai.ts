/**
 * AI API Routes — Chat streaming, conversation management, config, and models.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getAIService } from '../ai/service.js';
import {
  runChat,
  listConversations,
  loadConversation,
  deleteConversation,
  type ChatStreamEvent,
} from '../ai/chat.js';
import fs from 'fs';
import path from 'path';

const app = new Hono();

// ─── Chat Streaming ──────────────────────────────────────────────────────────

// POST /api/v1/ai/chat — Stream a chat message (SSE)
app.post('/chat', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { conversation_id, message, model } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return c.json({ ok: false, error: 'Message is required' }, 400);
  }

  // Set SSE headers
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');

  return streamSSE(c, async (stream) => {
    try {
      const generator = runChat(conversation_id || null, message.trim(), model);

      for await (const event of generator) {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        });
      }
    } catch (err: any) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ type: 'error', error: err.message || 'Stream failed' }),
      });
    }
  });
});

// ─── Conversation Management ─────────────────────────────────────────────────

// GET /api/v1/ai/conversations — List all conversations
app.get('/conversations', (c) => {
  const convos = listConversations();
  return c.json({ ok: true, data: { conversations: convos } });
});

// GET /api/v1/ai/conversations/:id — Get a specific conversation
app.get('/conversations/:id', (c) => {
  const convo = loadConversation(c.req.param('id'));
  if (!convo) return c.json({ ok: false, error: 'Conversation not found' }, 404);
  return c.json({ ok: true, data: convo });
});

// DELETE /api/v1/ai/conversations/:id — Delete a conversation
app.delete('/conversations/:id', (c) => {
  const deleted = deleteConversation(c.req.param('id'));
  return c.json({ ok: true, data: { deleted } });
});

// ─── Models & Config ─────────────────────────────────────────────────────────

// GET /api/v1/ai/models — List available models
app.get('/models', (c) => {
  const aiService = getAIService();
  return c.json({
    ok: true,
    data: {
      models: aiService.getAvailableModels(),
      configured: aiService.isConfigured(),
    },
  });
});

// GET /api/v1/ai/config — Get AI config
app.get('/config', (c) => {
  const aiService = getAIService();
  return c.json({
    ok: true,
    data: aiService.getConfig(),
  });
});

// PUT /api/v1/ai/config — Update AI config
app.put('/config', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const configPath = path.resolve(process.cwd(), 'data/ai/config.json');

  try {
    let config: any = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    // Merge updates
    Object.assign(config, body);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return c.json({ ok: true, data: config });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

// ─── Credentials (write-only) ────────────────────────────────────────────────

// PUT /api/v1/ai/credentials — Update AI provider credentials
app.put('/credentials', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const credsPath = path.resolve(process.cwd(), '.credentials.json');

  try {
    let creds: any = {};
    if (fs.existsSync(credsPath)) {
      creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
    }
    if (!creds.ai) creds.ai = {};

    // Only update provided fields
    if (body.openai !== undefined) creds.ai.openai = body.openai;
    if (body.anthropic !== undefined) creds.ai.anthropic = body.anthropic;
    if (body.google !== undefined) creds.ai.google = body.google;
    if (body.helicone !== undefined) creds.ai.helicone = body.helicone;
    if (body.helicone_org_id !== undefined) creds.ai.helicone_org_id = body.helicone_org_id;

    fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2));

    // Reset AI service to pick up new credentials
    const { resetAIService } = await import('../ai/service.js');
    resetAIService();

    return c.json({ ok: true, data: { updated: true } });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

// GET /api/v1/ai/credentials — Get masked credentials (for UI display)
app.get('/credentials', (c) => {
  const credsPath = path.resolve(process.cwd(), '.credentials.json');
  try {
    if (!fs.existsSync(credsPath)) return c.json({ ok: true, data: {} });
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
    const ai = creds.ai || {};

    // Mask keys — show first 8 and last 4 chars
    const mask = (key?: string) => {
      if (!key) return null;
      if (key.length < 16) return '••••••••';
      return key.substring(0, 8) + '••••••••' + key.substring(key.length - 4);
    };

    return c.json({
      ok: true,
      data: {
        openai: mask(ai.openai),
        anthropic: mask(ai.anthropic),
        google: mask(ai.google),
        helicone: mask(ai.helicone),
        has_openai: !!ai.openai,
        has_anthropic: !!ai.anthropic,
        has_google: !!ai.google,
        has_helicone: !!ai.helicone,
      },
    });
  } catch {
    return c.json({ ok: true, data: {} });
  }
});

// ─── Usage ───────────────────────────────────────────────────────────────────

// GET /api/v1/ai/usage — Get usage stats
app.get('/usage', (c) => {
  const usagePath = path.resolve(process.cwd(), 'data/ai/usage.json');
  try {
    if (!fs.existsSync(usagePath)) return c.json({ ok: true, data: { total: {}, daily: {} } });
    const usage = JSON.parse(fs.readFileSync(usagePath, 'utf-8'));
    return c.json({ ok: true, data: usage });
  } catch {
    return c.json({ ok: true, data: { total: {}, daily: {} } });
  }
});

// ─── Profiles ────────────────────────────────────────────────────────────────

// GET /api/v1/ai/profiles — Get all user profiles
app.get('/profiles', (c) => {
  const profilesPath = path.resolve(process.cwd(), 'data/ai/profiles.json');
  try {
    if (!fs.existsSync(profilesPath)) return c.json({ ok: true, data: { profiles: [] } });
    const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));
    return c.json({ ok: true, data: profiles });
  } catch {
    return c.json({ ok: true, data: { profiles: [] } });
  }
});

// GET /api/v1/ai/profile — Get the active user profile (first one)
app.get('/profile', (c) => {
  const profilesPath = path.resolve(process.cwd(), 'data/ai/profiles.json');
  try {
    if (!fs.existsSync(profilesPath)) return c.json({ ok: true, data: null });
    const data = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));
    const profile = data.profiles?.[0] || null;
    return c.json({ ok: true, data: profile });
  } catch {
    return c.json({ ok: true, data: null });
  }
});

// PUT /api/v1/ai/profile — Update the active user profile
app.put('/profile', async (c) => {
  const profilesPath = path.resolve(process.cwd(), 'data/ai/profiles.json');
  const body = await c.req.json().catch(() => ({}));

  try {
    let data: any = { profiles: [] };
    if (fs.existsSync(profilesPath)) {
      data = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));
    }

    const updated = {
      ...body,
      updated: new Date().toISOString().split('T')[0],
    };

    if (data.profiles.length > 0) {
      data.profiles[0] = { ...data.profiles[0], ...updated };
    } else {
      data.profiles.push({
        id: 'user-001',
        ...updated,
        created: new Date().toISOString().split('T')[0],
      });
    }

    fs.writeFileSync(profilesPath, JSON.stringify(data, null, 2));
    return c.json({ ok: true, data: data.profiles[0] });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

export default app;
