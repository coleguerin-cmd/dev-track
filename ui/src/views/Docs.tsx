import { useEffect, useState, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, BookOpen, Code, RefreshCw, Sparkles, FolderOpen, Loader2, Clock, ChevronRight, User, Bot, AlertTriangle, Info, Lightbulb } from 'lucide-react';
import { MermaidDiagram } from '../components/MermaidDiagram';
import * as api from '../api/client';

const BASE = '/api/v1';

interface DocEntry {
  id: string;
  title: string;
  type: string;
  parent_id?: string | null;
  sort_order?: number;
  layer?: string | null;
  systems: string[];
  auto_generated: boolean;
  last_generated: string | null;
  last_edited_by?: 'ai' | 'user';
  last_edited_at?: string;
  edit_history?: { timestamp: string; actor: string; actor_detail: string; summary: string; cost_usd?: number }[];
  author: string;
  status: string;
  tags: string[];
  created: string;
  updated: string;
}

interface DesignDoc { filename: string; title: string; }
interface TocItem { id: string; text: string; level: number; }
type DocSource = 'wiki' | 'design';

function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  let inCode = false;
  for (const line of markdown.split('\n')) {
    if (line.trim().startsWith('```')) { inCode = !inCode; continue; }
    if (inCode) continue;
    const m = line.match(/^(#{1,4})\s+(.+)/);
    if (m) {
      const level = m[1].length;
      const text = m[2].replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      items.push({ id, text, level });
    }
  }
  return items.length > 20 ? items.filter(i => i.level <= 2) : items;
}

function formatDesignTitle(f: string): string {
  return f.replace(/\.md$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bV(\d)/g, 'v$1');
}

// Group docs: top-level grouped by layer/category, sub-pages nested under parents
function groupDocs(docs: DocEntry[]): { category: string; icon: typeof FileText; docs: (DocEntry & { children: DocEntry[] })[] }[] {
  const topLevel = docs.filter(d => !d.parent_id);
  const children = docs.filter(d => d.parent_id);

  const withChildren = topLevel.map(d => ({
    ...d,
    children: children.filter(c => c.parent_id === d.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
  }));

  const groups: Record<string, typeof withChildren> = {};
  for (const doc of withChildren) {
    let cat = 'Other';
    const layer = (doc as any).layer;
    if (layer === 'architecture') cat = 'Architecture';
    else if (layer === 'operational') cat = 'Operational';
    else if (layer === 'implementation') cat = 'Implementation';
    else if (layer === 'design') cat = 'Design';
    else if (doc.id === 'system-overview' || doc.id === 'getting-started' || doc.id === 'data-model-reference' || doc.id === 'api-reference') cat = 'Guides';
    else if (doc.id.startsWith('system-')) cat = 'Systems';
    else if (doc.type === 'auto-generated') cat = 'Guides';
    else cat = 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(doc);
  }

  const order = ['Guides', 'Architecture', 'Systems', 'Operational', 'Implementation', 'Design', 'Other'];
  const icons: Record<string, typeof FileText> = { Guides: BookOpen, Architecture: Code, Systems: Code, Operational: FileText, Implementation: FileText, Design: FileText, Other: FileText };
  return order.filter(k => groups[k]).map(k => ({ category: k, icon: icons[k] || FileText, docs: groups[k].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)) }));
}

