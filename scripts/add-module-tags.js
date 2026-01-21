/**
 * Script to add @module tags to JS files missing them
 * This ensures proper JSDoc encapsulation
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, basename, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = join(__dirname, '..', 'src');

/**
 * Get module name from file path
 */
function getModuleName(filePath, baseDir) {
  const rel = relative(baseDir, filePath);
  // Remove .js extension and convert path separators
  return rel.replace(/\.js$/, '').replace(/\\/g, '/').replace(/\//g, '_');
}

/**
 * Check if file already has @module tag
 */
function hasModuleTag(content) {
  return /@module\s+\S+/.test(content);
}

/**
 * Get the first non-import line position
 */
function findInsertPosition(content) {
  const lines = content.split('\n');
  let lastImportLine = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('import ') || line.startsWith('import{')) {
      lastImportLine = i;
    } else if (line && !line.startsWith('//') && lastImportLine !== -1) {
      break;
    }
  }
  
  return lastImportLine;
}

/**
 * Process a single JS file
 */
function processFile(filePath, baseDir) {
  const content = readFileSync(filePath, 'utf8');
  const fileName = basename(filePath, '.js');
  
  // Skip files that already have @module
  if (hasModuleTag(content)) {
    console.log(`✓ ${fileName} - already has @module`);
    return false;
  }
  
  // Skip copy/backup files
  if (/copy|Copy|EXAMPLE|NOTES|IMPLEMENTATION|REFERENCE/i.test(fileName)) {
    console.log(`⊘ ${fileName} - skipped (backup/example file)`);
    return false;
  }
  
  // Determine module name based on directory
  const relPath = relative(baseDir, filePath);
  const dirName = dirname(relPath).replace(/\\/g, '/');
  let moduleName;
  
  if (dirName === '.') {
    moduleName = fileName;
  } else {
    moduleName = `${dirName}/${fileName}`.replace(/\//g, '_');
  }
  
  // Create module header
  const moduleHeader = `/**
 * @module ${moduleName}
 * @description ${fileName} module
 */

`;
  
  // Find insert position (after imports)
  const lastImportIdx = findInsertPosition(content);
  const lines = content.split('\n');
  
  let newContent;
  if (lastImportIdx === -1) {
    // No imports, add at the beginning
    newContent = moduleHeader + content;
  } else {
    // Add after imports with a blank line
    const before = lines.slice(0, lastImportIdx + 1).join('\n');
    const after = lines.slice(lastImportIdx + 1).join('\n');
    newContent = before + '\n\n' + moduleHeader + after;
  }
  
  writeFileSync(filePath, newContent, 'utf8');
  console.log(`✓ ${fileName} - added @module ${moduleName}`);
  return true;
}

/**
 * Recursively process directory
 */
function processDirectory(dir, baseDir) {
  const entries = readdirSync(dir);
  let processed = 0;
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      processed += processDirectory(fullPath, baseDir);
    } else if (entry.endsWith('.js') && !entry.includes('.test.')) {
      if (processFile(fullPath, baseDir)) {
        processed++;
      }
    }
  }
  
  return processed;
}

// Run
console.log('Adding @module tags to source files...\n');
const count = processDirectory(srcDir, srcDir);
console.log(`\n✅ Processed ${count} files`);
