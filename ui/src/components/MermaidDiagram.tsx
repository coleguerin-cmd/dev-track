import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// Initialize mermaid with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    darkMode: true,
    background: '#1a1a2e',
    primaryColor: '#3b82f6',
    primaryTextColor: '#e2e8f0',
    primaryBorderColor: '#334155',
    lineColor: '#475569',
    secondaryColor: '#1e293b',
    tertiaryColor: '#0f172a',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: '12px',
  },
  flowchart: { curve: 'monotoneX', padding: 15 },
  sequence: { showSequenceNumbers: false },
});

let diagramIdCounter = 0;

export function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !code.trim()) return;

    const id = `mermaid-${++diagramIdCounter}`;
    setError(null);
    setRendered(false);

    // Mermaid render is async
    (async () => {
      try {
        const { svg } = await mermaid.render(id, code.trim());
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          setRendered(true);
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to render diagram');
        // Show raw code as fallback
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }
      }
    })();
  }, [code]);

  if (error) {
    return (
      <div className="mb-4">
        <div className="text-[10px] text-accent-yellow mb-1">Diagram render failed: {error}</div>
        <pre className="text-xs font-mono text-text-secondary bg-surface-2 rounded-lg p-3 border border-border/50 overflow-x-auto">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="my-4 overflow-x-auto">
      <div
        ref={containerRef}
        className={`mermaid-container flex justify-center ${rendered ? '' : 'min-h-[60px] flex items-center justify-center'}`}
      >
        {!rendered && <span className="text-xs text-text-tertiary">Rendering diagram...</span>}
      </div>
    </div>
  );
}
