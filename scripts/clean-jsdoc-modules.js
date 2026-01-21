/**
 * JSDoc Module Cleanup - Ensures exactly ONE @module per file
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';

const srcDir = './src';

// Mapping of files to their new module namespace
const moduleMapping = {
  // COMPONENTS - Chart Rendering
  'renderComtradeCharts.js': 'Components/ChartRendering',
  'renderSingleAnalogChart.js': 'Components/ChartRendering',
  'renderSingleDigitalChart.js': 'Components/ChartRendering',
  'renderDigitalCharts.js': 'Components/ChartRendering',
  'renderComputedChart.js': 'Components/ChartRendering',
  'chartComponent.js': 'Components/ChartCore',
  'chartManager.js': 'Components/ChartCore',
  'chartUpdateHelpers.js': 'Components/ChartCore',
  
  // COMPONENTS - UI Elements
  'ProgressBar.js': 'Components/UI',
  'Tooltip.js': 'Components/UI',
  'showError.js': 'Components/UI',
  'ResizableGroup.js': 'Components/UI',
  'SidebarResizer.js': 'Components/UI',
  'createDragBar.js': 'Components/UI',
  'debugPanelLite.js': 'Components/UI',
  
  // COMPONENTS - Sidebars
  'AnalysisSidebar.js': 'Components/Sidebars',
  'ComputedChannelsSidebar.js': 'Components/Sidebars',
  'ChannelList.js': 'Components/Sidebars',
  'showChannelListWindow.js': 'Components/Sidebars',
  
  // COMPONENTS - Delta/Analysis
  'DeltaDrawer.js': 'Components/Analysis',
  'DeltaTable.js': 'Components/Analysis',
  'DeltaTableDataFormatter.js': 'Components/Analysis',
  'DeltaTableRenderer.js': 'Components/Analysis',
  
  // COMPONENTS - Polar Chart
  'PolarChart.js': 'Components/PolarChart',
  'PolarChartCanvas.js': 'Components/PolarChart',
  'setupPolarChartIntegration.js': 'Components/PolarChart',
  
  // COMPONENTS - Vertical Line
  'verticalLineControl.js': 'Components/VerticalLine',
  'initVerticalLineControl.js': 'Components/VerticalLine',
  'handleVerticalLineShortcuts.js': 'Components/VerticalLine',
  
  // COMPONENTS - Equation Editor
  'EquationEvaluatorInChannelList.js': 'Components/Equation',
  
  // COMPONENTS - State
  'createState.js': 'Components/State',
  
  // COMPONENTS - Drag & Drop
  'setupChartDragAndDrop.js': 'Components/DragDrop',
  
  // UTILS - COMTRADE Parsing
  'comtradeUtils.js': 'Utils/COMTRADE',
  
  // UTILS - Chart Utilities
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
  
  // UTILS - Data Processing
  'calculateDeltas.js': 'Utils/Data',
  'channelMerger.js': 'Utils/Data',
  'channelNameExtractor.js': 'Utils/Data',
  'timeInterpolation.js': 'Utils/Data',
  'timeMerger.js': 'Utils/Data',
  'mergeComtradeFiles.js': 'Utils/Data',
  'csvExport.js': 'Utils/Data',
  'binaryExportUtils.js': 'Utils/Data',
  'visibleChartExport.js': 'Utils/Data',
  
  // UTILS - Computed Channels
  'computedChannelDataProcessor.js': 'Utils/ComputedChannels',
  'computedChannelLabelRenderer.js': 'Utils/ComputedChannels',
  'computedChannelMetadata.js': 'Utils/ComputedChannels',
  'computedChannelOptimization.js': 'Utils/ComputedChannels',
  'computedChannelsState.js': 'Utils/ComputedChannels',
  'computedChannelStorage.js': 'Utils/ComputedChannels',
  'computedChartCreationUtils.js': 'Utils/ComputedChannels',
  'computedChartInteractions.js': 'Utils/ComputedChannels',
  
  // UTILS - Digital Channels
  'digitalChannelUtils.js': 'Utils/DigitalChannels',
  
  // UTILS - Grouping
  'autoGroupChannels.js': 'Utils/Grouping',
  'groupingUtils.js': 'Utils/Grouping',
  'analyzeGroupsAndPublish.js': 'Utils/Grouping',
  'calculateAndPublishMaxYAxes.js': 'Utils/Grouping',
  'maxYAxesStore.js': 'Utils/Grouping',
  
  // UTILS - DOM & UI
  'domUpdateQueue.js': 'Utils/DOM',
  'domUpdateQueueInit.js': 'Utils/DOM',
  'eventListenerManager.js': 'Utils/DOM',
  'requestAnimationFrameUpdates.js': 'Utils/DOM',
  'uiHelpers.js': 'Utils/DOM',
  'sidebarResize.js': 'Utils/DOM',
  'sidebarStore.js': 'Utils/DOM',
  
  // UTILS - Theming & Style
  'tailwindColors.js': 'Utils/Theme',
  'themeBroadcast.js': 'Utils/Theme',
  'constants.js': 'Utils/Theme',
  
  // UTILS - Helpers
  'helpers.js': 'Utils/Helpers',
  'mathJaxLoader.js': 'Utils/Helpers',
  'mergerWindowLauncher.js': 'Utils/Helpers',
  
  // PLUGINS
  'verticalLinePlugin.js': 'Plugins/Chart',
  'horizontalZoomPanPlugin.js': 'Plugins/Chart',
  'deltaBoxPlugin.js': 'Plugins/Chart',
  'digitalFillPlugin.js': 'Plugins/Chart',
  'axisLinesPlugin.js': 'Plugins/Chart',
  'autoUnitScalePlugin.js': 'Plugins/Chart',
  
  // SERVICES - Computed Channels
  'index.js': 'Services/ComputedChannels',
  'dataPreparation.js': 'Services/ComputedChannels',
  'eventHandling.js': 'Services/ComputedChannels',
  'expressionConversion.js': 'Services/ComputedChannels',
  'resultProcessing.js': 'Services/ComputedChannels',
  'stateUpdate.js': 'Services/ComputedChannels',
  'validators.js': 'Services/ComputedChannels',
  'workerManagement.js': 'Services/ComputedChannels',
};

function getNewModuleName(filePath) {
  const fileName = basename(filePath);
  
  if (moduleMapping[fileName]) {
    return moduleMapping[fileName];
  }
  
  if (filePath.includes('services/computedChannels') || filePath.includes('services\\computedChannels')) {
    return 'Services/ComputedChannels';
  }
  
  return null;
}

function cleanModuleDeclarations(filePath) {
  const newModule = getNewModuleName(filePath);
  if (!newModule) {
    return false;
  }
  
  try {
    let content = readFileSync(filePath, 'utf8');
    
    // Remove ALL existing @module declarations
    content = content.replace(/@module\s+[\w\/._-]+\s*/g, '');
    
    // Find the @file tag and add @module right after it
    const fileTagMatch = content.match(/(@file\s+[\w._-]+(?:\.\w+)?)/);
    
    if (fileTagMatch) {
      // Add @module after @file
      content = content.replace(fileTagMatch[0], `${fileTagMatch[0]}\n * @module ${newModule}`);
      writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Cleaned: ${basename(filePath)} → @module ${newModule}`);
      return true;
    } else {
      // If no @file tag, look for the first JSDoc comment and add @module there
      const jsdocMatch = content.match(/\/\*\*\s*\n/);
      if (jsdocMatch) {
        content = content.replace(jsdocMatch[0], `/**\n * @module ${newModule}\n`);
        writeFileSync(filePath, content, 'utf8');
        console.log(`✅ Added: ${basename(filePath)} → @module ${newModule}`);
        return true;
      }
    }
    
    console.log(`⚠️  No JSDoc found: ${basename(filePath)}`);
    return false;
  } catch (err) {
    console.error(`❌ Error: ${basename(filePath)} - ${err.message}`);
    return false;
  }
}

function processDirectory(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  let count = 0;
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      count += processDirectory(fullPath);
    } else if (entry.name.endsWith('.js') && 
               !entry.name.includes('Copy') && 
               !entry.name.includes('copy') &&
               !entry.name.includes('test') &&
               !entry.name.includes('NOTES') &&
               !entry.name.includes('EXAMPLE') &&
               !entry.name.includes('REFERENCE') &&
               !entry.name.includes('IMPLEMENTATION') &&
               !entry.name.includes('DOCUMENTATION') &&
               !entry.name.includes('_')) {
      if (cleanModuleDeclarations(fullPath)) {
        count++;
      }
    }
  }
  
  return count;
}

console.log('🧹 Cleaning and restructuring JSDoc modules...\n');
const updated = processDirectory(srcDir);
console.log(`\n✨ Done! Processed ${updated} files.`);
