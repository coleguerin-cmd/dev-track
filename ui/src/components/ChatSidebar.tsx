import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function getBase() {
  const origin = localStorage.getItem('devtrack-api-origin') || '';
  return `${origin}/api/v1`;
}
const STORAGE_KEY = 'dt-chat-conversation';
const STORAGE_MODEL_KEY = 'dt-chat-model';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  tool_name?: string;
  timestamp: string;
  toolResults?: ToolCallEvent[];
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface ToolCallEvent {
  id: string;
  name: string;
  friendly_name?: string;
  arguments?: string;
  result?: string;
  status?: 'running' | 'complete' | 'error';
}

interface ConversationSummary {
  id: string;
  title: string;
  updated: string;
}

interface SessionEntityChange {
  id: string;
  action: 'created' | 'updated' | 'deleted' | 'resolved' | 'listed';
  entityType: string;
  entityId: string;
  title: string;
  toolName: string;
  timestamp: string;
}

interface AvailableModel {
  id: string;
  provider: string;
  name: string;
  tier: string;
}

// Deduplicate models — only keep one per unique name, preferring the shortest ID (base model)
function deduplicateModels(models: AvailableModel[]): AvailableModel[] {
  const byName = new Map<string, AvailableModel>();
  for (const m of models) {
    // Skip audio/tts/transcribe/search/diarize variants — not useful for chat
    if (/tts|transcribe|audio|diarize|search|codex/.test(m.id)) continue;
    const key = `${m.provider}:${m.name}`;
    const existing = byName.get(key);
    if (!existing || m.id.length < existing.id.length) {
      byName.set(key, m);
    }
  }
  // Sort: Anthropic first, then OpenAI, then Google. Within each, premium > standard > budget
  const tierOrder: Record<string, number> = { premium: 0, standard: 1, budget: 2 };
  const providerOrder: Record<string, number> = { anthropic: 0, openai: 1, google: 2 };
  return Array.from(byName.values()).sort((a, b) => {
    const pDiff = (providerOrder[a.provider] ?? 9) - (providerOrder[b.provider] ?? 9);
    if (pDiff !== 0) return pDiff;
    return (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9);
  });
}

// ─── Chat Sidebar ───────────────────────────────────────────────────────────

interface ChatSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  width: number;
  onWidthChange: (w: number) => void;
}

type SidebarTab = 'chat' | 'activity';

