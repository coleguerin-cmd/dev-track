import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

export const docTools: ToolModule = {
  domain: 'docs',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'list_docs',
        description: 'List all design docs and decision docs',
        parameters: { type: 'object', properties: {} },
      }},
      label: 'Listing docs',
      execute: async () => ({
        designs: getStore().listDesignDocs(),
        decisions: getStore().listDecisions(),
      }),
    },
    {
      definition: { type: 'function', function: {
        name: 'get_doc',
        description: 'Read the contents of a design or decision document',
        parameters: { type: 'object', properties: {
          type: { type: 'string', enum: ['design', 'decision'] },
          filename: { type: 'string', description: 'Filename (e.g., SPEC.md)' },
        }, required: ['type', 'filename'] },
      }},
      label: 'Reading document',
      execute: async (args) => {
        const content = args.type === 'design'
          ? getStore().getDesignDoc(args.filename)
          : getStore().getDecision(args.filename);
        if (!content) return { error: `Document ${args.filename} not found` };
        const maxLen = 10000;
        if (content.length > maxLen) return { content: content.substring(0, maxLen) + '\n\n... (truncated)', truncated: true };
        return { content };
      },
    },
  ],
};
