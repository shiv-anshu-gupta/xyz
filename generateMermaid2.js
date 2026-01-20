// generateMermaid.js

const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^\d/, '_$&');
}

function getAllJSFiles(dir, files = []) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllJSFiles(fullPath, files);
    } else if (file.endsWith('.js')) {
      files.push(fullPath);
    }
  });
  return files;
}

function analyzeFile(filePath, tree, calls) {
  const code = fs.readFileSync(filePath, 'utf8');
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'objectRestSpread', 'optionalChaining']
  });
  traverse(ast, {
    ClassDeclaration(path) {
      tree.push({ type: 'class', name: path.node.id.name, file: filePath });
    },
    FunctionDeclaration(path) {
      tree.push({ type: 'function', name: path.node.id.name, file: filePath });
      path.traverse({
        CallExpression(callPath) {
          if (callPath.node.callee.type === 'Identifier') {
            calls.push({ from: path.node.id.name, to: callPath.node.callee.name });
          }
        }
      });
    },
    ArrowFunctionExpression(path) {
      if (path.parent.type === 'VariableDeclarator' && path.parent.id.type === 'Identifier') {
        tree.push({ type: 'function', name: path.parent.id.name, file: filePath });
        path.traverse({
          CallExpression(callPath) {
            if (callPath.node.callee.type === 'Identifier') {
              calls.push({ from: path.parent.id.name, to: callPath.node.callee.name });
            }
          }
        });
      }
    }
  });
}

let tree = [];
let calls = [];
const files = getAllJSFiles('./src');
files.forEach(file => analyzeFile(file, tree, calls));

function addSubgraphVertical(mermaidStr, groups, labelGenFn) {
  Object.entries(groups).forEach(([groupId, items]) => {
    mermaidStr += `  subgraph ${groupId}\n`;
    items.forEach((item, idx) => {
      const nodeId = safeName(item.name || item);
      mermaidStr += `    ${nodeId}${labelGenFn(item)}\n`;
      if (idx > 0) {
        const prevId = safeName(items[idx - 1].name || items[idx - 1]);
        mermaidStr += `    ${prevId} --> ${nodeId}\n`;
      }
    });
    mermaidStr += `  end\n`;
  });
  return mermaidStr;
}

// Class/Function Tree
let mermaidTree = 'flowchart TB\n';
const fileGroups = {};
tree.forEach(item => {
  const fileId = safeName(item.file.replace(/.*src\//, ''));
  if (!fileGroups[fileId]) fileGroups[fileId] = [];
  fileGroups[fileId].push(item);
});
mermaidTree = addSubgraphVertical(mermaidTree, fileGroups, item => `[${item.type}: ${item.name}]`);
fs.writeFileSync('./docs/classFunctionTree.mmd', mermaidTree);

// Call Graph
let mermaidCalls = 'flowchart TB\n';
const callsByFile = {};
tree.forEach(item => {
  const fileId = safeName(item.file.replace(/.*src\//, ''));
  if (!callsByFile[fileId]) callsByFile[fileId] = [];
  callsByFile[fileId].push(item.name);
});
mermaidCalls = addSubgraphVertical(mermaidCalls, callsByFile, () => '');
calls.forEach(call => {
  mermaidCalls += `  ${safeName(call.from)} --> ${safeName(call.to)}\n`;
});
fs.writeFileSync('./docs/callGraph.mmd', mermaidCalls);

// Import Graph
let mermaidImports = 'flowchart TB\n';
const importMap = {};
const importsByFile = {};
files.forEach(file => {
  const fileId = safeName(file.replace(/.*src\//, ''));
  const code = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'objectRestSpread', 'optionalChaining']
  });
  traverse(ast, {
    ImportDeclaration(path) {
      const imported = safeName(path.node.source.value);
      if (!importMap[fileId]) importMap[fileId] = [];
      importMap[fileId].push(imported);
      if (!importsByFile[fileId]) importsByFile[fileId] = [];
      importsByFile[fileId].push(imported);
      mermaidImports += `  ${fileId} --> ${imported}\n`;
    }
  });
});
mermaidImports = addSubgraphVertical(mermaidImports, importsByFile, () => '');
fs.writeFileSync('./docs/importGraph.mmd', mermaidImports);

// File Dependency Graph
let mermaidFileDeps = 'flowchart TB\n';
Object.entries(importMap).forEach(([importer, importedArr]) => {
  const filtered = importedArr.filter(i => i !== importer);
  if (filtered.length > 0) {
    mermaidFileDeps += `  subgraph file_${importer}\n`;
    filtered.forEach((imported, idx) => {
      mermaidFileDeps += `    ${imported}\n`;
      if (idx > 0) mermaidFileDeps += `    ${filtered[idx - 1]} --> ${imported}\n`;
    });
    mermaidFileDeps += `  end\n`;
    filtered.forEach(imported => {
      mermaidFileDeps += `  ${importer} --> ${imported}\n`;
    });
  }
});
fs.writeFileSync('./docs/fileDependencyGraph.mmd', mermaidFileDeps);

// Function to File Map
let mermaidFuncFile = 'flowchart TB\n';
const funcByFile = {};
tree.forEach(item => {
  const fileId = safeName(item.file.replace(/.*src\//, ''));
  const nodeId = safeName(item.name);
  mermaidFuncFile += `  ${nodeId} --> ${fileId}\n`;
  if (!funcByFile[fileId]) funcByFile[fileId] = [];
  funcByFile[fileId].push(nodeId);
});
mermaidFuncFile = addSubgraphVertical(mermaidFuncFile, funcByFile, () => '');
fs.writeFileSync('./docs/functionFileMap.mmd', mermaidFuncFile);

// Module Usage Graph
let mermaidModuleUsage = 'flowchart TB\n';
const moduleByFile = {};
files.forEach(file => {
  const fileId = safeName(file.replace(/.*src\//, ''));
  const code = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'objectRestSpread', 'optionalChaining']
  });
  traverse(ast, {
    ImportDeclaration(path) {
      const imported = safeName(path.node.source.value);
      mermaidModuleUsage += `  ${fileId} --> ${imported}\n`;
      if (!moduleByFile[fileId]) moduleByFile[fileId] = [];
      moduleByFile[fileId].push(imported);
    },
    CallExpression(path) {
      if (path.node.callee.type === 'Identifier') {
        const callee = safeName(path.node.callee.name);
        mermaidModuleUsage += `  ${fileId} --> ${callee}\n`;
        if (!moduleByFile[fileId]) moduleByFile[fileId] = [];
        moduleByFile[fileId].push(callee);
      }
    }
  });
});
mermaidModuleUsage = addSubgraphVertical(mermaidModuleUsage, moduleByFile, () => '');
fs.writeFileSync('./docs/moduleUsageGraph.mmd', mermaidModuleUsage);

// Convert all .mmd to .svg
const mmdFiles = [
  'classFunctionTree.mmd',
  'callGraph.mmd',
  'importGraph.mmd',
  'fileDependencyGraph.mmd',
  'functionFileMap.mmd',
  'moduleUsageGraph.mmd'
];
mmdFiles.forEach(file => {
  const mmdPath = `./docs/${file}`;
  const svgPath = mmdPath.replace(/\.mmd$/, '.svg');
  if (fs.existsSync(mmdPath)) {
    try {
      execSync(`mmdc -i ${mmdPath} -o ${svgPath}`);
      console.log(`SVG generated: ${svgPath}`);
    } catch (err) {
      console.error(`Failed to generate SVG for ${mmdPath}:`, err.message);
    }
  }
});
