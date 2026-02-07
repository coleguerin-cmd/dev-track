import { useEffect, useState, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as api from '../api/client';

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

  // For long docs (>15 headings), only show h1-h2 to prevent ToC clutter
  if (allItems.length > 15) {
    return allItems.filter(item => item.level <= 2);
  }
  return allItems;
}

export function Docs() {
  const [designFiles, setDesignFiles] = useState<string[]>([]);
  const [decisionFiles, setDecisionFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ type: 'design' | 'decision'; name: string } | null>(null);
  const [content, setContent] = useState('');
  const [activeSection, setActiveSection] = useState('');

  useEffect(() => {
    api.docs.listDesigns().then((d: any) => {
      const files = d?.files || [];
      setDesignFiles(files);
      // Auto-select first file
      if (files.length > 0 && !selectedFile) {
        setSelectedFile({ type: 'design', name: files[0] });
      }
    }).catch(() => {});
    api.docs.listDecisions().then((d: any) => setDecisionFiles(d?.files || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedFile) {
      const fetchDoc = selectedFile.type === 'design'
        ? api.docs.getDesign(selectedFile.name)
        : api.docs.getDecision(selectedFile.name);
      fetchDoc.then((d: any) => {
        setContent(d?.content || '');
        setActiveSection('');
        // Scroll to top when switching docs
        const contentEl = document.getElementById('docs-content');
        if (contentEl) contentEl.scrollTo(0, 0);
      }).catch(() => setContent('Failed to load'));
    }
  }, [selectedFile]);

  const toc = useMemo(() => extractToc(content), [content]);

  const scrollToSection = useCallback((id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Friendly file name display
  const displayName = (name: string) => name.replace('.md', '');

  // Nav item ordering: README first, then SPEC, then PHASES, then alphabetical
  const sortedDesignFiles = useMemo(() => {
    const priority: Record<string, number> = { 'README.md': 0, 'SPEC.md': 1, 'PHASES.md': 2 };
    return [...designFiles].sort((a, b) => {
      const pa = priority[a] ?? 99;
      const pb = priority[b] ?? 99;
      return pa - pb || a.localeCompare(b);
    });
  }, [designFiles]);

  return (
    <div className="flex h-[calc(100vh-120px)] overflow-hidden -mx-6 -mt-2">
      {/* Left sidebar — file nav + ToC */}
      <div className="w-56 flex-shrink-0 border-r border-border overflow-y-auto px-4 py-4">
        {/* File navigation */}
        {sortedDesignFiles.length > 0 && (
          <div className="mb-5">
            <h3 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-2">Designs</h3>
            <div className="space-y-0.5">
              {sortedDesignFiles.map(f => (
                <button
                  key={f}
                  onClick={() => setSelectedFile({ type: 'design', name: f })}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                    selectedFile?.name === f && selectedFile?.type === 'design'
                      ? 'bg-surface-3 text-text-primary font-medium'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                  }`}
                >
                  {displayName(f)}
                </button>
              ))}
            </div>
          </div>
        )}

        {decisionFiles.length > 0 && (
          <div className="mb-5">
            <h3 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-2">Decisions</h3>
            <div className="space-y-0.5">
              {decisionFiles.map(f => (
                <button
                  key={f}
                  onClick={() => setSelectedFile({ type: 'decision', name: f })}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                    selectedFile?.name === f && selectedFile?.type === 'decision'
                      ? 'bg-surface-3 text-text-primary font-medium'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                  }`}
                >
                  {displayName(f)}
                </button>
              ))}
            </div>
          </div>
        )}

        {designFiles.length === 0 && decisionFiles.length === 0 && (
          <p className="text-xs text-text-tertiary px-2">No docs yet. Add .md files to data/designs/ or data/decisions/</p>
        )}

        {/* Table of Contents for selected doc */}
        {toc.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-2">On This Page</h3>
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
        {content ? (
          <div className="max-w-4xl mx-auto px-8 py-6">
            <article className="docs-article">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Headings with IDs for ToC navigation
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
                  // Paragraphs
                  p: ({ children }) => <p className="text-sm text-text-secondary leading-relaxed mb-4">{children}</p>,
                  // Links
                  a: ({ href, children }) => (
                    <a href={href} className="text-accent-blue hover:text-accent-blue/80 underline underline-offset-2" target={href?.startsWith('http') ? '_blank' : undefined}>
                      {children}
                    </a>
                  ),
                  // Lists
                  ul: ({ children }) => <ul className="text-sm text-text-secondary list-disc list-outside ml-5 mb-4 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="text-sm text-text-secondary list-decimal list-outside ml-5 mb-4 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                  // Code
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
                  // Blockquotes
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-accent-blue/40 pl-4 my-4 text-sm text-text-tertiary italic">{children}</blockquote>
                  ),
                  // Tables
                  table: ({ children }) => (
                    <div className="overflow-x-auto mb-4 rounded-lg border border-border">
                      <table className="w-full text-sm">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-surface-2 border-b border-border">{children}</thead>,
                  th: ({ children }) => <th className="text-left text-xs font-semibold text-text-primary px-3 py-2">{children}</th>,
                  td: ({ children }) => <td className="text-xs text-text-secondary px-3 py-2 border-t border-border/50">{children}</td>,
                  // Horizontal rule
                  hr: () => <hr className="border-border my-6" />,
                  // Strong / em
                  strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
                  em: ({ children }) => <em className="italic text-text-secondary">{children}</em>,
                  // Images
                  img: ({ src, alt }) => (
                    <img src={src} alt={alt || ''} className="rounded-lg border border-border max-w-full my-4" />
                  ),
                }}
              />
            </article>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-sm text-text-tertiary">Select a document from the sidebar</p>
              <p className="text-xs text-text-tertiary mt-1">Design docs and architecture decisions live here</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Utility to extract text content from React children (for heading IDs)
function getTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(getTextContent).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return getTextContent((children as any).props?.children);
  }
  return '';
}
