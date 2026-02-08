import { useEffect, useState, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, BookOpen, Code, RefreshCw, Sparkles, FolderOpen, Play, Loader2, CheckCircle, Clock } from 'lucide-react';
import * as api from '../api/client';

const BASE = '/api/v1';

interface DocEntry {
  id: string;
  title: string;
  type: string;
  systems: string[];
  auto_generated: boolean;
  last_generated: string | null;
  author: string;
  status: string;
  tags: string[];
  created: string;
  updated: string;
}

interface DesignDoc {
  filename: string;
  title: string;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

type DocSource = 'wiki' | 'design';

function extractToc(markdown: string): TocItem[] {
  const allItems: TocItem[] = [];
  const lines = markdown.split('\n');
  let insideCodeBlock = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      insideCodeBlock = !insideCodeBlock;
      continue;
    }
    if (insideCodeBlock) continue;

    const match = line.match(/^(#{1,4})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      allItems.push({ id, text, level });
    }
  }

  if (allItems.length > 15) {
    return allItems.filter(item => item.level <= 2);
  }
  return allItems;
}

// Format filename as title: "ENTITY-MODEL-V2.md" → "Entity Model V2"
function formatDesignTitle(filename: string): string {
  return filename
    .replace(/\.md$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bReadme\b/i, 'README')
    .replace(/\bSpec\b/i, 'SPEC')
    .replace(/\bV(\d)/g, 'v$1');
}

// Group registry docs by category
function groupDocs(docs: DocEntry[]): Record<string, DocEntry[]> {
  const groups: Record<string, DocEntry[]> = {};
  
  for (const doc of docs) {
    let category = 'Other';
    if (doc.type === 'wiki') category = 'Wiki';
    else if (doc.id === 'system-overview' || doc.id === 'getting-started' || doc.id === 'data-model-reference' || doc.id === 'api-reference') category = 'Guides';
    else if (doc.id.startsWith('system-')) category = 'Systems';
    else if (doc.type === 'auto-generated' && !doc.id.startsWith('system-')) category = 'Guides';
    else if (doc.type === 'design') category = 'Design Docs';
    else if (doc.type === 'decision' || doc.type === 'adr') category = 'Decisions';
    else category = 'Guides';
    
    if (!groups[category]) groups[category] = [];
    groups[category].push(doc);
  }

  const order = ['Guides', 'Systems', 'Wiki', 'Design Docs', 'Decisions', 'Other'];
  const sorted: Record<string, DocEntry[]> = {};
  for (const key of order) {
    if (groups[key]) sorted[key] = groups[key];
  }
  return sorted;
}

const categoryIcons: Record<string, typeof FileText> = {
  'Guides': BookOpen,
  'Systems': Code,
  'Design Docs': FileText,
  'Decisions': FileText,
  'Wiki': FileText,
  'Other': FileText,
};

