// generateMermaid.js

const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const fs = require('fs');
const path = require('path');

// Utility to sanitize node names for Mermaid
function safeName(name) {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_') // Replace non-alphanum with _
    .replace(/^\d/, '_$&'); // Prefix if starts with digit
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

// Collects class/function tree and call graph
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
      // Find calls inside this function
      path.traverse({
        CallExpression(callPath) {
          if (callPath.node.callee.type === 'Identifier') {
            calls.push({ from: path.node.id.name, to: callPath.node.callee.name });
          }
        }
      });
    },
    ArrowFunctionExpression(path) {
      // Optionally handle arrow functions assigned to variables
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

// Main
let tree = [];
let calls = [];
const files = getAllJSFiles('./src');
files.forEach(file => {
  analyzeFile(file, tree, calls);
});

// Mermaid class/function tree with grouping by file/module
let mermaidTree = 'graph TD\n';
const fileGroups = {};
tree.forEach(item => {
  const fileId = safeName(item.file.replace(/.*src\//, ''));
  if (!fileGroups[fileId]) fileGroups[fileId] = [];
  fileGroups[fileId].push(item);
});

Object.entries(fileGroups).forEach(([fileId, items]) => {
  mermaidTree += `  subgraph ${fileId}\n`;
  items.forEach(item => {
    const nodeId = safeName(item.name);
    mermaidTree += `    ${nodeId}[${item.type}: ${item.name}]\n`;
  });
  mermaidTree += `  end\n`;
});

// Mermaid call graph with grouping by file/module
let mermaidCalls = 'flowchart TD\n';
const callsByFile = {};
tree.forEach(item => {
  const fileId = safeName(item.file.replace(/.*src\//, ''));
  if (!callsByFile[fileId]) callsByFile[fileId] = [];
  callsByFile[fileId].push(item.name);
});
Object.entries(callsByFile).forEach(([fileId, names]) => {
  mermaidCalls += `  subgraph ${fileId}\n`;
  names.forEach(name => {
    const nodeId = safeName(name);
    mermaidCalls += `    ${nodeId}\n`;
  });
  mermaidCalls += `  end\n`;
});
calls.forEach(call => {
  const fromId = safeName(call.from);
  const toId = safeName(call.to);
  mermaidCalls += `  ${fromId} --> ${toId}\n`;
});

fs.writeFileSync('./docs/classFunctionTree.mmd', mermaidTree);
fs.writeFileSync('./docs/callGraph.mmd', mermaidCalls);
console.log('Mermaid tree and call graph generated at docs/classFunctionTree.mmd and docs/callGraph.mmd');


// Mermaid import graph (who imports what) with grouping
let mermaidImports = 'graph TD\n';
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
      if (fileId !== imported) {
        mermaidImports += `  ${fileId} --> ${imported}\n`;
      }
      if (!importMap[fileId]) importMap[fileId] = [];
      importMap[fileId].push(imported);
      if (!importsByFile[fileId]) importsByFile[fileId] = [];
      importsByFile[fileId].push(imported);
    }
  });
});
Object.entries(importsByFile).forEach(([fileId, importedArr]) => {
  mermaidImports += `  subgraph ${fileId}\n`;
  importedArr.forEach(imported => {
    mermaidImports += `    ${imported}\n`;
  });
  mermaidImports += `  end\n`;
});
fs.writeFileSync('./docs/importGraph.mmd', mermaidImports);

// Mermaid file dependency graph with grouping and cycle prevention
let mermaidFileDeps = 'graph TD\n';
Object.keys(importMap).forEach(importer => {
  // Filter out self-references
  const nonSelfImports = importMap[importer].filter(imported => imported !== importer);
  if (nonSelfImports.length === 0) {
    // If all imports are self-references, skip subgraph for this file
    return;
  }
  mermaidFileDeps += `  subgraph file_${importer}\n`;
  nonSelfImports.forEach(imported => {
    // Only add non-self imports as nodes and edges, and never add a node with the same name as the subgraph
    if (imported !== importer) {
      mermaidFileDeps += `    ${imported}\n`;
      mermaidFileDeps += `  ${importer} --> ${imported}\n`;
    }
  });
  mermaidFileDeps += `  end\n`;
});
fs.writeFileSync('./docs/fileDependencyGraph.mmd', mermaidFileDeps);

// Mermaid function-to-file mapping with grouping
let mermaidFuncFile = 'graph TD\n';
const funcByFile = {};
tree.forEach(item => {
  const nodeId = safeName(item.name);
  const fileId = safeName(item.file.replace(/.*src\//, ''));
  if (nodeId !== fileId) {
    mermaidFuncFile += `  ${nodeId} --> ${fileId}\n`;
  }
  if (!funcByFile[fileId]) funcByFile[fileId] = [];
  funcByFile[fileId].push(nodeId);
});
Object.entries(funcByFile).forEach(([fileId, nodeArr]) => {
  mermaidFuncFile += `  subgraph ${fileId}\n`;
  nodeArr.forEach(nodeId => {
    mermaidFuncFile += `    ${nodeId}\n`;
  });
  mermaidFuncFile += `  end\n`;
});
fs.writeFileSync('./docs/functionFileMap.mmd', mermaidFuncFile);

// Mermaid module usage graph with grouping
let mermaidModuleUsage = 'graph TD\n';
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
      if (fileId !== imported) {
        mermaidModuleUsage += `  ${fileId} --> ${imported}\n`;
      }
      if (!moduleByFile[fileId]) moduleByFile[fileId] = [];
      moduleByFile[fileId].push(imported);
    },
    CallExpression(path) {
      if (path.node.callee.type === 'Identifier') {
        const callee = safeName(path.node.callee.name);
        if (fileId !== callee) {
          mermaidModuleUsage += `  ${fileId} --> ${callee}\n`;
        }
        if (!moduleByFile[fileId]) moduleByFile[fileId] = [];
        moduleByFile[fileId].push(callee);
      }
    }
  });
});
Object.entries(moduleByFile).forEach(([fileId, nodeArr]) => {
  mermaidModuleUsage += `  subgraph ${fileId}\n`;
  nodeArr.forEach(nodeId => {
    mermaidModuleUsage += `    ${nodeId}\n`;
  });
  mermaidModuleUsage += `  end\n`;
});
fs.writeFileSync('./docs/moduleUsageGraph.mmd', mermaidModuleUsage);

// Auto-convert all .mmd files in ./docs to .svg using Mermaid CLI
const { execSync } = require('child_process');
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