export function ChatSidebar({ isOpen, onToggle, width, onWidthChange }: ChatSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallEvent[]>([]);
  const [sessionChanges, setSessionChanges] = useState<SessionEntityChange[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [allModels, setAllModels] = useState<AvailableModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_MODEL_KEY) || ''; } catch { return ''; }
  });
  const [showConvoList, setShowConvoList] = useState(false);
  const [configured, setConfigured] = useState(false);

  const models = useMemo(() => deduplicateModels(allModels), [allModels]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, activeToolCalls]);

  // Persist conversationId to localStorage
  useEffect(() => {
    try {
      if (conversationId) localStorage.setItem(STORAGE_KEY, conversationId);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, [conversationId]);

  // Persist selected model
  useEffect(() => {
    try {
      if (selectedModel) localStorage.setItem(STORAGE_MODEL_KEY, selectedModel);
      else localStorage.removeItem(STORAGE_MODEL_KEY);
    } catch {}
  }, [selectedModel]);

  // Load models (with retry for discovery race) and conversations on mount
  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout>;

    const fetchModels = (attempt = 0) => {
      fetch(`${getBase()}/ai/models`).then(r => r.json()).then(d => {
        if (d.ok) {
          setConfigured(d.data.configured);
          const modelList = d.data.models || [];
          setAllModels(modelList);
          // If configured but no models yet, discovery might still be running — retry
          if (d.data.configured && modelList.length === 0 && attempt < 5) {
            retryTimer = setTimeout(() => fetchModels(attempt + 1), 1500);
          }
        }
      }).catch(() => {});
    };

    fetchModels();

    fetch(`${getBase()}/ai/conversations`).then(r => r.json()).then(d => {
      if (d.ok) setConversations(d.data.conversations || []);
    }).catch(() => {});

    return () => clearTimeout(retryTimer);
  }, []);

  // Auto-load persisted conversation on mount
  useEffect(() => {
    if (conversationId && messages.length === 0) {
      fetch(`${getBase()}/ai/conversations/${conversationId}`).then(r => r.json()).then(data => {
        if (data.ok) {
          setMessages((data.data.messages || []).filter((m: ChatMessage) => m.role !== 'system' && m.role !== 'tool'));
        } else {
          // Conversation gone — clear
          setConversationId(null);
        }
      }).catch(() => setConversationId(null));
    }
  }, []); // Only on mount

  // Resize handler
  useEffect(() => {
    if (!resizeRef.current) return;
    let startX = 0;
    let startWidth = 0;
    let isDragging = false;

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault(); // Prevent text selection
      e.stopPropagation();
      isDragging = true;
      startX = e.clientX;
      startWidth = width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.body.style.pointerEvents = 'none';
      // Keep resize handle interactive
      if (resizeRef.current) resizeRef.current.style.pointerEvents = 'auto';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      const diff = startX - e.clientX; // Dragging left increases width
      const newWidth = Math.min(700, Math.max(320, startWidth + diff));
      onWidthChange(newWidth);
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.style.pointerEvents = '';
    };

    const el = resizeRef.current;
    el.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [width, onWidthChange]);

  // ── Send message ────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput('');
    setIsStreaming(true);
    setStreamingContent('');
    setActiveToolCalls([]);

    // Add user message to UI
    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await fetch(`${getBase()}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: text,
          model: selectedModel || undefined,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to connect to AI');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accContent = '';
      let finalToolCalls: ToolCallEvent[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              const event = JSON.parse(line.substring(5).trim());
              handleStreamEvent(event, accContent, finalToolCalls, (newContent) => {
                accContent = newContent;
                setStreamingContent(newContent);
              }, (toolCalls) => {
                finalToolCalls = toolCalls;
                setActiveToolCalls([...toolCalls]);
              }, (convoId) => {
                if (convoId) setConversationId(convoId);
              }, (change) => {
                setSessionChanges(prev => [change, ...prev]);
              });

              if (event.type === 'message_complete') {
                // Add complete assistant message with tool results attached
                if (accContent || finalToolCalls.length > 0) {
                  const assistantMsg: ChatMessage = {
                    id: event.message?.id || `ai-${Date.now()}`,
                    role: 'assistant',
                    content: accContent,
                    timestamp: new Date().toISOString(),
                    toolResults: finalToolCalls.length > 0 ? [...finalToolCalls] : undefined,
                  };
                  setMessages(prev => [...prev, assistantMsg]);
                  setStreamingContent('');
                  accContent = ''; // Clear so 'done' event doesn't re-add
                }
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `**Error:** ${err.message || 'Something went wrong'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsStreaming(false);
      setActiveToolCalls([]);
      // Refresh conversation list
      fetch(`${getBase()}/ai/conversations`).then(r => r.json()).then(d => {
        if (d.ok) setConversations(d.data.conversations || []);
      }).catch(() => {});
    }
  }, [input, isStreaming, conversationId, selectedModel]);

  // ── New conversation ────────────────────────────────────────────────────

  const startNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setStreamingContent('');
    setActiveToolCalls([]);
    setSessionChanges([]);
    setShowConvoList(false);
    inputRef.current?.focus();
  };

  // ── Load conversation ──────────────────────────────────────────────────

  const loadConversation = async (id: string) => {
    try {
      const res = await fetch(`${getBase()}/ai/conversations/${id}`);
      const data = await res.json();
      if (data.ok) {
        setConversationId(data.data.id);
        setMessages((data.data.messages || []).filter((m: ChatMessage) => m.role !== 'system' && m.role !== 'tool'));
        setShowConvoList(false);
      }
    } catch {}
  };

  // ── Delete conversation ────────────────────────────────────────────────

  const deleteConversation = async (id: string) => {
    try {
      await fetch(`${getBase()}/ai/conversations/${id}`, { method: 'DELETE' });
      setConversations(prev => prev.filter(c => c.id !== id));
      if (conversationId === id) {
        startNewConversation();
      }
    } catch {}
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-accent-blue text-white shadow-lg hover:bg-accent-blue/90 transition-all flex items-center justify-center"
        title="Open AI Chat"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="flex-shrink-0 border-l border-border bg-surface-1 flex flex-col h-full relative" style={{ width }}>
      {/* Resize handle */}
      <div
        ref={resizeRef}
        className="absolute left-[-2px] top-0 bottom-0 w-[5px] cursor-col-resize hover:bg-accent-blue/40 active:bg-accent-blue/60 transition-colors z-20"
      />

      {/* Header with tabs */}
      <div className="border-b border-border flex-shrink-0">
        <div className="px-3 py-2 flex items-center justify-between">
          {/* Tabs */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setActiveTab('chat')}
              className={`text-[11px] font-medium px-2.5 py-1 rounded transition-colors ${
                activeTab === 'chat' ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              Chat
              {isStreaming && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-accent-blue inline-block animate-pulse" />}
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`text-[11px] font-medium px-2.5 py-1 rounded transition-colors ${
                activeTab === 'activity' ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              Activity
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Chat-specific controls */}
            {activeTab === 'chat' && (
              <>
                {models.length > 0 && (
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="text-[10px] bg-surface-2 border border-border rounded px-1.5 py-0.5 text-text-secondary max-w-[140px]"
                  >
                    <option value="">Auto</option>
                    {['anthropic', 'openai', 'google'].map(provider => {
                      const providerModels = models.filter(m => m.provider === provider);
                      if (providerModels.length === 0) return null;
                      return (
                        <optgroup key={provider} label={provider.charAt(0).toUpperCase() + provider.slice(1)}>
                          {providerModels.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                )}
                <button onClick={() => setShowConvoList(!showConvoList)} className="text-text-tertiary hover:text-text-secondary p-1 rounded hover:bg-surface-2" title="Conversations">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </button>
                <button onClick={startNewConversation} className="text-text-tertiary hover:text-text-secondary p-1 rounded hover:bg-surface-2" title="New conversation">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </>
            )}
            {/* Close */}
            <button onClick={onToggle} className="text-text-tertiary hover:text-text-secondary p-1 rounded hover:bg-surface-2" title="Close">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Activity Log Tab ─── */}
      {activeTab === 'activity' && <ActivityLog />}

      {/* ── Chat Tab ─── */}
      {activeTab === 'chat' && (
        <>
          {/* Conversation list dropdown */}
          {showConvoList && (
            <div className="border-b border-border bg-surface-2 max-h-48 overflow-y-auto">
              {conversations.length === 0 ? (
                <p className="text-xs text-text-tertiary p-3">No conversations yet</p>
              ) : (
                conversations.map(c => (
                  <div
                    key={c.id}
                    className={`flex items-center gap-1 px-3 py-2 text-xs hover:bg-surface-3 transition-colors group ${
                      conversationId === c.id ? 'bg-surface-3 text-text-primary' : 'text-text-secondary'
                    }`}
                  >
                    <button
                      onClick={() => loadConversation(c.id)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="truncate font-medium">{c.title}</p>
                      <p className="text-[9px] text-text-tertiary mt-0.5">
                        {new Date(c.updated).toLocaleDateString()}
                      </p>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
                      className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-accent-red p-0.5 transition-opacity"
                      title="Delete conversation"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Not configured message */}
          {!configured && (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="text-center">
                <p className="text-sm text-text-secondary mb-2">AI not configured</p>
                <p className="text-xs text-text-tertiary">Add API keys in Settings to enable the AI chat.</p>
              </div>
            </div>
          )}

          {/* Messages */}
          {configured && (
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {messages.length === 0 && !isStreaming && (
                <div className="text-center pt-8">
                  <p className="text-sm text-text-secondary mb-1">Ask anything about your project</p>
                  <p className="text-[10px] text-text-tertiary leading-relaxed max-w-[280px] mx-auto">
                    I can read your codebase, manage the backlog, track issues, capture ideas, analyze git history, and help plan your architecture.
                  </p>
                  <div className="mt-4 space-y-1.5">
                    {['What should we work on next?', 'Show me the current backlog', 'Summarize recent changes'].map(q => (
                      <button
                        key={q}
                        onClick={() => { setInput(q); }}
                        className="block w-full text-left text-[11px] text-text-tertiary hover:text-text-secondary px-3 py-1.5 rounded hover:bg-surface-2 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}

              {/* Agent Activity Panel — shows tool calls + thinking state during streaming */}
              {isStreaming && (activeToolCalls.length > 0 || !streamingContent) && (
                <AgentActivityPanel toolCalls={activeToolCalls} isThinking={!streamingContent && activeToolCalls.length === 0} />
              )}

              {/* Streaming content */}
              {isStreaming && streamingContent && (
                <div className="bg-surface-2 rounded-lg px-3 py-2">
                  <div className="text-xs text-text-secondary chat-markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Changes Tray — session-level entity mutations */}
          {sessionChanges.length > 0 && <SessionChangesTray changes={sessionChanges} />}

          {/* Input area */}
          {configured && (
            <div className="border-t border-border p-3 flex-shrink-0">
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Ask about your project..."
                  className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-tertiary resize-none focus:outline-none focus:border-accent-blue/50"
                  rows={2}
                  disabled={isStreaming}
                />
                <button
                  onClick={sendMessage}
                  disabled={isStreaming || !input.trim()}
                  className="self-end px-3 py-2 bg-accent-blue text-white rounded-lg text-xs font-medium hover:bg-accent-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Session Changes Tray (Pillar-style) ─────────────────────────────────────

const ENTITY_ICONS: Record<string, string> = {
  issue: '🐛', idea: '💡', backlog: '📋', 'roadmap item': '📋', epic: '🏔',
  changelog: '📝', 'brain note': '🧠', velocity: '📊', 'project state': '⚙️',
  milestone: '🎯', release: '🚀', session: '📅',
};

const ACTION_COLORS: Record<string, string> = {
  created: 'text-emerald-400',
  updated: 'text-blue-400',
  deleted: 'text-red-400',
  resolved: 'text-violet-400',
};

function SessionChangesTray({ changes }: { changes: SessionEntityChange[] }) {
  const [isOpen, setIsOpen] = useState(true);

  // Group by entity type
  const byType = useMemo(() => {
    const map = new Map<string, SessionEntityChange[]>();
    for (const c of changes) {
      const key = c.entityType;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [changes]);

  const created = changes.filter(c => c.action === 'created').length;
  const updated = changes.filter(c => c.action === 'updated').length;
  const resolved = changes.filter(c => c.action === 'resolved').length;
  const deleted = changes.filter(c => c.action === 'deleted').length;

  const summaryParts: string[] = [];
  if (created) summaryParts.push(`${created} created`);
  if (updated) summaryParts.push(`${updated} updated`);
  if (resolved) summaryParts.push(`${resolved} resolved`);
  if (deleted) summaryParts.push(`${deleted} deleted`);

  return (
    <div className="border-t border-border/60 flex-shrink-0">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-surface-2/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
          <span className="text-[10px] font-medium text-text-secondary">
            {changes.length} change{changes.length !== 1 ? 's' : ''} this session
          </span>
          <span className="text-[9px] text-text-tertiary">{summaryParts.join(' · ')}</span>
        </div>
        <span className={`text-text-tertiary text-[9px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {/* Expanded panel */}
      {isOpen && (
        <div className="max-h-[30vh] overflow-y-auto px-1 pb-1.5">
          {[...byType.entries()].map(([type, items]) => (
            <div key={type}>
              {/* Type header */}
              <div className="flex items-center gap-1.5 px-2 py-0.5">
                <span className="text-[10px]">{ENTITY_ICONS[type] || '📦'}</span>
                <span className="text-[9px] text-text-tertiary uppercase tracking-wider">{type}</span>
                <span className="text-[9px] text-text-tertiary">({items.length})</span>
              </div>
              {/* Change rows */}
              {items.map(c => (
                <div key={c.id} className="flex items-center gap-1.5 px-2 py-1 mx-1 rounded hover:bg-surface-2/40 transition-colors">
                  <span className={`text-[9px] font-medium flex-shrink-0 ${ACTION_COLORS[c.action] || 'text-text-tertiary'}`}>
                    {c.action}
                  </span>
                  {c.entityId && (
                    <span className="text-[8px] font-mono text-text-tertiary flex-shrink-0">{c.entityId}</span>
                  )}
                  <span className="text-[10px] text-text-secondary truncate">{c.title}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Activity Log ────────────────────────────────────────────────────────────

interface ActivityEvent {
  id: string;
  type: string;
  entity_type: string;
  entity_id: string;
  title: string;
  actor: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

const ACTOR_META: Record<string, { label: string; color: string; bgColor: string; icon: string }> = {
  user:       { label: 'You',        color: 'text-accent-blue',   bgColor: 'bg-accent-blue/10',  icon: '👤' },
  system:     { label: 'DevTrack',   color: 'text-accent-purple', bgColor: 'bg-accent-purple/10', icon: '⚡' },
  devtrack:   { label: 'DevTrack AI',color: 'text-accent-purple', bgColor: 'bg-accent-purple/10', icon: '🤖' },
  automation: { label: 'Automation', color: 'text-accent-orange', bgColor: 'bg-accent-orange/10', icon: '⚙️' },
  external:   { label: 'External',   color: 'text-text-tertiary', bgColor: 'bg-surface-3',        icon: '🔗' },
};

const EVENT_TYPE_META: Record<string, { icon: string; verb: string; color: string }> = {
  item_created:          { icon: '➕', verb: 'created',   color: 'bg-emerald-500' },
  item_updated:          { icon: '✏️', verb: 'updated',   color: 'bg-accent-blue' },
  item_completed:        { icon: '✅', verb: 'completed', color: 'bg-emerald-500' },
  item_deleted:          { icon: '🗑️', verb: 'deleted',   color: 'bg-accent-red' },
  issue_opened:          { icon: '🐛', verb: 'opened',    color: 'bg-accent-red' },
  issue_resolved:        { icon: '✅', verb: 'resolved',  color: 'bg-emerald-500' },
  idea_captured:         { icon: '💡', verb: 'captured',  color: 'bg-yellow-500' },
  idea_promoted:         { icon: '🚀', verb: 'promoted',  color: 'bg-accent-blue' },
  changelog_entry:       { icon: '📝', verb: 'shipped',   color: 'bg-accent-blue' },
  system_health_changed: { icon: '⚙️', verb: 'ran',       color: 'bg-accent-purple' },
  session_started:       { icon: '▶️', verb: 'started',   color: 'bg-emerald-500' },
  session_ended:         { icon: '⏹️', verb: 'ended',     color: 'bg-text-tertiary' },
  doc_generated:         { icon: '📄', verb: 'generated', color: 'bg-accent-blue' },
};

function getActorMeta(actor: string) {
  if (actor === 'user' || actor === 'cole') return ACTOR_META.user;
  if (actor === 'system' || actor === 'devtrack' || actor === 'devtrack-ai') return ACTOR_META.system;
  if (actor.startsWith('session-')) return { ...ACTOR_META.system, label: `Session ${actor.split('-')[1]}` };
  if (actor === 'automation' || actor === 'scheduler') return ACTOR_META.automation;
  return ACTOR_META.external;
}

function getEventMeta(type: string) {
  return EVENT_TYPE_META[type] || { icon: '📌', verb: 'changed', color: 'bg-text-tertiary' };
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function groupByDate(events: ActivityEvent[]): { label: string; events: ActivityEvent[] }[] {
  const groups: Map<string, ActivityEvent[]> = new Map();
  for (const e of events) {
    const d = new Date(e.timestamp);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    let label: string;
    if (d.toDateString() === today.toDateString()) label = 'Today';
    else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday';
    else label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(e);
  }
  return Array.from(groups.entries()).map(([label, events]) => ({ label, events }));
}

type ActivityFilter = 'all' | 'user' | 'ai' | 'system';

function ActivityLog() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [entityFilter, setEntityFilter] = useState<string>('');
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${getBase()}/activity?limit=200`);
      const data = await res.json();
      if (data.ok) setEvents(data.data.events);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchEvents();
    // Poll every 15s for live updates
    pollRef.current = setInterval(fetchEvents, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchEvents]);

  const filtered = useMemo(() => {
    let result = events;
    if (filter === 'user') result = result.filter(e => e.actor === 'user' || e.actor === 'cole');
    else if (filter === 'ai') result = result.filter(e => ['system', 'devtrack', 'devtrack-ai'].includes(e.actor) || e.actor.startsWith('session-'));
    else if (filter === 'system') result = result.filter(e => e.actor === 'automation' || e.actor === 'scheduler' || e.type === 'system_health_changed');
    if (entityFilter) result = result.filter(e => e.entity_type === entityFilter);
    return result;
  }, [events, filter, entityFilter]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  const entityTypes = useMemo(() => {
    const types = new Set(events.map(e => e.entity_type));
    return Array.from(types).sort();
  }, [events]);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="animate-pulse flex gap-2.5">
            <div className="w-2 h-2 rounded-full bg-surface-3 mt-1.5 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-surface-3 rounded w-3/4" />
              <div className="h-2 bg-surface-3 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Filters */}
      <div className="px-3 py-2 border-b border-border/50 flex-shrink-0">
        <div className="flex items-center gap-1 mb-1.5">
          {(['all', 'user', 'ai', 'system'] as ActivityFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[10px] px-2 py-0.5 rounded-full transition-colors capitalize ${
                filter === f ? 'bg-accent-blue/15 text-accent-blue font-medium' : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-3'
              }`}
            >
              {f === 'ai' ? 'DevTrack' : f}
            </button>
          ))}
        </div>
        {entityTypes.length > 1 && (
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="text-[10px] bg-surface-2 border border-border rounded px-1.5 py-0.5 text-text-secondary w-full"
          >
            <option value="">All entities</option>
            {entityTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {groups.length === 0 ? (
          <div className="text-center pt-8">
            <p className="text-sm text-text-secondary mb-1">No activity yet</p>
            <p className="text-[10px] text-text-tertiary">Changes to your project will appear here.</p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label} className="mb-4">
              {/* Date header */}
              <div className="sticky top-0 z-10 bg-surface-1 pb-1.5">
                <span className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider">{group.label}</span>
              </div>

              {/* Events */}
              <div className="relative">
                {/* Timeline track */}
                <div className="absolute left-[5px] top-2 bottom-2 w-[1px] bg-border" />

                {group.events.map((event, idx) => {
                  const actorMeta = getActorMeta(event.actor);
                  const eventMeta = getEventMeta(event.type);
                  const isLast = idx === group.events.length - 1;

                  return (
                    <div key={event.id} className={`relative flex gap-2.5 group ${isLast ? '' : 'mb-1'}`}>
                      {/* Timeline dot */}
                      <div className={`relative z-10 w-[11px] h-[11px] rounded-full mt-1 flex-shrink-0 border-2 border-surface-1 ${eventMeta.color}`} />

                      {/* Event card */}
                      <div className="flex-1 pb-2">
                        <div className="rounded-lg px-2.5 py-1.5 hover:bg-surface-2 transition-colors cursor-default">
                          {/* Title */}
                          <p className="text-[11px] text-text-primary leading-snug">
                            {event.title}
                          </p>

                          {/* Meta row */}
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {/* Actor badge */}
                            <span className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full ${actorMeta.bgColor} ${actorMeta.color}`}>
                              <span className="text-[8px]">{actorMeta.icon}</span>
                              {actorMeta.label}
                            </span>

                            {/* Entity type */}
                            <span className="text-[9px] text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded-full">
                              {event.entity_type}
                            </span>

                            {/* Entity ID */}
                            <span className="text-[9px] text-text-tertiary font-mono">
                              {event.entity_id}
                            </span>

                            {/* Timestamp */}
                            <span className="text-[9px] text-text-tertiary ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                              {relativeTime(event.timestamp)}
                            </span>
                          </div>

                          {/* Metadata details (automation duration, etc.) */}
                          {event.metadata && Object.keys(event.metadata).length > 0 && (
                            <div className="mt-1 flex items-center gap-2 flex-wrap">
                              {event.metadata.trigger && (
                                <span className="text-[9px] text-text-tertiary">
                                  trigger: <span className="text-text-secondary">{String(event.metadata.trigger)}</span>
                                </span>
                              )}
                              {event.metadata.duration_seconds && (
                                <span className="text-[9px] text-text-tertiary">
                                  took <span className="text-text-secondary">{String(event.metadata.duration_seconds)}s</span>
                                </span>
                              )}
                              {event.metadata.severity && (
                                <span className={`text-[9px] px-1 py-0.5 rounded ${
                                  event.metadata.severity === 'critical' ? 'bg-accent-red/15 text-accent-red' :
                                  event.metadata.severity === 'high' ? 'bg-accent-orange/15 text-accent-orange' :
                                  'bg-surface-3 text-text-tertiary'
                                }`}>
                                  {String(event.metadata.severity)}
                                </span>
                              )}
                              {event.metadata.horizon && (
                                <span className="text-[9px] text-text-tertiary">
                                  <span className="text-text-secondary">{String(event.metadata.horizon)}</span>
                                </span>
                              )}
                              {event.metadata.size && (
                                <span className="text-[9px] text-text-tertiary">
                                  <span className="text-text-secondary">{String(event.metadata.size)}</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/* Footer stats */}
        {events.length > 0 && (
          <div className="text-center py-3 border-t border-border/50 mt-2">
            <p className="text-[9px] text-text-tertiary">
              {filtered.length} of {events.length} events
              {filter !== 'all' && ` (filtered: ${filter})`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tool Type Icons & Colors ────────────────────────────────────────────────

const TOOL_META: Record<string, { icon: string; color: string; label: string }> = {
  capture_idea:        { icon: '💡', color: 'text-yellow-400', label: 'Captured idea' },
  create_issue:        { icon: '🐛', color: 'text-accent-red', label: 'Created issue' },
  create_backlog_item: { icon: '📋', color: 'text-accent-blue', label: 'Created backlog item' },
  list_ideas:          { icon: '💡', color: 'text-yellow-400', label: 'Listed ideas' },
  list_issues:         { icon: '🐛', color: 'text-accent-red', label: 'Listed issues' },
  list_backlog:        { icon: '📋', color: 'text-accent-blue', label: 'Listed backlog' },
  update_idea:         { icon: '💡', color: 'text-yellow-400', label: 'Updated idea' },
  update_issue:        { icon: '🐛', color: 'text-accent-red', label: 'Updated issue' },
  resolve_issue:       { icon: '✅', color: 'text-status-pass', label: 'Resolved issue' },
  update_backlog_item: { icon: '📋', color: 'text-accent-blue', label: 'Updated item' },
  delete_backlog_item: { icon: '🗑️', color: 'text-text-tertiary', label: 'Deleted item' },
  read_file:           { icon: '📄', color: 'text-text-tertiary', label: 'Read file' },
  search_code:         { icon: '🔍', color: 'text-text-tertiary', label: 'Searched code' },
  git_log:             { icon: '📜', color: 'text-text-tertiary', label: 'Git log' },
  git_diff:            { icon: '📜', color: 'text-text-tertiary', label: 'Git diff' },
};

function getToolMeta(name: string) {
  return TOOL_META[name] || { icon: '⚙️', color: 'text-text-tertiary', label: name.replace(/_/g, ' ') };
}

// ─── Message Bubble ──────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-accent-blue/10 border border-accent-blue/20 rounded-lg px-3 py-2 max-w-[90%]">
          <p className="text-xs text-text-primary whitespace-pre-wrap">{message.content}</p>
          <span className="text-[8px] text-text-tertiary mt-1 block text-right">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Tool results rendered as rich cards */}
      {message.toolResults && message.toolResults.length > 0 && (
        <div className="space-y-1.5">
          {message.toolResults.map(tc => (
            <RichToolCard key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {/* Text content */}
      {message.content && (
        <div className="bg-surface-2 rounded-lg px-3 py-2">
          <div className="text-xs text-text-secondary chat-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                h1: ({ children }) => <h1 className="text-base font-bold text-text-primary mt-3 mb-1.5">{children}</h1>,
                h2: ({ children }) => <h2 className="text-sm font-bold text-text-primary mt-2.5 mb-1">{children}</h2>,
                h3: ({ children }) => <h3 className="text-xs font-semibold text-text-primary mt-2 mb-1">{children}</h3>,
                ul: ({ children }) => <ul className="list-disc list-outside ml-4 mb-2 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-outside ml-4 mb-2 space-y-0.5">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
                code: ({ className, children }) => {
                  if (className?.includes('language-')) {
                    return <code className="block text-[10px] font-mono bg-surface-1 rounded p-2 my-1.5 overflow-x-auto border border-border/50">{children}</code>;
                  }
                  return <code className="text-[10px] font-mono bg-accent-blue/10 text-accent-blue px-1 py-0.5 rounded">{children}</code>;
                },
                pre: ({ children }) => <pre className="my-1.5">{children}</pre>,
                a: ({ href, children }) => <a href={href} className="text-accent-blue underline" target="_blank">{children}</a>,
                blockquote: ({ children }) => <blockquote className="border-l-2 border-accent-blue/30 pl-2 my-1.5 text-text-tertiary italic">{children}</blockquote>,
                hr: () => <hr className="border-border my-2" />,
                table: ({ children }) => <div className="overflow-x-auto my-1.5"><table className="w-full text-[10px]">{children}</table></div>,
                th: ({ children }) => <th className="text-left px-2 py-1 bg-surface-1 border-b border-border font-semibold">{children}</th>,
                td: ({ children }) => <td className="px-2 py-1 border-b border-border/50">{children}</td>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rich Tool Card ──────────────────────────────────────────────────────────

function RichToolCard({ toolCall }: { toolCall: ToolCallEvent }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getToolMeta(toolCall.name);

  let parsed: any = null;
  try { parsed = toolCall.result ? JSON.parse(toolCall.result) : null; } catch {}

  const isCreate = toolCall.name.startsWith('create_') || toolCall.name === 'capture_idea';
  const isList = toolCall.name.startsWith('list_');
  const isUpdate = toolCall.name.startsWith('update_') || toolCall.name === 'resolve_issue';
  const isDuplicate = parsed?.duplicate === true;

  const statusIcon = toolCall.status === 'running' ? (
    <div className="w-3 h-3 border-[1.5px] border-accent-blue border-t-transparent rounded-full animate-spin" />
  ) : toolCall.status === 'error' ? (
    <span className="text-accent-red text-xs">✕</span>
  ) : (
    <span className="text-sm">{meta.icon}</span>
  );

  // ── Create operations: show the created entity as a card ──
  if (isCreate && parsed && !isDuplicate) {
    const entity = parsed.created;
    if (entity) {
      return (
        <div className="border border-border/60 rounded-lg overflow-hidden bg-surface-2/30">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-surface-2/50 transition-colors"
          >
            {statusIcon}
            <span className="text-[10px] font-medium text-text-secondary">{meta.label}</span>
            <span className="text-[9px] text-text-tertiary ml-auto">{expanded ? '▾' : '▸'}</span>
          </button>
          <div className="px-2.5 pb-2">
            <div className="bg-surface-1 border border-border/40 rounded-md p-2.5">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono text-text-tertiary">{entity.id}</span>
                    {entity.severity && <span className={`text-[8px] font-semibold px-1 py-0.5 rounded ${
                      entity.severity === 'critical' ? 'bg-red-500/15 text-red-400' :
                      entity.severity === 'high' ? 'bg-orange-500/15 text-orange-400' :
                      entity.severity === 'medium' ? 'bg-yellow-500/15 text-yellow-400' :
                      'bg-blue-500/15 text-blue-300'
                    }`}>{entity.severity}</span>}
                    {entity.priority && <span className={`text-[8px] font-semibold px-1 py-0.5 rounded ${
                      entity.priority === 'critical' ? 'bg-red-500/15 text-red-400' :
                      entity.priority === 'high' ? 'bg-orange-500/15 text-orange-400' :
                      entity.priority === 'medium' ? 'bg-yellow-500/15 text-yellow-400' :
                      'bg-blue-500/15 text-blue-300'
                    }`}>{entity.priority}</span>}
                    {entity.status && <span className="text-[8px] bg-surface-3 text-text-tertiary px-1 py-0.5 rounded">{entity.status}</span>}
                    {entity.horizon && <span className="text-[8px] bg-accent-blue/10 text-accent-blue px-1 py-0.5 rounded">{entity.horizon}</span>}
                    {entity.size && <span className="text-[8px] bg-surface-3 text-text-tertiary px-1 py-0.5 rounded">{entity.size}</span>}
                  </div>
                  <p className="text-[11px] font-medium text-text-primary mt-1 leading-snug">{entity.title}</p>
                  {entity.description && <p className="text-[10px] text-text-tertiary mt-0.5 line-clamp-2">{entity.description}</p>}
                  {entity.summary && <p className="text-[10px] text-text-tertiary mt-0.5 line-clamp-2">{entity.summary}</p>}
                  {entity.symptoms && <p className="text-[10px] text-text-tertiary mt-0.5 line-clamp-2">{entity.symptoms}</p>}
                </div>
              </div>

              {expanded && (
                <div className="mt-2 pt-2 border-t border-border/30 text-[9px] space-y-1 animate-fade-in">
                  {entity.category && <div><span className="text-text-tertiary">Category:</span> <span className="text-text-secondary">{entity.category}</span></div>}
                  {entity.pros?.length > 0 && (
                    <div><span className="text-status-pass">Pros:</span> <span className="text-text-secondary">{entity.pros.join(' · ')}</span></div>
                  )}
                  {entity.cons?.length > 0 && (
                    <div><span className="text-accent-red">Cons:</span> <span className="text-text-secondary">{entity.cons.join(' · ')}</span></div>
                  )}
                  {entity.open_questions?.length > 0 && (
                    <div><span className="text-accent-blue">Open:</span> <span className="text-text-secondary">{entity.open_questions.join(' · ')}</span></div>
                  )}
                  {entity.root_cause && <div><span className="text-text-tertiary">Root cause:</span> <span className="text-text-secondary">{entity.root_cause}</span></div>}
                  {entity.files?.length > 0 && <div><span className="text-text-tertiary">Files:</span> <span className="text-text-secondary font-mono">{entity.files.join(', ')}</span></div>}
                  {entity.depends_on?.length > 0 && <div><span className="text-text-tertiary">Depends on:</span> <span className="text-text-secondary">{entity.depends_on.join(', ')}</span></div>}
                  {entity.tags?.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-0.5">
                      {entity.tags.map((t: string) => <span key={t} className="bg-surface-3 text-text-tertiary px-1 py-0.5 rounded">{t}</span>)}
                    </div>
                  )}
                  <div className="text-text-tertiary pt-0.5">
                    Created {entity.created || entity.discovered}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }
  }

  // ── Duplicate detected: show the existing entity ──
  if (isDuplicate && parsed?.existing) {
    const entity = parsed.existing;
    return (
      <div className="border border-yellow-500/30 rounded-lg overflow-hidden bg-yellow-500/5">
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          <span className="text-sm">⚠️</span>
          <span className="text-[10px] font-medium text-yellow-400">Duplicate prevented</span>
        </div>
        <div className="px-2.5 pb-2">
          <div className="bg-surface-1 border border-border/40 rounded-md p-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono text-text-tertiary">{entity.id}</span>
              {entity.status && <span className="text-[8px] bg-surface-3 text-text-tertiary px-1 py-0.5 rounded">{entity.status}</span>}
            </div>
            <p className="text-[11px] font-medium text-text-primary mt-1">{entity.title}</p>
            <p className="text-[9px] text-yellow-400/80 mt-1">{parsed.message}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── List operations: show summary + items ──
  if (isList && parsed) {
    const items = parsed.ideas || parsed.issues || parsed.items || [];
    const total = parsed.total || items.length;
    return (
      <div className="border border-border/60 rounded-lg overflow-hidden bg-surface-2/30">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-surface-2/50 transition-colors"
        >
          {statusIcon}
          <span className="text-[10px] font-medium text-text-secondary">{meta.label}</span>
          <span className="text-[9px] font-mono text-text-tertiary">{total} items</span>
          <span className="text-[9px] text-text-tertiary ml-auto">{expanded ? '▾' : '▸'}</span>
        </button>
        {expanded && items.length > 0 && (
          <div className="px-2.5 pb-2 space-y-1 animate-fade-in">
            {items.slice(0, 8).map((item: any, i: number) => (
              <div key={item.id || i} className="flex items-center gap-1.5 bg-surface-1 border border-border/30 rounded px-2 py-1.5">
                <span className="text-[8px] font-mono text-text-tertiary flex-shrink-0">{item.id}</span>
                <span className="text-[10px] text-text-secondary truncate flex-1">{item.title}</span>
                {item.status && <span className={`text-[8px] px-1 py-0.5 rounded flex-shrink-0 ${
                  item.status === 'open' || item.status === 'captured' ? 'bg-accent-blue/10 text-accent-blue' :
                  item.status === 'in_progress' || item.status === 'exploring' ? 'bg-yellow-500/10 text-yellow-400' :
                  item.status === 'resolved' || item.status === 'completed' || item.status === 'promoted' ? 'bg-status-pass/10 text-status-pass' :
                  'bg-surface-3 text-text-tertiary'
                }`}>{item.status}</span>}
                {item.severity && <span className={`text-[8px] px-1 py-0.5 rounded flex-shrink-0 ${
                  item.severity === 'critical' ? 'bg-red-500/15 text-red-400' :
                  item.severity === 'high' ? 'bg-orange-500/15 text-orange-400' :
                  'bg-surface-3 text-text-tertiary'
                }`}>{item.severity}</span>}
              </div>
            ))}
            {items.length > 8 && (
              <p className="text-[9px] text-text-tertiary text-center py-0.5">+{items.length - 8} more</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Update/resolve: show what changed ──
  if (isUpdate && parsed) {
    const entity = parsed.updated || parsed.resolved;
    if (entity) {
      return (
        <div className="border border-border/60 rounded-lg overflow-hidden bg-surface-2/30">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-surface-2/50 transition-colors"
          >
            {statusIcon}
            <span className="text-[10px] font-medium text-text-secondary">{meta.label}</span>
            <span className="text-[9px] font-mono text-text-tertiary">{entity.id}</span>
            <span className="text-[9px] text-text-tertiary ml-auto">{expanded ? '▾' : '▸'}</span>
          </button>
          {expanded && (
            <div className="px-2.5 pb-2 animate-fade-in">
              <div className="bg-surface-1 border border-border/30 rounded px-2 py-1.5">
                <p className="text-[10px] font-medium text-text-primary">{entity.title}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {entity.status && <span className="text-[8px] bg-surface-3 text-text-tertiary px-1 py-0.5 rounded">{entity.status}</span>}
                  {entity.resolution && <span className="text-[9px] text-status-pass">{entity.resolution}</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
  }

  // ── Default: minimal pill for other tools ──
  return (
    <div className="border border-border/40 rounded-lg bg-surface-2/20">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-surface-2/50 transition-colors"
      >
        {statusIcon}
        <span className="text-[10px] font-medium text-text-secondary">{toolCall.friendly_name || meta.label}</span>
        <span className="text-[9px] text-text-tertiary ml-auto">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="px-2.5 pb-2 space-y-1 animate-fade-in">
          {toolCall.arguments && (
            <pre className="text-[9px] font-mono text-text-tertiary bg-surface-1 rounded p-1.5 overflow-x-auto max-h-24">
              {(() => { try { return JSON.stringify(JSON.parse(toolCall.arguments), null, 2); } catch { return toolCall.arguments; } })()}
            </pre>
          )}
          {toolCall.result && (
            <pre className="text-[9px] font-mono text-text-tertiary bg-surface-1 rounded p-1.5 overflow-x-auto max-h-32">
              {(() => { try { return JSON.stringify(JSON.parse(toolCall.result), null, 2); } catch { return toolCall.result; } })()}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── Agent Activity Panel (streaming) ─────────────────────────────────────────

function getToolContext(tc: ToolCallEvent): string {
  // Extract meaningful context from tool name and arguments
  try {
    const args = tc.arguments ? JSON.parse(tc.arguments) : {};
    if (tc.name === 'read_project_file' || tc.name === 'read_file') return args.path || args.file || '';
    if (tc.name === 'search_code' || tc.name === 'search_codebase') return `"${args.query || args.pattern || ''}"`;
    if (tc.name === 'git_status' || tc.name === 'git_diff' || tc.name === 'git_log') return '';
    if (tc.name?.startsWith('list_')) return '';
    if (tc.name?.startsWith('create_') || tc.name === 'capture_idea') return args.title || '';
    if (tc.name?.startsWith('update_') || tc.name === 'resolve_issue') return args.id || '';
    if (tc.name === 'add_changelog_entry') return args.title || '';
    if (tc.name === 'add_brain_note') return args.content?.substring(0, 60) || '';
    return args.id || args.title || '';
  } catch { return ''; }
}

function getToolStatusText(tc: ToolCallEvent): string {
  const name = tc.name || '';
  if (name.startsWith('read_') || name === 'search_code' || name === 'search_codebase') return 'Reading';
  if (name.startsWith('list_')) return 'Querying';
  if (name.startsWith('create_') || name === 'capture_idea' || name === 'add_changelog_entry' || name === 'add_brain_note') return 'Creating';
  if (name.startsWith('update_') || name === 'resolve_issue') return 'Updating';
  if (name.startsWith('delete_')) return 'Deleting';
  if (name.startsWith('git_')) return 'Checking';
  return 'Running';
}

function AgentActivityPanel({ toolCalls, isThinking }: { toolCalls: ToolCallEvent[]; isThinking: boolean }) {
  const completed = toolCalls.filter(tc => tc.status === 'complete');
  const running = toolCalls.filter(tc => tc.status === 'running');
  const errored = toolCalls.filter(tc => tc.status === 'error');

  // Determine the current phase
  const currentAction = running.length > 0
    ? `${getToolStatusText(running[0])}...`
    : isThinking ? 'Thinking...' : 'Processing...';

  return (
    <div className="border border-border/40 rounded-lg bg-surface-2/20 overflow-hidden">
      {/* Status header */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border/20">
        <div className="w-3 h-3 border-[1.5px] border-accent-blue border-t-transparent rounded-full animate-spin" />
        <span className="text-[10px] font-medium text-text-secondary">{currentAction}</span>
        {toolCalls.length > 0 && (
          <span className="text-[9px] text-text-tertiary ml-auto">
            Step {completed.length + (running.length > 0 ? 1 : 0)}{running.length > 0 ? ` of ${toolCalls.length}+` : ''}
          </span>
        )}
      </div>

      {/* Tool call list */}
      {toolCalls.length > 0 && (
        <div className="px-1.5 py-1 space-y-0.5 max-h-48 overflow-y-auto">
          {toolCalls.map(tc => {
            const meta = getToolMeta(tc.name);
            const context = getToolContext(tc);
            const isRunning = tc.status === 'running';
            const isError = tc.status === 'error';
            const isComplete = tc.status === 'complete';

            return (
              <div key={tc.id} className={`flex items-center gap-1.5 px-1.5 py-1 rounded transition-colors ${
                isRunning ? 'bg-accent-blue/5' : ''
              }`}>
                {/* Status icon */}
                {isRunning ? (
                  <div className="w-3 h-3 border-[1.5px] border-accent-blue border-t-transparent rounded-full animate-spin flex-shrink-0" />
                ) : isError ? (
                  <span className="text-accent-red text-[10px] flex-shrink-0 w-3 text-center">✕</span>
                ) : isComplete ? (
                  <span className="text-emerald-400 text-[10px] flex-shrink-0 w-3 text-center">✓</span>
                ) : (
                  <span className="text-text-tertiary text-[10px] flex-shrink-0 w-3 text-center">·</span>
                )}

                {/* Tool label */}
                <span className={`text-[10px] flex-shrink-0 ${isRunning ? 'text-text-secondary font-medium' : 'text-text-tertiary'}`}>
                  {tc.friendly_name || meta.label}
                </span>

                {/* Context (file path, query, entity id) */}
                {context && (
                  <span className={`text-[9px] font-mono truncate ${isRunning ? 'text-accent-blue/70' : 'text-text-tertiary/60'}`}>
                    {context}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Stream Event Handler ────────────────────────────────────────────────────

/** Extract entity changes from a completed tool call result */
function extractSessionChange(tc: { name: string; arguments?: string; result?: string }): SessionEntityChange | null {
  const name = tc.name || '';
  // Only track mutating operations
  const isCreate = name.startsWith('create_') || name === 'capture_idea' || name === 'add_changelog_entry' || name === 'add_brain_note';
  const isUpdate = name.startsWith('update_') || name === 'resolve_issue' || name === 'publish_release';
  const isDelete = name.startsWith('delete_');
  if (!isCreate && !isUpdate && !isDelete) return null;

  try {
    const result = tc.result ? JSON.parse(tc.result) : {};
    if (result.duplicate) return null; // Dedup prevented — not a real change

    const entity = result.created || result.updated || result.resolved || result.deleted || result.published;
    if (!entity) return null;

    const action = isCreate ? 'created' : isDelete ? 'deleted' : name === 'resolve_issue' ? 'resolved' : 'updated';
    const entityType = name.replace(/^(create_|update_|delete_|resolve_|publish_|add_|capture_)/, '').replace(/_/g, ' ');

    return {
      id: `sc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      action,
      entityType,
      entityId: entity.id || '',
      title: entity.title || entity.content?.substring(0, 60) || entity.id || 'Unknown',
      toolName: name,
      timestamp: new Date().toISOString(),
    };
  } catch { return null; }
}

function handleStreamEvent(
  event: any,
  currentContent: string,
  currentToolCalls: ToolCallEvent[],
  setContent: (c: string) => void,
  setToolCalls: (tc: ToolCallEvent[]) => void,
  setConvoId: (id: string | null) => void,
  addSessionChange?: (change: SessionEntityChange) => void,
) {
  switch (event.type) {
    case 'status':
      if (event.content === 'new_conversation' && event.message?.id) {
        setConvoId(event.message.id);
      }
      break;
    case 'text_delta':
      setContent(currentContent + (event.content || ''));
      break;
    case 'tool_call_start':
      if (event.tool_call) {
        currentToolCalls.push({
          id: event.tool_call.id,
          name: event.tool_call.name,
          friendly_name: event.tool_call.friendly_name,
          arguments: event.tool_call.arguments,
          status: 'running',
        });
        setToolCalls(currentToolCalls);
      }
      break;
    case 'tool_call_result':
      if (event.tool_call) {
        const idx = currentToolCalls.findIndex(tc => tc.id === event.tool_call.id);
        if (idx >= 0) {
          currentToolCalls[idx] = {
            ...currentToolCalls[idx],
            arguments: event.tool_call.arguments,
            result: event.tool_call.result,
            status: 'complete',
          };
          setToolCalls(currentToolCalls);

          // Extract session change for the tray
          if (addSessionChange) {
            const change = extractSessionChange({
              name: currentToolCalls[idx].name,
              arguments: event.tool_call.arguments,
              result: event.tool_call.result,
            });
            if (change) addSessionChange(change);
          }
        }
      }
      break;
    case 'error':
      setContent(currentContent + `\n\n**Error:** ${event.error}`);
      break;
  }
}
