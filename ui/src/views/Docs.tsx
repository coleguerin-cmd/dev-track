import { useEffect, useState } from 'react';
import * as api from '../api/client';

export function Docs() {
  const [designFiles, setDesignFiles] = useState<string[]>([]);
  const [decisionFiles, setDecisionFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ type: 'design' | 'decision'; name: string } | null>(null);
  const [content, setContent] = useState('');

  useEffect(() => {
    api.docs.listDesigns().then((d: any) => setDesignFiles(d?.files || [])).catch(() => {});
    api.docs.listDecisions().then((d: any) => setDecisionFiles(d?.files || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedFile) {
      const fetch = selectedFile.type === 'design'
        ? api.docs.getDesign(selectedFile.name)
        : api.docs.getDecision(selectedFile.name);
      fetch.then((d: any) => setContent(d?.content || '')).catch(() => setContent('Failed to load'));
    }
  }, [selectedFile]);

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Docs</h1>

      <div className="grid grid-cols-4 gap-6 items-start">
        {/* Sidebar file list */}
        <div className="space-y-4">
          {designFiles.length > 0 && (
            <div>
              <h3 className="label mb-2">Designs</h3>
              <div className="space-y-0.5">
                {designFiles.map(f => (
                  <button
                    key={f}
                    onClick={() => setSelectedFile({ type: 'design', name: f })}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      selectedFile?.name === f
                        ? 'bg-surface-3 text-text-primary font-medium'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                    }`}
                  >
                    {f.replace('.md', '')}
                  </button>
                ))}
              </div>
            </div>
          )}
          {decisionFiles.length > 0 && (
            <div>
              <h3 className="label mb-2">Decisions</h3>
              <div className="space-y-0.5">
                {decisionFiles.map(f => (
                  <button
                    key={f}
                    onClick={() => setSelectedFile({ type: 'decision', name: f })}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      selectedFile?.name === f
                        ? 'bg-surface-3 text-text-primary font-medium'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                    }`}
                  >
                    {f.replace('.md', '')}
                  </button>
                ))}
              </div>
            </div>
          )}
          {designFiles.length === 0 && decisionFiles.length === 0 && (
            <p className="text-xs text-text-tertiary">No docs yet. Add .md files to data/designs/ or data/decisions/</p>
          )}
        </div>

        {/* Content */}
        <div className="col-span-3">
          {content ? (
            <div className="card p-6">
              <div className="prose prose-invert prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-text-secondary font-sans leading-relaxed">
                  {content}
                </pre>
              </div>
            </div>
          ) : (
            <div className="card p-8 text-center text-text-tertiary">
              <p>Select a document</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
