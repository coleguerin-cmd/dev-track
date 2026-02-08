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
import { getDataDir, getLocalDataDir, getCredentialsPath } from '../project-config.js';
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
  const configPath = path.join(getDataDir(), 'ai/config.json');

  try {
    let config: any = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    // Deep merge — preserves nested properties (fixes ISS-035: Object.assign shallow merge)
    function deepMerge(target: any, source: any): any {
      for (const key in source) {
        if (
          source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
          target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
        ) {
          deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
      return target;
    }
    deepMerge(config, body);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    // Reload in-memory config so GET returns fresh data
    const aiService = getAIService();
    aiService.reloadConfig();
    return c.json({ ok: true, data: config });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

// ─── Credentials (write-only) ────────────────────────────────────────────────

// PUT /api/v1/ai/credentials — Update AI provider credentials
app.put('/credentials', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const credsPath = getCredentialsPath();

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
  const credsPath = getCredentialsPath();
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

// ─── Provider Connection Test ─────────────────────────────────────────────────

// POST /api/v1/ai/providers/:id/test — Test a provider connection by listing models
app.post('/providers/:id/test', async (c) => {
  const providerId = c.req.param('id');
  const credsPath = getCredentialsPath();

  try {
    let creds: any = {};
    if (fs.existsSync(credsPath)) {
      creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
    }
    const ai = creds.ai || {};

    if (providerId === 'openai') {
      if (!ai.openai) return c.json({ ok: true, data: { ok: false, message: 'No OpenAI API key configured' } });
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: ai.openai });
      const models = await client.models.list();
      const count = Array.isArray(models.data) ? models.data.length : 0;
      return c.json({ ok: true, data: { ok: true, message: `Connected. ${count} models available.` } });
    }

    if (providerId === 'anthropic') {
      if (!ai.anthropic) return c.json({ ok: true, data: { ok: false, message: 'No Anthropic API key configured' } });
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: ai.anthropic });
      // Anthropic doesn't have a list models endpoint — do a minimal message to verify key
      const resp = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return c.json({ ok: true, data: { ok: true, message: `Connected. Key verified (model: ${resp.model}).` } });
    }

    if (providerId === 'google') {
      if (!ai.google) return c.json({ ok: true, data: { ok: false, message: 'No Google AI API key configured' } });
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const client = new GoogleGenerativeAI(ai.google);
      const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const resp = await model.generateContent('hi');
      const text = resp.response.text();
      return c.json({ ok: true, data: { ok: true, message: `Connected. Key verified (response length: ${text.length}).` } });
    }

    if (providerId === 'helicone') {
      if (!ai.helicone) return c.json({ ok: true, data: { ok: false, message: 'No Helicone API key configured' } });
      // Verify by hitting Helicone's API
      const resp = await fetch('https://api.helicone.ai/v1/request/query', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ai.helicone}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filter: {}, limit: 1 }),
      });
      if (resp.ok) {
        return c.json({ ok: true, data: { ok: true, message: 'Connected to Helicone API.' } });
      } else {
        return c.json({ ok: true, data: { ok: false, message: `Helicone returned ${resp.status}: ${resp.statusText}` } });
      }
    }

    return c.json({ ok: true, data: { ok: false, message: `Unknown provider: ${providerId}` } });
  } catch (err: any) {
    return c.json({ ok: true, data: { ok: false, message: err.message || 'Connection test failed' } });
  }
});

// ─── Usage ───────────────────────────────────────────────────────────────────

// GET /api/v1/ai/usage — Get usage stats
app.get('/usage', (c) => {
  const usagePath = path.join(getDataDir(), 'ai/usage.json');
  try {
    if (!fs.existsSync(usagePath)) return c.json({ ok: true, data: { total: {}, daily: {} } });
    const usage = JSON.parse(fs.readFileSync(usagePath, 'utf-8'));
    return c.json({ ok: true, data: usage });
  } catch {
    return c.json({ ok: true, data: { total: {}, daily: {} } });
  }
});

// ─── Profiles (personal data — stored in local/gitignored directory) ─────────

function getProfilesPath(): string {
  const localDir = getLocalDataDir();
  const localPath = path.join(localDir, 'profiles.json');
  // Migration: copy from old path if exists but not in local yet
  if (!fs.existsSync(localPath)) {
    const oldPath = path.join(getDataDir(), 'ai/profiles.json');
    if (fs.existsSync(oldPath)) {
      fs.copyFileSync(oldPath, localPath);
    }
  }
  return localPath;
}

// GET /api/v1/ai/profiles — Get all user profiles
app.get('/profiles', (c) => {
  const profilesPath = getProfilesPath();
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
  const profilesPath = getProfilesPath();
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
  const profilesPath = getProfilesPath();
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

    const dir = path.dirname(profilesPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(profilesPath, JSON.stringify(data, null, 2));
    return c.json({ ok: true, data: data.profiles[0] });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

export default app;
