/**
 * ChatService — Multi-turn agent loop with tool calling and streaming.
 * 
 * Manages conversation threads, injects context (project state, user profile,
 * codebase summary), runs the agent loop (call AI → execute tools → repeat),
 * and persists conversations to disk.
 * 
 * Following Pillar's runtime.ts pattern: parallel tool execution, max iterations,
 * full transcript tracking.
 */

import fs from 'fs';
import path from 'path';
import { getAIService, type AIMessage, type AIToolCall, type StreamEvent } from './service.js';
import { TOOL_DEFINITIONS, TOOL_LABELS, executeTool } from './tools.js';
import { getStore } from '../store.js';
import type { TaskType } from './router.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string | null;      // Override model for this conversation
  created: string;
  updated: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: AIToolCall[];
  tool_call_id?: string;
  tool_name?: string;
  timestamp: string;
}

export interface ChatStreamEvent {
  type: 'status' | 'text_delta' | 'tool_call_start' | 'tool_call_progress' | 'tool_call_result' | 'message_complete' | 'error' | 'done';
  content?: string;
  tool_call?: {
    id: string;
    name: string;
    friendly_name?: string;
    arguments?: string;
    result?: string;
    status?: 'running' | 'complete' | 'error';
  };
  message?: ChatMessage;
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  model?: string;
  error?: string;
}

// ─── Conversation Storage ────────────────────────────────────────────────────

const CONVO_DIR = path.resolve(process.cwd(), 'data/ai/conversations');

function ensureConvoDir() {
  if (!fs.existsSync(CONVO_DIR)) fs.mkdirSync(CONVO_DIR, { recursive: true });
}

export function listConversations(): { id: string; title: string; updated: string }[] {
  ensureConvoDir();
  const files = fs.readdirSync(CONVO_DIR).filter(f => f.endsWith('.json'));
  const convos: { id: string; title: string; updated: string }[] = [];

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(CONVO_DIR, file), 'utf-8'));
      convos.push({ id: data.id, title: data.title, updated: data.updated });
    } catch {}
  }

  return convos.sort((a, b) => b.updated.localeCompare(a.updated));
}

export function loadConversation(id: string): Conversation | null {
  try {
    const filePath = path.join(CONVO_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return null; }
}

export function saveConversation(convo: Conversation): void {
  ensureConvoDir();
  convo.updated = new Date().toISOString();
  fs.writeFileSync(path.join(CONVO_DIR, `${convo.id}.json`), JSON.stringify(convo, null, 2));
}

export function deleteConversation(id: string): boolean {
  try {
    const filePath = path.join(CONVO_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); return true; }
  } catch {}
  return false;
}

function createConversation(title?: string): Conversation {
  const id = `chat-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  return {
    id,
    title: title || 'New conversation',
    messages: [],
    model: null,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

// ─── System Prompt ───────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const store = getStore();
  const status = store.getQuickStatusLine();

  // Load user profile
  let profileBlock = '';
  try {
    const profilesPath = path.resolve(process.cwd(), 'data/ai/profiles.json');
    if (fs.existsSync(profilesPath)) {
      const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));
      const user = profiles.profiles?.[0];
      if (user) {
        profileBlock = `\n## User Profile\nName: ${user.name} | Role: ${user.role} | Technical level: ${user.technical_level}/10\n${user.ai_instructions}\n`;
      }
    }
  } catch {}

  // Load recent brain notes
  let notesBlock = '';
  try {
    const notesPath = path.resolve(process.cwd(), 'data/brain/notes.json');
    if (fs.existsSync(notesPath)) {
      const data = JSON.parse(fs.readFileSync(notesPath, 'utf-8'));
      const recent = (data.notes || []).slice(-5);
      if (recent.length > 0) {
        notesBlock = '\n## Recent AI Notes\n' + recent.map((n: any) => `- [${n.type}] ${n.content.substring(0, 150)}`).join('\n') + '\n';
      }
    }
  } catch {}

  return `You are the dev-track AI assistant — an intelligent project copilot that helps manage, plan, and understand software projects.

## Current Status
${status}

${profileBlock}
${notesBlock}

## Your Capabilities
You have FULL access to the dev-track project management system through tools:
- **Backlog**: List, create, update items. Move between horizons (now/next/later).
- **Issues**: Track bugs, create issues, resolve them.
- **Changelog**: Record what shipped.
- **Ideas**: Capture, explore, and promote ideas.
- **Codebase**: Search code, examine files, get module architecture, read any project file.
- **Git**: Check status, read diffs, view commit history.
- **Docs**: Read design documents and architecture specs.
- **Brain**: Read and write persistent notes, observations, and decisions.
- **Session & Metrics**: View session history and velocity data.

## Behavior
- Be direct, specific, and action-oriented. When the user discusses something that should be tracked, use your tools to track it.
- Use markdown formatting in your responses: headers, code blocks, lists, bold text.
- When discussing architecture or planning, be thorough and think in systems.
- Proactively use tools to get context before answering questions about the project.
- When the user makes a decision, capture it (brain note or backlog item).
- Show your reasoning. The user likes to see how you think.
- You can read any file in the project — use read_project_file for source code examination.
- Bias toward action: if something should be created/updated, do it and tell the user what you did.`;
}

// ─── Agent Loop ──────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 12;

