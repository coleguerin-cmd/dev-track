#!/usr/bin/env npx tsx
/**
 * Capture remaining session 7 ideas — AI provenance, edit logs, chat auditing
 */
import fs from 'fs';
import path from 'path';

const DATA = path.resolve(process.argv[2] || path.join(process.cwd(), 'data'));
const ideas = JSON.parse(fs.readFileSync(path.join(DATA, 'ideas/items.json'), 'utf-8'));
const today = '2026-02-08';

const newIdeas = [
  {
    id: `IDEA-${String(ideas.next_id).padStart(3, '0')}`,
    title: 'Entity provenance — modified_by field on all mutations (user vs AI, which model)',
    description: 'Every entity mutation (create, update, delete) should record who made the change: user, ai-chat, ai-automation, or system. Include the model ID when AI-made (e.g., "claude-opus-4-6", "gpt-5.2"). This field goes on every entity as last_modified_by and created_by. The automation engine and headless runner pass actor info through to tool execution. The chat service already knows the model — just needs to propagate it. Like Landmark\'s edit attribution system.',
    category: 'feature', status: 'captured', priority: 'P1',
    source: 'conversation session-7',
    related_ideas: [], promoted_to: null,
    pros: ['Full audit trail', 'Know exactly what AI changed vs human', 'Debugging AI behavior becomes possible', 'Required for trust in autonomous AI operations'],
    cons: ['Touches every entity type and every mutation path', 'Adds a field to every write operation'],
    open_questions: ['Do we store full edit history or just last_modified_by?', 'Where does Cursor/external AI fit in the actor taxonomy?'],
    notes: null, tags: ['provenance', 'audit', 'trust'], created: today, updated: today,
  },
  {
    id: `IDEA-${String(ideas.next_id + 1).padStart(3, '0')}`,
    title: 'Full edit history log on all entities — who changed what, when, which model',
    description: 'Every entity should have an edit history: an array of { timestamp, actor, model, field, old_value, new_value } entries. Similar to Landmark\'s edit log system. Stored either inline on the entity or in a separate audit log file (data/audit/log.json). The UI shows this as an expandable "History" section on each entity detail view. Critical for: debugging AI behavior, understanding how data evolved, reverting bad AI edits, compliance.',
    category: 'feature', status: 'captured', priority: 'P1',
    source: 'conversation session-7',
    related_ideas: [], promoted_to: null,
    pros: ['Complete audit trail', 'Can revert bad AI edits', 'Understand data evolution', 'Required for enterprise trust'],
    cons: ['Storage grows with every edit', 'Need archival strategy for old history', 'Adds latency to every write'],
    open_questions: ['Inline on entity vs separate audit log?', 'How far back to keep history?', 'Do we store full old/new values or just diffs?'],
    notes: null, tags: ['audit', 'history', 'provenance'], created: today, updated: today,
  },
  {
    id: `IDEA-${String(ideas.next_id + 2).padStart(3, '0')}`,
    title: 'UI badges showing AI model attribution on created/edited entities',
    description: 'In the DevTrack UI, any entity that was created or last modified by AI should show a small badge: "Claude Opus 4.6" or "GPT-5.2" or "AI Automation" with the model name. This appears on roadmap items, issues, ideas, brain notes, docs, changelog entries — anywhere an entity is displayed. Color-coded by provider (Anthropic blue, OpenAI green, Google orange). Clicking the badge shows the edit history for that entity.',
    category: 'ux', status: 'captured', priority: 'P2',
    source: 'conversation session-7',
    related_ideas: [], promoted_to: null,
    pros: ['Immediately visible who/what made changes', 'Builds trust in AI operations', 'Beautiful UX detail'],
    cons: ['Need provenance data first (IDEA-043)', 'Badge visual design needs care to not clutter'],
    open_questions: ['Badge design — icon? text? color dot?', 'Show on list views or only detail views?'],
    notes: null, tags: ['ui', 'provenance', 'badges'], created: today, updated: today,
  },
  {
    id: `IDEA-${String(ideas.next_id + 3).padStart(3, '0')}`,
    title: 'Headless runner conversation logging — save full AI transcripts from automations',
    description: 'The headless AI runner (server/ai/runner.ts) currently discards the full conversation after execution. Only tool call summaries are logged to the activity feed. Need to save full transcripts (system prompt, user message, all AI responses, all tool calls with full arguments and results) to data/ai/conversations/ just like ChatService does. Critical for: debugging automation behavior, auditing what the AI decided and why, cost attribution per conversation.',
    category: 'feature', status: 'captured', priority: 'P1',
    source: 'conversation session-7',
    related_ideas: [], promoted_to: null,
    pros: ['Full audit trail for automations', 'Debug why AI made specific decisions', 'Cost attribution per automation run'],
    cons: ['Transcripts can be large (49 tool calls = big JSON)', 'Need archival for old transcripts'],
    open_questions: ['Same conversation format as chat? Or separate?', 'How long to keep automation transcripts?'],
    notes: null, tags: ['automations', 'logging', 'audit'], created: today, updated: today,
  },
  {
    id: `IDEA-${String(ideas.next_id + 4).padStart(3, '0')}`,
    title: 'Chat conversation audit automation — AI reviews its own conversations for insights',
    description: 'Add a scheduled automation that reads recent AI conversations (from data/ai/conversations/) and extracts: decisions made, ideas surfaced, issues discovered, preferences expressed, behavioral patterns observed. Updates the relevant DevTrack entities (ideas, issues, brain notes, user profile). This is the self-awareness loop — the AI reviews what it discussed and makes sure nothing fell through the cracks. Also works as the foundation for the conversation bridge (ISS-012) when external conversations are captured.',
    category: 'feature', status: 'captured', priority: 'P2',
    source: 'conversation session-7',
    related_ideas: [], promoted_to: null,
    pros: ['Nothing falls through the cracks', 'Self-improving data capture', 'Foundation for conversation bridge'],
    cons: ['Reading full transcripts is token-expensive', 'Need to avoid infinite loops (AI auditing its own audit)'],
    open_questions: ['How often to audit? Daily? Per-conversation?', 'How to prevent the audit from creating noise?'],
    notes: null, tags: ['automations', 'conversations', 'self-awareness'], created: today, updated: today,
  },
];

// Update IDs for cross-references
newIdeas[2].related_ideas = [newIdeas[0].id]; // UI badges references provenance
newIdeas[4].related_ideas = [newIdeas[3].id]; // Chat audit references conversation logging

for (const idea of newIdeas) {
  ideas.ideas.push(idea);
  ideas.next_id++;
  console.log(`  + ${idea.id}: ${idea.title}`);
}

fs.writeFileSync(path.join(DATA, 'ideas/items.json'), JSON.stringify(ideas, null, 2) + '\n');
console.log(`\nDone. ${newIdeas.length} ideas captured (${newIdeas[0].id} through ${newIdeas[newIdeas.length - 1].id}).`);