export function Docs() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [designDocs, setDesignDocs] = useState<DesignDoc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<DocSource>('wiki');
  const [content, setContent] = useState('');
  const [activeSection, setActiveSection] = useState('');
  const [loading, setLoading] = useState(true);
  const [docsAction, setDocsAction] = useState<'idle' | 'initializing' | 'updating'>('idle');
  const [genProgress, setGenProgress] = useState<{ docs_total: number; docs_completed: number; current_doc: string | null; errors: string[]; total_cost: number } | null>(null);

  // Check if docs have been initialized (have content)
  const isInitialized = useMemo(() => docs.length > 0, [docs]);

  // Fetch all docs from registry + design docs
  useEffect(() => {
    Promise.all([
      api.docs.list().then((d: any) => d?.docs || []),
      api.docs.listDesigns().catch(() => ({ files: [] })).then((d: any) => d?.files || []),
    ]).then(([docList, designFiles]) => {
      setDocs(docList);
      setDesignDocs(
        (designFiles as string[]).map((f: string) => ({
          filename: f,
          title: formatDesignTitle(f),
        }))
      );
      // Auto-select first doc
      if (docList.length > 0 && !selectedId) {
        const preferred = docList.find((doc: DocEntry) => doc.id === 'system-overview')
          || docList.find((doc: DocEntry) => doc.id === 'getting-started')
          || docList[0];
        setSelectedId(preferred.id);
        setSelectedSource('wiki');
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Fetch content when selection changes
  useEffect(() => {
    if (selectedId) {
      setContent('');
      if (selectedSource === 'wiki') {
        api.docs.get(selectedId).then((d: any) => {
          setContent(d?.content || '*No content yet. Click "Update Docs" to generate content for this page.*');
          setActiveSection('');
          const contentEl = document.getElementById('docs-content');
          if (contentEl) contentEl.scrollTo(0, 0);
        }).catch(() => setContent('Failed to load document.'));
      } else {
        // Design doc
        api.docs.getDesign(selectedId).then((d: any) => {
          setContent(d?.content || '*No content.*');
          setActiveSection('');
          const contentEl = document.getElementById('docs-content');
          if (contentEl) contentEl.scrollTo(0, 0);
        }).catch(() => setContent('Failed to load design document.'));
      }
    }
  }, [selectedId, selectedSource]);

  const grouped = useMemo(() => groupDocs(docs), [docs]);
  const selectedDoc = selectedSource === 'wiki' ? docs.find(d => d.id === selectedId) : null;
  const selectedDesign = selectedSource === 'design' ? designDocs.find(d => d.filename === selectedId) : null;
  const toc = useMemo(() => extractToc(content), [content]);

  const scrollToSection = useCallback((id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    const container = document.getElementById('docs-content');
    if (el && container) {
      const offset = el.offsetTop - container.offsetTop - 20;
      container.scrollTo({ top: offset, behavior: 'smooth' });
    }
  }, []);

  // Poll generation status when running
  useEffect(() => {
    if (docsAction === 'idle') return;
    const poll = setInterval(async () => {
      try {
        const status = await api.docs.generateStatus();
        setGenProgress(status);
        // Refresh docs list to see updates
        const d = await api.docs.list();
        setDocs(d?.docs || []);
        // Check if done
        if (!status?.running) {
          setDocsAction('idle');
          setGenProgress(null);
          clearInterval(poll);
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(poll);
  }, [docsAction]);

  const handleDocsAction = async (action: 'initialize' | 'update') => {
    setDocsAction(action === 'initialize' ? 'initializing' : 'updating');
    try {
      await fetch(`${BASE}/docs/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: action }),
      });
    } catch {
      setDocsAction('idle');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] overflow-hidden -mx-6 -mt-2">
      {/* Top header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-text-primary">Documentation</h2>
          <span className="text-[10px] text-text-tertiary">
            {docs.length} pages{designDocs.length > 0 ? ` · ${designDocs.length} design docs` : ''}
          </span>
          {docs.some(d => d.auto_generated) && (
            <span className="flex items-center gap-1 text-[9px] bg-accent-blue/10 text-accent-blue px-1.5 py-0.5 rounded">
              <Sparkles size={9} />
              AI-generated
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {docsAction !== 'idle' ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[10px] text-accent-blue">
                <Loader2 size={12} className="animate-spin" />
                {docsAction === 'initializing' ? 'Initializing docs' : 'Updating docs'}
                {genProgress && genProgress.docs_total > 0 && (
                  <span className="text-text-tertiary">
                    {genProgress.docs_completed}/{genProgress.docs_total}
                    {genProgress.current_doc && ` — ${genProgress.current_doc}`}
                  </span>
                )}
              </span>
              {genProgress && genProgress.docs_total > 0 && (
                <div className="w-20 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-blue rounded-full transition-all duration-500"
                    style={{ width: `${Math.round((genProgress.docs_completed / genProgress.docs_total) * 100)}%` }}
                  />
                </div>
              )}
              {genProgress && genProgress.total_cost > 0 && (
                <span className="text-[9px] text-text-tertiary">${genProgress.total_cost.toFixed(2)}</span>
              )}
            </div>
          ) : (
            <>
              <button
                onClick={() => {
                  if (confirm('Update Docs: Refresh stale pages with Sonnet (~$3-5). New pages will be created for any missing systems. Continue?')) {
                    handleDocsAction('update');
                  }
                }}
                className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded bg-surface-3 text-text-secondary hover:bg-surface-4 hover:text-text-primary transition-colors"
              >
                <RefreshCw size={10} />
                Update Docs
              </button>
              <button
                onClick={() => {
                  if (confirm('Reinitialize Docs: Full deep scan with Opus 4.5 (~$15-20). Regenerates ALL documentation from scratch. This costs real money. Continue?')) {
                    handleDocsAction('initialize');
                  }
                }}
                className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded bg-surface-3 text-text-secondary hover:bg-surface-4 hover:text-text-primary transition-colors"
              >
                <Sparkles size={10} />
                Reinitialize
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — doc nav + ToC */}
        <div className="w-60 flex-shrink-0 border-r border-border overflow-y-auto px-3 py-4">
          {loading && (
            <p className="text-xs text-text-tertiary px-2">Loading docs...</p>
          )}

          {!loading && docs.length === 0 && designDocs.length === 0 && (
            <div className="px-2 py-4 text-center">
              <FileText size={24} className="mx-auto mb-2 text-text-tertiary" />
              <p className="text-xs text-text-tertiary mb-2">No docs yet.</p>
              <p className="text-[10px] text-text-tertiary">Click "Initialize Docs" to generate project documentation from your codebase.</p>
            </div>
          )}

          {/* Wiki docs grouped by category */}
          {Object.entries(grouped).map(([category, categoryDocs]) => {
            const Icon = categoryIcons[category] || FileText;
            return (
              <div key={category} className="mb-4">
                <h3 className="flex items-center gap-1.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5 px-2">
                  <Icon size={10} />
                  {category}
                </h3>
                <div className="space-y-0.5">
                  {categoryDocs.map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => { setSelectedId(doc.id); setSelectedSource('wiki'); }}
                      className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                        selectedId === doc.id && selectedSource === 'wiki'
                          ? 'bg-surface-3 text-text-primary font-medium'
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                      }`}
                      title={doc.title}
                    >
                      <span className="block truncate">{doc.title.replace(/^System:\s*/, '')}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Design docs section */}
          {designDocs.length > 0 && (
            <div className="mb-4">
              <h3 className="flex items-center gap-1.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5 px-2">
                <FolderOpen size={10} />
                Design Docs
              </h3>
              <div className="space-y-0.5">
                {designDocs.map(doc => (
                  <button
                    key={doc.filename}
                    onClick={() => { setSelectedId(doc.filename); setSelectedSource('design'); }}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      selectedId === doc.filename && selectedSource === 'design'
                        ? 'bg-surface-3 text-text-primary font-medium'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                    }`}
                    title={doc.title}
                  >
                    <span className="block truncate">{doc.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Table of Contents for selected doc */}
          {toc.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <h3 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5 px-2">On This Page</h3>
              <nav className="space-y-0.5">
                {toc.map(item => (
                  <button
                    key={item.id}
                    onClick={() => scrollToSection(item.id)}
                    className={`w-full text-left text-[11px] py-0.5 transition-colors truncate ${
                      activeSection === item.id
                        ? 'text-text-primary font-medium'
                        : 'text-text-tertiary hover:text-text-secondary'
                    }`}
                    style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                  >
                    {item.text}
                  </button>
                ))}
              </nav>
            </div>
          )}
        </div>

        {/* Main content — rendered markdown */}
        <div id="docs-content" className="flex-1 overflow-y-auto">
          {(selectedDoc || selectedDesign) && (
            <div className="max-w-4xl mx-auto px-8 py-6">
              {/* Doc header */}
              <div className="mb-6 pb-4 border-b border-border">
                <h1 className="text-xl font-bold text-text-primary mb-2">
                  {selectedDoc?.title || selectedDesign?.title}
                </h1>
                <div className="flex items-center gap-3 text-[10px] text-text-tertiary">
                  {selectedDoc?.auto_generated && (
                    <span className="flex items-center gap-1 bg-accent-blue/10 text-accent-blue px-1.5 py-0.5 rounded">
                      <Sparkles size={9} />
                      AI-generated
                    </span>
                  )}
                  {selectedSource === 'design' && (
                    <span className="flex items-center gap-1 bg-accent-purple/10 text-accent-purple px-1.5 py-0.5 rounded">
                      <FileText size={9} />
                      Design Doc
                    </span>
                  )}
                  {selectedDoc?.systems && selectedDoc.systems.length > 0 && (
                    <span>Systems: {selectedDoc.systems.join(', ')}</span>
                  )}
                  {selectedDoc && (
                    <span className="flex items-center gap-1">
                      <Clock size={9} />
                      Updated {selectedDoc.updated}
                    </span>
                  )}
                  {selectedDesign && (
                    <span className="font-mono text-[9px] bg-surface-3 px-1.5 py-0.5 rounded">
                      data/designs/{selectedDesign.filename}
                    </span>
                  )}
                </div>
              </div>

              {/* Rendered content */}
              <article className="docs-article">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => {
                      const text = getTextContent(children);
                      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                      return <h1 id={id} className="text-2xl font-bold text-text-primary mt-8 mb-4 pb-2 border-b border-border first:mt-0">{children}</h1>;
                    },
                    h2: ({ children }) => {
                      const text = getTextContent(children);
                      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                      return <h2 id={id} className="text-xl font-bold text-text-primary mt-8 mb-3 pb-1.5 border-b border-border/50">{children}</h2>;
                    },
                    h3: ({ children }) => {
                      const text = getTextContent(children);
                      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                      return <h3 id={id} className="text-lg font-semibold text-text-primary mt-6 mb-2">{children}</h3>;
                    },
                    h4: ({ children }) => {
                      const text = getTextContent(children);
                      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                      return <h4 id={id} className="text-base font-semibold text-text-primary mt-4 mb-2">{children}</h4>;
                    },
                    p: ({ children }) => <p className="text-sm text-text-secondary leading-relaxed mb-4">{children}</p>,
                    a: ({ href, children }) => (
                      <a href={href} className="text-accent-blue hover:text-accent-blue/80 underline underline-offset-2" target={href?.startsWith('http') ? '_blank' : undefined}>
                        {children}
                      </a>
                    ),
                    ul: ({ children }) => <ul className="text-sm text-text-secondary list-disc list-outside ml-5 mb-4 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="text-sm text-text-secondary list-decimal list-outside ml-5 mb-4 space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    code: ({ className, children }) => {
                      const isBlock = className?.includes('language-');
                      if (isBlock) {
                        return (
                          <code className="block text-xs font-mono text-text-primary bg-surface-2 rounded-lg p-4 mb-4 overflow-x-auto border border-border/50">
                            {children}
                          </code>
                        );
                      }
                      return <code className="text-xs font-mono text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded">{children}</code>;
                    },
                    pre: ({ children }) => <pre className="mb-4">{children}</pre>,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-accent-blue/40 pl-4 my-4 text-sm text-text-tertiary italic">{children}</blockquote>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto mb-4 rounded-lg border border-border">
                        <table className="w-full text-sm">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-surface-2 border-b border-border">{children}</thead>,
                    th: ({ children }) => <th className="text-left text-xs font-semibold text-text-primary px-3 py-2">{children}</th>,
                    td: ({ children }) => <td className="text-xs text-text-secondary px-3 py-2 border-t border-border/50">{children}</td>,
                    hr: () => <hr className="border-border my-6" />,
                    strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
                    em: ({ children }) => <em className="italic text-text-secondary">{children}</em>,
                    img: ({ src, alt }) => (
                      <img src={src} alt={alt || ''} className="rounded-lg border border-border max-w-full my-4" />
                    ),
                  }}
                >
                  {content}
                </ReactMarkdown>
              </article>
            </div>
          )}
          {!selectedDoc && !selectedDesign && !loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <FileText size={32} className="mx-auto mb-3 text-text-tertiary" />
                <p className="text-sm text-text-tertiary">Select a document from the sidebar</p>
                <p className="text-xs text-text-tertiary mt-1">Project documentation, architecture guides, and design docs</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(getTextContent).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return getTextContent((children as any).props?.children);
  }
  return '';
}
