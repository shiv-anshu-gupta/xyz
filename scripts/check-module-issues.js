/**
 * Find and fix files with carriage return issues in @module tags
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, '..', 'src');

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Find @module lines
  const moduleMatch = content.match(/@module\s+[^\n\r]+/);
  if (moduleMatch) {
    const moduleLine = moduleMatch[0];
    // Check for any special characters
    const hasSpecialChars = /[\r]/.test(moduleLine);
    if (hasSpecialChars) {
      console.log(`Problem in: ${path.relative(srcDir, filePath)}`);
      console.log(`  Module line: "${moduleLine.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`);
      return true;
    }
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

console.log('🔍 Checking for @module issues...\n');

let foundCount = 0;
walkDir(srcDir, (filePath) => {
  if (checkFile(filePath)) {
    foundCount++;
  }
});

console.log(`\n✅ Found ${foundCount} files with issues.`);
