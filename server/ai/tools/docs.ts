import { getStore } from '../../store.js';
import type { ToolModule } from './types.js';

export const docTools: ToolModule = {
  domain: 'docs',
  tools: [
    {
      definition: { type: 'function', function: {
        name: 'list_docs',
        description: 'List all docs from the registry with metadata (type, status, relationships, auto_generated flag). Also lists raw design/decision files.',
        parameters: { type: 'object', properties: {
          type: { type: 'string', enum: ['design', 'decision', 'adr', 'rfc', 'wiki', 'auto-generated'], description: 'Filter by doc type' },
        }},
      }},
      label: 'Listing docs',
      execute: async (args) => {
        const store = getStore();
        let docs = store.docsRegistry.docs;
        if (args.type) docs = docs.filter((d: any) => d.type === args.type);
        return {
          docs: docs.map(d => ({ id: d.id, title: d.title, type: d.type, status: d.status, auto_generated: d.auto_generated, systems: d.systems, updated: d.updated })),
          designs: store.listDesignDocs(),
          decisions: store.listDecisions(),
          total: docs.length,
        };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'get_doc',
        description: 'Read the full content of a document by ID (from registry) or filename (from designs/decisions)',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Doc ID from registry, or filename for legacy design/decision docs' },
          source: { type: 'string', enum: ['registry', 'design', 'decision'], description: 'Where to look. Default: registry' },
        }, required: ['id'] },
      }},
      label: 'Reading document',
      execute: async (args) => {
        const store = getStore();
        const source = args.source || 'registry';

        if (source === 'design') {
          const content = store.getDesignDoc(args.id);
          if (!content) return { error: `Design doc ${args.id} not found` };
          return { content: content.length > 12000 ? content.substring(0, 12000) + '\n\n... (truncated)' : content };
        }
        if (source === 'decision') {
          const content = store.getDecision(args.id);
          if (!content) return { error: `Decision doc ${args.id} not found` };
          return { content: content.length > 12000 ? content.substring(0, 12000) + '\n\n... (truncated)' : content };
        }

        // Registry doc
        const doc = store.docsRegistry.docs.find(d => d.id === args.id);
        if (!doc) return { error: `Doc ${args.id} not found in registry` };
        const content = store.getDocContent(args.id);
        return {
          ...doc,
          content: content.length > 12000 ? content.substring(0, 12000) + '\n\n... (truncated)' : content,
        };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'create_doc',
        description: 'Create a new document (design, decision, ADR, RFC, wiki, or auto-generated). Content is written as a markdown file.',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Doc ID (kebab-case slug, e.g., "system-overview", "adr-001-entity-model")' },
          title: { type: 'string', description: 'Document title' },
          type: { type: 'string', enum: ['design', 'decision', 'adr', 'rfc', 'wiki', 'auto-generated'], description: 'Document type' },
          content: { type: 'string', description: 'Full markdown content of the document' },
          systems: { type: 'array', items: { type: 'string' }, description: 'Related system IDs' },
          roadmap_items: { type: 'array', items: { type: 'string' }, description: 'Related roadmap item IDs' },
          epics: { type: 'array', items: { type: 'string' }, description: 'Related epic IDs' },
          auto_generated: { type: 'boolean', description: 'Whether this doc is AI-generated and should be refreshed automatically' },
          generation_sources: { type: 'array', items: { type: 'string' }, description: 'What data sources feed this doc (e.g., "systems", "roadmap", "codebase")' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
        }, required: ['title', 'type', 'content'] },
      }},
      label: 'Creating document',
      execute: async (args) => {
        const store = getStore();
        const now = new Date().toISOString().split('T')[0];
        const id = args.id || args.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        if (store.docsRegistry.docs.find(d => d.id === id)) {
          return { error: `Doc "${id}" already exists. Use update_doc to modify it.` };
        }

        const doc = {
          id, title: args.title, type: args.type, content: '',
          systems: args.systems || [], roadmap_items: args.roadmap_items || [], epics: args.epics || [],
          auto_generated: args.auto_generated || false,
          last_generated: args.auto_generated ? now : null,
          generation_sources: args.generation_sources || [],
          author: 'ai', status: 'published' as const,
          tags: args.tags || [], created: now, updated: now,
        };

        store.writeDocContent(id, args.content);
        store.docsRegistry.docs.push(doc as any);
        store.saveDocsRegistry();

        return { created: { id, title: doc.title, type: doc.type, content_length: args.content.length } };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'update_doc',
        description: 'Update an existing document. The content parameter is REQUIRED when updating doc content — pass the FULL markdown text as a string, not a reference or filename. The content replaces the entire document.',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Doc ID to update (e.g., "system-overview", "getting-started")' },
          content: { type: 'string', description: 'REQUIRED for content updates. The complete markdown text of the document. Must be a string containing the full document content, not a reference. Example: "# Title\\n\\nParagraph text here..."' },
          title: { type: 'string', description: 'Updated title (optional)' },
          status: { type: 'string', enum: ['draft', 'published', 'archived'] },
          systems: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
        }, required: ['id', 'content'] },
      }},
      label: 'Updating document',
      execute: async (args) => {
        const store = getStore();
        const doc = store.docsRegistry.docs.find(d => d.id === args.id);
        if (!doc) return { error: `Doc ${args.id} not found` };

        if (!args.content || args.content.length < 10) {
          return { error: 'No content provided or content too short. Pass the FULL markdown text in the "content" parameter as a string. The content must be the complete document text.' };
        }

        store.writeDocContent(args.id, args.content);
        if (args.title) doc.title = args.title;
        if (args.status) doc.status = args.status as any;
        if (args.systems) doc.systems = args.systems;
        if (args.tags) doc.tags = args.tags;
        doc.updated = new Date().toISOString().split('T')[0];
        if (doc.auto_generated && args.content) doc.last_generated = doc.updated;

        store.saveDocsRegistry();
        return { updated: { id: doc.id, title: doc.title, content_length: args.content?.length } };
      },
    },
    {
      definition: { type: 'function', function: {
        name: 'delete_doc',
        description: 'Delete a document from the registry and remove its markdown file',
        parameters: { type: 'object', properties: {
          id: { type: 'string', description: 'Doc ID to delete' },
        }, required: ['id'] },
      }},
      label: 'Deleting document',
      execute: async (args) => {
        const store = getStore();
        const idx = store.docsRegistry.docs.findIndex(d => d.id === args.id);
        if (idx === -1) return { error: `Doc ${args.id} not found` };
        const removed = store.docsRegistry.docs.splice(idx, 1)[0];
        store.deleteDocContent(args.id);
        store.saveDocsRegistry();
        return { deleted: removed.id };
      },
    },
  ],
};