export async function* runChat(
  conversationId: string | null,
  userMessage: string,
  modelOverride?: string,
): AsyncGenerator<ChatStreamEvent> {
  const aiService = getAIService();

  if (!aiService.isConfigured()) {
    yield { type: 'error', error: 'No AI providers configured. Add API keys in Settings → AI.' };
    return;
  }

  // Wait for model discovery if it hasn't completed yet
  await aiService.waitForReady(5000);

  // Load or create conversation
  let convo = conversationId ? loadConversation(conversationId) : null;
  if (!convo) {
    convo = createConversation();
    yield { type: 'status', content: 'new_conversation', message: { id: convo.id, role: 'system', content: '', timestamp: '' } as any };
  }

  // Add user message
  const userMsg: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
  };
  convo.messages.push(userMsg);

  // Auto-title from first message
  if (convo.messages.filter(m => m.role === 'user').length === 1) {
    convo.title = userMessage.substring(0, 80) + (userMessage.length > 80 ? '...' : '');
  }

  // Build AI messages from conversation history
  const systemPrompt = buildSystemPrompt();
  const aiMessages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...convo.messages.map(m => ({
      role: m.role as AIMessage['role'],
      content: m.content,
      tool_call_id: m.tool_call_id,
      tool_calls: m.tool_calls,
    })),
  ];

  const model = modelOverride || convo.model || undefined;
  const task: TaskType = 'chat';

  yield { type: 'status', content: 'thinking' };

  // Agent loop — call AI, execute tools, repeat
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let fullContent = '';
    let toolCalls: AIToolCall[] = [];
    let usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
    let resolvedModel = '';

    // Stream the AI response
    try {
      const stream = aiService.stream(aiMessages, {
        task,
        model,
        tools: TOOL_DEFINITIONS,
        max_tokens: 4096,
      });

      for await (const event of stream) {
        switch (event.type) {
          case 'text_delta':
            fullContent += event.content || '';
            yield { type: 'text_delta', content: event.content };
            break;
          case 'tool_call_start':
            if (event.tool_call) {
              const tc = event.tool_call as AIToolCall;
              toolCalls.push(tc);
              yield {
                type: 'tool_call_start',
                tool_call: {
                  id: tc.id,
                  name: tc.function.name,
                  friendly_name: TOOL_LABELS[tc.function.name] || tc.function.name,
                  status: 'running',
                },
              };
            }
            break;
          case 'tool_call_delta':
            // Update the last tool call's arguments
            if (event.tool_call && toolCalls.length > 0) {
              const lastTc = toolCalls[toolCalls.length - 1];
              if (lastTc.id === event.tool_call.id) {
                lastTc.function.arguments = event.tool_call.function?.arguments || lastTc.function.arguments;
              }
            }
            break;
          case 'tool_call_end':
            if (event.tool_call) {
              const tc = event.tool_call as AIToolCall;
              // Update the matching tool call
              const idx = toolCalls.findIndex(t => t.id === tc.id);
              if (idx >= 0) toolCalls[idx] = tc;
            }
            break;
          case 'done':
            usage = event.usage || usage;
            resolvedModel = event.model || '';
            break;
          case 'error':
            yield { type: 'error', error: event.error };
            return;
        }
      }
    } catch (err: any) {
      yield { type: 'error', error: err.message || 'AI request failed' };
      return;
    }

    // If no tool calls, we're done — save and return the assistant message
    if (toolCalls.length === 0) {
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: fullContent,
        timestamp: new Date().toISOString(),
      };
      convo.messages.push(assistantMsg);
      saveConversation(convo);

      yield {
        type: 'message_complete',
        message: assistantMsg,
        model: resolvedModel,
        usage,
      };
      yield { type: 'done', model: resolvedModel, usage };
      return;
    }

    // Tool calls — execute them and loop
    const assistantMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: fullContent,
      tool_calls: toolCalls,
      timestamp: new Date().toISOString(),
    };
    convo.messages.push(assistantMsg);
    aiMessages.push({
      role: 'assistant',
      content: fullContent,
      tool_calls: toolCalls,
    });

    // Execute all tool calls (in parallel when possible)
    const toolPromises = toolCalls.map(async (tc) => {
      let args: Record<string, any> = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}

      yield_tool_progress(tc);
      const result = await executeTool(tc.function.name, args);

      return { tc, result, args };
    });

    // Can't actually yield from inside Promise.all, so execute sequentially with yields
    for (const tc of toolCalls) {
      let args: Record<string, any> = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}

      const result = await executeTool(tc.function.name, args);

      // Emit tool result event
      yield {
        type: 'tool_call_result',
        tool_call: {
          id: tc.id,
          name: tc.function.name,
          friendly_name: TOOL_LABELS[tc.function.name] || tc.function.name,
          arguments: JSON.stringify(args),
          result: result.substring(0, 500) + (result.length > 500 ? '...' : ''),
          status: 'complete',
        },
      };

      // Add tool result to conversation
      const toolMsg: ChatMessage = {
        id: `msg-${Date.now()}-${tc.id}`,
        role: 'tool',
        content: result,
        tool_call_id: tc.id,
        tool_name: tc.function.name,
        timestamp: new Date().toISOString(),
      };
      convo.messages.push(toolMsg);
      aiMessages.push({
        role: 'tool',
        content: result,
        tool_call_id: tc.id,
      });
    }

    // Save intermediate state
    saveConversation(convo);

    yield { type: 'status', content: 'thinking' };
    // Loop continues — AI will process tool results and either respond or call more tools
  }

  // Hit max iterations
  yield { type: 'error', error: `Agent loop hit maximum iterations (${MAX_ITERATIONS}). The conversation is saved.` };
  saveConversation(convo);
}

// Helper that we can't actually use inside the loop (keeping for reference)
function yield_tool_progress(_tc: AIToolCall) {
  // This would be called if we had a way to yield from inside Promise.all
  // For now, we execute sequentially and yield directly
}
