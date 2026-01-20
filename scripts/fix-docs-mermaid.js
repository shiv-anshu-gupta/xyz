/**
 * Post-process JSDoc generated HTML to fix Mermaid diagram rendering
 * 
 * Issues fixed:
 * 1. Removes reference to missing build/entry.js
 * 2. Removes inline mermaid v7.1.0 script tags
 * 3. Adds proper mermaid v10 initialization script
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const DOCS_DIR = './docs';

// Script to add for mermaid initialization
const MERMAID_INIT_SCRIPT = `
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ 
    startOnLoad: true,
    theme: 'default',
    flowchart: { useMaxWidth: false },
    securityLevel: 'loose'
  });
</script>
`;

async function processHtmlFile(filePath) {
  let content = await readFile(filePath, 'utf-8');
  let modified = false;

  // 1. Remove broken build/entry.js reference (with or without ./)
  if (content.includes('build/entry.js')) {
    content = content.replace(
      /<script src="\.?\/build\/entry\.js"><\/script>/g,
      '<!-- build/entry.js removed - not needed -->'
    );
    modified = true;
  }

  // 2. Remove ALL inline mermaid 7.1.0 script tags inserted by jsdoc-mermaid plugin
  const oldMermaidPattern = /<script type="text\/javascript" src="https:\/\/unpkg\.com\/mermaid@7\.1\.0\/dist\/mermaid\.min\.js"><\/script>/g;
  if (oldMermaidPattern.test(content)) {
    // Need to reset regex lastIndex
    content = content.replace(
      /<script type="text\/javascript" src="https:\/\/unpkg\.com\/mermaid@7\.1\.0\/dist\/mermaid\.min\.js"><\/script>/g,
      ''
    );
    modified = true;
  }

  // 3. Add mermaid initialization if we have mermaid diagrams and haven't added it yet
  if (content.includes('class="mermaid"') && !content.includes('mermaid.esm.min.mjs')) {
    // Add before </body>
    content = content.replace('</body>', `${MERMAID_INIT_SCRIPT}\n</body>`);
    modified = true;
  }

  if (modified) {
    await writeFile(filePath, content, 'utf-8');
    console.log(`✅ Fixed: ${filePath}`);
    return true;
  }
  return false;
}

async function main() {
  console.log('🔧 Fixing Mermaid in JSDoc output...\n');
  
  const files = await readdir(DOCS_DIR);
  const htmlFiles = files.filter(f => f.endsWith('.html'));
  
  let fixedCount = 0;
  for (const file of htmlFiles) {
    const filePath = join(DOCS_DIR, file);
    if (await processHtmlFile(filePath)) {
      fixedCount++;
    }
  }
  
  console.log(`\n✨ Done! Fixed ${fixedCount}/${htmlFiles.length} files.`);
}

main().catch(console.error);
