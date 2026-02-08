import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const BASE = '/api/v1';
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

export function ChatSidebar({ isOpen, onToggle, width, onWidthChange }: ChatSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallEvent[]>([]);
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
      fetch(`${BASE}/ai/models`).then(r => r.json()).then(d => {
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

    fetch(`${BASE}/ai/conversations`).then(r => r.json()).then(d => {
      if (d.ok) setConversations(d.data.conversations || []);
    }).catch(() => {});

    return () => clearTimeout(retryTimer);
  }, []);

  // Auto-load persisted conversation on mount
  useEffect(() => {
    if (conversationId && messages.length === 0) {
      fetch(`${BASE}/ai/conversations/${conversationId}`).then(r => r.json()).then(data => {
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
      const response = await fetch(`${BASE}/ai/chat`, {
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
              });

              if (event.type === 'message_complete') {
                // Add complete assistant message (only on message_complete, NOT on done)
                if (accContent) {
                  const assistantMsg: ChatMessage = {
                    id: event.message?.id || `ai-${Date.now()}`,
                    role: 'assistant',
                    content: accContent,
                    timestamp: new Date().toISOString(),
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
      fetch(`${BASE}/ai/conversations`).then(r => r.json()).then(d => {
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
    setShowConvoList(false);
    inputRef.current?.focus();
  };

  // ── Load conversation ──────────────────────────────────────────────────

  const loadConversation = async (id: string) => {
    try {
      const res = await fetch(`${BASE}/ai/conversations/${id}`);
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
      await fetch(`${BASE}/ai/conversations/${id}`, { method: 'DELETE' });
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

      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-text-primary">AI Chat</h3>
          {isStreaming && (
            <span className="text-[9px] bg-accent-blue/15 text-accent-blue px-1.5 py-0.5 rounded animate-pulse">thinking</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Model selector */}
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
          {/* Conversations */}
          <button
            onClick={() => setShowConvoList(!showConvoList)}
            className="text-text-tertiary hover:text-text-secondary p-1 rounded hover:bg-surface-2"
            title="Conversations"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </button>
          {/* New chat */}
          <button
            onClick={startNewConversation}
            className="text-text-tertiary hover:text-text-secondary p-1 rounded hover:bg-surface-2"
            title="New conversation"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          {/* Close */}
          <button
            onClick={onToggle}
            className="text-text-tertiary hover:text-text-secondary p-1 rounded hover:bg-surface-2"
            title="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

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

          {/* Active tool calls */}
          {activeToolCalls.length > 0 && (
            <div className="space-y-1">
              {activeToolCalls.map(tc => (
                <ToolCallPill key={tc.id} toolCall={tc} />
              ))}
            </div>
          )}

          {/* Streaming content */}
          {isStreaming && streamingContent && (
            <div className="bg-surface-2 rounded-lg px-3 py-2">
              <div className="text-xs text-text-secondary prose-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
              </div>
            </div>
          )}

          {isStreaming && !streamingContent && activeToolCalls.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />
              Thinking...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

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
    </div>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-accent-blue/10 border border-accent-blue/20 rounded-lg px-3 py-2 max-w-[90%]">
          <p className="text-xs text-text-primary whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
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
  );
}

// ─── Tool Call Pill ──────────────────────────────────────────────────────────

function ToolCallPill({ toolCall }: { toolCall: ToolCallEvent }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = toolCall.status === 'running' ? (
    <div className="w-2.5 h-2.5 border border-accent-blue border-t-transparent rounded-full animate-spin" />
  ) : toolCall.status === 'error' ? (
    <span className="text-accent-red text-[10px]">x</span>
  ) : (
    <span className="text-status-pass text-[10px]">ok</span>
  );

  return (
    <div className="bg-surface-2/50 border border-border/50 rounded text-[10px]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-surface-2 transition-colors"
      >
        {statusIcon}
        <span className="text-text-secondary font-medium">{toolCall.friendly_name || toolCall.name}</span>
        <span className="text-text-tertiary ml-auto">{expanded ? 'v' : '>'}</span>
      </button>
      {expanded && (
        <div className="px-2 pb-1.5 space-y-1">
          {toolCall.arguments && (
            <pre className="text-[9px] font-mono text-text-tertiary bg-surface-1 rounded p-1.5 overflow-x-auto max-h-24">
              {(() => { try { return JSON.stringify(JSON.parse(toolCall.arguments), null, 2); } catch { return toolCall.arguments; } })()}
            </pre>
          )}
          {toolCall.result && (
            <pre className="text-[9px] font-mono text-text-tertiary bg-surface-1 rounded p-1.5 overflow-x-auto max-h-32">
              {toolCall.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stream Event Handler ────────────────────────────────────────────────────

function handleStreamEvent(
  event: any,
  currentContent: string,
  currentToolCalls: ToolCallEvent[],
  setContent: (c: string) => void,
  setToolCalls: (tc: ToolCallEvent[]) => void,
  setConvoId: (id: string | null) => void,
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
        }
      }
      break;
    case 'error':
      setContent(currentContent + `\n\n**Error:** ${event.error}`);
      break;
  }
}
