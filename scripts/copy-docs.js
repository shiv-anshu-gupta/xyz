/**
 * @file copy-docs.js
 * @description Cross-platform script to copy docs folder into dist/docs
 */

import { cpSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const srcDir = join(rootDir, 'docs');
const destDir = join(rootDir, 'dist', 'docs');

if (!existsSync(srcDir)) {
  console.error('❌ docs folder does not exist. Run npm run docs first.');
  process.exit(1);
}

// Create dist folder if it doesn't exist
if (!existsSync(join(rootDir, 'dist'))) {
  mkdirSync(join(rootDir, 'dist'), { recursive: true });
}

// Copy docs to dist/docs
cpSync(srcDir, destDir, { recursive: true });
console.log('✅ Copied docs/ to dist/docs/');