const layerColors: Record<string, string> = {
  architecture: 'bg-accent-blue/10 text-accent-blue',
  operational: 'bg-status-pass/10 text-status-pass',
  implementation: 'bg-accent-purple/10 text-accent-purple',
  design: 'bg-accent-yellow/10 text-accent-yellow',
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
  const [genProgress, setGenProgress] = useState<any>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [costModal, setCostModal] = useState<{ mode: 'initialize' | 'update'; show: boolean }>({ mode: 'update', show: false });

  useEffect(() => {
    Promise.all([
      api.docs.list().then((d: any) => d?.docs || []),
      api.docs.listDesigns().catch(() => ({ files: [] })).then((d: any) => d?.files || []),
    ]).then(([docList, designFiles]) => {
      setDocs(docList);
      setDesignDocs((designFiles as string[]).map((f: string) => ({ filename: f, title: formatDesignTitle(f) })));
      if (docList.length > 0 && !selectedId) {
        const pref = docList.find((d: DocEntry) => d.id === 'system-overview') || docList[0];
        setSelectedId(pref.id);
        setSelectedSource('wiki');
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setContent('');
    if (selectedSource === 'wiki') {
      api.docs.get(selectedId).then((d: any) => {
        setContent(d?.content || '*No content yet.*');
        setActiveSection('');
        document.getElementById('docs-content')?.scrollTo(0, 0);
      }).catch(() => setContent('Failed to load.'));
    } else {
      api.docs.getDesign(selectedId).then((d: any) => {
        setContent(d?.content || '*No content.*');
        document.getElementById('docs-content')?.scrollTo(0, 0);
      }).catch(() => setContent('Failed to load.'));
    }
  }, [selectedId, selectedSource]);

  useEffect(() => {
    if (docsAction === 'idle') return;
    const poll = setInterval(async () => {
      try {
        const s = await api.docs.generateStatus();
        setGenProgress(s);
        const d = await api.docs.list();
        setDocs(d?.docs || []);
        if (!s?.running) { setDocsAction('idle'); setGenProgress(null); clearInterval(poll); }
      } catch {}
    }, 3000);
    return () => clearInterval(poll);
  }, [docsAction]);

  const handleDocsAction = async (action: 'initialize' | 'update') => {
    setDocsAction(action === 'initialize' ? 'initializing' : 'updating');
    try {
      await fetch(`${BASE}/docs/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: action }) });
    } catch { setDocsAction('idle'); }
  };

  const grouped = useMemo(() => groupDocs(docs), [docs]);
  const selectedDoc = selectedSource === 'wiki' ? docs.find(d => d.id === selectedId) : null;
  const selectedDesign = selectedSource === 'design' ? designDocs.find(d => d.filename === selectedId) : null;
  const toc = useMemo(() => extractToc(content), [content]);

  const scrollToSection = useCallback((id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    const container = document.getElementById('docs-content');
    if (el && container) {
      container.scrollTo({ top: el.offsetTop - container.offsetTop - 20, behavior: 'smooth' });
    }
  }, []);

  const toggleParent = (id: string) => {
    setExpandedParents(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] overflow-hidden -mx-6 -mt-2">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-text-primary">Documentation</h2>
          <span className="text-[10px] text-text-tertiary">{docs.length} pages{designDocs.length > 0 ? ` · ${designDocs.length} design docs` : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          {docsAction !== 'idle' ? (
            <div className="flex items-center gap-2">
              <Loader2 size={12} className="animate-spin text-accent-blue" />
              <span className="text-[10px] text-accent-blue">
                {docsAction === 'initializing' ? 'Initializing' : 'Updating'}
                {genProgress?.docs_total > 0 && ` ${genProgress.docs_completed}/${genProgress.docs_total}`}
                {genProgress?.current_doc && ` — ${genProgress.current_doc}`}
                {genProgress?.phase && ` (${genProgress.phase})`}
              </span>
              {genProgress?.docs_total > 0 && (
                <div className="w-20 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-blue rounded-full transition-all duration-500" style={{ width: `${Math.round((genProgress.docs_completed / genProgress.docs_total) * 100)}%` }} />
                </div>
              )}
              {genProgress?.total_cost > 0 && <span className="text-[9px] text-text-tertiary">${genProgress.total_cost.toFixed(2)}</span>}
            </div>
          ) : (
            <>
              <button onClick={() => setCostModal({ mode: 'update', show: true })}
                className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded bg-surface-3 text-text-secondary hover:bg-surface-4 hover:text-text-primary transition-colors">
                <RefreshCw size={10} /> Update Docs
              </button>
              <button onClick={() => setCostModal({ mode: 'initialize', show: true })}
                className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded bg-surface-3 text-text-secondary hover:bg-surface-4 hover:text-text-primary transition-colors">
                <Sparkles size={10} /> Reinitialize
              </button>
            </>
          )}
        </div>
      </div>

      {/* Three-column layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Page Navigation */}
        <div className="w-52 flex-shrink-0 border-r border-border overflow-y-auto px-2 py-3">
          {loading && <p className="text-xs text-text-tertiary px-2">Loading...</p>}

          {grouped.map(group => {
            const Icon = group.icon;
            return (
              <div key={group.category} className="mb-3">
                <h3 className="flex items-center gap-1.5 text-[9px] font-semibold text-text-tertiary uppercase tracking-wider mb-1 px-2">
                  <Icon size={9} /> {group.category}
                </h3>
                {group.docs.map(doc => (
                  <div key={doc.id}>
                    <button
                      onClick={() => { setSelectedId(doc.id); setSelectedSource('wiki'); if (doc.children.length > 0) toggleParent(doc.id); }}
                      className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors flex items-center gap-1 ${
                        selectedId === doc.id && selectedSource === 'wiki'
                          ? 'bg-surface-3 text-text-primary font-medium'
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                      }`}
                    >
                      {doc.children.length > 0 && (
                        <ChevronRight size={10} className={`transition-transform flex-shrink-0 ${expandedParents.has(doc.id) ? 'rotate-90' : ''}`} />
                      )}
                      <span className="truncate">{doc.title.replace(/^System:\s*/, '')}</span>
                    </button>
                    {doc.children.length > 0 && expandedParents.has(doc.id) && (
                      <div className="ml-4 border-l border-border/50">
                        {doc.children.map(child => (
                          <button key={child.id}
                            onClick={() => { setSelectedId(child.id); setSelectedSource('wiki'); }}
                            className={`w-full text-left px-2 py-0.5 text-[10px] transition-colors ${
                              selectedId === child.id ? 'text-text-primary font-medium' : 'text-text-tertiary hover:text-text-secondary'
                            }`}
                          >
                            <span className="truncate block">{child.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          {designDocs.length > 0 && (
            <div className="mb-3">
              <h3 className="flex items-center gap-1.5 text-[9px] font-semibold text-text-tertiary uppercase tracking-wider mb-1 px-2">
                <FolderOpen size={9} /> Design Docs
              </h3>
              {designDocs.map(doc => (
                <button key={doc.filename}
                  onClick={() => { setSelectedId(doc.filename); setSelectedSource('design'); }}
                  className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors ${
                    selectedId === doc.filename && selectedSource === 'design'
                      ? 'bg-surface-3 text-text-primary font-medium'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                  }`}
                >
                  <span className="truncate block">{doc.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* CENTER: Content */}
        <div id="docs-content" className="flex-1 overflow-y-auto">
          {(selectedDoc || selectedDesign) ? (
            <div className="max-w-4xl mx-auto px-8 py-6">
              {/* Doc header with provenance */}
              <div className="mb-6 pb-4 border-b border-border">
                <h1 className="text-xl font-bold text-text-primary mb-2">{selectedDoc?.title || selectedDesign?.title}</h1>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-text-tertiary">
                  {selectedDoc?.layer && (
                    <span className={`px-1.5 py-0.5 rounded font-medium ${layerColors[selectedDoc.layer] || 'bg-surface-3 text-text-tertiary'}`}>
                      {selectedDoc.layer}
                    </span>
                  )}
                  {selectedDoc?.auto_generated && (
                    <span className="flex items-center gap-1 bg-accent-blue/10 text-accent-blue px-1.5 py-0.5 rounded">
                      <Sparkles size={8} /> AI-generated
                    </span>
                  )}
                  {(selectedDoc as any)?.last_edited_by && (
                    <span className="flex items-center gap-1">
                      {(selectedDoc as any).last_edited_by === 'ai' ? <Bot size={9} /> : <User size={9} />}
                      Last edited by {(selectedDoc as any).last_edited_by === 'ai' ? 'AI' : 'User'}
                      {(selectedDoc as any).last_edited_at && ` · ${(selectedDoc as any).last_edited_at}`}
                    </span>
                  )}
                  {selectedDoc && <span className="flex items-center gap-1"><Clock size={9} /> Updated {selectedDoc.updated}</span>}
                  {selectedDesign && <span className="font-mono text-[9px] bg-surface-3 px-1.5 py-0.5 rounded">data/designs/{selectedDesign.filename}</span>}
                </div>
              </div>

              <article className="docs-article">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                  h1: ({ children }) => { const id = toId(children); return <h1 id={id} className="text-2xl font-bold text-text-primary mt-8 mb-4 pb-2 border-b border-border first:mt-0">{children}</h1>; },
                  h2: ({ children }) => { const id = toId(children); return <h2 id={id} className="text-xl font-bold text-text-primary mt-8 mb-3 pb-1.5 border-b border-border/50">{children}</h2>; },
                  h3: ({ children }) => { const id = toId(children); return <h3 id={id} className="text-lg font-semibold text-text-primary mt-6 mb-2">{children}</h3>; },
                  h4: ({ children }) => { const id = toId(children); return <h4 id={id} className="text-base font-semibold text-text-primary mt-4 mb-2">{children}</h4>; },
                  p: ({ children }) => <p className="text-sm text-text-secondary leading-relaxed mb-4">{children}</p>,
                  a: ({ href, children }) => <a href={href} className="text-accent-blue hover:text-accent-blue/80 underline underline-offset-2" target={href?.startsWith('http') ? '_blank' : undefined}>{children}</a>,
                  ul: ({ children }) => <ul className="text-sm text-text-secondary list-disc list-outside ml-5 mb-4 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="text-sm text-text-secondary list-decimal list-outside ml-5 mb-4 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                  code: ({ className, children }) => {
                    // Mermaid diagrams
                    if (className?.includes('language-mermaid')) {
                      const code = String(children).replace(/\n$/, '');
                      return <MermaidDiagram code={code} />;
                    }
                    if (className?.includes('language-')) {
                      return <code className="block text-xs font-mono text-text-primary bg-surface-2 rounded-lg p-4 mb-4 overflow-x-auto border border-border/50">{children}</code>;
                    }
                    return <code className="text-xs font-mono text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded">{children}</code>;
                  },
                  pre: ({ children }) => <pre className="mb-4">{children}</pre>,
                  blockquote: ({ children }) => {
                    // Detect callout types from first text content
                    const text = getTextContent(children);
                    if (text.startsWith('Warning:') || text.startsWith('WARNING:')) {
                      return <div className="flex gap-2 border-l-2 border-accent-yellow/60 bg-accent-yellow/5 pl-3 pr-4 py-3 my-4 rounded-r-lg"><AlertTriangle size={14} className="text-accent-yellow flex-shrink-0 mt-0.5" /><div className="text-sm text-text-secondary">{children}</div></div>;
                    }
                    if (text.startsWith('Note:') || text.startsWith('NOTE:')) {
                      return <div className="flex gap-2 border-l-2 border-accent-blue/60 bg-accent-blue/5 pl-3 pr-4 py-3 my-4 rounded-r-lg"><Info size={14} className="text-accent-blue flex-shrink-0 mt-0.5" /><div className="text-sm text-text-secondary">{children}</div></div>;
                    }
                    if (text.startsWith('Tip:') || text.startsWith('TIP:')) {
                      return <div className="flex gap-2 border-l-2 border-status-pass/60 bg-status-pass/5 pl-3 pr-4 py-3 my-4 rounded-r-lg"><Lightbulb size={14} className="text-status-pass flex-shrink-0 mt-0.5" /><div className="text-sm text-text-secondary">{children}</div></div>;
                    }
                    return <blockquote className="border-l-2 border-accent-blue/40 pl-4 my-4 text-sm text-text-tertiary italic">{children}</blockquote>;
                  },
                  table: ({ children }) => <div className="overflow-x-auto mb-4 rounded-lg border border-border"><table className="w-full text-sm">{children}</table></div>,
                  thead: ({ children }) => <thead className="bg-surface-2 border-b border-border">{children}</thead>,
                  tr: ({ children }) => <tr className="even:bg-surface-1">{children}</tr>,
                  th: ({ children }) => <th className="text-left text-xs font-semibold text-text-primary px-3 py-2">{children}</th>,
                  td: ({ children }) => <td className="text-xs text-text-secondary px-3 py-2 border-t border-border/30">{children}</td>,
                  hr: () => <hr className="border-border my-6" />,
                  strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
                  em: ({ children }) => <em className="italic text-text-secondary">{children}</em>,
                  img: ({ src, alt }) => <img src={src} alt={alt || ''} className="rounded-lg border border-border max-w-full my-4" />,
                }}>{content}</ReactMarkdown>
              </article>
            </div>
          ) : !loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <FileText size={32} className="mx-auto mb-3 text-text-tertiary" />
                <p className="text-sm text-text-tertiary">Select a document</p>
              </div>
            </div>
          ) : null}
        </div>

        {/* RIGHT: On This Page (section nav) */}
        {toc.length > 0 && (selectedDoc || selectedDesign) && (
          <div className="w-44 flex-shrink-0 border-l border-border overflow-y-auto px-2 py-4">
            <h3 className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-1">On This Page</h3>
            <nav className="space-y-0.5">
              {toc.map(item => (
                <button key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className={`w-full text-left text-[10px] py-0.5 transition-colors truncate block ${
                    activeSection === item.id ? 'text-text-primary font-medium' : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                  style={{ paddingLeft: `${(item.level - 1) * 10 + 4}px` }}
                >
                  {item.text}
                </button>
              ))}
            </nav>
          </div>
        )}
      </div>

      {/* Cost Confirmation Modal */}
      {costModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-1 border border-border rounded-xl shadow-2xl w-[420px] overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-text-primary">
                {costModal.mode === 'initialize' ? 'Reinitialize Documentation' : 'Update Documentation'}
              </h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              {costModal.mode === 'initialize' ? (
                <>
                  <p className="text-xs text-text-secondary">Full deep scan of the codebase with AI discovery agent. Generates comprehensive documentation across all four layers.</p>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-surface-2 rounded-lg px-3 py-2">
                      <div className="text-text-tertiary">Model</div>
                      <div className="text-text-primary font-medium">Opus 4.5</div>
                    </div>
                    <div className="bg-surface-2 rounded-lg px-3 py-2">
                      <div className="text-text-tertiary">Est. Cost</div>
                      <div className="text-text-primary font-medium">$15 - $30</div>
                    </div>
                    <div className="bg-surface-2 rounded-lg px-3 py-2">
                      <div className="text-text-tertiary">Est. Time</div>
                      <div className="text-text-primary font-medium">20 - 45 min</div>
                    </div>
                    <div className="bg-surface-2 rounded-lg px-3 py-2">
                      <div className="text-text-tertiary">Pages</div>
                      <div className="text-text-primary font-medium">{docs.length || '14-30'} (AI decides)</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 bg-accent-yellow/5 border border-accent-yellow/20 rounded-lg px-3 py-2">
                    <AlertTriangle size={12} className="text-accent-yellow flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-text-secondary">This costs real money and takes time. The AI will scan your codebase, create a doc plan, and generate pages in phases. You can monitor progress in the header bar.</p>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-text-secondary">Incremental update of stale documentation. Only docs with source code changes or thin content will be regenerated.</p>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-surface-2 rounded-lg px-3 py-2">
                      <div className="text-text-tertiary">Model</div>
                      <div className="text-text-primary font-medium">Sonnet 4.5</div>
                    </div>
                    <div className="bg-surface-2 rounded-lg px-3 py-2">
                      <div className="text-text-tertiary">Est. Cost</div>
                      <div className="text-text-primary font-medium">$3 - $10</div>
                    </div>
                    <div className="bg-surface-2 rounded-lg px-3 py-2">
                      <div className="text-text-tertiary">Est. Time</div>
                      <div className="text-text-primary font-medium">5 - 20 min</div>
                    </div>
                    <div className="bg-surface-2 rounded-lg px-3 py-2">
                      <div className="text-text-tertiary">Scope</div>
                      <div className="text-text-primary font-medium">Changed docs only</div>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-surface-2/50">
              <button
                onClick={() => setCostModal({ ...costModal, show: false })}
                className="text-[11px] font-medium px-3 py-1.5 rounded bg-surface-3 text-text-secondary hover:bg-surface-4 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setCostModal({ ...costModal, show: false }); handleDocsAction(costModal.mode); }}
                className="text-[11px] font-medium px-3 py-1.5 rounded bg-accent-blue text-white hover:bg-accent-blue/90 transition-colors"
              >
                {costModal.mode === 'initialize' ? 'Reinitialize' : 'Update'} Docs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function toId(children: React.ReactNode): string {
  return getTextContent(children).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function getTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(getTextContent).join('');
  if (children && typeof children === 'object' && 'props' in children) return getTextContent((children as any).props?.children);
  return '';
}
