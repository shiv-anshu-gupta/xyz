/**
 * JSDoc Module Name Restructurer
 * 
 * This script updates @module declarations in source files to use a clean,
 * hierarchical namespace structure for better documentation organization.
 * 
 * Structure:
 * - Components → Components/ChartRendering, Components/UI, Components/Sidebars
 * - Utils → Utils/Chart, Utils/Data, Utils/DOM, Utils/State
 * - Plugins → Plugins/Chart
 * - Services → Services/ComputedChannels
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';

const srcDir = './src';

// Mapping of files to their new module namespace
const moduleMapping = {
  // ═══════════════════════════════════════════════════════════════════════
  // COMPONENTS - Chart Rendering
  // ═══════════════════════════════════════════════════════════════════════
  'renderComtradeCharts.js': 'Components/ChartRendering',
  'renderSingleAnalogChart.js': 'Components/ChartRendering',
  'renderSingleDigitalChart.js': 'Components/ChartRendering',
  'renderDigitalCharts.js': 'Components/ChartRendering',
  'renderComputedChart.js': 'Components/ChartRendering',
  'chartComponent.js': 'Components/ChartCore',
  'chartManager.js': 'Components/ChartCore',
  'chartUpdateHelpers.js': 'Components/ChartCore',
  
  // ═══════════════════════════════════════════════════════════════════════
  // COMPONENTS - UI Elements
  // ═══════════════════════════════════════════════════════════════════════
  'ProgressBar.js': 'Components/UI',
  'Tooltip.js': 'Components/UI',
  'showError.js': 'Components/UI',
  'ResizableGroup.js': 'Components/UI',
  'SidebarResizer.js': 'Components/UI',
  'createDragBar.js': 'Components/UI',
  'debugPanelLite.js': 'Components/UI',
  
  // ═══════════════════════════════════════════════════════════════════════
  // COMPONENTS - Sidebars
  // ═══════════════════════════════════════════════════════════════════════
  'AnalysisSidebar.js': 'Components/Sidebars',
  'ComputedChannelsSidebar.js': 'Components/Sidebars',
  'ChannelList.js': 'Components/Sidebars',
  'showChannelListWindow.js': 'Components/Sidebars',
  
  // ═══════════════════════════════════════════════════════════════════════
  // COMPONENTS - Delta/Analysis
  // ═══════════════════════════════════════════════════════════════════════
  'DeltaDrawer.js': 'Components/Analysis',
  'DeltaTable.js': 'Components/Analysis',
  'DeltaTableDataFormatter.js': 'Components/Analysis',
  'DeltaTableRenderer.js': 'Components/Analysis',
  
  // ═══════════════════════════════════════════════════════════════════════
  // COMPONENTS - Polar Chart
  // ═══════════════════════════════════════════════════════════════════════
  'PolarChart.js': 'Components/PolarChart',
  'PolarChartCanvas.js': 'Components/PolarChart',
  'setupPolarChartIntegration.js': 'Components/PolarChart',
  
  // ═══════════════════════════════════════════════════════════════════════
  // COMPONENTS - Vertical Line
  // ═══════════════════════════════════════════════════════════════════════
  'verticalLineControl.js': 'Components/VerticalLine',
  'initVerticalLineControl.js': 'Components/VerticalLine',
  'handleVerticalLineShortcuts.js': 'Components/VerticalLine',
  
  // ═══════════════════════════════════════════════════════════════════════
  // COMPONENTS - Equation Editor
  // ═══════════════════════════════════════════════════════════════════════
  'EquationEvaluatorInChannelList.js': 'Components/Equation',
  
  // ═══════════════════════════════════════════════════════════════════════
  // COMPONENTS - State
  // ═══════════════════════════════════════════════════════════════════════
  'createState.js': 'Components/State',
  
  // ═══════════════════════════════════════════════════════════════════════
  // COMPONENTS - Drag & Drop
  // ═══════════════════════════════════════════════════════════════════════
  'setupChartDragAndDrop.js': 'Components/DragDrop',
  
  // ═══════════════════════════════════════════════════════════════════════
  // UTILS - Chart Utilities
  // ═══════════════════════════════════════════════════════════════════════
  'axisBuilder.js': 'Utils/Chart',
  'axisCalculator.js': 'Utils/Chart',
  'chartAxisAlignment.js': 'Utils/Chart',
  'chartCreationUtils.js': 'Utils/Chart',
  'chartDataProcessor.js': 'Utils/Chart',
  'chartDomUtils.js': 'Utils/Chart',
  'chartInteractions.js': 'Utils/Chart',
  'chartMetadataStore.js': 'Utils/Chart',
  'chartUtils.js': 'Utils/Chart',
  'seriesMapper.js': 'Utils/Chart',
  'scaleUtils.js': 'Utils/Chart',
  'zoomControls.js': 'Utils/Chart',
  
  // ═══════════════════════════════════════════════════════════════════════
  // UTILS - Data Processing
  // ═══════════════════════════════════════════════════════════════════════
  'comtradeUtils.js': 'Utils/Data',
  'calculateDeltas.js': 'Utils/Data',
  'channelMerger.js': 'Utils/Data',
  'channelNameExtractor.js': 'Utils/Data',
  'timeInterpolation.js': 'Utils/Data',
  'timeMerger.js': 'Utils/Data',
  'mergeComtradeFiles.js': 'Utils/Data',
  'csvExport.js': 'Utils/Data',
  'binaryExportUtils.js': 'Utils/Data',
  'visibleChartExport.js': 'Utils/Data',
  
  // ═══════════════════════════════════════════════════════════════════════
  // UTILS - Computed Channels
  // ═══════════════════════════════════════════════════════════════════════
  'computedChannelDataProcessor.js': 'Utils/ComputedChannels',
  'computedChannelLabelRenderer.js': 'Utils/ComputedChannels',
  'computedChannelMetadata.js': 'Utils/ComputedChannels',
  'computedChannelOptimization.js': 'Utils/ComputedChannels',
  'computedChannelsState.js': 'Utils/ComputedChannels',
  'computedChannelStorage.js': 'Utils/ComputedChannels',
  'computedChartCreationUtils.js': 'Utils/ComputedChannels',
  'computedChartInteractions.js': 'Utils/ComputedChannels',
  
  // ═══════════════════════════════════════════════════════════════════════
  // UTILS - Digital Channels
  // ═══════════════════════════════════════════════════════════════════════
  'digitalChannelUtils.js': 'Utils/DigitalChannels',
  
  // ═══════════════════════════════════════════════════════════════════════
  // UTILS - Grouping
  // ═══════════════════════════════════════════════════════════════════════
  'autoGroupChannels.js': 'Utils/Grouping',
  'groupingUtils.js': 'Utils/Grouping',
  'analyzeGroupsAndPublish.js': 'Utils/Grouping',
  'calculateAndPublishMaxYAxes.js': 'Utils/Grouping',
  'maxYAxesStore.js': 'Utils/Grouping',
  
  // ═══════════════════════════════════════════════════════════════════════
  // UTILS - DOM & UI
  // ═══════════════════════════════════════════════════════════════════════
  'domUpdateQueue.js': 'Utils/DOM',
  'domUpdateQueueInit.js': 'Utils/DOM',
  'eventListenerManager.js': 'Utils/DOM',
  'requestAnimationFrameUpdates.js': 'Utils/DOM',
  'uiHelpers.js': 'Utils/DOM',
  'sidebarResize.js': 'Utils/DOM',
  'sidebarStore.js': 'Utils/DOM',
  
  // ═══════════════════════════════════════════════════════════════════════
  // UTILS - Theming & Style
  // ═══════════════════════════════════════════════════════════════════════
  'tailwindColors.js': 'Utils/Theme',
  'themeBroadcast.js': 'Utils/Theme',
  'constants.js': 'Utils/Theme',
  
  // ═══════════════════════════════════════════════════════════════════════
  // UTILS - Helpers
  // ═══════════════════════════════════════════════════════════════════════
  'helpers.js': 'Utils/Helpers',
  'mathJaxLoader.js': 'Utils/Helpers',
  'mergerWindowLauncher.js': 'Utils/Helpers',
  
  // ═══════════════════════════════════════════════════════════════════════
  // PLUGINS
  // ═══════════════════════════════════════════════════════════════════════
  'verticalLinePlugin.js': 'Plugins/Chart',
  'horizontalZoomPanPlugin.js': 'Plugins/Chart',
  'deltaBoxPlugin.js': 'Plugins/Chart',
  'digitalFillPlugin.js': 'Plugins/Chart',
  'axisLinesPlugin.js': 'Plugins/Chart',
  'autoUnitScalePlugin.js': 'Plugins/Chart',
  
  // ═══════════════════════════════════════════════════════════════════════
  // SERVICES - Computed Channels
  // ═══════════════════════════════════════════════════════════════════════
  'index.js': 'Services/ComputedChannels',
  'dataPreparation.js': 'Services/ComputedChannels',
  'eventHandling.js': 'Services/ComputedChannels',
  'expressionConversion.js': 'Services/ComputedChannels',
  'resultProcessing.js': 'Services/ComputedChannels',
  'stateUpdate.js': 'Services/ComputedChannels',
  'validators.js': 'Services/ComputedChannels',
  'workerManagement.js': 'Services/ComputedChannels',
};

// Function to get the new module name for a file
function getNewModuleName(filePath) {
  const fileName = basename(filePath);
  const dirName = basename(dirname(filePath));
  
  // Check if this file has a specific mapping
  if (moduleMapping[fileName]) {
    return moduleMapping[fileName];
  }
  
  // For services/computedChannels subfolder
  if (filePath.includes('services/computedChannels') || filePath.includes('services\\computedChannels')) {
    return 'Services/ComputedChannels';
  }
  
  return null;
}

// Function to update a file's @module declaration
function updateModuleDeclaration(filePath) {
  const newModule = getNewModuleName(filePath);
  if (!newModule) {
    console.log(`⏭️  Skipping (no mapping): ${filePath}`);
    return false;
  }
  
  try {
    let content = readFileSync(filePath, 'utf8');
    
    // Match @module declarations with various formats
    const moduleRegex = /@module\s+[\w\/._-]+/g;
    
    if (moduleRegex.test(content)) {
      content = content.replace(moduleRegex, `@module ${newModule}`);
      writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Updated: ${filePath} → @module ${newModule}`);
      return true;
    } else {
      console.log(`⚠️  No @module found: ${filePath}`);
      return false;
    }
  } catch (err) {
    console.error(`❌ Error updating ${filePath}:`, err.message);
    return false;
  }
}

// Recursively process all .js files
function processDirectory(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  let count = 0;
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      count += processDirectory(fullPath);
    } else if (entry.name.endsWith('.js') && !entry.name.includes('Copy') && !entry.name.includes('test')) {
      if (updateModuleDeclaration(fullPath)) {
        count++;
      }
    }
  }
  
  return count;
}

// Main execution
console.log('🚀 Starting JSDoc module restructuring...\n');
const updated = processDirectory(srcDir);
console.log(`\n✨ Done! Updated ${updated} files.`);
