/**
 * Fix JSDoc syntax issues in all source files
 * - Removes double asterisk lines: "* *" -> "*"
 * - Replaces "* * @" with "* @"
 * - Ensures @module is followed by @description (not raw text)
 * - Removes duplicate @description tags
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, '..', 'src');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;
  
  // Fix double asterisk before any JSDoc tag: "* * @" -> "* @"
  content = content.replace(/\* \* @/g, '* @');
  
  // Fix empty lines with double asterisk (handle both \r\n and \n endings): "* * \r\n" or "* *\n" -> "*\n"
  content = content.replace(/\* \* ?\r?\n/g, '*\n');
  
  // Fix @module followed by text that isn't a tag (handle both line endings)
  // Pattern: @module ModuleName\n * Text that isn't a tag
  // Replace with: @module ModuleName\n * @description Text
  content = content.replace(
    /(@module [A-Za-z0-9/_-]+)\r?\n(\s*\* )(?!@)([A-Z][^\n]*)/g,
    '$1\n$2@description $3'
  );
  
  // Remove duplicate @description tags if they exist
  // Pattern: @description ...\n * @description
  content = content.replace(/(@description [^\n]*\r?\n\s*\* )@description /g, '$1');
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`  Fixed: ${path.relative(srcDir, filePath)}`);
    return true;
  }
  return false;
}

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, callback);
    } else if (file.endsWith('.js')) {
      callback(filePath);
    }
  });
}

console.log('🔧 Fixing JSDoc syntax issues...\n');

let fixedCount = 0;
walkDir(srcDir, (filePath) => {
  if (fixFile(filePath)) {
    fixedCount++;
  }
});

console.log(`\n✨ Done! Fixed ${fixedCount} files.`);
