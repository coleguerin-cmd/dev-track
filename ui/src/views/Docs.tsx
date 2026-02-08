import { useEffect, useState, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, BookOpen, Code, RefreshCw } from 'lucide-react';
import * as api from '../api/client';

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

interface TocItem {
  id: string;
  text: string;
  level: number;
}

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

// Group docs by category
function groupDocs(docs: DocEntry[]): Record<string, DocEntry[]> {
  const groups: Record<string, DocEntry[]> = {};
  
  for (const doc of docs) {
    let category = 'Other';
    if (doc.id.startsWith('system-')) category = 'Systems';
    else if (doc.type === 'auto-generated' && !doc.id.startsWith('system-')) category = 'Guides & Reference';
    else if (doc.type === 'design') category = 'Design Docs';
    else if (doc.type === 'decision' || doc.type === 'adr') category = 'Decisions';
    else if (doc.type === 'wiki') category = 'Wiki';
    else category = 'Guides & Reference';
    
    if (!groups[category]) groups[category] = [];
    groups[category].push(doc);
  }

  // Sort groups
  const order = ['Guides & Reference', 'Systems', 'Design Docs', 'Decisions', 'Wiki', 'Other'];
  const sorted: Record<string, DocEntry[]> = {};
  for (const key of order) {
    if (groups[key]) sorted[key] = groups[key];
  }
  return sorted;
}

const categoryIcons: Record<string, typeof FileText> = {
  'Guides & Reference': BookOpen,
  'Systems': Code,
  'Design Docs': FileText,
  'Decisions': FileText,
  'Wiki': FileText,
  'Other': FileText,
};

export function Docs() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [activeSection, setActiveSection] = useState('');
  const [loading, setLoading] = useState(true);

  // Fetch all docs from registry
  useEffect(() => {
    api.docs.list().then((d: any) => {
      const docList = d?.docs || [];
      setDocs(docList);
      // Auto-select first doc
      if (docList.length > 0 && !selectedId) {
        // Prefer 'system-overview' or 'getting-started' as initial doc
        const preferred = docList.find((doc: DocEntry) => doc.id === 'system-overview')
          || docList.find((doc: DocEntry) => doc.id === 'getting-started')
          || docList[0];
        setSelectedId(preferred.id);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Fetch content when selection changes
  useEffect(() => {
    if (selectedId) {
      setContent('');
      api.docs.get(selectedId).then((d: any) => {
        setContent(d?.content || '*No content yet. This doc needs to be generated.*');
        setActiveSection('');
        const contentEl = document.getElementById('docs-content');
        if (contentEl) contentEl.scrollTo(0, 0);
      }).catch(() => setContent('Failed to load document.'));
    }
  }, [selectedId]);

  const grouped = useMemo(() => groupDocs(docs), [docs]);
  const selectedDoc = docs.find(d => d.id === selectedId);
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

  return (
    <div className="flex h-[calc(100vh-120px)] overflow-hidden -mx-6 -mt-2">
      {/* Left sidebar — doc nav + ToC */}
      <div className="w-60 flex-shrink-0 border-r border-border overflow-y-auto px-3 py-4">
        {loading && (
          <p className="text-xs text-text-tertiary px-2">Loading docs...</p>
        )}

        {!loading && docs.length === 0 && (
          <p className="text-xs text-text-tertiary px-2">No docs yet. Docs are auto-generated when automations run.</p>
        )}

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
                    onClick={() => setSelectedId(doc.id)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      selectedId === doc.id
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
        {selectedDoc && (
          <div className="max-w-4xl mx-auto px-8 py-6">
            {/* Doc header */}
            <div className="mb-6 pb-4 border-b border-border">
              <h1 className="text-xl font-bold text-text-primary mb-2">{selectedDoc.title}</h1>
              <div className="flex items-center gap-3 text-[10px] text-text-tertiary">
                {selectedDoc.auto_generated && (
                  <span className="flex items-center gap-1 bg-accent-blue/10 text-accent-blue px-1.5 py-0.5 rounded">
                    <RefreshCw size={9} />
                    Auto-generated
                  </span>
                )}
                {selectedDoc.systems.length > 0 && (
                  <span>Systems: {selectedDoc.systems.join(', ')}</span>
                )}
                <span>Updated {selectedDoc.updated}</span>
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
              />
            </article>
          </div>
        )}
        {!selectedDoc && !loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <FileText size={32} className="mx-auto mb-3 text-text-tertiary" />
              <p className="text-sm text-text-tertiary">Select a document from the sidebar</p>
              <p className="text-xs text-text-tertiary mt-1">Project documentation and architecture guides</p>
            </div>
          </div>
        )}
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
