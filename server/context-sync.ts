/**
 * Context Sync Engine
 * 
 * Generates AI context files for different platforms from the core dev-track data.
 * The rule: AI always edits dev-track/data/ files. Platform-specific files are auto-generated.
 * 
 * Supported platforms:
 * - Cursor (.cursor/rules/dev-track.mdc)
 * - Claude Code (CLAUDE.md section)
 * - GitHub Copilot (.github/copilot-instructions.md)
 * - Windsurf (.windsurfrules)
 * - Generic (AI_CONTEXT.md)
 */

import fs from 'fs';
import path from 'path';
import { getStore } from './store.js';

type Platform = 'cursor' | 'claude' | 'copilot' | 'windsurf' | 'generic';

const PLATFORM_FILES: Record<Platform, string> = {
  cursor: '.cursor/rules/dev-track.mdc',
  claude: 'CLAUDE.md',
  copilot: '.github/copilot-instructions.md',
  windsurf: '.windsurfrules',
  generic: 'AI_CONTEXT.md',
};

export function generateContextFile(platform: Platform, projectRoot: string): string {
  const store = getStore();
  const statusLine = store.getQuickStatusLine();

  const content = generateContent(statusLine, platform);

  // Write to the appropriate location
  const filePath = path.join(projectRoot, PLATFORM_FILES[platform]);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (platform === 'claude') {
    // Append to CLAUDE.md instead of overwriting
    appendToFile(filePath, content, '<!-- dev-track:start -->', '<!-- dev-track:end -->');
  } else if (platform === 'cursor') {
    // Write the full cursor rule
    fs.writeFileSync(filePath, content, 'utf-8');
  } else {
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  return filePath;
}

export function syncAllPlatforms(projectRoot: string, platforms: Platform[]): string[] {
  return platforms.map(p => generateContextFile(p, projectRoot));
}

function generateContent(statusLine: string, platform: Platform): string {
  // The core content is the same for all platforms
  const core = `
## Quick Status (auto-updated)
${statusLine}

## System
Project tracking lives in \`dev-track/data/\`. Dashboard: http://localhost:24680
CLI: \`node dev-track/cli/index.ts <resource> <action> [id] [--flags]\`

## File Map
### Core
- \`dev-track/data/state.json\` — System health ratings
- \`dev-track/data/session/current.json\` — Current session plan
- \`dev-track/data/session/log.json\` — Session history
- \`dev-track/data/backlog/items.json\` — All items (horizon: now/next/later)
- \`dev-track/data/changelog/entries.json\` — What shipped
- \`dev-track/data/actions/registry.json\` — Tracked features + health
- \`dev-track/data/issues/items.json\` — Bug tracker
- \`dev-track/data/designs/*.md\` — Architecture docs

### AI Brain (persistent memory)
- \`dev-track/data/brain/notes.json\` — Observations, suggestions, warnings, decisions
- \`dev-track/data/brain/preferences.json\` — Learned user preferences
- \`dev-track/data/brain/context-recovery.json\` — Session start briefing
- \`dev-track/data/ideas/items.json\` — Captured ideas

## Key Rules
- Session start → Read session plan + state + now items
- Session end → Update backlog, write changelog, generate context recovery briefing
- Discovering bugs → Create issues in issues/items.json
- Brainstorming → Capture ideas to ideas/items.json
- Architecture decisions → Write to decisions/*.md
- ALWAYS edit dev-track/data/ files, NEVER edit this context file directly
- Max 3 items in Now (WIP limit)
- Write brain notes proactively (observations, suggestions, warnings)
`.trim();

  switch (platform) {
    case 'cursor':
      return `# dev-track — Project Intelligence\n\n${core}\n`;
    case 'claude':
      return `<!-- dev-track:start -->\n# dev-track — Project Intelligence\n\n${core}\n<!-- dev-track:end -->`;
    case 'copilot':
      return `# dev-track — Project Intelligence\n\n${core}\n`;
    case 'windsurf':
      return `# dev-track — Project Intelligence\n\n${core}\n`;
    case 'generic':
      return `# AI Project Context (dev-track)\n\n${core}\n`;
  }
}

function appendToFile(filePath: string, content: string, startMarker: string, endMarker: string): void {
  let existing = '';
  if (fs.existsSync(filePath)) {
    existing = fs.readFileSync(filePath, 'utf-8');
  }

  // Replace existing section or append
  const startIdx = existing.indexOf(startMarker);
  const endIdx = existing.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing section
    const before = existing.substring(0, startIdx);
    const after = existing.substring(endIdx + endMarker.length);
    fs.writeFileSync(filePath, `${before}${content}${after}`, 'utf-8');
  } else {
    // Append
    fs.writeFileSync(filePath, `${existing}\n\n${content}\n`, 'utf-8');
  }
}
