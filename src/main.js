/**
 * @file main.js
 * @module main
 * 
 * @description
 * <h3>COMTRADE Viewer Application Entry Point</h3>
 * 
 * <p>Main application logic for the COMTRADE waveform viewer. Handles file loading,
 * chart rendering, state management, and cross-window communication with popup editors.</p>
 * 
 * <h4>Core Responsibilities</h4>
 * <table>
 *   <tr><th>Area</th><th>Description</th></tr>
 *   <tr><td>File Loading</td><td>Parse CFG/DAT files, initialize data structures</td></tr>
 *   <tr><td>Chart Rendering</td><td>Create uPlot instances for analog/digital/computed channels</td></tr>
 *   <tr><td>State Management</td><td>Maintain channelState for colors, groups, labels</td></tr>
 *   <tr><td>Message Handling</td><td>Process postMessage from popup Channel List window</td></tr>
 *   <tr><td>UI Updates</td><td>Progress bar, stats cards, sidebar coordination</td></tr>
 * </table>
 * 
 * <h4>Message Types (from Popup Windows)</h4>
 * <table>
 *   <tr><th>Type</th><th>Action</th></tr>
 *   <tr><td>callback_color</td><td>Update channel trace color</td></tr>
 *   <tr><td>callback_channelName</td><td>Update channel display name</td></tr>
 *   <tr><td>callback_update</td><td>Generic field update (unit, scale, etc.)</td></tr>
 *   <tr><td>callback_addChannel</td><td>Add new computed channel</td></tr>
 *   <tr><td>callback_delete</td><td>Delete computed channel</td></tr>
 *   <tr><td>callback_group</td><td>Change channel group assignment</td></tr>
 * </table>
 * 
 * <h4>Key Exports to Window</h4>
 * <ul>
 *   <li><strong>window.channelState</strong> — Reactive state for channel properties</li>
 *   <li><strong>window.globalCfg</strong> — Parsed COMTRADE configuration</li>
 *   <li><strong>window.globalData</strong> — Parsed COMTRADE data arrays</li>
 *   <li><strong>window.charts</strong> — Array of uPlot chart instances</li>
 * </ul>
 * 
 * @see {@link module:components/chartManager} - Centralized chart update handling
 * @see {@link module:components/renderComtradeCharts} - Chart rendering orchestrator
 * @see {@link module:services/computedChannels} - Computed channel evaluation
 * 
 * @example
 * // Application lifecycle:
 * // 1. User drops CFG/DAT files
 * // 2. Files parsed via parseCFG/parseDAT
 * // 3. channelState initialized with colors, groups
 * // 4. renderComtradeCharts creates uPlot instances
 * // 5. User opens Channel List popup
 * // 6. Popup sends postMessage on changes
 * // 7. main.js message handler updates state
 * // 8. Charts re-render via chartManager
 * 
 * @mermaid
 * graph TD
 *     subgraph File_Loading
 *         A[User Drops Files] --> B[parseCFG]
 *         B --> C[parseDAT]
 *         C --> D[Initialize channelState]
 *         D --> E[renderComtradeCharts]
 *     end
 *     
 *     subgraph Message_Handling
 *         F[Popup Window] -->|postMessage| G[window.onmessage]
 *         G --> H{Message Type}
 *         H -->|callback_color| I[Update Color]
 *         H -->|callback_group| J[Change Group]
 *         H -->|callback_addChannel| K[Add Computed]
 *         H -->|callback_delete| L[Delete Channel]
 *     end
 *     
 *     subgraph State_Updates
 *         I --> M[channelState Update]
 *         J --> M
 *         K --> M
 *         L --> M
 *         M --> N[chartManager Notified]
 *         N --> O[Charts Re-render]
 *     end
 *     
 *     style A fill:#4CAF50,color:white
 *     style G fill:#2196F3,color:white
 *     style O fill:#FF9800,color:white
 */

import {
  createChartOptions,
  updateAllChartAxisColors,
} from "./components/chartComponent.js";
import { parseCFG, parseDAT } from "./components/comtradeUtils.js";
import { createState } from "./components/createState.js";
import { themeContext } from "./Context/ThemeContext.js";
import {
  calculateDeltas,
  collectChartDeltas,
} from "./utils/calculateDeltas.js";
import { createDeltaDrawer } from "./components/DeltaDrawer.js";
import { createAnalysisSidebar } from "./components/AnalysisSidebar.js";
import { sidebarStore } from "./utils/sidebarStore.js";
import { adjustMainContent } from "./utils/sidebarResize.js";
import { createDragBar } from "./components/createDragBar.js";
import { setupChartDragAndDrop } from "./components/setupChartDragAndDrop.js";
import { handleVerticalLineShortcuts } from "./components/handleVerticalLineShortcuts.js";
import { showError } from "./components/showError.js";
import { renderComtradeCharts } from "./components/renderComtradeCharts.js";
import { renderComputedChart } from "./components/renderComputedChart.js";
import { handleComputedChannelEvaluation } from "./services/computedChannels/index.js";
import { ResizableGroup } from "./components/ResizableGroup.js";
import { showChannelListWindow } from "./components/showChannelListWindow.js";
import { createChannelList } from "./components/ChannelList.js";
import { createCustomElement } from "./utils/helpers.js";
import {
  analogPalette,
  digitalPalette,
  computedPalette,
} from "./utils/constants.js";

// ✅ Make computedPalette available globally for popup windows
if (typeof window !== "undefined") {
  window.COMPUTED_CHANNEL_COLORS = computedPalette[0]; // Use light theme palette (index 0)
  console.log(
    "[main] Computed channel colors loaded and exposed to window:",
    window.COMPUTED_CHANNEL_COLORS
  );
}
import { subscribeChartUpdates, handleChannelUpdate } from "./components/chartManager.js";
import { debugLite } from "./components/debugPanelLite.js";
import { autoGroupChannels } from "./utils/autoGroupChannels.js";
import { initVerticalLineControl } from "./components/initVerticalLineControl.js";
import { debounce } from "./utils/computedChannelOptimization.js";
import {
  exportComputedChannelAsASCII,
  importComputedChannelFromJSON,
  exportComputedChannelAsCFGDAT,
} from "./components/EquationEvaluatorInChannelList.js";
import { exportVisibleChartsAsComtrade } from "./utils/visibleChartExport.js";
import {
  showFileInfo,
  updateStatsCards,
  wrapChartInSection,
  updateFileInfo,
  toggleChartsVisibility,
  clearChartsContainer,
} from "./utils/uiHelpers.js";
import { exportComputedChannelsAsCSV, exportAllChannelsAsCSV } from "./utils/csvExport.js";
import {
  saveComputedChannelsToStorage,
  loadComputedChannelsFromStorage,
  updateComputedChannelGroupInStorage,
  getComputedChannelById,
} from "./utils/computedChannelStorage.js";
import { PolarChart } from "./components/PolarChart.js";
import { PolarChartCanvas } from "./components/PolarChartCanvas.js"; // ✅ NEW: Canvas-based renderer
import { setupPolarChartWithVerticalLines } from "./components/setupPolarChartIntegration.js";
import {
  createProgressBar,
  showProgress,
  updateProgress,
  hideProgress,
} from "./components/ProgressBar.js";

import { initGlobalDOMUpdateQueue } from "./utils/domUpdateQueueInit.js";
import { openMergerWindow } from "./utils/mergerWindowLauncher.js";
import zoomControls from "./utils/zoomControls.js";

import {
  initComputedChannelsState,
  getComputedChannelsState,
  listenForComputedChannelChanges,
} from "./utils/computedChannelsState.js";
import {
  getChartMetadataState,
  removeChart,
  clearAllCharts,
} from "./utils/chartMetadataStore.js";

// Initialize global DOM update queue for selectiveUpdate feature
initGlobalDOMUpdateQueue();

// Export sidebarResize functions to window for onclick handlers
window.__sidebarResize = {
  adjustMainContent,
};

let metadataDebugSubscriptionAttached = false;
const chartMetadataDebugState = getChartMetadataState();

if (typeof window !== "undefined") {
  window.__chartMetadataState = chartMetadataDebugState;
}

if (
  chartMetadataDebugState &&
  typeof chartMetadataDebugState.subscribe === "function" &&
  !metadataDebugSubscriptionAttached
) {
  chartMetadataDebugState.subscribe((change) => {
    const pathString = Array.isArray(change.path)
      ? change.path.join(".")
      : change.path;
    console.log("📊 [ChartMetadata] Change detected:", {
      path: pathString,
      oldValue: change.oldValue,
      newValue: change.newValue,
    });
  });
  metadataDebugSubscriptionAttached = true;
}

if (typeof window !== "undefined") {
  window.debugChartMetadata = function debugChartMetadata() {
    const metadata = getChartMetadataState();
    const charts = Array.isArray(metadata.charts) ? metadata.charts : [];

    if (typeof console !== "undefined" && typeof console.table === "function") {
      console.table(
        charts.map((m) => ({
          "User Group": m.userGroupId,
          "Internal ID": m.uPlotInstance,
          Type: m.chartType,
          Name: m.name,
          Channels: Array.isArray(m.channels) ? m.channels.length : 0,
        }))
      );
    }

    console.log("Counters:", {
      nextUserGroupId: metadata.nextUserGroupId,
      nextAnalogId: metadata.nextAnalogId,
      nextDigitalId: metadata.nextDigitalId,
      nextComputedId: metadata.nextComputedId,
    });

    return charts;
  };

  console.log(
    "💡 [Debug] Type debugChartMetadata() in console to view chart groups"
  );
}

// ✅ NEW: Global progress callback for chart operations
// Used to pass progress updates from subscribeChartUpdates → handleChannelUpdate
let globalProgressCallback = null;

function setProgressCallback(callback) {
  globalProgressCallback = callback;
}

function callProgress(percent, message) {
  if (typeof globalProgressCallback === "function") {
    globalProgressCallback(percent, message);
  }
}

/**
 * Simple file reader utility for loading text files
 * @param {File} file - File object to read
 * @returns {Promise<string>} File content as text
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(e.target.result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${file.name}`));
    };
    reader.readAsText(file);
  });
}

/**
 * Convert LaTeX expression to math.js compatible format
 * Example: \sqrt{I_{A}^2+I_{B}^2+I_{C}^2} → sqrt(IA^2+IB^2+IC^2)
 * @param {string} latex - LaTeX expression from MathLive editor
 * @returns {string} math.js compatible expression
 */
function convertLatexToMathJs(latex) {
  if (!latex) return "";

  let expr = latex.trim();

  // Convert subscripts: I_{A} → IA, I_{B} → IB, etc.
  expr = expr.replace(/([A-Za-z])_\{([A-Za-z0-9]+)\}/g, "$1$2");

  // Convert sqrt: \sqrt{x} → sqrt(x)
  expr = expr.replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)");

  // Convert fractions: \frac{a}{b} → (a)/(b)
  expr = expr.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)");

  // Convert functions: \operatorname{func} → func
  expr = expr.replace(
    /\\operatorname\{RMS\}\s*\\left\(\s*([^)]+)\s*\\right\)/gi,
    "sqrt(mean(($1)^2))"
  );
  expr = expr.replace(
    /\\operatorname\{AVG\}\s*\\left\(\s*([^)]+)\s*\\right\)/gi,
    "mean($1)"
  );
  expr = expr.replace(/\\operatorname\{([^}]+)\}/g, "$1");

  // Convert operators
  expr = expr.replace(/\\cdot/g, "*");
  expr = expr.replace(/\\times/g, "*");

  // Convert absolute value: \left\lvert a \right\rvert → abs(a)
  expr = expr.replace(/\\left\\lvert\s*([^\\]*)\s*\\right\\rvert/g, "abs($1)");

  // Convert parentheses
  expr = expr.replace(/\\left\(/g, "(");
  expr = expr.replace(/\\right\)/g, ")");

  // Convert power: ^{n} → ^(n) for math.js compatibility
  expr = expr.replace(/\^\{([^}]+)\}/g, "^($1)");

  // Remove remaining LaTeX artifacts
  expr = expr.replace(/\\[a-zA-Z]+/g, ""); // Remove remaining commands
  expr = expr.replace(/[\{\}]/g, ""); // Remove braces

  return expr.trim();
}

/**
 * @file main.js - Core application logic and parent-child window messaging
 * @module main
 * @description
 * This module handles COMTRADE file loading, chart initialization, and manages
 * communication between the parent window and child popup (ChannelList).
 *
 * Message Flow:
 * Child Window (Tabulator) → Parent Window → channelState update → Chart subscribers triggered
 */
/**
 * Channel row structure received from the ChannelList popup (Tabulator).
 * Copied here for JSDoc compatibility so JSDoc can resolve the type without
 * relying on `import()`-style type expressions which older JSDoc versions
 * do not accept.
 *
 * @typedef {Object} ChannelRow
 * @property {string} [type] - 'Analog' or 'Digital'
 * @property {number} [id] - 1-based table id
 * @property {number} [originalIndex] - zero-based original index when available
 * @property {string} [channelID] - stable channel identifier assigned by parent
 * @property {string} [name]
 * @property {string} [unit]
 * @property {string} [group]
 * @property {string} [color]
 * @property {number|string} [scale]
 * @property {number|string} [start]
 * @property {number|string} [duration]
 * @property {boolean} [invert]
 * @property {boolean} [isNew]
 */

/**
 * Child -> Parent message shape used by the ChannelList popup.
 *
 * @typedef {Object} ChildToParentMessage
 * @property {string} source - Should be 'ChildWindow'
 * @property {string} type - One of the CALLBACK_TYPE constants
 * @property {ChildMessagePayload} payload - The payload detailed below
 */

/**
 * Payload sent by the child window to the parent (Tabulator edits).
 * @typedef {Object} ChildMessagePayload
 * @property {string} [field]
 * @property {ChannelRow} [row]
 * @property {any} [newValue]
 * @property {string} [channelID]
 * @property {Array} [args]
 */

/**
 * Acknowledgement message posted back from parent -> child after channel add.
 * @typedef {Object} ParentAckMessage
 * @property {string} source - 'ParentWindow'
 * @property {string} type - 'ack_addChannel'
 * @property {Object} payload - { tempClientId, channelID, assignedIndex, type }
 */

// --- State ---
export const verticalLinesX = createState([]);
export const dataState = createState({ analog: [], digital: [] });

// Initialize delta display drawer (replaces popup window)
export const deltaWindow = createDeltaDrawer();

// Initialize analysis sidebar (phasor diagram - dynamically injected)
export const analysisSidebar = createAnalysisSidebar();

// ✅ Define global handlers FIRST (before any module code runs)
// These are called by onclick attributes in index.html
if (!window.handleDeltaButtonClick) {
  window.handleDeltaButtonClick = function (event) {
    console.log("[main.js] ⚡⚡⚡ DELTA BUTTON CLICKED (via onclick) ⚡⚡⚡");
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    try {
      // Import at call time to ensure module is loaded
      const { adjustMainContent } = window.__sidebarResize || {};
      if (!adjustMainContent) {
        console.warn(
          "[handleDeltaButtonClick] adjustMainContent not available yet"
        );
        return;
      }

      // Safety check: ensure sidebar system is initialized
      if (!sidebarStore.getRegisteredSidebars().includes("delta-drawer")) {
        console.log(
          "[main.js] ⚠️ delta-drawer not registered, registering now..."
        );
        deltaWindow.registerWithStore();
      }

      // Check current state and toggle
      const isDeltaOpen = sidebarStore.isOpen("delta-drawer");
      console.log(
        `[handleDeltaButtonClick] Delta currently open: ${isDeltaOpen}`
      );

      // Toggle drawer - CSS transforms handle animation, no margin adjustments needed
      sidebarStore.toggle("delta-drawer");
      const isDeltaNowOpen = sidebarStore.isOpen("delta-drawer");

      console.log("[main.js] ✅ Delta drawer toggled successfully");
    } catch (err) {
      console.error("[main.js] Error toggling delta drawer:", err);
    }
  };
}

// Setup event listener for delta drawer close button
function setupDeltaDrawerCloseButton() {
  const closeBtn = document.getElementById("delta-drawer-close");
  if (closeBtn && !closeBtn.__hasListener) {
    closeBtn.__hasListener = true;
    closeBtn.addEventListener("click", (event) => {
      console.log("[main.js] Delta drawer close button clicked");
      event.preventDefault();
      event.stopPropagation();
      // Call the same toggle function as the Crosshair Data button
      window.handleDeltaButtonClick(event);
    });
  }
}

// Setup event listener for delta drawer minimize button
function setupDeltaDrawerMinimizeButton() {
  const minimizeBtn = document.getElementById("delta-drawer-minimize");
  if (minimizeBtn && !minimizeBtn.__hasListener) {
    minimizeBtn.__hasListener = true;
    minimizeBtn.addEventListener("click", (event) => {
      console.log("[main.js] Delta drawer minimize button clicked");
      event.preventDefault();
      event.stopPropagation();
      // Close the drawer (same as close button)
      window.handleDeltaButtonClick(event);
    });
  }
}

// Setup event listener for analysis sidebar close button
function setupAnalysisSidebarCloseButton() {
  const closeBtn = document.getElementById("analysis-sidebar-close");
  if (closeBtn && !closeBtn.__hasListener) {
    closeBtn.__hasListener = true;
    closeBtn.addEventListener("click", (event) => {
      console.log("[main.js] Analysis sidebar close button clicked");
      event.preventDefault();
      event.stopPropagation();
      // Call the same toggle function as the Analysis button
      window.handleAnalysisButtonClick(event);
    });
  }
}

// Setup event listener for analysis sidebar minimize button
function setupAnalysisSidebarMinimizeButton() {
  const minimizeBtn = document.getElementById("analysis-sidebar-minimize");
  if (minimizeBtn && !minimizeBtn.__hasListener) {
    minimizeBtn.__hasListener = true;
    minimizeBtn.addEventListener("click", (event) => {
      console.log("[main.js] Analysis sidebar minimize button clicked");
      event.preventDefault();
      event.stopPropagation();
      // Close the sidebar (same as close button)
      window.handleAnalysisButtonClick(event);
    });
  }
}

if (!window.handleAnalysisButtonClick) {
  window.handleAnalysisButtonClick = function (event) {
    console.log(
      "[main.js] ⚡⚡⚡ ANALYSIS BUTTON CLICKED (via onclick) ⚡⚡⚡"
    );
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    try {
      // Import at call time to ensure module is loaded
      const { adjustMainContent } = window.__sidebarResize || {};
      if (!adjustMainContent) {
        console.warn(
          "[handleAnalysisButtonClick] adjustMainContent not available yet"
        );
        return;
      }

      // Safety check: ensure sidebar system is initialized
      if (!sidebarStore.getRegisteredSidebars().includes("analysis-sidebar")) {
        console.log(
          "[main.js] ⚠️ analysis-sidebar not registered, registering now..."
        );
        analysisSidebar.registerWithStore();
      }

      // Check current state and toggle
      const isAnalysisOpen = sidebarStore.isOpen("analysis-sidebar");
      console.log(
        `[handleAnalysisButtonClick] Analysis currently open: ${isAnalysisOpen}`
      );

      // Toggle sidebar - CSS transforms handle animation, no margin adjustments needed
      sidebarStore.toggle("analysis-sidebar");
      const isAnalysisNowOpen = sidebarStore.isOpen("analysis-sidebar");

      console.log("[main.js] ✅ Analysis sidebar toggled successfully");
    } catch (err) {
      console.error("[main.js] Error toggling analysis sidebar:", err);
    }
  };
}

/**
 * Initialize sidebar/drawer registry
 * Ensures only one sidebar is visible at a time
 * By default, the phasor diagram (analysis) sidebar is closed
 */
function initializeSidebarRegistry() {
  // Initialize sidebars with Tailwind classes and resizer functionality
  analysisSidebar.init();
  deltaWindow.init();

  // Register the analysis sidebar with the store
  analysisSidebar.registerWithStore();

  // Register delta drawer with the store
  deltaWindow.registerWithStore();

  // Initialize all sidebars to their default closed state
  sidebarStore.initializeDefaults();

  // Setup button event listeners for close/minimize buttons
  setupDeltaDrawerCloseButton();
  setupDeltaDrawerMinimizeButton();
  setupAnalysisSidebarCloseButton();
  setupAnalysisSidebarMinimizeButton();

  console.log(
    "[SidebarRegistry] Sidebar registry initialized. Active sidebars:",
    sidebarStore.getRegisteredSidebars()
  );
}

// Export registry initializer so it can be called after DOM is ready
export function initSidebarSystem() {
  initializeSidebarRegistry();
}

// Getter functions for global state
export function getCfg() {
  return cfg;
}

export function getData() {
  return data;
}

export function getPolarChart() {
  return polarChart;
}

export function getChartsComputed() {
  return chartsComputed;
}

// Main charts array - holds ALL charts: analog, digital, and computed
let charts = [];
const chartTypes = ["analog", "digital"];

// Computed channels charts array - one chart per computed channel
let chartsComputed = [];

// Expose charts globally for theme system to access
window.__charts = charts;
window.__chartsComputed = chartsComputed;
window.chartsArray = charts;

/**
 * Update computed channel color by ID in channelState
 * Searches computed channels directly in state
 * @param {string} channelId - Channel ID (e.g., "V4")
 * @param {string} color - New color hex code
 * @returns {boolean} Success status
 */
function updateComputedChannelColorInState(channelId, color) {
  try {
    console.log(
      `[updateComputedChannelColorInState] 🔍 Looking for channel ID: "${channelId}" in computed state`
    );

    // Access computed state (Proxy). Do not invoke as a function.
    let computedState = null;
    try {
      computedState = channelState.computed;
      console.log(`[updateComputedChannelColorInState] Got computed state directly`);
    } catch (e) {
      console.warn(
        `[updateComputedChannelColorInState] Failed to get computed state directly:`,
        e.message
      );
    }

    // Try getter fallback if needed
    if (!computedState || (!computedState.channelIDs && typeof getComputedChannelsState === "function")) {
      console.log(`[updateComputedChannelColorInState] Trying getComputedChannelsState()...`);
      try {
        const s = getComputedChannelsState?.();
        if (s) {
          computedState = s;
          if (computedState?.channelIDs) {
            console.log(`[
updateComputedChannelColorInState] ✅ Got state from getComputedChannelsState()`);
          }
        }
      } catch (e) {
        console.warn(
          `[updateComputedChannelColorInState] getComputedChannelsState() failed:`,
          e.message
        );
      }
    }

    // Determine index of channelId in computed ordering
    let idx = -1;
    if (computedState?.channelIDs && Array.isArray(computedState.channelIDs)) {
      idx = computedState.channelIDs.indexOf(channelId);
    }

    // Fallback 1: use fast channelIDMap if available
    if (idx < 0 && channelIDMap && typeof channelIDMap.get === "function") {
      const loc = channelIDMap.get(channelId);
      if (loc?.type === "computed" && Number.isFinite(loc.idx)) {
        idx = loc.idx;
        console.log(
          `[updateComputedChannelColorInState] ✅ Index from channelIDMap: ${idx}`
        );
      }
    }

    // Fallback 2: derive from cfg/global computed arrays (last resort)
    if (idx < 0) {
      idx = findComputedChannelIndexById(channelId);
      if (idx >= 0) {
        console.log(
          `[updateComputedChannelColorInState] ✅ Index from cfg/global computed arrays: ${idx}`
        );
      }
    }

    if (idx < 0) {
      console.warn(
        `[updateComputedChannelColorInState] ⚠️ Channel "${channelId}" index not resolved`
      );
      return false;
    }

    // Update the lineColors array
    const lineColors = computedState?.lineColors || channelState?.computed?.lineColors;
    if (!Array.isArray(lineColors)) {
      console.warn(`[updateComputedChannelColorInState] ⚠️ lineColors is not an array`);
      return false;
    }

    console.log(
      `[updateComputedChannelColorInState] Updating color for "${channelId}" at index ${idx}`
    );
    lineColors[idx] = color;
    console.log(`[updateComputedChannelColorInState] ✅ Updated state color for "${channelId}"`);
    return true;
  } catch (e) {
    console.error(`[updateComputedChannelColorInState] ❌ Error:`, e.message);
    return false;
  }
}

/**
 * Find computed channel index by its ID in cfg.computedChannels
 * ✅ REFACTORED: Only search cfg.computedChannels (metadata), not data.computedData (values array)
 * 
 * @param {string} channelId - Channel ID (e.g., "V4")
 * @returns {number} Index in computed array, or -1 if not found
 */
function findComputedChannelIndexById(channelId) {
  console.log(
    `[findComputedChannelIndexById] 🔍 Looking for channel ID: "${channelId}"`
  );

  // ✅ Search cfg.computedChannels (METADATA) - this is where IDs are stored
  if (cfg?.computedChannels && Array.isArray(cfg.computedChannels)) {
    console.log(
      `[findComputedChannelIndexById] Searching cfg.computedChannels (${cfg.computedChannels.length} channels)`
    );
    const idx = cfg.computedChannels.findIndex(
      (ch) => ch.id === channelId || ch.name === channelId
    );
    if (idx >= 0) {
      console.log(
        `[findComputedChannelIndexById] ✅ Found in cfg.computedChannels at index ${idx}`
      );
      return idx;
    }
  }

  // Fallback: Try window.globalCfg.computedChannels
  if (window?.globalCfg?.computedChannels && Array.isArray(window.globalCfg.computedChannels)) {
    console.log(
      `[findComputedChannelIndexById] Searching window.globalCfg.computedChannels (${window.globalCfg.computedChannels.length} channels)`
    );
    const idx = window.globalCfg.computedChannels.findIndex(
      (ch) => ch.id === channelId || ch.name === channelId
    );
    if (idx >= 0) {
      console.log(
        `[findComputedChannelIndexById] ✅ Found in window.globalCfg.computedChannels at index ${idx}`
      );
      return idx;
    }
  }

  console.warn(
    `[findComputedChannelIndexById] ❌ Channel "${channelId}" not found in cfg.computedChannels`
  );
  return -1;
}

/**
 * Update a computed chart's colors directly by channel ID lookup
 * @param {string} channelId - Channel ID (e.g., "V4")
 * @param {string} newColor - New color hex code
 */
function updateComputedChartColorById(channelId, newColor) {
  try {
    console.log(
      `[updateComputedChartColorById] 🎨 Updating computed channel "${channelId}" color → ${newColor}`
    );

    // Computed charts are stored in the main charts array, not in a separate chartsComputed array
    const chartsArr = charts || [];
    if (!Array.isArray(chartsArr) || chartsArr.length === 0) {
      console.warn(
        `[updateComputedChartColorById] ⚠️ charts array not ready (length: ${
          chartsArr?.length || 0
        })`
      );
      return false;
    }

    // Iterate all computed charts and update the one containing this id
    let updated = false;
    for (const chart of chartsArr) {
      if (!chart || !(chart._computed === true || chart._type === "computed")) continue;
      if (!Array.isArray(chart._computedIds)) continue;

      const seriesIndex = chart._computedIds.indexOf(channelId);
      if (seriesIndex < 0) continue;

      const actualSeriesIdx = seriesIndex + 1; // series[0] is x-axis
      const series = chart.series?.[actualSeriesIdx];
      if (!series) continue;

      series.stroke = () => newColor;
      if (series._paths) series._paths = null;
      try { chart.redraw?.(false); } catch {}
      console.log(`[updateComputedChartColorById] ✅ Updated computed chart series for "${channelId}"`);
      updated = true;
    }

    if (!updated) {
      console.warn(`[updateComputedChartColorById] ⚠️ No computed chart contained "${channelId}"`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[updateComputedChartColorById] ❌ Error:`, e.message);
    return false;
  }
}

/**
 * Update color for a computed channel that has been merged into analog charts.
 * Looks for `channelId` inside each analog chart's `_computedChannelIds` and updates stroke.
 * @param {string} channelId
 * @param {string} newColor
 */
function updateAnalogMergedComputedColorById(channelId, newColor) {
  try {
    let updates = 0;
    for (const chart of charts || []) {
      if (!chart || chart._type !== "analog") continue;

      const computedIdsInChart = chart._computedChannelIds || [];
      if (!computedIdsInChart.length) continue;

      const posInChart = computedIdsInChart.indexOf(channelId);
      if (posInChart < 0) continue;

      const numAnalog = chart._analogSeriesCount || 0;
      const seriesIdx = 1 + numAnalog + posInChart; // 0:x, 1..analog, then computed
      if (!chart.series || seriesIdx >= chart.series.length) continue;

      const s = chart.series[seriesIdx];
      const strokeFn = () => newColor;
      s.stroke = strokeFn;
      s._stroke = newColor;
      if (s.points) {
        s.points.stroke = strokeFn;
        s.points._stroke = newColor;
      }
      s._paths = null; // force regeneration
      try { chart.redraw(false); } catch {}
      updates++;
      console.log(
        `[updateAnalogMergedComputedColorById] ✅ Updated analog chart series[${seriesIdx}] for computed "${channelId}" → ${newColor}`
      );
    }
    if (updates === 0) {
      console.log(
        `[updateAnalogMergedComputedColorById] ⏭️ No analog charts contain computed "${channelId}"`
      );
    }
  } catch (e) {
    console.warn(`[updateAnalogMergedComputedColorById] ⚠️ Error:`, e.message);
  }
}

// Global config and data
let cfg, data;

// Polar chart instance (initialized when files are loaded)
let polarChart = null;

// Vertical Line Control instance (initialized when files are loaded)
let verticalLineControl = null;

// --- Constants ---
const TIME_UNIT = "seconds";

// Callback message types from child window
export const CALLBACK_TYPE = {
  COLOR: "callback_color",
  SCALE: "callback_scale",
  START: "callback_start",
  DURATION: "callback_duration",
  INVERT: "callback_invert",
  CHANNEL_NAME: "callback_channelName",
  GROUP: "callback_group",
  UNIT: "callback_unit", // ✅ NEW: Unit changes (triggers Y-axis recalculation)
  ADD_CHANNEL: "callback_addChannel",
  DELETE: "callback_delete",
  TIME_WINDOW: "callback_time_window", // ✅ NEW: Combined start/duration updates
};

const COMPUTED_COLOR_PALETTE = computedPalette;

/**
 * Find a channel by its unique channelID in the channel state
 *
 * @function findChannelByID
 * @category State Management / Channel Lookup
 * @since 1.0.0
 *
 * @description
 * Searches for a channel across both analog and digital channel arrays using
 * its stable channelID. Returns the channel type and array index if found.
 * Analog channels are searched first, followed by digital channels.
 *
 * @param {string} channelID - Unique identifier of the channel to find
 *
 * @returns {Object|null} Channel location object or null if not found
 * @returns {string} returns.type - Channel type: "analog" or "digital"
 * @returns {number} returns.idx - Zero-based index in the type-specific array
 *
 * @mermaid
 * flowchart TD
 *     A["Input channelID"] --> B{"channelID valid?"}
 *     B -->|No| C["Return null"]
 *     B -->|Yes| D["Search analog channelIDs"]
 *     D -->|Found| E["Return {type:'analog', idx}"]
 *     D -->|Not Found| F["Search digital channelIDs"]
 *     F -->|Found| G["Return {type:'digital', idx}"]
 *     F -->|Not Found| H["Return null"]
 *     style A fill:#E3F2FD,stroke:#1565C0,color:#000
 *     style E fill:#C8E6C9,stroke:#2E7D32,color:#000
 *     style G fill:#C8E6C9,stroke:#2E7D32,color:#000
 *     style C fill:#FFCDD2,stroke:#C62828,color:#000
 *     style H fill:#FFCDD2,stroke:#C62828,color:#000
 *
 * @example
 * // Finding an existing analog channel
 * const result = findChannelByID("analog-0-abc123");
 * // Returns: { type: "analog", idx: 0 }
 *
 * @example
 * // Finding a non-existent channel
 * const result = findChannelByID("invalid-id");
 * // Returns: null
 *
 * @example
 * // Using the result to update channel state
 * const found = findChannelByID("CH001");
 * if (found) {
 *   channelState[found.type].lineColors[found.idx] = "#ff0000";
 * }
 *
 * @algorithm
 * 1. Validate that channelID is provided
 * 2. Search in analog channels:
 *    - Use indexOf on channelState.analog.channelIDs
 *    - If found (index >= 0), return { type: "analog", idx }
 * 3. If not found in analog, search digital channels:
 *    - Use indexOf on channelState.digital.channelIDs
 *    - If found (index >= 0), return { type: "digital", idx }
 * 4. If not found in either array, return null
 *
 * @throws {TypeError} Does not throw, but returns null for invalid input
 *
 * @dependencies
 * - channelState.analog.channelIDs {string[]} - Array of analog channel IDs
 * - channelState.digital.channelIDs {string[]} - Array of digital channel IDs
 *
 * @testcase
 * Input: channelID = "analog-0-abc123" (exists at analog index 0)
 * Expected: { type: "analog", idx: 0 }
 *
 * @testcase
 * Input: channelID = "digital-2-xyz789" (exists at digital index 2)
 * Expected: { type: "digital", idx: 2 }
 *
 * @testcase
 * Input: channelID = "invalid-id-12345" (does not exist)
 * Expected: null
 *
 * @testcase
 * Input: channelID = null
 * Expected: null
 *
 * @testcase
 * Input: channelID = "" (empty string)
 * Expected: null
 *
 * @performance O(n) where n is the number of channels in the searched arrays
 *
 * @see {@link updateChannelFieldByID} - Uses this function to locate channels
 * @see {@link deleteChannelByID} - Uses this function to locate channels
 */
// ⚡ Fast lookup map for channelID -> {type, idx} (O(1) instead of O(n))
// Updated whenever channelIDs change
const channelIDMap = new Map();

/**
 * Rebuild the fast lookup map when channelIDs change
 * Should be called after any change to channelState.analog/digital.channelIDs
 */
function rebuildChannelIDMap() {
  channelIDMap.clear();

  // Map analog channels
  const analogIDs = channelState.analog?.channelIDs || [];
  analogIDs.forEach((id, idx) => {
    if (id) channelIDMap.set(id, { type: "analog", idx });
  });

  // Map digital channels
  const digitalIDs = channelState.digital?.channelIDs || [];
  digitalIDs.forEach((id, idx) => {
    if (id) channelIDMap.set(id, { type: "digital", idx });
  });

  // Map computed channels
  const computedIDs = channelState.computed?.channelIDs || [];
  computedIDs.forEach((id, idx) => {
    if (id) channelIDMap.set(id, { type: "computed", idx });
  });
}

function findChannelByID(channelID) {
  if (!channelID) return null;

  // ⚡ Fast O(1) lookup using map instead of O(n) indexOf
  const result = channelIDMap.get(channelID);
  if (result) return result;

  // Fallback: rebuild map in case it's stale (safety net)
  rebuildChannelIDMap();
  return channelIDMap.get(channelID) || null;
}
/**
 * Update a specific field of a channel identified by its channelID
 *
 * @function updateChannelFieldByID
 * @category State Management / Channel Update
 * @since 1.0.0
 *
 * @description
 * High-level wrapper that locates a channel by its stable ID and updates
 * a specific field. This function automatically determines whether the channel
 * is analog or digital and delegates to updateChannelFieldByIndex for the
 * actual update. The reactive state system automatically notifies subscribers
 * after the update.
 *
 * @param {string} channelID - Unique identifier of the channel to update
 * @param {string} fieldName - Name of the field to update
 * @param {*} value - New value to set for the field
 *
 * @returns {boolean} true if update succeeded, false if channel not found
 *
 * @mermaid
 * flowchart TD
 *     A["Input channelID, fieldName, value"] --> B["Call findChannelByID"]
 *     B --> C{"Channel found?"}
 *     C -->|No| D["Log not-found and return false"]
 *     C -->|Yes| E["Extract type and index"]
 *     E --> F["Get channelState[type][fieldName]"]
 *     F --> G{"Array valid?"}
 *     G -->|No| D
 *     G -->|Yes| H["Update array[index] = value"]
 *     H --> I["Trigger subscribers"]
 *     I --> J["Log success and return true"]
 *     style A fill:#E3F2FD,stroke:#1565C0,color:#000
 *     style J fill:#C8E6C9,stroke:#2E7D32,color:#000
 *     style D fill:#FFCDD2,stroke:#C62828,color:#000
 *     style I fill:#F3E5F5,stroke:#6A1B9A,color:#fff
 *
 * @example
 * // Update channel color
 * const success = updateChannelFieldByID("analog-0-abc123", "lineColors", "#ff0000");
 * console.log(success); // true
 * // Result: Channel color updated, chart redraws automatically
 *
 * @example
 * // Update channel name
 * updateChannelFieldByID("digital-2-xyz789", "yLabels", "New Sensor Name");
 * // Result: Channel label updated, legend refreshes
 *
 * @example
 * // Update scale (triggers chart recreation)
 * updateChannelFieldByID("analog-1-def456", "scales", 2.5);
 * // Result: Scale factor changed, chart recreates with new data
 *
 * @example
 * // Attempting to update non-existent channel
 * const success = updateChannelFieldByID("invalid-id", "lineColors", "#00ff00");
 * console.log(success); // false
 * // Result: No changes made, debug log shows "not-found"
 *
 * @algorithm
 * 1. Call findChannelByID(channelID) to locate the channel
 * 2. If channel not found (result is null):
 *    - Log debug message with "not-found" status
 *    - Return false
 * 3. If channel found:
 *    - Extract type and index from result
 *    - Get the target array (channelState[type][fieldName])
 *    - Verify array exists
 *    - Update array[index] = value
 *    - Log debug message with success details
 *    - Return true
 * 4. Reactive state system automatically notifies subscribers
 *
 * @throws {TypeError} Does not throw, returns false on errors
 *
 * @dependencies
 * - findChannelByID() - To locate the channel
 * - channelState - Reactive state object containing channel data
 * - debugLite.log() - For debug logging (optional)
 *
 * @sideeffects
 * - Mutates channelState arrays directly
 * - Triggers reactive subscribers for the modified field
 * - May cause chart updates (redraw or recreation depending on field)
 * - Logs debug information to debugLite
 *
 * @testcase
 * Input: channelID="analog-0-abc", fieldName="lineColors", value="#ff0000"
 * Expected: Returns true, channelState.analog.lineColors[0] = "#ff0000"
 * Side Effect: Color subscriber triggered, chart series color updated
 *
 * @testcase
 * Input: channelID="digital-1-xyz", fieldName="inverts", value=true
 * Expected: Returns true, channelState.digital.inverts[1] = true
 * Side Effect: Invert subscriber triggered, data recalculated, chart recreated
 *
 * @testcase
 * Input: channelID="invalid-channel-id", fieldName="lineColors", value="#00ff00"
 * Expected: Returns false, no state changes
 * Side Effect: Debug log entry with "not-found" status
 *
 * @testcase
 * Input: channelID=null, fieldName="scales", value=2.0
 * Expected: Returns false (findChannelByID returns null)
 *
 * @performance O(n) for channel lookup, O(1) for update
 *
 * @see {@link findChannelByID} - Used internally for channel lookup
 * @see {@link updateChannelFieldByIndex} - Lower-level update function
 * @see {@link subscribeChartUpdates} - Handles subscriber notifications
 */
// Helper: update a named per-channel array (like 'inverts' or 'scales') by channelID
function updateChannelFieldByID(channelID, fieldName, value) {
  const found = findChannelByID(channelID);
  try {
    debugLite.log("updateByID.attempt", {
      channelID,
      field: found ? "found" : "not-found",
      fieldName,
      newValue: value,
    });
  } catch (e) {}
  if (!found) return false;
  const arr = channelState[found.type][fieldName];
  if (!Array.isArray(arr)) return false;
  arr[found.idx] = value;
  try {
    debugLite.log("updateByID.ok", {
      channelID,
      type: found.type,
      idx: found.idx,
      fieldName,
      newValue: value,
    });
  } catch (e) {}
  return true;
}

/**
 * Update a channel field using direct array index access
 *
 * @function updateChannelFieldByIndex
 * @category State Management / Direct Update
 * @since 1.0.0
 *
 * @description
 * Lower-level function that directly mutates channelState arrays using
 * numeric indices. This function performs defensive bounds checking and
 * ensures the target field array exists before updating. No channel ID
 * lookup is performed - the caller must provide the correct type and index.
 *
 * @param {string} type - Channel type: "analog" or "digital"
 * @param {number} idx - Zero-based array index
 * @param {string} fieldName - Field array name (e.g., "lineColors", "scales")
 * @param {*} value - New value to set
 *
 * @returns {boolean} true if update succeeded, false on validation failure
 *
 * @mermaid
 * flowchart TD
 *     A["Input type, index, fieldName, value"] --> B{"Type is analog or digital?"}
 *     B -->|No| B1["Return false"]
 *     B -->|Yes| C["Get channelState[type]"]
 *     C --> D{"Section exists?"}
 *     D -->|No| B1
 *     D -->|Yes| E["Ensure field array initialized"]
 *     E --> F["Get array reference"]
 *     F --> G{"Value is array?"}
 *     G -->|No| B1
 *     G -->|Yes| H["Convert idx to number"]
 *     H --> I{"Index finite and in range?"}
 *     I -->|No| B1
 *     I -->|Yes| J["Write value into array"]
 *     J --> K["Trigger subscribers"]
 *     K --> L["Return true"]
 *     style A fill:#E3F2FD,stroke:#1565C0,color:#000
 *     style L fill:#C8E6C9,stroke:#2E7D32,color:#000
 *     style B1 fill:#FFCDD2,stroke:#C62828,color:#000
 *     style K fill:#F3E5F5,stroke:#6A1B9A,color:#fff
 *
 * @example
 * // Update analog channel color by index
 * const success = updateChannelFieldByIndex("analog", 0, "lineColors", "#ff0000");
 * // Result: channelState.analog.lineColors[0] = "#ff0000"
 *
 * @example
 * // Update digital channel invert flag
 * updateChannelFieldByIndex("digital", 2, "inverts", true);
 * // Result: channelState.digital.inverts[2] = true, chart recreates
 *
 * @example
 * // Update scale factor
 * updateChannelFieldByIndex("analog", 1, "scales", 2.5);
 * // Result: channelState.analog.scales[1] = 2.5
 *
 * @example
 * // Invalid type - returns false
 * const success = updateChannelFieldByIndex("invalid", 0, "lineColors", "#fff");
 * console.log(success); // false
 *
 * @example
 * // Out of bounds index - returns false
 * const success = updateChannelFieldByIndex("analog", 999, "lineColors", "#fff");
 * console.log(success); // false
 *
 * @algorithm
 * 1. Validate type parameter:
 *    - Must be exactly "analog" or "digital"
 *    - Return false if invalid
 * 2. Get channelState section: s = channelState[type]
 *    - Return false if section doesn't exist
 * 3. Ensure target field array exists:
 *    - Initialize s[fieldName] as empty array if undefined
 *    - Return false if fieldName is not array after initialization
 * 4. Validate index:
 *    - Convert idx to number
 *    - Check: Number.isFinite(i) && i >= 0 && i < arr.length
 *    - Log attempt via debugLite
 *    - Return false if validation fails
 * 5. Perform update:
 *    - arr[i] = value
 *    - Log success via debugLite
 *    - Return true
 *
 * @throws {TypeError} Does not throw, returns false for invalid inputs
 *
 * @dependencies
 * - channelState.analog - Analog channel state object
 * - channelState.digital - Digital channel state object
 * - debugLite.log() - Debug logging utility (optional, failures caught)
 *
 * @sideeffects
 * - Direct mutation of channelState arrays
 * - Triggers reactive subscribers for the field
 * - Chart updates depend on field type:
 *   - lineColors/yLabels → in-place chart update
 *   - scales/inverts → full chart recreation
 *   - starts/durations → x-axis scale update
 *
 * @validation
 * This function validates:
 * - Type is "analog" or "digital"
 * - State section exists
 * - Index is finite number within bounds
 *
 * This function does NOT validate:
 * - Value type correctness (caller's responsibility)
 * - Field name validity (invalid names have no effect)
 *
 * @testcase
 * Input: type="analog", idx=0, fieldName="lineColors", value="#ff0000"
 * Expected: Returns true, lineColors[0] updated
 *
 * @testcase
 * Input: type="digital", idx=1, fieldName="inverts", value=true
 * Expected: Returns true, inverts[1] = true
 *
 * @testcase
 * Input: type="invalid", idx=0, fieldName="lineColors", value="#fff"
 * Expected: Returns false, no changes
 *
 * @testcase
 * Input: type="analog", idx=-1, fieldName="scales", value=2.0
 * Expected: Returns false (negative index)
 *
 * @testcase
 * Input: type="analog", idx=1000, fieldName="lineColors", value="#fff"
 * Expected: Returns false (index out of bounds)
 *
 * @testcase
 * Input: type="analog", idx=NaN, fieldName="scales", value=1.5
 * Expected: Returns false (non-finite index)
 *
 * @performance O(1) constant time operation
 *
 * @see {@link updateChannelFieldByID} - Higher-level wrapper using channelID
 * @see {@link subscribeChartUpdates} - Subscriber system that reacts to changes
 */
function updateChannelFieldByIndex(type, idx, fieldName, value) {
  const updateStartTime = performance.now();

  if (type !== "analog" && type !== "digital" && type !== "computed")
    return false;
  const s = channelState[type];
  if (!s) return false;
  // ensure the target field exists and is an array
  s[fieldName] = s[fieldName] || [];
  const arr = s[fieldName];
  if (!Array.isArray(arr)) return false;
  const i = Number(idx);
  try {
    debugLite.log("updateByIndex.attempt", {
      type,
      idx: i,
      fieldName,
      newValue: value,
    });
  } catch (e) {}
  if (!Number.isFinite(i) || i < 0 || i >= arr.length) return false;
  arr[i] = value;

  const updateEndTime = performance.now();
  const updateTime = updateEndTime - updateStartTime;
  if (updateTime > 10) {
    console.log(
      `[Performance] updateChannelFieldByIndex: ${fieldName} = ${value}`,
      {
        type,
        idx: i,
        timeMs: updateTime.toFixed(2),
      }
    );
  }

  try {
    debugLite.log("updateByIndex.ok", {
      type,
      idx: i,
      fieldName,
      newValue: value,
    });
  } catch (e) {}
  return true;
}

/**
 * Delete a channel completely from the system by its channelID
 *
 * @function deleteChannelByID
 * @category State Management / Channel Deletion
 * @since 1.0.0
 *
 * @description
 * Removes a channel from all related arrays in channelState, dataState, and
 * the raw data object. This ensures all arrays remain synchronized with the
 * same length. The operation is immediate and irreversible. After deletion,
 * reactive subscribers trigger and charts are automatically recreated with
 * the updated series list.
 *
 * @param {string} channelID - Unique identifier of channel to delete
 *
 * @returns {boolean} true if channel was found and deleted, false otherwise
 *
 * @mermaid
 * flowchart TD
 *     A["Input channelID"] --> B["Find channel with findChannelByID"]
 *     B --> C{"Channel exists?"}
 *     C -->|No| D["Return false; no change"]
 *     C -->|Yes| E["Extract type and index"]
 *     E --> F["List arrays that must stay in sync"]
 *     F --> G["Splice index from each array"]
 *     G --> H["Remove matching dataState series"]
 *     H --> I["Remove matching raw data series"]
 *     I --> J["Notify channelIDs subscribers"]
 *     J --> K["Charts rebuild without channel"]
 *     K --> L["Return true"]
 *     style A fill:#F44336,stroke:#B71C1C,color:#fff
 *     style D fill:#FFCDD2,stroke:#C62828,color:#000
 *     style L fill:#C8E6C9,stroke:#2E7D32,color:#000
 *     style G fill:#FFCCBC,stroke:#D84315,color:#000
 *     style J fill:#2196F3,stroke:#0D47A1,color:#fff
 *
 * @example
 * // Delete an existing analog channel
 * const success = deleteChannelByID("analog-0-abc123");
 * console.log(success); // true
 * // Result: Channel removed from all arrays, chart recreated without it
 *
 * @example
 * // Attempt to delete non-existent channel
 * const success = deleteChannelByID("invalid-channel-id");
 * console.log(success); // false
 * // Result: No changes made, function returns early
 *
 * @example
 * // Delete digital channel
 * deleteChannelByID("digital-2-xyz789");
 * // Result: Digital channel removed, digital chart recreated
 *
 * @algorithm
 * 1. Locate channel using findChannelByID(channelID)
 * 2. If not found (result is null):
 *    - Return false immediately
 * 3. If found, extract type and index from result
 * 4. Get state section: s = channelState[type]
 * 5. Define list of arrays that must be synchronized:
 *    - yLabels, lineColors, yUnits, groups, axesScales
 *    - scales, starts, durations, inverts, channelIDs
 * 6. For each array name in the list:
 *    - Check if s[name] exists and is array
 *    - If valid and index is in bounds: splice(index, 1)
 * 7. Remove corresponding series from dataState[type]:
 *    - Calculate seriesIdx = index + 1 (offset for time array)
 *    - Splice from dataState array
 * 8. Remove corresponding series from raw data[type]:
 *    - Calculate seriesIdx = index + 1
 *    - Splice from data array
 * 9. Reactive system notifies channelIDs subscribers
 * 10. Subscribers trigger chart recreation
 * 11. Return true
 *
 * @throws {TypeError} Does not throw, catches errors and continues
 *
 * @dependencies
 * - findChannelByID() - To locate the channel
 * - channelState - Reactive state with channel metadata
 * - dataState - Reactive state with chart data arrays
 * - data - Raw parsed data object
 *
 * @sideeffects
 * - Mutates multiple arrays in channelState[type]
 * - Mutates dataState[type] series array
 * - Mutates raw data[type] series array
 * - Triggers channelIDs subscriber (causes chart recreation)
 * - All arrays must remain synchronized (same length after deletion)
 *
 * @synchronization
 * Critical: All per-channel arrays must be kept in sync!
 * Before deletion (3 channels):
 * ```
 * channelIDs:   ["CH001", "CH002", "CH003"]
 * yLabels:      ["Temp1", "Temp2", "Temp3"]
 * lineColors:   ["#f00",  "#0f0",  "#00f"]
 * scales:       [1,       1,       2]
 * ```
 * After deleteChannelByID("CH002") (2 channels remain):
 * ```
 * channelIDs:   ["CH001", "CH003"]
 * yLabels:      ["Temp1", "Temp3"]
 * lineColors:   ["#f00",  "#00f"]
 * scales:       [1,       2]
 * ```
 *
 * @testcase
 * Input: channelID = "analog-1-abc" (exists at index 1 of 3 channels)
 * Expected: Returns true
 * State Before: yLabels=["A","B","C"], lineColors=["#f00","#0f0","#00f"]
 * State After: yLabels=["A","C"], lineColors=["#f00","#00f"]
 * Side Effect: Chart recreated with 2 series
 *
 * @testcase
 * Input: channelID = "invalid-id"
 * Expected: Returns false
 * State: No changes to any arrays
 *
 * @testcase
 * Input: channelID = "digital-0-xyz" (last remaining digital channel)
 * Expected: Returns true
 * State After: All digital arrays become empty []
 * Side Effect: Digital chart recreated with no series
 *
 * @testcase
 * Input: channelID = null
 * Expected: Returns false (findChannelByID returns null)
 *
 * @testcase
 * Input: channelID = ""
 * Expected: Returns false (findChannelByID returns null)
 *
 * @performance O(n*m) where n = number of arrays, m = array length
 *
 * @warnings
 * ⚠️ This operation is IRREVERSIBLE - no undo functionality
 * ⚠️ All arrays must be kept in sync - missing splice causes corruption
 * ⚠️ Chart will be completely recreated (expensive operation)
 *
 * @see {@link findChannelByID} - Used to locate the channel
 * @see {@link subscribeChartUpdates} - Handles post-deletion chart recreation
 * @see {@link CALLBACK_TYPE.DELETE} - Message type that triggers this function
 */
// Helper: delete a channel by channelID (splice same arrays as delete-by-index)
function deleteChannelByID(channelID) {
  const found = findChannelByID(channelID);
  if (!found) return false;
  
  const type = found.type;
  const i = found.idx;

  console.log(`[deleteChannelByID] 🗑️ Deleting ${type}[${i}] - ID: ${channelID}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPUTED CHANNEL DELETION - Special handling
  // ═══════════════════════════════════════════════════════════════════════════
  if (type === "computed") {
    console.log(`[deleteChannelByID] 📌 Computed channel deletion path`);
    
    // 1. Remove from channelState.computed arrays
    const s = channelState.computed;
    if (s) {
      const perChannelArrays = [
        "yLabels",
        "lineColors",
        "yUnits",
        "groups",
        "axesScales",
        "scales",
        "starts",
        "durations",
        "inverts",
        "channelIDs",
      ];
      perChannelArrays.forEach((name) => {
        if (s[name] && Array.isArray(s[name]) && i >= 0 && i < s[name].length) {
          s[name].splice(i, 1);
          console.log(`[deleteChannelByID]   ✓ Spliced computed.${name}`);
        }
      });
    }
    
    // 2. Remove from cfg.computedChannels
    if (Array.isArray(cfg?.computedChannels)) {
      const cfgIdx = cfg.computedChannels.findIndex(ch => ch.id === channelID || ch.name === channelID);
      if (cfgIdx >= 0) {
        cfg.computedChannels.splice(cfgIdx, 1);
        console.log(`[deleteChannelByID]   ✓ Removed from cfg.computedChannels[${cfgIdx}]`);
      }
    }
    
    // 3. Remove from window.globalCfg.computedChannels
    if (Array.isArray(window.globalCfg?.computedChannels)) {
      const globalCfgIdx = window.globalCfg.computedChannels.findIndex(ch => ch.id === channelID || ch.name === channelID);
      if (globalCfgIdx >= 0) {
        window.globalCfg.computedChannels.splice(globalCfgIdx, 1);
        console.log(`[deleteChannelByID]   ✓ Removed from globalCfg.computedChannels[${globalCfgIdx}]`);
      }
    }
    
    // 4. Remove from data.computedData (values array)
    if (Array.isArray(data?.computedData) && i >= 0 && i < data.computedData.length) {
      data.computedData.splice(i, 1);
      console.log(`[deleteChannelByID]   ✓ Removed from data.computedData[${i}]`);
    }
    
    // 5. Remove from window.globalData.computedData
    if (Array.isArray(window.globalData?.computedData) && i >= 0 && i < window.globalData.computedData.length) {
      window.globalData.computedData.splice(i, 1);
      console.log(`[deleteChannelByID]   ✓ Removed from globalData.computedData[${i}]`);
    }
    
    // 6. Remove from localStorage (async, fire-and-forget)
    import("./utils/computedChannelStorage.js").then(({ deleteComputedChannelFromStorage }) => {
      if (typeof deleteComputedChannelFromStorage === "function") {
        deleteComputedChannelFromStorage(channelID);
      }
    }).catch(e => console.warn("[deleteChannelByID] Storage deletion failed:", e));
    
    // 7. Rebuild channelID map
    rebuildChannelIDMap();
    
    console.log(`[deleteChannelByID] ✅ Computed channel "${channelID}" deleted successfully`);
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALOG/DIGITAL CHANNEL DELETION - Original logic
  // ═══════════════════════════════════════════════════════════════════════════
  const s = channelState[type];

  // Arrays that must remain in sync for each channel
  const perChannelArrays = [
    "yLabels",
    "lineColors",
    "yUnits",
    "groups",
    "axesScales",
    "scales",
    "starts",
    "durations",
    "inverts",
    "channelIDs",
  ];

  perChannelArrays.forEach((name) => {
    if (s[name] && Array.isArray(s[name])) {
      if (i >= 0 && i < s[name].length) s[name].splice(i, 1);
    }
  });

  // Also remove the placeholder series from dataState and original data to keep series alignment.
  try {
    const dtype = type;
    const arr = dataState && dataState[dtype];
    const raw = data && data[dtype];
    // series arrays start at index 1 (0 is time)
    const seriesIdx = i + 1;
    if (Array.isArray(arr) && seriesIdx >= 1 && seriesIdx < arr.length) {
      arr.splice(seriesIdx, 1);
    }
    if (raw && Array.isArray(raw) && seriesIdx >= 1 && seriesIdx < raw.length) {
      raw.splice(seriesIdx, 1);
    }
  } catch (e) {
    // non-fatal
  }

  // Rebuild channelID map after deletion
  rebuildChannelIDMap();
  
  return true;
}

/**
 * Process combined CFG and DAT data from child merger app
 * Parses the combined files and loads them into the main app
 */
async function processCombinedDataFromMerger(cfgText, datText) {
  try {
    console.log(
      "[processCombinedDataFromMerger] 🔄 Starting combined data processing..."
    );

    // PHASE 1: Parse CFG and DAT files
    console.log("[processCombinedDataFromMerger] 📝 Parsing CFG and DAT...");
    const cfg = parseCFG(cfgText, TIME_UNIT);
    const data = parseDAT(datText, cfg, "ASCII", TIME_UNIT);

    // Store globally
    window.globalCfg = cfg;
    window.globalData = data;

    console.log("[processCombinedDataFromMerger] ✅ Parsing complete");

    // Show loading indicator
    const fixedResultsEl = document.getElementById("fixedResults");
    if (fixedResultsEl) {
      fixedResultsEl.innerHTML =
        '<div style="padding: 20px; text-align: center; color: var(--text-secondary);"><p>🔄 Loading combined data...</p></div>';
    }

    // Validation
    if (!data.time || data.time.length === 0) {
      throw new Error("Failed to parse combined COMTRADE data.");
    }

    console.log(
      "[processCombinedDataFromMerger] 📊 PHASE 2: Updating UI state"
    );

    // PHASE 2: Update global data state
    dataState.analog = data.analogData;
    dataState.digital = data.digitalData;

    // Update UI with filename
    const cfgFileNameEl = document.getElementById("cfgFileName");
    const datFileNameEl = document.getElementById("datFileName");
    if (cfgFileNameEl) cfgFileNameEl.textContent = "Combined Data (Merged)";
    if (datFileNameEl) datFileNameEl.textContent = "Combined Data (Merged)";

    const groups = autoGroupChannels(cfg.analogChannels, "GA");

    // UI helper calls
    showFileInfo();
    updateFileInfo("Combined Data (Merged)", "Combined Data (Merged)");
    updateStatsCards({
      sampleRate: cfg.sampleRate || 4800,
      duration: cfg.duration || 2000,
      analogChannels: cfg.analogChannels,
      digitalChannels: cfg.digitalChannels,
    });
    toggleChartsVisibility(true);

    console.log(
      "[processCombinedDataFromMerger] 🎨 PHASE 3: Channel state initialization"
    );

    // PHASE 3: Initialize channel state
    if (channelState && channelState.suspendHistory)
      channelState.suspendHistory();
    try {
      initializeChannelState(cfg, data);

      // Populate analog group IDs
      const analogGroups = groups; // { G0: [0,1,2], G1: [3,4,5] }
      const analogGroupIds = new Array(cfg.analogChannels.length);
      Object.entries(analogGroups).forEach(([groupId, channelIndices]) => {
        channelIndices.forEach((channelIdx) => {
          analogGroupIds[channelIdx] = groupId;
        });
      });
      channelState.analog.groups = analogGroupIds;
      console.log("[processCombinedDataFromMerger] ✅ Populated analog group IDs");

      // Populate digital group IDs (same pattern as analog)
      const digitalGroups = autoGroupChannels(cfg.digitalChannels || []);
      const digitalGroupIds = new Array((cfg.digitalChannels || []).length);
      Object.entries(digitalGroups).forEach(([groupId, channelIndices]) => {
        channelIndices.forEach((channelIdx) => {
          digitalGroupIds[channelIdx] = groupId;
        });
      });
      channelState.digital.groups = digitalGroupIds;
      console.log(
        "[processCombinedDataFromMerger] ✅ Populated digital group IDs:",
        digitalGroupIds
      );
    } finally {
      if (channelState && channelState.resumeHistory)
        channelState.resumeHistory();
    }

    console.log("[processCombinedDataFromMerger] 📈 PHASE 4: Chart rendering");

    // PHASE 4: Render all charts
    renderComtradeCharts(
      cfg,
      data,
      chartsContainer,
      charts,
      verticalLinesX,
      createState,
      calculateDeltas,
      TIME_UNIT,
      channelState
    );
    updateExportButtonState();

    console.log(
      "[processCombinedDataFromMerger] 🎯 PHASE 5: Polar chart initialization"
    );

    // PHASE 5: Initialize Polar Chart
    try {
      if (!polarChart) {
        polarChart = new PolarChart("polarChartContainer");
        polarChart.init();
        console.log("[processCombinedDataFromMerger] ✅ PolarChart created");
      }

      if (window.requestIdleCallback) {
        window.requestIdleCallback(
          () => {
            try {
              polarChart.updatePhasorAtTimeIndex(cfg, data, 0);
              console.log(
                "[processCombinedDataFromMerger] ✅ Phasor data updated"
              );
            } catch (err) {
              console.error(
                "[processCombinedDataFromMerger] Phasor update failed:",
                err
              );
            }
          },
          { timeout: 2000 }
        );
      } else {
        requestAnimationFrame(() => {
          setTimeout(() => {
            try {
              polarChart.updatePhasorAtTimeIndex(cfg, data, 0);
            } catch (err) {
              console.error(
                "[processCombinedDataFromMerger] Phasor update failed:",
                err
              );
            }
          }, 100);
        });
      }
    } catch (err) {
      console.error(
        "[processCombinedDataFromMerger] Polar chart failed:",
        err.message
      );
    }

    console.log(
      "[processCombinedDataFromMerger] 📟 PHASE 6: Computed channels"
    );

    // PHASE 6: Load persisted computed channels
    const savedChannels = loadComputedChannelsFromStorage();
    const restoredChannels = rehydrateStoredComputedChannels(
      savedChannels,
      cfg,
      data,
      channelState
    );

    if (restoredChannels.length > 0) {
      // ✅ REFACTORED: Pass cfg + data like analog/digital
      renderComputedChart(
        cfg,
        data,
        chartsContainer,
        charts,
        verticalLinesX,
        channelState
      );
    }

    console.log(
      "[processCombinedDataFromMerger] ✅ Combined data processing complete!"
    );

    if (fixedResultsEl) {
      fixedResultsEl.innerHTML =
        '<div style="padding: 20px; text-align: center; color: green;">✅ Combined data loaded successfully!</div>';
    }
  } catch (error) {
    console.error("[processCombinedDataFromMerger] ❌ Error:", error);
    const fixedResultsEl = document.getElementById("fixedResults");
    if (fixedResultsEl) {
      fixedResultsEl.innerHTML = `<div style="padding: 20px; text-align: center; color: red;">❌ Error loading combined data: ${error.message}</div>`;
    }
  }
}

// Channel state for analog/digital
export const channelState = createState({
  analog: {
    yLabels: [],
    lineColors: [],
    yUnits: [],
    groups: [],
    axesScales: [],
    // per-channel parameters managed by ChannelList
    scales: [],
    starts: [],
    durations: [],
    inverts: [],
    xLabel: "",
    xUnit: "",
  },
  digital: {
    yLabels: [],
    lineColors: [],
    yUnits: [],
    groups: [],
    axesScales: [],
    // per-channel parameters managed by ChannelList
    scales: [],
    starts: [],
    durations: [],
    inverts: [],
    xLabel: "",
    xUnit: "",
  },
  computed: {
    channelIDs: [],
    yLabels: [],
    lineColors: [],
    yUnits: [],
    groups: [],
    // per-channel parameters managed by ChannelList
    scales: [],
    starts: [],
    durations: [],
    inverts: [],
    equations: [],
    xLabel: "Time",
    xUnit: "sec",
  },
});

function rehydrateStoredComputedChannels(
  savedChannels,
  cfg,
  data,
  channelState
) {
  if (!Array.isArray(savedChannels) || savedChannels.length === 0) {
    return [];
  }

  if (!data.computedData) {
    data.computedData = [];
  }

  if (!cfg.computedChannels) {
    cfg.computedChannels = [];
  }

  const addedChannels = [];
  let paletteIndex = 0;

  const computedState = (() => {
    try {
      return getComputedChannelsState();
    } catch (err) {
      console.warn(
        "[rehydrateStoredComputedChannels] State access failed",
        err
      );
      return null;
    }
  })();

  const normalizeId = (value, fallback) => {
    if (value === undefined || value === null || value === "") {
      return fallback;
    }
    return value;
  };

  const ensureNumericArray = (arr) => {
    if (!Array.isArray(arr)) {
      return [];
    }
    return arr.map((val) => {
      const num = Number(val);
      return Number.isFinite(num) ? num : 0;
    });
  };

  const collectExistingGroups = () => {
    const set = new Set();
    const pushGroup = (value) => {
      if (typeof value === "string" && value.startsWith("G")) {
        set.add(value);
      }
    };

    if (cfg?.computedChannels) {
      cfg.computedChannels.forEach((item) => pushGroup(item?.group));
    }

    if (channelState?.analog?.groups) {
      channelState.analog.groups.forEach(pushGroup);
    }

    if (channelState?.digital?.groups) {
      channelState.digital.groups.forEach(pushGroup);
    }

    if (channelState?.computed?.groups) {
      channelState.computed.groups.forEach(pushGroup);
    }

    return set;
  };

  const existingGroups = collectExistingGroups();

  const getFallbackGroup = () => {
    let index = 0;
    while (existingGroups.has(`G${index}`)) {
      index += 1;
    }
    const groupId = `G${index}`;
    existingGroups.add(groupId);
    return groupId;
  };

  const idsMatch = (a, b) => {
    if (a === undefined || a === null || b === undefined || b === null) {
      return false;
    }
    if (a === b) {
      return true;
    }
    return String(a) === String(b);
  };

  savedChannels.forEach((savedChannel, idx) => {
    try {
      const rawId = normalizeId(savedChannel?.id, savedChannel?.name);
      const channelId = normalizeId(rawId, `computed_${Date.now()}_${idx}`);
      const rawName = normalizeId(
        savedChannel?.name,
        typeof channelId === "string" ? channelId : `computed_${channelId}`
      );
      const channelName = String(rawName);
      const expression =
        savedChannel?.expression || savedChannel?.equation || "";
      const unit = savedChannel?.unit || "";
      const type = savedChannel?.type || "Computed";
      const group =
        typeof savedChannel?.group === "string" && savedChannel.group.trim()
          ? savedChannel.group.trim()
          : getFallbackGroup();
      const color =
        savedChannel?.color &&
        typeof savedChannel.color === "string" &&
        savedChannel.color.trim()
          ? savedChannel.color.trim()
          : COMPUTED_COLOR_PALETTE[
              paletteIndex % COMPUTED_COLOR_PALETTE.length
            ];
      paletteIndex += 1;

      existingGroups.add(group);

      const dataSeries = ensureNumericArray(savedChannel?.data);

      // Allow empty data arrays - they may be evaluated later
      if (!Array.isArray(dataSeries)) {
        console.warn(
          `[rehydrateStoredComputedChannels] Channel ${channelId}: converting invalid data to empty array`
        );
      }
      const validData = Array.isArray(dataSeries) ? dataSeries : [];
      console.log(
        `[rehydrateStoredComputedChannels] Restoring channel: ${channelId} (${validData.length} samples, color: ${color}, group: ${group})`
      );

      // ✅ REFACTORED: Check existence in cfg.computedChannels (metadata), not data.computedData (values)
      const alreadyInCfg = cfg.computedChannels.some(
        (existing) =>
          idsMatch(existing?.id, channelId) ||
          (expression && existing?.equation === expression)
      );

      if (alreadyInCfg) {
        console.log(
          `[rehydrateStoredComputedChannels] Skipping duplicate channel: ${channelId}`
        );
        return;
      }

      // ✅ FIX: Determine madeFrom - if stored as "digital" but values are NOT binary,
      // override to "analog" to prevent digitalFillPlugin errors
      let madeFromValue = savedChannel.madeFrom || "analog";
      if (madeFromValue === "digital" && validData.length > 0) {
        const isBinary = validData.slice(0, 100).every(v => v === 0 || v === 1);
        if (!isBinary) {
          console.log(`[rehydrateStoredComputedChannels] ⚠️ Channel "${channelName}" has madeFrom="digital" but non-binary values. Overriding to "analog".`);
          madeFromValue = "analog";
        }
      }

      // ✅ REFACTORED: Add METADATA to cfg.computedChannels
      const metadataEntry = {
        id: channelId,
        channelID: channelId,  // ✅ FIX: Include channelID for consistency with analog/digital
        name: channelName,
        equation: expression,
        unit,
        group,
        color,
        type,
        index: cfg.computedChannels.length,
        sampleCount: validData.length,
        madeFrom: madeFromValue,  // ✅ FIX: Include madeFrom for proper chart type routing
      };
      cfg.computedChannels.push(metadataEntry);
      
      // ✅ REFACTORED: Add VALUES to data.computedData (as array, not object)
      data.computedData.push(validData);

      // ✅ Update channelState.computed for UI reactivity
      if (channelState?.computed) {
        const computed = channelState.computed;
        const alreadyInState = computed.channelIDs.some((id) =>
          idsMatch(id, channelId)
        );

        if (!alreadyInState) {
          computed.channelIDs.push(channelId);
          computed.yLabels.push(channelName);
          computed.lineColors.push(
            color && typeof color === "string" && color.trim()
              ? color.trim()
              : "#888"
          );
          computed.yUnits.push(unit);
          computed.groups.push(group);
          computed.scales.push(1);
          computed.starts.push(0);
          computed.durations.push("");
          computed.inverts.push(false);
          computed.equations.push(expression);
        }
      }

      if (computedState?.addChannel && !computedState.hasChannel(channelId)) {
        computedState.addChannel(channelId, metadataEntry, "init");
      }

      addedChannels.push(computedEntry);
      console.log(
        `[rehydrateStoredComputedChannels] ✅ Restored channel: ${channelId} (${dataSeries.length} samples, group: ${group})`
      );
    } catch (err) {
      console.error(
        `[rehydrateStoredComputedChannels] Error processing channel ${idx}:`,
        err
      );
    }
  });

  return addedChannels;
}

// Small runtime helper to inspect key runtime structures from DevTools.
// Call `window.__inspectComtradeState()` in the console to print `data`,
// `dataState`, `channelState`, and `charts` (safe, non-destructive).
try {
  if (typeof window !== "undefined") {
    window.__inspectComtradeState = function () {
      try {
        console.groupCollapsed("__inspectComtradeState");
        console.log(
          "data (module):",
          typeof data !== "undefined" ? data : null
        );
        console.log(
          "dataState (module):",
          typeof dataState !== "undefined" ? dataState : null
        );
        console.log(
          "channelState (module):",
          typeof channelState !== "undefined" ? channelState : null
        );
        try {
          console.log(
            "charts (module):",
            typeof charts !== "undefined" ? charts : null
          );
          if (Array.isArray(charts)) {
            charts.forEach((c, i) => {
              try {
                const xArr = c && c.data && c.data[0] ? c.data[0] : undefined;
                console.log(
                  `chart[${i}] x-array (first 10):`,
                  xArr && xArr.slice ? xArr.slice(0, 10) : xArr
                );
              } catch (e) {}
            });
          }
        } catch (e) {}
        console.groupEnd();
      } catch (err) {
        console.error("__inspectComtradeState failed:", err);
      }
    };
  }
} catch (e) {}

// Friendly property aliases so callers can subscribe using business names
export const PROPERTY_ALIASES = {
  color: "lineColors",
  name: "yLabels",
  scale: "scales",
  start: "starts",
  duration: "durations",
  invert: "inverts",
  // allow subscribing directly to channelIDs array if desired
  channelIDs: "channelIDs",
  group: "groups",
};

// Convenience helper: subscribe to a logical property across analog, digital, AND computed
// Usage: channelState.subscribeProperty('color', handler, { descendants: true })
// The handler receives the same change object emitted by createState
channelState.subscribeProperty = function (propName, fn, options = {}) {
  const mapped = PROPERTY_ALIASES[propName] || propName;
  try {
    // subscribe to analog.<mapped>, digital.<mapped>, AND computed.<mapped>
    this.subscribe(fn, {
      path: `analog.${mapped}`,
      descendants: !!options.descendants,
    });
    this.subscribe(fn, {
      path: `digital.${mapped}`,
      descendants: !!options.descendants,
    });
    // ✅ FIX: Also subscribe to computed property changes
    this.subscribe(fn, {
      path: `computed.${mapped}`,
      descendants: !!options.descendants,
    });
  } catch (e) {
    console.warn("subscribeProperty failed:", e);
  }
};

// Background mode: 0 = white, 1 = dark
export const whiteBackground = createState(0);

// --- DOM Elements ---
const cfgFileInput = document.getElementById("cfgFile");
const loadBtn = document.getElementById("loadBtn");
const cfgFileNameEl = document.getElementById("cfgFileName");
const datFileNameEl = document.getElementById("datFileName");
const chartsContainer = document.getElementById("charts");
const fixedResultsEl = document.getElementById("fixed-results");

// Initialize progress bar in header
const topHeader = document.querySelector(".top-header");
if (topHeader) {
  const progressBar = createProgressBar();
  topHeader.style.position = "relative";
  topHeader.appendChild(progressBar);
}

console.log("[main.js] DOM Elements:", {
  loadBtn,
  cfgFileInput,
  chartsContainer,
});

// Global error capture so runtime crashes are visible in the app UI
window.addEventListener("error", (ev) => {
  try {
    const msg = `Error: ${ev.message} at ${ev.filename}:${ev.lineno}:${ev.colno}`;
    console.error(msg, ev.error);
    if (fixedResultsEl)
      fixedResultsEl.textContent =
        msg + "\n" + (ev.error && ev.error.stack ? ev.error.stack : "");
  } catch (e) {
    console.error("Error handler failed", e);
  }
});
window.addEventListener("unhandledrejection", (ev) => {
  try {
    const msg = `UnhandledRejection: ${
      ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason)
    }`;
    console.error(msg, ev.reason);
    if (fixedResultsEl)
      fixedResultsEl.textContent =
        msg + "\n" + (ev.reason && ev.reason.stack ? ev.reason.stack : "");
  } catch (e) {
    console.error("Rejection handler failed", e);
  }
});

// --- Event Listeners ---
if (loadBtn) {
  loadBtn.addEventListener("click", handleLoadFiles);
  console.log("[main.js] loadBtn event listener attached");
} else {
  console.warn("[main.js] loadBtn element not found in DOM");
}

// Merge Multiple Files button
const mergeMultipleFilesBtn = document.getElementById("mergeMultipleFilesBtn");
if (mergeMultipleFilesBtn) {
  mergeMultipleFilesBtn.addEventListener("click", () => {
    console.log("[main.js] Opening COMTRADE File Merger...");
    openMergerWindow();
  });
  console.log("[main.js] mergeMultipleFilesBtn event listener attached");
}

// Listen for merged files from the merger app
window.addEventListener("mergedFilesReceived", async (event) => {
  console.log(
    "[main.js] 📦 Received merged files from merger app:",
    event.detail
  );

  try {
    // Handle BOTH old and new data structures for backwards compatibility
    const {
      cfg: cfgData,
      data: parsedData, // NEW: Already parsed data from combiner
      datContent, // OLD: Raw DAT text for backwards compatibility
      filenames,
      fileCount,
      isMerged,
      isMergedFromCombiner,
    } = event.detail;

    // Validate we have either the new structure (cfg+data) or old structure (cfgData+datContent)
    if (!cfgData || (!parsedData && !datContent)) {
      showError(
        "Invalid merged file data received from merger app.",
        fixedResultsEl
      );
      return;
    }

    // Show loading indicator
    fixedResultsEl.innerHTML =
      '<div style="padding: 20px; text-align: center; color: var(--text-secondary);"><p>🔄 Loading merged files...</p><p style="font-size: 0.9rem; margin-top: 10px;">Processing merged COMTRADE data</p></div>';

    console.log("[main.js] 📊 PHASE 1: Processing merged data");

    // Parse the merged CFG and DAT data
    cfg = cfgData;

    // ✅ Make cfg globally accessible for computed channel evaluation (like temp repo)
    window.globalCfg = cfg;

    // Use already-parsed data if available (NEW path from combiner)
    // Otherwise parse raw text (OLD path for backwards compatibility)
    let datData;
    if (parsedData) {
      // NEW: Data is already parsed by combiner using parent's parseCFG/parseDAT
      console.log(`[main.js] ✅ Using pre-parsed data from combiner`);
      datData = parsedData;
    } else if (typeof datContent === "string") {
      // OLD: Parse raw text content
      const fileType = cfg.ft || "ASCII";
      console.log(`[main.js] Parsing merged DAT content as ${fileType} format`);
      datData = parseDAT(datContent, cfg, fileType, TIME_UNIT);
    } else {
      datData = datContent;
    }

    data = {
      ...datData,
      time: datData.time || [],
      analogData: datData.analogData || [],
      digitalData: datData.digitalData || [],
    };

    // ✅ Make data globally accessible for computed channel evaluation (like temp repo)
    window.globalData = data;

    if (!data.time || data.time.length === 0) {
      showError("Failed to parse merged COMTRADE data.", fixedResultsEl);
      return;
    }

    console.log("[main.js] 📊 PHASE 2: Initializing data state");

    // Update global data state
    dataState.analog = data.analogData;
    dataState.digital = data.digitalData;

    // Update UI with filenames
    const filenameText = isMerged
      ? `Merged: ${filenames.join(", ")}`
      : `Loaded: ${filenames[0]}`;

    cfgFileNameEl.textContent = filenameText;
    datFileNameEl.textContent = isMerged
      ? `(${fileCount} DAT files merged)`
      : `DAT File: ${filenames[0]}.dat`;

    const groups = autoGroupChannels(cfg.analogChannels, "GA");

    // ===== UI HELPER CALLS (Light) =====
    showFileInfo();
    updateFileInfo(
      filenames[0],
      isMerged ? `${fileCount} files merged` : `${filenames[0]}.dat`
    );
    updateStatsCards({
      sampleRate: cfg.sampleRate || 4800,
      duration: cfg.duration || 2000,
      analogChannels: cfg.analogChannels,
      digitalChannels: cfg.digitalChannels,
    });
    toggleChartsVisibility(true);

    console.log("[main.js] 🎨 PHASE 3: Channel state initialization");

    // PHASE 3: Initialize channel state
    if (channelState && channelState.suspendHistory)
      channelState.suspendHistory();
    try {
      initializeChannelState(cfg, data);

      // Populate analog group IDs
      const analogGroups = groups;
      const analogGroupIds = new Array(cfg.analogChannels.length);
      Object.entries(analogGroups).forEach(([groupId, channelIndices]) => {
        channelIndices.forEach((channelIdx) => {
          analogGroupIds[channelIdx] = groupId;
        });
      });
      channelState.analog.groups = analogGroupIds;
      console.log(
        "[main.js] ✅ Populated analog group IDs from merged files:",
        analogGroupIds
      );

      // Populate digital group IDs (same pattern as analog)
      const digitalGroups = autoGroupChannels(cfg.digitalChannels || []);
      const digitalGroupIds = new Array((cfg.digitalChannels || []).length);
      Object.entries(digitalGroups).forEach(([groupId, channelIndices]) => {
        channelIndices.forEach((channelIdx) => {
          digitalGroupIds[channelIdx] = groupId;
        });
      });
      channelState.digital.groups = digitalGroupIds;
      console.log(
        "[main.js] ✅ Populated digital group IDs from merged files:",
        digitalGroupIds
      );
    } finally {
      if (channelState && channelState.resumeHistory)
        channelState.resumeHistory();
    }

    // Yield to event loop
    await new Promise((resolve) => setTimeout(resolve, 50));

    console.log("[main.js] 📈 PHASE 4: Chart rendering");

    // PHASE 4: Render all charts
    renderComtradeCharts(
      cfg,
      data,
      chartsContainer,
      charts,
      verticalLinesX,
      createState,
      calculateDeltas,
      TIME_UNIT,
      channelState
    );
    updateExportButtonState();

    // Yield to event loop
    await new Promise((resolve) => setTimeout(resolve, 50));

    console.log("[main.js] 🎯 PHASE 5: Polar chart initialization");

    // PHASE 5: Initialize Polar Chart
    try {
      console.log("[main.js] Creating PolarChart instance...");
      if (!polarChart) {
        polarChart = new PolarChart("polarChartContainer");
        polarChart.init();
        console.log("[main.js] ✅ PolarChart instance created");
      } else {
        console.log(
          "[main.js] ⏭️ PolarChart already exists, skipping creation"
        );
      }

      if (window.requestIdleCallback) {
        window.requestIdleCallback(
          () => {
            try {
              console.log("[PolarChart] Background: Updating phasor data...");
              polarChart.updatePhasorAtTimeIndex(cfg, data, 0);
              console.log("[PolarChart] ✅ Background phasor update complete");
            } catch (err) {
              console.error("[PolarChart] Background update failed:", err);
            }
          },
          { timeout: 2000 }
        );
      } else {
        requestAnimationFrame(() => {
          setTimeout(() => {
            try {
              console.log("[PolarChart] Fallback: Updating phasor data...");
              polarChart.updatePhasorAtTimeIndex(cfg, data, 0);
            } catch (err) {
              console.error("[PolarChart] Fallback update failed:", err);
            }
          }, 100);
        });
      }

      console.log(
        "[main.js] ✅ Polar chart instance created (rendering deferred)"
      );
    } catch (err) {
      console.error(
        "[main.js] ❌ Failed to initialize polar chart:",
        err.message
      );
    }

    // Yield to event loop
    await new Promise((resolve) => setTimeout(resolve, 50));

    console.log("[main.js] 📟 PHASE 6: Computed channels");

    // PHASE 6: Load persisted computed channels
    const savedChannels = loadComputedChannelsFromStorage();
    const restoredChannels = rehydrateStoredComputedChannels(
      savedChannels,
      cfg,
      data,
      channelState
    );

    if (restoredChannels.length > 0) {
      const csvBtn = document.getElementById("exportCSVBtn");
      if (csvBtn) csvBtn.disabled = false;
      // ✅ REFACTORED: Pass cfg + data like analog/digital
      renderComputedChart(
        cfg,
        data,
        chartsContainer,
        charts,
        verticalLinesX,
        channelState
      );
      updateExportButtonState();
    } else {
      updateExportButtonState();
    }
    subscribeToComputedChannelStateChanges();
    setupComputedChannelsListener();

    // Yield to event loop
    await new Promise((resolve) => setTimeout(resolve, 50));

    console.log("[main.js] 🔗 PHASE 7: Chart integrations");

    // PHASE 7: Setup polar chart with vertical lines
    if (polarChart) {
      try {
        setupPolarChartWithVerticalLines(
          polarChart,
          cfg,
          data,
          verticalLinesX,
          charts
        );
        console.log("[main.js] ✅ Polar chart integrated");
      } catch (err) {
        console.error(
          "[main.js] ❌ Polar chart integration failed:",
          err.message
        );
      }
    }

    // PHASE 8: Final setup
    try {
      applyInitialStartDurations(channelState, dataState, charts);
    } catch (e) {
      console.debug("applyInitialStartDurations failed:", e);
    }

    try {
      const maxDuration = data.time ? data.time[data.time.length - 1] : 1;
      verticalLineControl = initVerticalLineControl({
        dataState: dataState,
        maxDuration: maxDuration,
        onPositionChange: (value) => {
          // Vertical line position changed
        },
      });
    } catch (error) {
      console.error(
        "[main.js] Failed to initialize vertical line control:",
        error
      );
    }

    if (window._resizableGroup) window._resizableGroup.disconnect();
    window._resizableGroup = new ResizableGroup(".dragBar");

    // Initialize fast lookup map
    rebuildChannelIDMap();

    // Setup subscriptions
    try {
      channelState.analog?.subscribe?.(() => {
        rebuildChannelIDMap();
      });
      channelState.digital?.subscribe?.(() => {
        rebuildChannelIDMap();
      });
    } catch (e) {
      console.warn("[main] Failed to set up channelID map rebuild:", e);
    }

    // Defer subscription setup
    if (window.requestIdleCallback) {
      window.requestIdleCallback(
        () => {
          console.log(
            "[main.js] Background: Setting up chart subscriptions..."
          );
          subscribeChartUpdates(
            channelState,
            dataState,
            charts,
            chartsContainer,
            verticalLinesX,
            cfg,
            data,
            createState,
            calculateDeltas,
            TIME_UNIT,
            () => globalProgressCallback // ✅ NEW: Pass progress callback getter
          );
          console.log("[main.js] ✅ Chart subscriptions ready");
        },
        { timeout: 2000 }
      );
    } else {
      setTimeout(() => {
        subscribeChartUpdates(
          channelState,
          dataState,
          charts,
          chartsContainer,
          verticalLinesX,
          cfg,
          data,
          createState,
          calculateDeltas,
          TIME_UNIT,
          () => globalProgressCallback // ✅ NEW: Pass progress callback getter
        );
      }, 500);
    }

    console.log(
      "[main.js] 🎉 COMPLETE - All merged files loaded and rendered successfully"
    );
    fixedResultsEl.innerHTML = "";
  } catch (error) {
    console.error("[main.js] ❌ Error processing merged files:", error.message);
    showError(
      "An error occurred while processing the merged COMTRADE files. Check the console for details.",
      fixedResultsEl
    );
  }
});
console.log("[main.js] mergedFilesReceived event listener attached");

// Note: initSidebarSystem() is now called in DOMContentLoaded (see below)
// This ensures the DOM is ready before initializing the sidebar system

// DOM Elements for Phasor/Analysis Controls
const mainContent = document.querySelector("main");
const detachedWindow = document.getElementById("detachedWindow");
const windowTitleBar = document.getElementById("windowTitleBar");
const attachWindowBtn = document.getElementById("attachWindowBtn");
const closeWindowBtn = document.getElementById("closeWindowBtn");
const detachedWindowContent = document.getElementById("detachedWindowContent");

// Note: Sidebar buttons are now dynamically created in AnalysisSidebar.js
// They will be available after analysisSidebar.show() is called
// Create analysis container for detached sidebar in charts area
let analysisContainer = null;
function getOrCreateAnalysisContainer() {
  if (!analysisContainer) {
    analysisContainer = document.createElement("div");
    analysisContainer.id = "analysis-sidebar-container";
    analysisContainer.style.background = "var(--bg-secondary)";
    analysisContainer.style.border = "1px solid var(--border-color)";
    analysisContainer.style.borderRadius = "var(--border-radius-sm)";
    analysisContainer.style.padding = "16px";
    analysisContainer.style.marginTop = "16px";
  }
  return analysisContainer;
}

// Track current sidebar layout mode
let sidebarLayoutMode = "sidebar"; // "sidebar", "floating", "charts-inline", "charts-below", or "analysis-container"

// Dragging variables
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Helper function to move polar chart section to different locations
function movePolarChartSection(targetMode) {
  const polarChartSection = document.querySelector(".polar-chart-section");
  if (!polarChartSection) {
    console.warn("[main.js] polar-chart-section not found for layout change");
    return;
  }

  const sidebar = document.getElementById("sidebar");
  const sidebarToggleBtn = document.getElementById("analysis-sidebar-toggle");
  const analysisPanel = document.getElementById("analysis-sidebar-panel");
  const detachedWindowEl = document.getElementById("detachedWindow");
  const detachedContentEl = document.getElementById("detachedWindowContent");

  switch (targetMode) {
    case "floating":
      // Move to floating window
      if (!detachedWindowEl || !detachedContentEl) {
        console.warn("[main.js] Floating window container missing");
        return;
      }

      detachedContentEl.innerHTML = polarChartSection.innerHTML;
      detachedWindowEl.classList.add("show");
      if (sidebar) sidebar.style.display = "none";
      if (analysisPanel) analysisPanel.style.display = "none";
      if (sidebarToggleBtn) sidebarToggleBtn.style.display = "flex";
      if (mainContent) mainContent.classList.add("sidebar-closed");
      console.log("[main.js] Sidebar moved to floating window");
      break;

    case "charts-inline":
      // Move to charts container (side by side)
      if (chartsContainer) {
        // Store original content before moving
        chartsContainer.classList.remove("charts-block-layout");
        polarChartSection.style.order = "-1"; // Display first in charts container
        chartsContainer.style.display = "grid";
        chartsContainer.style.gridTemplateColumns = "1fr 1fr";
        chartsContainer.style.gap = "16px";
        chartsContainer.insertBefore(
          polarChartSection,
          chartsContainer.firstChild
        );
        if (sidebar) sidebar.style.display = "none";
        if (analysisPanel) analysisPanel.style.display = "none";
        if (sidebarToggleBtn) sidebarToggleBtn.style.display = "flex";
        if (mainContent) mainContent.classList.add("sidebar-closed");
        console.log(
          "[main.js] Sidebar moved to charts container inline (side by side)"
        );
      }
      break;

    case "charts-below":
      // Move to charts container (below charts)
      if (chartsContainer) {
        // Reset order and append to end (below charts)
        chartsContainer.classList.add("charts-block-layout");
        polarChartSection.style.order = "auto";
        chartsContainer.style.display = "block";
        chartsContainer.style.gridTemplateColumns = "auto";
        chartsContainer.style.gap = "auto";
        chartsContainer.appendChild(polarChartSection);
        if (sidebar) sidebar.style.display = "none";
        if (analysisPanel) analysisPanel.style.display = "none";
        if (sidebarToggleBtn) sidebarToggleBtn.style.display = "flex";
        if (mainContent) mainContent.classList.add("sidebar-closed");
        console.log("[main.js] Sidebar moved to charts container below");
      }
      break;

    case "analysis-container":
      // Move to dedicated analysis container in charts area
      if (chartsContainer) {
        const container = getOrCreateAnalysisContainer();
        if (!container.parentElement) {
          chartsContainer.appendChild(container);
        }

        // Create header with close button
        const headerDiv = document.createElement("div");
        headerDiv.style.display = "flex";
        headerDiv.style.justifyContent = "space-between";
        headerDiv.style.alignItems = "center";
        headerDiv.style.marginBottom = "12px";
        headerDiv.style.paddingBottom = "8px";
        headerDiv.style.borderBottom = "1px solid var(--border-color)";

        const titleSpan = document.createElement("span");
        titleSpan.textContent = "Analysis";
        titleSpan.style.fontWeight = "600";
        titleSpan.style.color = "var(--text-primary)";
        headerDiv.appendChild(titleSpan);

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "⬅ Back";
        closeBtn.style.background = "none";
        closeBtn.style.border = "none";
        closeBtn.style.color = "var(--text-secondary)";
        closeBtn.style.cursor = "pointer";
        closeBtn.style.fontSize = "0.85rem";
        closeBtn.style.padding = "4px 8px";
        closeBtn.style.borderRadius = "4px";
        closeBtn.style.transition = "background 0.2s";

        closeBtn.addEventListener("mouseenter", () => {
          closeBtn.style.background = "var(--bg-tertiary)";
        });
        closeBtn.addEventListener("mouseleave", () => {
          closeBtn.style.background = "none";
        });

        closeBtn.addEventListener("click", () => {
          sidebarLayoutMode = "sidebar";
          movePolarChartSection("sidebar");
        });

        headerDiv.appendChild(closeBtn);

        container.innerHTML = headerDiv.outerHTML + polarChartSection.innerHTML;
        if (sidebar) sidebar.style.display = "none";
        if (analysisPanel) analysisPanel.style.display = "none";
        if (sidebarToggleBtn) sidebarToggleBtn.style.display = "flex";
        if (mainContent) mainContent.classList.add("sidebar-closed");
        console.log("[main.js] Sidebar moved to analysis container");
      }
      break;

    case "sidebar":
      // Return to original sidebar position
      const originalSidebar = document.getElementById("sidebar");
      if (originalSidebar) {
        // Restore original inline styles and remove CSS classes
        chartsContainer.classList.remove("charts-block-layout");
        if (analysisContainer && analysisContainer.parentElement) {
          analysisContainer.remove();
        }
        polarChartSection.style.order = "auto";
        originalSidebar.appendChild(polarChartSection);
        if (detachedWindowEl) detachedWindowEl.classList.remove("show");
        if (sidebar) {
          sidebar.style.display = "flex";
          sidebar.style.flexDirection = "column";
        }
        if (analysisPanel) analysisPanel.style.display = "flex";
        if (sidebarToggleBtn) sidebarToggleBtn.style.display = "none";
        if (mainContent) mainContent.classList.remove("sidebar-closed");
        console.log("[main.js] Sidebar returned to original sidebar position");
      }
      break;
  }
}

// Setup handlers for floating/below chart buttons (created dynamically in AnalysisSidebar)
function setupLayoutButtonHandlers() {
  const floatingWindowBtn = document.getElementById("floatingWindowBtn");
  const belowChartBtn = document.getElementById("belowChartBtn");
  const returnSidebarBtn = document.getElementById("returnSidebarBtn");
  const returnSidebarFromBelowBtn = document.getElementById(
    "returnSidebarFromBelowBtn"
  );

  // Handle floating window button
  if (floatingWindowBtn && !floatingWindowBtn.__hasListener) {
    floatingWindowBtn.__hasListener = true;
    floatingWindowBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sidebarLayoutMode = "floating";
      movePolarChartSection("floating");
      updateLayoutButtonVisibility();
    });

    floatingWindowBtn.addEventListener("mouseenter", () => {
      floatingWindowBtn.style.background = "var(--bg-secondary)";
      floatingWindowBtn.style.opacity = "0.8";
    });
    floatingWindowBtn.addEventListener("mouseleave", () => {
      floatingWindowBtn.style.background = "var(--bg-tertiary)";
      floatingWindowBtn.style.opacity = "1";
    });
  }

  // Handle below chart button
  if (belowChartBtn && !belowChartBtn.__hasListener) {
    belowChartBtn.__hasListener = true;
    belowChartBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sidebarLayoutMode = "charts-below";
      movePolarChartSection("charts-below");
      updateLayoutButtonVisibility();
    });

    belowChartBtn.addEventListener("mouseenter", () => {
      belowChartBtn.style.background = "var(--bg-secondary)";
      belowChartBtn.style.opacity = "0.8";
    });
    belowChartBtn.addEventListener("mouseleave", () => {
      belowChartBtn.style.background = "var(--bg-tertiary)";
      belowChartBtn.style.opacity = "1";
    });
  }

  // Handle return sidebar buttons
  if (returnSidebarBtn && !returnSidebarBtn.__hasListener) {
    returnSidebarBtn.__hasListener = true;
    returnSidebarBtn.addEventListener("click", () => {
      sidebarLayoutMode = "sidebar";
      movePolarChartSection("sidebar");
      updateLayoutButtonVisibility();
    });
  }

  if (returnSidebarFromBelowBtn && !returnSidebarFromBelowBtn.__hasListener) {
    returnSidebarFromBelowBtn.__hasListener = true;
    returnSidebarFromBelowBtn.addEventListener("click", () => {
      sidebarLayoutMode = "sidebar";
      movePolarChartSection("sidebar");
      updateLayoutButtonVisibility();
    });
  }
}

// Call setup when sidebar is shown
const originalAnalysisSidebarShow = analysisSidebar.show;
analysisSidebar.show = function () {
  originalAnalysisSidebarShow.call(this);
  setupLayoutButtonHandlers();
};

// Button handlers are now setup via setupLayoutButtonHandlers()
// called when sidebar is shown

// Helper function to update button visibility based on layout mode
function updateLayoutButtonVisibility() {
  const floatingWindowBtn = document.getElementById("floatingWindowBtn");
  const belowChartBtn = document.getElementById("belowChartBtn");
  const returnSidebarBtn = document.getElementById("returnSidebarBtn");
  const returnSidebarFromBelowBtn = document.getElementById(
    "returnSidebarFromBelowBtn"
  );

  if (
    floatingWindowBtn &&
    belowChartBtn &&
    returnSidebarBtn &&
    returnSidebarFromBelowBtn
  ) {
    if (sidebarLayoutMode === "floating") {
      // Show return button in sidebar header when in floating mode
      returnSidebarBtn.style.display = "block";
      floatingWindowBtn.style.display = "none";
      belowChartBtn.style.display = "none";
      // Hide below button
      returnSidebarFromBelowBtn.style.display = "none";
    } else if (sidebarLayoutMode === "charts-below") {
      // Hide buttons in sidebar header and show return button in polar chart header
      returnSidebarBtn.style.display = "none";
      floatingWindowBtn.style.display = "none";
      belowChartBtn.style.display = "none";
      // Show return button in the below chart section
      returnSidebarFromBelowBtn.style.display = "block";
    } else {
      // Show mode buttons when in sidebar
      floatingWindowBtn.style.display = "block";
      belowChartBtn.style.display = "block";
      returnSidebarBtn.style.display = "none";
      returnSidebarFromBelowBtn.style.display = "none";
    }
  }
}

/**
 * Setup resizable divider between main content and sidebar
 * Allows user to drag to resize main content and sidebar widths
 */
function setupResizableDivider() {
  const divider = document.getElementById("resizeDivider");
  const mainContent = document.getElementById("mainContent");
  const deltaDrawer = document.getElementById("delta-drawer");
  const analysisSidebar = document.getElementById("analysis-sidebar");

  if (!divider || !mainContent || !deltaDrawer) {
    console.warn("[ResizableDivider] Required elements not found");
    return;
  }

  const mainContentArea = mainContent.parentElement;

  let isDragging = false;

  divider.addEventListener("mousedown", () => {
    isDragging = true;
    document.body.style.cursor = "col-resize";
    console.log("[ResizableDivider] ✅ Dragging started");
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = "default";
      console.log("[ResizableDivider] ✅ Dragging ended");
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const containerRect = mainContentArea.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const newWidth = ((e.clientX - containerRect.left) / containerWidth) * 100;

    // Constrain width between 20% and 80%
    if (newWidth > 20 && newWidth < 80) {
      const mainWidth = newWidth;
      const sidebarWidth = 100 - newWidth;

      // ✅ Use CSS variables to override Tailwind hashing
      document.documentElement.style.setProperty(
        "--main-content-width",
        mainWidth + "%"
      );
      document.documentElement.style.setProperty(
        "--sidebar-width",
        sidebarWidth + "%"
      );
      document.documentElement.style.setProperty(
        "--sidebar-width-right",
        sidebarWidth + "%"
      );

      // Add resized class to apply CSS variable widths
      mainContent.classList.add("sidebar-resized");
      deltaDrawer.classList.add("sidebar-resized");

      // Also update analysis sidebar if it's open
      if (analysisSidebar && !analysisSidebar.classList.contains("hidden")) {
        analysisSidebar.classList.add("sidebar-resized");
      }

      console.log(
        `[ResizableDivider] Width: Main ${mainWidth.toFixed(
          1
        )}% | Sidebar ${sidebarWidth.toFixed(1)}%`
      );
    }
  });

  console.log("[ResizableDivider] ✅ Initialized");
}

// Handle sidebar toggle button (for Analysis Sidebar)
// Note: This button is now dynamically created in AnalysisSidebar.js
// Get reference to it after sidebar is injected
function setupAnalysisSidebarHandlers() {
  const sidebarToggleBtn = document.getElementById("analysis-sidebar-toggle");
  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener("click", () => {
      analysisSidebar.toggle();
    });
  }
}

function setupHtmlButtonHandlers() {
  console.log("[main.js] Setting up HTML button handlers");

  // Note: Analysis and Delta button handlers are now defined as global functions
  // (handleAnalysisButtonClick and handleDeltaButtonClick in onclick attributes)
  // See index.html for button definitions

  // Keep this function for any other HTML button handlers that may be needed later
}

// Setup handlers after first render
document.addEventListener("DOMContentLoaded", () => {
  console.log("[main.js] DOMContentLoaded event fired");

  // Initialize sidebar system FIRST (before button handlers)
  // This ensures sidebars are registered before buttons try to control them
  // and before the DOM elements are accessed
  initSidebarSystem();

  setupAnalysisSidebarHandlers();

  // Setup draggable divider for sidebar resizing
  setupResizableDivider();

  // Initialize zoom controls for all sections
  console.log("[main.js] Initializing zoom controls...");
  // Zoom controls are already in HTML with onclick handlers
  // The zoomControls module exposes functions to window.__zoomControls

  // Note: Button handlers are now attached via onclick attributes in HTML
  // No need to call setupHtmlButtonHandlers() anymore
});

// Also setup when sidebar is first shown
const originalShow = analysisSidebar.show;
analysisSidebar.show = function () {
  originalShow.call(this);
  setupAnalysisSidebarHandlers();
  setupLayoutButtonHandlers();
};

// OLD CODE - detached window functionality now handled in floating mode via movePolarChartSection
// Keeping references but commenting out the broken event listeners
// if (attachWindowBtn) { ... }
// if (closeWindowBtn) { ... }
// if (windowTitleBar) { ... }

document.addEventListener("keydown", (e) => {
  handleVerticalLineShortcuts(
    e,
    charts,
    verticalLinesX,
    fixedResultsEl,
    TIME_UNIT,
    calculateDeltas
  ).catch((err) =>
    console.error("[main.js] Error in handleVerticalLineShortcuts:", err)
  );
});

// === Theme Toggle ===
// ThemeContext is now initialized globally and handles theme management

// === Computed Channels State ===
// Initialize global computed channels state for reactive updates
initComputedChannelsState({});

// Listen for computed channel changes and re-render charts
try {
  const computedChannelsState = getComputedChannelsState();
  if (computedChannelsState && computedChannelsState.onChannelsChanged) {
    computedChannelsState.onChannelsChanged(({ channels, source }) => {
      try {
        console.log("[main.js] Computed channels updated:", {
          source,
          channelCount: Object.keys(channels || {}).length,
        });

        // Only re-render if the change came from the child window or parent
        if (source !== "init" && channels) {
          // ✅ FIX: Re-render ALL charts (not just computed) so analog charts
          // can include computed channels assigned to their groups
          if (typeof renderComtradeCharts === "function") {
            const cfgRef = window.globalCfg || cfg;
            const dataRef = window.globalData || data;
            const container = document.getElementById("charts");
            if (container) {
              console.log("[main.js] 🔄 Re-rendering ALL charts after computed channel update...");
              renderComtradeCharts(
                cfgRef,
                dataRef,
                container,
                charts,
                verticalLinesX,
                createState,
                null, // calculateDeltas
                "seconds",
                channelState
              );
            }
            updateExportButtonState();
          }

          // 🎯 Broadcast computed channels update to Channel List popup if open
          if (window.__channelListWindow && !window.__channelListWindow.closed) {
            try {
              const computedChannelsList = Object.values(channels || {});
              console.log("[main.js] 📢 Broadcasting computed channels to popup:", {
                count: computedChannelsList.length,
                ids: computedChannelsList.map((ch) => ch.id),
              });

              window.__channelListWindow.postMessage(
                {
                  source: "MainApp",
                  type: "computed_channels_updated",
                  payload: {
                    computedChannels: computedChannelsList,
                  },
                },
                "*"
              );
            } catch (err) {
              console.warn(
                "[main.js] Failed to broadcast computed channels to popup:",
                err
              );
            }
          }
        }
      } catch (e) {
        console.error("[main.js] Error handling computed channels update:", e);
      }
    });
  }
} catch (e) {
  console.warn("[main.js] Failed to setup computed channels listener:", e);
}

import themeBroadcast from "./utils/themeBroadcast.js";

// ✅ Initialize unified theme broadcast system
themeBroadcast.init();

// ✅ Listen for theme changes to update charts
window.addEventListener("message", (ev) => {
  if (ev.data && ev.data.theme) {
    console.log("[main.js] Theme change received, updating charts");
    updateAllChartAxisColors(charts);
  }
});

// ✅ Keep ThemeContext for backward compatibility
// Subscribe to global theme changes
const themeUnsubscribe = themeContext.subscribe(({ theme, isDark, colors }) => {
  console.log(`[Main] Global theme changed to: ${theme}`);

  // Update body class for additional styling
  document.body.classList.toggle("dark-theme", isDark);

  // Dispatch event for legacy components
  window.dispatchEvent(
    new CustomEvent("app-theme-changed", {
      detail: { theme, isDark, colors },
    })
  );
});

// Reference existing buttons from header
const showChannelListBtn = document.getElementById("showChannelListBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");

// Keep buttons enabled/disabled based on stack sizes
function updateUndoRedoButtons() {
  try {
    if (!undoBtn || !redoBtn) return;
    const canUndo = !!(
      channelState.getHistory && channelState.getHistory().length > 0
    );
    const canRedo = !!(
      channelState.getRedoStack && channelState.getRedoStack().length > 0
    );
    undoBtn.disabled = !canUndo;
    redoBtn.disabled = !canRedo;
  } catch (e) {
    if (undoBtn) undoBtn.disabled = true;
    if (redoBtn) redoBtn.disabled = true;
  }
}

if (undoBtn) {
  undoBtn.addEventListener("click", () => {
    try {
      channelState.undoLast();
    } finally {
      updateUndoRedoButtons();
    }
  });
}
if (redoBtn) {
  redoBtn.addEventListener("click", () => {
    try {
      channelState.redoLast && channelState.redoLast();
    } finally {
      updateUndoRedoButtons();
    }
  });
}

function updateExportButtonState() {
  const exportBtn = document.getElementById("exportComputedChannelBtn");
  if (!exportBtn) return;
  const resolvedCharts = Array.isArray(charts)
    ? charts
    : Array.isArray(window.__charts)
    ? window.__charts
    : Array.isArray(window.chartsArray)
    ? window.chartsArray
    : [];

  const getSeriesLength = (series) => {
    if (!series) return 0;
    if (typeof series.length === "number") return series.length;
    if (Array.isArray(series.data) && typeof series.data.length === "number") {
      return series.data.length;
    }
    return 0;
  };

  const timeSeries = data?.time;
  let hasSamples = getSeriesLength(timeSeries) > 0;

  if (!hasSamples) {
    const hasAnalog = Array.isArray(data?.analogData)
      && data.analogData.some((series) => getSeriesLength(series) > 0);
    const hasDigital = !hasAnalog
      && Array.isArray(data?.digitalData)
      && data.digitalData.some((series) => getSeriesLength(series) > 0);
    const hasComputed = !hasAnalog
      && !hasDigital
      && Array.isArray(data?.computedData)
      && data.computedData.some((series) => getSeriesLength(series?.data) > 0);
    hasSamples = hasAnalog || hasDigital || hasComputed;
  }

  const chartHasData = Array.isArray(resolvedCharts)
    && resolvedCharts.some((chart) => {
      if (!chart) return false;
      const candidateData = chart.data ?? chart._data;
      if (!candidateData || typeof candidateData.length !== "number" || candidateData.length === 0) {
        return false;
      }
      const baseSeries = candidateData[0];
      return getSeriesLength(baseSeries) > 0;
    });

  const hasCharts = Array.isArray(resolvedCharts)
    && resolvedCharts.some((chart) => chart && chart._chartType);

  exportBtn.disabled = !(hasCharts && (hasSamples || chartHasData));
}

// Export Computed Channel button
const exportComputedChannelBtn = document.getElementById(
  "exportComputedChannelBtn"
);
if (exportComputedChannelBtn) {
  exportComputedChannelBtn.addEventListener("click", () => {
    try {
      const resolvedData = data || window.globalData;
      const resolvedCfg = cfg || window.globalCfg;
      const resolvedCharts = Array.isArray(charts) && charts.length > 0
        ? charts
        : Array.isArray(window.__charts) && window.__charts.length > 0
        ? window.__charts
        : Array.isArray(window.chartsArray) && window.chartsArray.length > 0
        ? window.chartsArray
        : [];

      if (!resolvedData || resolvedCharts.length === 0) {
        alert("❌ No charts to export. Load a COMTRADE file first.");
        return;
      }

      exportVisibleChartsAsComtrade({
        cfg: resolvedCfg,
        data: resolvedData,
        charts: resolvedCharts,
        channelState,
      });
    } catch (error) {
      console.error("[Export] Error:", error);
      alert(`❌ Export failed: ${error.message}`);
    }
  });
}

updateExportButtonState();

// CSV Export button
const exportCSVBtn = document.getElementById("exportCSVBtn");
if (exportCSVBtn) {
  exportCSVBtn.addEventListener("click", async () => {
    try {
      const resolvedData = data || window.globalData;
      const resolvedCfg = cfg || window.globalCfg;

      if (!resolvedData) {
        alert("❌ No data available to export. Load a COMTRADE file first.");
        return;
      }

      // Check if we have at least some data to export
      const hasAnalog = resolvedData.analogData && resolvedData.analogData.length > 0;
      const hasDigital = resolvedData.digitalData && resolvedData.digitalData.length > 0;
      const hasComputed = resolvedData.computedData && resolvedData.computedData.length > 0;
      const hasTime = resolvedData.time && resolvedData.time.length > 0;

      if (!hasTime || (!hasAnalog && !hasDigital && !hasComputed)) {
        alert("❌ No data available to export. Load a COMTRADE file first.");
        return;
      }

      // Generate filename with timestamp
      const now = new Date();
      const timestamp = now.toISOString().slice(0, 19).replace(/[:-]/g, "");
      const filename = `all-channels-${timestamp}.csv`;
      
      // Export ALL available data (analog, digital, computed)
      // Pass both data and cfg for proper metadata
      // Use await since exportAllChannelsAsCSV is now async
      await exportAllChannelsAsCSV(resolvedData, resolvedCfg, filename);
    } catch (error) {
      console.error("[CSV Export] Error:", error);
      alert(`❌ CSV export failed: ${error.message}`);
    }
  });
}

// Update when state changes
channelState.subscribe(() => updateUndoRedoButtons());
// Initialize
updateUndoRedoButtons();

// Show Channel List button event listener
if (showChannelListBtn) {
  showChannelListBtn.addEventListener("click", () => {
    try {
      // ✅ FIX: Store parent window reference and pass to showChannelListWindow
      const parentWindow = window;
      console.log(
        "[main.js] Opening Channel List with parentWindow reference",
        {
          hasWindow: !!parentWindow,
        }
      );

      // Open popup window with Tabulator
      showChannelListWindow(
        channelState,
        (type, fromIdx, toIdx) => {
          // Channel reordering callback
        },
        (type, idx, color) => {
          if (type === "analog") {
            channelState.analog.lineColors[idx] = color;
          } else if (type === "digital") {
            channelState.digital.lineColors[idx] = color;
          }
        },
        charts,
        cfg,
        data,
        parentWindow // ✅ FIX: Pass explicit parent window reference as 7th parameter
      );
    } catch (error) {
      console.error("Error opening channel list:", error);
    }
  });
}

// Close modal when X is clicked
document
  .getElementById("close-channel-modal")
  ?.addEventListener("click", () => {
    const modal = document.getElementById("channel-list-modal");
    if (modal) modal.style.display = "none";
  });

// Close modal when clicking outside
document
  .getElementById("channel-list-modal")
  ?.addEventListener("click", (e) => {
    if (e.target.id === "channel-list-modal") {
      e.target.style.display = "none";
    }
  });

// --- Main Handlers ---
async function handleLoadFiles() {
  console.log(
    "[handleLoadFiles] Button clicked, files selected:",
    cfgFileInput.files.length
  );

  if (cfgFileInput.files.length === 0) {
    // Debug: No files selected
    showError("Please select at least one CFG/DAT file pair.", fixedResultsEl);
    return;
  }

  try {
    // Show loading indicator
    fixedResultsEl.innerHTML =
      '<div style="padding: 20px; text-align: center; color: var(--text-secondary);"><p>🔄 Loading and parsing files...</p><p style="font-size: 0.9rem; margin-top: 10px;">Please wait, processing file</p></div>';

    console.log("[handleLoadFiles] 📂 PHASE 1: Parsing single file pair");

    // PHASE 1: Parse single CFG/DAT file pair (simple approach)
    const files = Array.from(cfgFileInput.files);

    // Find the first CFG file
    const cfgFile = files.find((file) =>
      file.name.toLowerCase().endsWith(".cfg")
    );
    if (!cfgFile) {
      throw new Error("No CFG file found. Please select a .cfg file.");
    }

    // Find matching DAT file
    const baseName = cfgFile.name.replace(/\.(cfg|dat)$/i, "");
    const datFile = files.find(
      (f) =>
        f.name.toLowerCase().startsWith(baseName.toLowerCase()) &&
        f.name.toLowerCase().endsWith(".dat")
    );

    if (!datFile) {
      throw new Error(`No matching DAT file found for ${cfgFile.name}`);
    }

    // Read and parse CFG file
    const cfgText = await readFileAsText(cfgFile);
    const cfg = parseCFG(cfgText, TIME_UNIT);

    // Read and parse DAT file
    const datText = await readFileAsText(datFile);
    const data = parseDAT(datText, cfg, "ASCII", TIME_UNIT);

    // ✅ Make cfg and data globally accessible (like temp repo)
    window.globalCfg = cfg;
    window.globalData = data;

    // Basic validation
    if (!data.time || data.time.length === 0) {
      throw new Error("Failed to parse COMTRADE data.");
    }

    console.log("[handleLoadFiles] 📊 PHASE 2: Initializing data state");

    // PHASE 2: Update global data state (light operations)
    dataState.analog = data.analogData;
    dataState.digital = data.digitalData;

    // Update UI with filename
    const filenameText = cfgFile.name.replace(".cfg", "");
    cfgFileNameEl.textContent = filenameText;
    datFileNameEl.textContent = `DAT File: ${datFile.name}`;

    const groups = autoGroupChannels(cfg.analogChannels, "GA");

    // ===== UI HELPER CALLS (Light) =====
    showFileInfo();
    updateFileInfo(filenameText, datFile.name);
    updateStatsCards({
      sampleRate: cfg.sampleRate || 4800,
      duration: cfg.duration || 2000,
      analogChannels: cfg.analogChannels,
      digitalChannels: cfg.digitalChannels,
    });
    toggleChartsVisibility(true);

    console.log("[handleLoadFiles] 🎨 PHASE 3: Channel state initialization");

    // PHASE 3: Initialize channel state (this is heavy - suspend history)
    if (channelState && channelState.suspendHistory)
      channelState.suspendHistory();
    try {
      initializeChannelState(cfg, data);

      // Populate analog group IDs
      const analogGroups = groups;
      const analogGroupIds = new Array(cfg.analogChannels.length);
      Object.entries(analogGroups).forEach(([groupId, channelIndices]) => {
        channelIndices.forEach((channelIdx) => {
          analogGroupIds[channelIdx] = groupId;
        });
      });
      channelState.analog.groups = analogGroupIds;
      console.log(
        "[handleLoadFiles] ✅ Populated analog group IDs:",
        analogGroupIds
      );

      // ✅ DIGITAL CHANNELS: ALL in single "GD0" group (no auto-grouping)
      // Unlike analog channels, digital channels are kept together because:
      // 1. We don't know the types/patterns of digital channels
      // 2. We need ALL data visible in one chart
      const digitalGroupIds = new Array((cfg.digitalChannels || []).length).fill("GD0");
      channelState.digital.groups = digitalGroupIds;
      console.log(
        "[handleLoadFiles] ✅ Digital channels: ALL assigned to single 'GD0' group:",
        digitalGroupIds.length, "channels"
      );
    } finally {
      if (channelState && channelState.resumeHistory)
        channelState.resumeHistory();
    }

    console.log("[handleLoadFiles] 📈 PHASE 4: Chart rendering");

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 4a: Load persisted computed channels BEFORE rendering charts
    // This ensures cfg.computedChannels is populated so getComputedChannelsForGroup
    // can merge computed channels with their matching analog groups in Phase 1
    // ═══════════════════════════════════════════════════════════════════════════
    const savedChannels = loadComputedChannelsFromStorage();
    if (savedChannels.length > 0) {
      console.log(`[handleLoadFiles] 📟 Loading ${savedChannels.length} persisted computed channels`);
      if (!cfg.computedChannels) cfg.computedChannels = [];
      if (!data.computedData) data.computedData = [];
      
      for (const savedChannel of savedChannels) {
        // Check for duplicates using equation match
        const existsInCfg = cfg.computedChannels.some(
          (ch) => ch.equation === savedChannel.expression || ch.equation === savedChannel.equation
        );
        
        if (!existsInCfg) {
          // Determine madeFrom - validate against actual data
          const channelData = savedChannel.data || [];
          let madeFromValue = savedChannel.madeFrom || "analog";
          if (madeFromValue === "digital" && channelData.length > 0) {
            const isBinary = channelData.slice(0, 100).every(v => v === 0 || v === 1);
            if (!isBinary) {
              console.log(`[handleLoadFiles] ⚠️ Channel "${savedChannel.name}" has madeFrom="digital" but non-binary values. Overriding to "analog".`);
              madeFromValue = "analog";
            }
          }

          // Add METADATA to cfg.computedChannels
          const computedId = savedChannel.id || savedChannel.name;
          cfg.computedChannels.push({
            id: computedId,
            channelID: computedId,
            name: savedChannel.name,
            equation: savedChannel.expression || savedChannel.equation,
            color: savedChannel.color,
            unit: savedChannel.unit,
            group: savedChannel.group,
            type: savedChannel.type || "Computed",
            index: cfg.computedChannels.length,
            madeFrom: madeFromValue,
          });
          
          // Add VALUES to data.computedData
          data.computedData.push(channelData);
        }
      }
      console.log(`[handleLoadFiles] ✅ Loaded ${cfg.computedChannels.length} computed channels (will merge with matching analog groups)`);
    }

    // PHASE 4b: Render all charts (analog, digital, AND computed merged together)
    renderComtradeCharts(
      cfg,
      data,
      chartsContainer,
      charts,
      verticalLinesX,
      createState,
      calculateDeltas,
      TIME_UNIT,
      channelState
    );
    updateExportButtonState();

    console.log("[handleLoadFiles] 🎯 PHASE 5: Polar chart initialization");

    // PHASE 5: Initialize Polar Chart using Canvas (much faster than SVG!)
    try {
      console.log("[handleLoadFiles] Creating PolarChartCanvas instance...");
      if (!polarChart) {
        // ✅ Use Canvas-based renderer for 10x+ better performance
        polarChart = new PolarChartCanvas("polarChartContainer");
        polarChart.init();
        console.log("[handleLoadFiles] ✅ PolarChartCanvas instance created");
      } else {
        console.log(
          "[handleLoadFiles] ⏭️ PolarChart already exists, skipping creation"
        );
      }

      // ✅ OPTIMIZED: Use double RAF for better responsiveness
      // Canvas rendering is so fast we can use regular RAF instead of requestIdleCallback
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            console.log(
              "[PolarChart] 🎨 Deferred: Updating phasor visualization..."
            );
            polarChart.updatePhasorAtTimeIndex(cfg, data, 0);
            console.log("[PolarChart] ✅ Phasor visualization complete");
          } catch (err) {
            console.error("[PolarChart] Phasor update failed:", err);
          }
        });
      });

      console.log(
        "[handleLoadFiles] ✅ Polar chart initialized (Canvas render - super fast!)"
      );
    } catch (err) {
      console.error(
        "[handleLoadFiles] ❌ Failed to initialize polar chart:",
        err.message
      );
    }

    console.log("[handleLoadFiles] 📟 PHASE 6: Computed channels setup");

    // PHASE 6: Setup computed channels listener (loading already done in Phase 4a)
    // Computed channels are now loaded BEFORE renderComtradeCharts so they merge with analog groups
    if (cfg.computedChannels?.length > 0) {
      const csvBtn = document.getElementById("exportCSVBtn");
      if (csvBtn) csvBtn.disabled = false;
    }
    updateExportButtonState();
    setupComputedChannelsListener();

    console.log("[handleLoadFiles] 🔗 PHASE 7: Chart integrations");

    // PHASE 7: Setup polar chart with vertical lines
    if (polarChart) {
      try {
        setupPolarChartWithVerticalLines(
          polarChart,
          cfg,
          data,
          verticalLinesX,
          charts
        );
        console.log("[handleLoadFiles] ✅ Polar chart integrated");
      } catch (err) {
        console.error(
          "[handleLoadFiles] ❌ Polar chart integration failed:",
          err.message
        );
      }
    }

    // PHASE 8: Final setup
    try {
      applyInitialStartDurations(channelState, dataState, charts);
    } catch (e) {
      console.debug("applyInitialStartDurations failed:", e);
    }

    try {
      const maxDuration = data.time ? data.time[data.time.length - 1] : 1;
      verticalLineControl = initVerticalLineControl({
        dataState: dataState,
        maxDuration: maxDuration,
        onPositionChange: (value) => {
          // Vertical line position changed
        },
      });
    } catch (error) {
      console.error(
        "[handleLoadFiles] Failed to initialize vertical line control:",
        error
      );
    }

    if (window._resizableGroup) window._resizableGroup.disconnect();
    window._resizableGroup = new ResizableGroup(".dragBar");

    // Initialize fast lookup map
    rebuildChannelIDMap();

    // Setup subscriptions
    try {
      channelState.analog?.subscribe?.(() => {
        rebuildChannelIDMap();
      });
      channelState.digital?.subscribe?.(() => {
        rebuildChannelIDMap();
      });
    } catch (e) {
      console.warn("[main] Failed to set up channelID map rebuild:", e);
    }

    // Defer subscription setup
    if (window.requestIdleCallback) {
      window.requestIdleCallback(
        () => {
          console.log(
            "[handleLoadFiles] Background: Setting up chart subscriptions..."
          );
          subscribeChartUpdates(
            channelState,
            dataState,
            charts,
            chartsContainer,
            verticalLinesX,
            cfg,
            data,
            createState,
            calculateDeltas,
            TIME_UNIT
          );
          console.log("[handleLoadFiles] ✅ Chart subscriptions ready");
        },
        { timeout: 2000 }
      );
    } else {
      // Fallback for older browsers
      setTimeout(() => {
        subscribeChartUpdates(
          channelState,
          dataState,
          charts,
          chartsContainer,
          verticalLinesX,
          cfg,
          data,
          createState,
          calculateDeltas,
          TIME_UNIT
        );
      }, 500);
    }

    console.log(
      "[handleLoadFiles] 🎉 COMPLETE - File loaded and rendered successfully"
    );
    fixedResultsEl.innerHTML = "";
  } catch (error) {
    console.error("[handleLoadFiles] ❌ Caught error:", error);
    console.error("[handleLoadFiles] ❌ Error message:", error.message);
    console.error("[handleLoadFiles] ❌ Error stack:", error.stack);
    showError(
      "An error occurred while processing the COMTRADE files. Check the console for details.",
      fixedResultsEl
    );
  }
}
/**
 * Initialize channelState from parsed COMTRADE configuration
 *
 * @function initializeChannelState
 * @category Initialization
 * @since 1.0.0
 *
 * @description
 * Populates channelState with metadata from the parsed CFG file. Assigns
 * colors from palettes, generates stable channelIDs, and initializes all
 * per-channel arrays (scales, starts, durations, inverts) with default values.
 * History tracking is suspended during initialization to avoid recording
 * individual array mutations.
 *
 * @param {Object} cfg - Parsed COMTRADE configuration
 * @param {Array} cfg.analogChannels - Analog channel metadata
 * @param {Array} cfg.digitalChannels - Digital channel metadata
 * @param {Object} data - Parsed COMTRADE data (unused but kept for signature)
 *
 * @returns {void} Mutates channelState directly
 *
 * @mermaid
 * flowchart TD
 *     A["initializeChannelState entry"] --> B["Select palette row"]
 *     B --> C["Prepare analog arrays"]
 *     C1["Clear arrays"] -.-> C
 *     C2["Create channelIDs array"] -.-> C1
 *     C3["Seed axesScales with 1e-6"] -.-> C2
 *     C4["Loop over analog channels"] -.-> C3
 *     C5["Assign palette color"] -.-> C4
 *     C6["Push metadata into arrays"] -.-> C5
 *     C7["Generate stable channelID"] -.-> C6
 *     C8["Store channelID"] -.-> C7
 *     C9["Advance palette index"] -.-> C8
 *     C --> D["Set analog axes labels"]
 *     D --> E["Initialize digital arrays with same steps"]
 *     E --> F["channelState populated"]
 *     F --> G["All per-channel arrays aligned"]
 *     style A fill:#4CAF50,stroke:#1B5E20,color:#fff
 *     style C fill:#BBDEFB,stroke:#1565C0,color:#000
 *     style E fill:#BBDEFB,stroke:#1565C0,color:#000
 *     style F fill:#C8E6C9,stroke:#2E7D32,color:#000
 *     style G fill:#4CAF50,stroke:#1B5E20,color:#fff
 *
 * @example
 * // Initialize after parsing COMTRADE files
 * const cfg = parseCFG(cfgText, TIME_UNIT);
 * const data = parseDAT(datContent, cfg, fileType, TIME_UNIT);
 * initializeChannelState(cfg, data);
 * // Result: channelState populated with all channel metadata
 *
 * @algorithm
 * 1. Get palette row based on whiteBackground.value
 * 2. Ensure groups and yUnits arrays exist (empty arrays)
 * 3. Initialize analog channels:
 *    a. Clear all existing arrays (length = 0)
 *    b. Initialize channelIDs as empty array
 *    c. Add base axesScales value (1e-6)
 *    d. For each analog channel:
 *       - Assign color from palette (cycling through colors)
 *       - Set stroke = color
 *       - Push to yLabels, lineColors, yUnits arrays
 *       - Push default scale/start/duration/invert values
 *       - Generate stable channelID if missing
 *       - Push channelID to array
 *       - Increment palette index
 *    e. Set xLabel = "Time", xUnit = "sec"
 * 4. Initialize digital channels (same process as analog):
 *    a. Clear existing arrays
 *    b. Add axesScales values (1e-6, 1)
 *    c. Process each digital channel
 *    d. Set xLabel and xUnit
 *
 * @dependencies
 * - whiteBackground - State controlling palette selection
 * - analogPalette - Color palette array for analog channels
 * - digitalPalette - Color palette array for digital channels
 * - channelState - Reactive state object to populate
 *
 * @sideeffects
 * - Clears and repopulates channelState.analog arrays
 * - Clears and repopulates channelState.digital arrays
 * - Mutates cfg channel objects (adds color, stroke, channelID)
 * - Triggers reactive subscribers (if not suspended)
 *
 * @testcase
 * Input: cfg with 3 analog channels, 2 digital channels
 * Expected:
 * - channelState.analog arrays have length 3
 * - channelState.digital arrays have length 2
 * - All channels have unique channelIDs
 * - Colors assigned from palette
 *
 * @see {@link parseCFG} - Generates the cfg object
 * @see {@link handleLoadFiles} - Calls this function during file loading
 */
// --- Initialize channelState ---
function initializeChannelState(cfg, data) {
  const paletteRow = whiteBackground.value || 0;

  // ensure groups and yUnits exist as arrays to keep lengths consistent
  channelState.analog.groups = channelState.analog.groups || [];
  channelState.analog.yUnits = channelState.analog.yUnits || [];
  channelState.digital.groups = channelState.digital.groups || [];
  channelState.digital.yUnits = channelState.digital.yUnits || [];

  // Analog channels
  channelState.analog.groups.length = 0;
  channelState.analog.yLabels.length = 0;
  channelState.analog.lineColors.length = 0;
  channelState.analog.yUnits.length = 0;
  channelState.analog.axesScales.length = 0;
  // stable ids for channels in this session
  channelState.analog.channelIDs = [];
  channelState.analog.axesScales.push(1e-6);
  let analogPaletteIdx = 0;
  cfg.analogChannels.forEach((ch, idx) => {
    ch.color =
      ch.color ||
      analogPalette[paletteRow][
        analogPaletteIdx % analogPalette[paletteRow].length
      ];
    ch.stroke = ch.color;
    channelState.analog.yLabels.push(ch.id);
    channelState.analog.lineColors.push(ch.color);
    channelState.analog.yUnits.push(ch.unit || "");
    channelState.analog.scales.push(ch.scale || 1);
    channelState.analog.starts.push(ch.start || 0);
    channelState.analog.durations.push(ch.duration || "");
    channelState.analog.inverts.push(ch.invert || false);
    // assign a stable channelID if missing
    if (!ch.channelID) {
      ch.channelID = `analog-${idx}-${Math.random().toString(36).slice(2, 9)}`;
    }
    channelState.analog.channelIDs.push(ch.channelID);
    analogPaletteIdx++;
  });
  channelState.analog.xLabel = "Time";
  channelState.analog.xUnit = "sec";

  // Digital channels
  channelState.digital.groups.length = 0;
  channelState.digital.yLabels.length = 0;
  channelState.digital.lineColors.length = 0;
  channelState.digital.yUnits.length = 0;
  channelState.digital.axesScales.length = 0;
  channelState.digital.channelIDs = [];
  channelState.digital.axesScales.push(1e-6, 1);
  let digitalPaletteIdx = 0;
  cfg.digitalChannels.forEach((ch, idx) => {
    ch.color =
      ch.color ||
      digitalPalette[paletteRow][
        digitalPaletteIdx % digitalPalette[paletteRow].length
      ];
    ch.stroke = ch.color;
    channelState.digital.yLabels.push(ch.id);
    channelState.digital.lineColors.push(ch.color);
    channelState.digital.yUnits.push("");
    channelState.digital.scales.push(ch.scale || 1);
    channelState.digital.starts.push(ch.start || 0);
    channelState.digital.durations.push(ch.duration || "");
    channelState.digital.inverts.push(ch.invert || false);
    if (!ch.channelID) {
      ch.channelID = `digital-${idx}-${Math.random().toString(36).slice(2, 9)}`;
    }
    channelState.digital.channelIDs.push(ch.channelID);
    digitalPaletteIdx++;
  });
  channelState.digital.xLabel = "Time";
  channelState.digital.xUnit = "sec";
}

/**
 * Subscribe to channelState.computed changes for tabulator updates
 */
function subscribeToComputedChannelStateChanges() {
  channelState.subscribe(
    (change) => {
      console.log("[Main] channelState.computed changed:", change.path);

      // Notify any open channel list windows to refresh
      if (window.channelListWindow && !window.channelListWindow.closed) {
        window.channelListWindow.postMessage(
          {
            type: "COMPUTED_CHANNEL_STATE_UPDATED",
            computedChannels: channelState.computed.channelIDs.map(
              (id, idx) => ({
                id,
                name: channelState.computed.yLabels[idx],
                unit: channelState.computed.yUnits[idx],
                color: channelState.computed.lineColors[idx],
                group: channelState.computed.groups[idx],
                equation: channelState.computed.equations[idx],
              })
            ),
          },
          "*"
        );
      }
    },
    { path: "computed", descendants: true }
  );
}

/**
 * Setup listener for computed channels being saved
 * Re-renders computed channels chart when new ones are created
 * OPTIMIZED: Uses debouncing and requestAnimationFrame for performance
 */
function setupComputedChannelsListener() {
  // ✅ OPTIMIZATION: Debounce rapid computed channel events (300ms delay)
  const handleComputedChannelSaved = debounce((event) => {
    const listenerStartTime = performance.now();
    console.log("[Main] Processing computed channel saved event");

    // ✅ Enable export buttons when computed channel is saved
    const csvBtn = document.getElementById("exportCSVBtn");
    if (csvBtn) {
      csvBtn.disabled = false;
    }
    updateExportButtonState();

    // ✅ FIXED: Use globalData instead of reinitializing - preserves analog/digital data!
    // Previously this was overwriting data with empty arrays, losing analog/digital
    if (!data || !data.analogData?.length) {
      console.log(
        "[Main] Using globalData for computed channel rendering (preserves analog/digital)"
      );
      // Use globalData which has the full analog/digital/computed data
      data = window.globalData || {
        computedData: [],
        time: null,
        analogData: [],
        digitalData: [],
      };
    }

    // Process event data
    if (event.detail.fullData) {
      const eventProcessStart = performance.now();
      
      // ═══════════════════════════════════════════════════════════════════
      // ✅ REFACTORED: data.computedData is now a 2D VALUES array
      // The state has ALREADY been updated by stateUpdate.js before this event fires
      // We only need to ensure the local `data` variable is synced with globalData
      // ═══════════════════════════════════════════════════════════════════
      
      console.log("[Main] 🔍 Event received, checking state sync:", {
        "window.globalData.computedData length": window.globalData?.computedData?.length,
        "window.globalCfg.computedChannels length": window.globalCfg?.computedChannels?.length,
        "local data.computedData length": data?.computedData?.length,
        "fullData.id": event.detail.fullData?.id,
      });

      // Sync local `data` variable with globalData (which was already updated by stateUpdate.js)
      if (window.globalData?.computedData) {
        data.computedData = window.globalData.computedData;
      }
      
      // Sync local `cfg` variable with globalCfg
      if (window.globalCfg?.computedChannels) {
        if (cfg) {
          cfg.computedChannels = window.globalCfg.computedChannels;
        }
      }

      const eventProcessTime = performance.now() - eventProcessStart;
      console.log(
        `[Main] ⏱️ Event data sync: ${eventProcessTime.toFixed(2)}ms`,
        {
          "data.computedData count": data.computedData?.length,
          "cfg.computedChannels count": cfg?.computedChannels?.length || window.globalCfg?.computedChannels?.length,
        }
      );
    }

    // ✅ OPTIMIZATION: Use requestAnimationFrame to defer chart rendering
    // This prevents blocking user interactions while charts are being created
    const rafStartTime = performance.now();
    requestAnimationFrame(() => {
      const rafExecStart = performance.now();
      console.log(
        `[Main] ⏱️ requestAnimationFrame wait: ${(
          rafExecStart - rafStartTime
        ).toFixed(2)}ms`
      );

      const chartsContainer = document.getElementById("charts");
      if (!chartsContainer) {
        console.error("[Main] Charts container not found");
        return;
      }

      // ✅ Clear old computed charts for fresh render
      const removeStartTime = performance.now();

      // Destroy old chart instances and update metadata store
      chartsComputed.forEach((chart) => {
        if (chart && chart._userGroupId) {
          const userGroupId = chart._userGroupId;
          removeChart(userGroupId);
          const metadataState = getChartMetadataState();
          console.log(
            `[ComputedChannel] Deleted ${userGroupId}.  Remaining groups: `,
            Array.isArray(metadataState.charts)
              ? metadataState.charts.map((c) => c.userGroupId)
              : []
          );
        }

        try {
          chart.destroy();
        } catch (e) {}
      });
      chartsComputed = [];
      window.__chartsComputed = chartsComputed;

      // Remove old computed chart containers from DOM
      const oldComputedContainers = chartsContainer.querySelectorAll(
        '[data-chart-type="computed"]'
      );
      oldComputedContainers.forEach((container) => {
        container.remove();
      });

      const removeTime = performance.now() - removeStartTime;
      console.log(`[Main] ⏱️ Chart cleanup: ${removeTime.toFixed(2)}ms`);

      // ═══════════════════════════════════════════════════════════════════
      // ✅ REFACTORED: Merge localStorage channels with current cfg/data
      // NEW STRUCTURE:
      //   - cfg.computedChannels = [{id, name, unit, equation, ...}] (METADATA)
      //   - data.computedData = [[val1, val2], [val1, val2], ...] (VALUES 2D array)
      //   - localStorage stores combined objects, we split them on load
      // ═══════════════════════════════════════════════════════════════════
      const mergeStartTime = performance.now();
      const savedChannels = loadComputedChannelsFromStorage();

      if (savedChannels.length > 0) {
        console.log(
          `[Main] 🔄 Merging ${savedChannels.length} stored channels`
        );

        // Ensure cfg.computedChannels exists
        const cfgRef = cfg || window.globalCfg;
        if (!cfgRef.computedChannels) {
          cfgRef.computedChannels = [];
        }
        
        // Ensure data.computedData exists as array
        if (!data.computedData) {
          data.computedData = [];
        }

        // Merge: Add stored channels that are not already in cfg.computedChannels
        savedChannels.forEach((storedChannel) => {
          // Check existence by id or name in cfg.computedChannels (metadata)
          const exists = cfgRef.computedChannels.some(
            (ch) =>
              ch.id === storedChannel.id ||
              (storedChannel.name && ch.name === storedChannel.name)
          );

          if (!exists) {
            console.log(
              `[Main] ✅ Adding stored channel: ${storedChannel.id || storedChannel.name}`
            );
            
            // Add VALUES to data.computedData (as array, not object)
            const values = Array.isArray(storedChannel.data) ? storedChannel.data : [];
            
            // ✅ FIX: Determine madeFrom - if stored as "digital" but values are NOT binary,
            // override to "analog" to prevent digitalFillPlugin errors
            let madeFromValue = storedChannel.madeFrom || "analog";
            if (madeFromValue === "digital" && values.length > 0) {
              // Check if values are actually binary (0/1)
              const isBinary = values.slice(0, 100).every(v => v === 0 || v === 1);
              if (!isBinary) {
                console.log(`[Main] ⚠️ Channel "${storedChannel.name}" has madeFrom="digital" but non-binary values. Overriding to "analog".`);
                madeFromValue = "analog";
              }
            }
            
            // Add METADATA to cfg.computedChannels
            const storedId = storedChannel.id || storedChannel.name;
            cfgRef.computedChannels.push({
              id: storedId,
              channelID: storedId,  // ✅ FIX: Include channelID for consistency with analog/digital
              name: storedChannel.name,
              equation: storedChannel.expression || storedChannel.equation,
              mathJsExpression: storedChannel.mathJsExpression,
              unit: storedChannel.unit || "",
              group: storedChannel.group || "Computed",
              color: storedChannel.color,
              type: storedChannel.type || "Computed",
              index: cfgRef.computedChannels.length,
              stats: storedChannel.stats,
              sampleCount: storedChannel.data?.length || 0,
              madeFrom: madeFromValue,  // ✅ FIX: Include madeFrom for proper chart type routing
            });
            
            data.computedData.push(values);
          }
        });

        // Sync with globalData/globalCfg
        if (window.globalData) {
          window.globalData.computedData = data.computedData;
        }
        if (window.globalCfg) {
          window.globalCfg.computedChannels = cfgRef.computedChannels;
        }

        const mergeTime = performance.now() - mergeStartTime;
        console.log(
          `[Main] ⏱️ Channel merge: ${mergeTime.toFixed(2)}ms`,
          {
            "cfg.computedChannels count": cfgRef.computedChannels.length,
            "data.computedData count": data.computedData.length,
          }
        );
      }

      // Create computed channel charts - one per channel
      try {
        const renderStartTime = performance.now();
        
        // ✅ FIX: Always use globalCfg and globalData to ensure we have all data
        const cfgRef = window.globalCfg || cfg;
        const dataRef = window.globalData || data;
        
        // ✅ DEBUG: Log the NEW computed channel that was just added
        console.log("[Main] 🔍 DEBUG - About to render, checking new channel:", {
          "event.detail.fullData": event?.detail?.fullData,
          "event.detail.fullData.id": event?.detail?.fullData?.id,
          "event.detail.fullData.data?.length": event?.detail?.fullData?.data?.length,
        });
        
        // ✅ FIX: Ensure the new channel from the event is in globalCfg/globalData
        const newChannel = event?.detail?.fullData;
        if (newChannel && newChannel.id) {
          // Check if it's already in cfg
          const existsInCfg = cfgRef.computedChannels?.some(ch => ch.id === newChannel.id);
          const existsInData = dataRef.computedData?.length > 0;
          
          console.log("[Main] 🔍 New channel check:", {
            channelId: newChannel.id,
            existsInCfg,
            existsInData,
            "cfgRef.computedChannels": cfgRef.computedChannels?.map(c => c.id),
            "dataRef.computedData.length": dataRef.computedData?.length,
          });
          
          // If channel not in cfg yet, add it
          if (!existsInCfg && newChannel.id) {
            console.log("[Main] ⚠️ Channel NOT in cfg, adding it now!");
            if (!cfgRef.computedChannels) cfgRef.computedChannels = [];
            
            // ✅ FIX: Validate madeFrom against actual data
            let madeFromValue = newChannel.madeFrom || "analog";
            if (madeFromValue === "digital" && newChannel.data?.length > 0) {
              const isBinary = newChannel.data.slice(0, 100).every(v => v === 0 || v === 1);
              if (!isBinary) {
                console.log(`[Main] ⚠️ Channel "${newChannel.id}" has madeFrom="digital" but non-binary values. Overriding to "analog".`);
                madeFromValue = "analog";
              }
            }
            
            cfgRef.computedChannels.push({
              id: newChannel.id,
              channelID: newChannel.id,  // ✅ FIX: Include channelID for consistency with analog/digital
              name: newChannel.name || newChannel.id,
              equation: newChannel.equation,
              mathJsExpression: newChannel.mathJsExpression,
              unit: newChannel.unit || "",
              group: newChannel.group || "G0",
              color: newChannel.color,
              type: "Computed",
              stats: newChannel.stats,
              sampleCount: newChannel.data?.length || 0,
              madeFrom: madeFromValue,  // ✅ FIX: Include madeFrom for proper chart type routing
            });
          }
          
          // If channel data not in dataRef yet, add it
          const dataIndex = cfgRef.computedChannels?.findIndex(ch => ch.id === newChannel.id);
          if (dataIndex >= 0 && (!dataRef.computedData?.[dataIndex] || dataRef.computedData[dataIndex]?.length === 0)) {
            console.log("[Main] ⚠️ Channel DATA not in dataRef, adding it now!");
            if (!dataRef.computedData) dataRef.computedData = [];
            // Ensure array is long enough
            while (dataRef.computedData.length <= dataIndex) {
              dataRef.computedData.push([]);
            }
            if (newChannel.data && newChannel.data.length > 0) {
              dataRef.computedData[dataIndex] = newChannel.data;
            }
          }
        }
        
        console.log(
          "[Main] Rendering ALL charts after computed channel creation...", {
            analogChannels: cfgRef?.analogChannels?.length || 0,
            digitalChannels: cfgRef?.digitalChannels?.length || 0,
            computedChannels: cfgRef?.computedChannels?.length || 0,
            analogData: dataRef?.analogData?.length || 0,
            digitalData: dataRef?.digitalData?.length || 0,
            computedData: dataRef?.computedData?.length || 0,
            computedDataLengths: dataRef?.computedData?.map(d => d?.length || 0),
          }
        );

        // ✅ FIX: Always render ALL charts (not just computed)
        // This ensures analog + digital + computed all render correctly
        renderComtradeCharts(
          cfgRef,
          dataRef,
          chartsContainer,
          charts,
          verticalLinesX,
          createState,
          null, // calculateDeltas
          "seconds",
          channelState
        );
        updateExportButtonState();
        const renderTime = performance.now() - renderStartTime;
        console.log(
          `[Main] ⏱️ renderComtradeCharts (all charts): ${renderTime.toFixed(
            2
          )}ms`
        );

        // ✅ REMOVED: Redundant conditional re-render - already rendering all charts above

        // Scroll to the new chart
        const scrollStartTime = performance.now();
        const newComputedChart = chartsContainer.querySelector(
          '[data-chart-type="computed"]'
        );
        if (newComputedChart) {
          // ✅ FIXED: Use 'auto' instead of 'smooth' to avoid multi-second animation
          // 'smooth' uses requestAnimationFrame loops causing 3+ second freeze
          newComputedChart.scrollIntoView({
            behavior: "auto", // ← Changed from 'smooth' to prevent freeze
            block: "nearest",
          });
        }
        const scrollTime = performance.now() - scrollStartTime;
        console.log(`[Main] ⏱️ Scroll into view: ${scrollTime.toFixed(2)}ms`);
      } catch (error) {
        console.error("[Main] Error rendering computed channels:", error);
      }

      const totalRafTime = performance.now() - rafExecStart;
      console.log(
        `[Main] ⏱️ Total requestAnimationFrame work: ${totalRafTime.toFixed(
          2
        )}ms`
      );

      // Schedule a check after RAF to see if anything else is running
      requestAnimationFrame(() => {
        const afterRafTime = performance.now() - listenerStartTime;
        console.log(
          `[Main] ⏱️ After RAF callback: ${afterRafTime.toFixed(
            2
          )}ms (this captures any hanging async work)`
        );
      });
    });

    const totalListenerTime = performance.now() - listenerStartTime;
    console.log(
      `[Main] ⏱️ Total listener execution (sync part): ${totalListenerTime.toFixed(
        2
      )}ms`
    );
  }, 0); // ✅ CHANGED: No debounce delay - process immediately instead of waiting 300ms

  window.addEventListener("computedChannelSaved", handleComputedChannelSaved);
}

// One-time helper: apply initial start/duration windows after charts are created
function applyInitialStartDurations(channelState, dataState, charts) {
  const types = ["analog", "digital"];
  types.forEach((type, typeIdx) => {
    const chart = charts[typeIdx];
    if (
      !chart ||
      !Array.isArray(dataState[type]) ||
      !Array.isArray(dataState[type][0])
    )
      return;
    const timeArr = dataState[type][0];
    if (!timeArr || timeArr.length === 0) return;
    const first = timeArr[0];
    const last = timeArr[timeArr.length - 1];
    const totalSamples = timeArr.length;
    const starts = channelState[type].starts || [];
    const durations = channelState[type].durations || [];

    for (let i = 0; i < Math.max(starts.length, durations.length); i++) {
      let sRaw = starts[i];
      let dRaw = durations[i];
      let sNum = sRaw == null ? NaN : Number(sRaw);
      let dNum = dRaw == null ? NaN : Number(dRaw);

      if (Number.isInteger(sNum) && sNum >= 0 && sNum < totalSamples) {
        sNum = timeArr[sNum];
      }
      if (Number.isInteger(dNum) && dNum > 0 && dNum < totalSamples) {
        const dt = (last - first) / Math.max(1, totalSamples - 1);
        dNum = dNum * dt;
      }
      if (Number.isFinite(sNum)) {
        if (sNum < first) sNum = first;
        if (sNum > last) sNum = last;
      }
      if (Number.isFinite(dNum) && Number.isFinite(sNum)) {
        if (sNum + dNum > last) dNum = Math.max(0, last - sNum);
      }

      try {
        if (Number.isFinite(sNum) && Number.isFinite(dNum)) {
          if (typeof chart.batch === "function") {
            chart.batch(() =>
              chart.setScale("x", { min: sNum, max: sNum + dNum })
            );
          } else {
            chart.setScale("x", { min: sNum, max: sNum + dNum });
          }
          break; // apply first valid window only
        } else if (Number.isFinite(sNum)) {
          chart.setScale("x", { min: sNum, max: null });
          break;
        }
      } catch (e) {
        // ignore and try next channel
      }
    }
  });
}

// ⚡ OPTIMIZATION NOTE: Removed old updateChartsSafely function
// Color updates are now handled efficiently by the chartManager.js color subscriber
// which performs in-place updates without full chart recreation

// ⚡ OPTIMIZATION: Color updates are handled by the chartManager color subscriber
// which does efficient in-place updates. Disable the old updateChartsSafely to avoid
// full renders on color changes.
// OLD CODE (disabled): channelState.subscribe for lineColors → updateChartsSafely
// NEW PATH: lineColors change → chartManager color subscriber → in-place chart update

// Debug: watch start/duration state changes and log via debugPanelLite so we can trace
try {
  channelState.subscribeProperty(
    "start",
    (change) => {
      try {
        debugLite.log("state.start.change", change);
      } catch (e) {}
    },
    { descendants: true }
  );
  channelState.subscribeProperty(
    "duration",
    (change) => {
      try {
        debugLite.log("state.duration.change", change);
      } catch (e) {}
    },
    { descendants: true }
  );
} catch (e) {
  /* subscribeProperty not available - skip */
}

// Parent message handler: accept callbacks posted from the child popup
/**
 * Message Event Handler - Routes child window messages to appropriate handlers
 *
 * @description
 * Handles window.postMessage events from the child popup window (ChannelList/Tabulator).
 * Routes different message types to appropriate update functions, maintaining synchronization
 * between the child UI and parent application state. Supports multiple payload formats
 * for backwards compatibility.
 *
 * @mermaid
 * flowchart TD
 *     A["window message event"] --> B{"Source is ChildWindow?"}
 *     B -->|No| C["Ignore message"]
 *     B -->|Yes| D["Read type and payload"]
 *     D --> E{"Dispatch by type"}
 *     E -->|callback_color| E1["Update color via ID"]
 *     E -->|callback_scale| E2["Update scale via ID"]
 *     E -->|callback_start| E3["Update start via ID"]
 *     E -->|callback_duration| E4["Update duration via ID"]
 *     E -->|callback_invert| E5["Update invert via ID"]
 *     E -->|callback_channelName| E6["Update label via ID"]
 *     E -->|callback_group| E7["Write group field"]
 *     E -->|callback_addChannel| E8["Insert new channel"]
 *     E -->|callback_delete| E9["Delete channel"]
 *     E -->|callback_update| E10["Legacy routing"]
 *     E -->|other| E11["Log unknown type"]
 *     E1 --> F["channelState updated"]
 *     E2 --> F
 *     E3 --> F
 *     E4 --> F
 *     E5 --> F
 *     E6 --> F
 *     E7 --> F
 *     E8 --> F
 *     E9 --> F
 *     E10 --> F
 *     E11 --> G["Log error and continue"]
 *     F --> H["Notify subscribers"]
 *     H --> I["Charts refresh"]
 *     I --> J["UI reflects change"]
 *     style A fill:#E3F2FD,stroke:#1565C0,color:#000
 *     style F fill:#F3E5F5,stroke:#6A1B9A,color:#fff
 *     style J fill:#C8E6C9,stroke:#2E7D32,color:#000
 *     style E11 fill:#FFCDD2,stroke:#C62828,color:#000
 */
window.addEventListener("message", (ev) => {
  const msgStartTime = performance.now();
  const msg = ev && ev.data;

  // ✅ FIX: Filter out react-devtools spam messages silently
  if (msg?.source && msg.source.startsWith("react-devtools")) {
    return;
  }

  // 🔍 DIAGNOSTIC: Log ALL messages received (before any filtering)
  console.group(`[main.js] 📨 RAW MESSAGE RECEIVED`);
  console.log(`Has data:`, !!msg);
  console.log(`Message source:`, msg?.source);
  console.log(`Message type:`, msg?.type);
  console.log(`Origin:`, ev.origin);
  console.log(`Full message:`, msg);
  console.groupEnd();

  // Listen for messages from child windows (ChannelList, Merger app)
  if (!msg || msg.source !== "ChildWindow") {
    console.warn(`[main.js] ⚠️ Message IGNORED (wrong source):`, msg?.source);
    return;
  }

  console.log(`[main.js] ✅ Message ACCEPTED - Processing type: "${msg.type}"`);

  const { type, payload } = msg;

  // ⏱️ DIAGNOSTIC: Track all phases of message processing
  const timings = {
    start: msgStartTime,
    parsed: 0,
    switched: 0,
    subscribers: 0,
    chartUpdate: 0,
    total: 0,
  };

  console.log(`[Performance] 📨 Message received: ${type}`, {
    timestamp: msgStartTime.toFixed(2),
  });

  try {
    debugLite.log("child->parent", {
      type,
      channelID: payload?.channelID,
      field: payload?.field || payload?.name || payload?.newName || null,
      rowId: payload?.row?.id ?? payload?.rowId ?? null,
    });
  } catch (e) {}
  try {
    switch (type) {
      // ✅ Handle merged files from merger app
      case "merged_files_ready": {
        console.log("[main.js] 📦 Received merged files from merger app");
        const { cfg, data, filenames, fileCount, isMergedFromCombiner } =
          payload || {};

        if (cfg && data) {
          console.log("[main.js] ✅ Processing merged file data from combiner");

          // ✅ Data is ALREADY PARSED by combiner (using parent's parseCFG/parseDAT)
          // Just use it directly!
          window.globalCfg = cfg;
          window.globalData = data;

          console.log("[main.js] ✅ Global data set:", {
            analogChannels: cfg.analogChannels?.length || 0,
            digitalChannels: cfg.digitalChannels?.length || 0,
            samples: data.time?.length || 0,
          });

          // Trigger event for mergedFilesReceived listener
          window.dispatchEvent(
            new CustomEvent("mergedFilesReceived", {
              detail: {
                cfg: cfg,
                data: data,
                filenames: filenames || [],
                fileCount: fileCount || 1,
                isMerged: true,
                isMergedFromCombiner: isMergedFromCombiner,
              },
            })
          );
        }
        break;
      }

      // Backwards-compat: ChannelList historically sent generic 'callback_update' messages
      // for many editable fields. If we receive that, inspect payload.field and route to
      // the dedicated handlers (e.g., group) so parent updates channelState correctly.
      case CALLBACK_TYPE.INVERT: {
        const { channelID, newValue, row } = payload || {};
        if (channelID) {
          updateChannelFieldByID(channelID, "inverts", !!newValue);
        } else if (row) {
          const t = (row.type || "").toLowerCase();
          const idx = Number(row.originalIndex ?? row.id - 1);
          updateChannelFieldByIndex(t, idx, "inverts", !!row.invert);
        }
        break;
      }
      case "callback_update": {
        try {
          const f =
            payload && payload.field
              ? String(payload.field).toLowerCase()
              : null;
          if (f === "group") {
            // reuse GROUP handling logic by falling through to the GROUP case
            // construct a synthetic message and assign type for processing below
            // (we'll handle inline here to avoid code duplication)
            let row = payload && payload.row ? payload.row : null;
            let channelID = null;
            const newGroup =
              payload && payload.newValue !== undefined
                ? payload.newValue
                : payload && payload.group !== undefined
                ? payload.group
                : null;
            if (!row) {
              if (Array.isArray(payload) && payload.length >= 3)
                channelID = payload[1];
              else if (payload && payload.channelID)
                channelID = payload.channelID;
            }
            if (channelID) {
              const found = findChannelByID(channelID);
              if (found) {
                channelState[found.type].groups =
                  channelState[found.type].groups || [];
                channelState[found.type].groups[found.idx] = newGroup;
                break;
              }
            }
            if (!row) break;
            const t = (row.type || "").toLowerCase();
            // prefer explicit originalIndex/idx, else fall back to numeric id (1-based) when present
            let oi = Number(row.originalIndex ?? row.idx ?? -1);
            if (!Number.isFinite(oi) || oi < 0) {
              const maybeId = Number(row.id ?? row.name);
              if (Number.isFinite(maybeId)) oi = maybeId - 1;
            }
            if ((t === "analog" || t === "digital") && oi >= 0) {
              channelState[t].groups = channelState[t].groups || [];
              channelState[t].groups[oi] = newGroup;
              try {
                debugLite.log("msg.group.byIndex", {
                  type: t,
                  idx: oi,
                  newGroup,
                });
              } catch (e) {}
            } else {
              let idx = channelState.analog.yLabels.indexOf(row.id ?? row.name);
              if (idx >= 0) {
                channelState.analog.groups = channelState.analog.groups || [];
                channelState.analog.groups[idx] = newGroup;
                try {
                  debugLite.log("msg.group.byLabel", {
                    type: "analog",
                    idx,
                    newGroup,
                  });
                } catch (e) {}
              } else {
                idx = channelState.digital.yLabels.indexOf(row.id ?? row.name);
                if (idx >= 0) {
                  channelState.digital.groups =
                    channelState.digital.groups || [];
                  channelState.digital.groups[idx] = newGroup;
                  try {
                    debugLite.log("msg.group.byLabel", {
                      type: "digital",
                      idx,
                      newGroup,
                    });
                  } catch (e) {}
                } else {
                  try {
                    debugLite.log("msg.group.notfound", { row, payload });
                  } catch (e) {}
                }
              }
            }
          }
        } catch (e) {
          /* ignore */
        }
        break;
      }
      case CALLBACK_TYPE.COLOR: {
        // ✅ NEW: Try cheap in-place color update first (v2.1.0 optimization)
        console.log(`[COLOR HANDLER] 📢 Color change received:`, {
          type: payload?.row?.type,
          color: payload?.color || payload?.newValue,
        });

        // ✅ NEW: Show progress for color change
        const colorChannelName = payload?.row?.name || "Channel";
        showProgress(0, `Changing color for ${colorChannelName}...`);

        // ✅ NEW: Set up progress callback
        setProgressCallback((percent, message) => {
          updateProgress(percent, message);
          // Auto-hide after completion
          if (percent >= 100) {
            setTimeout(() => hideProgress(), 500);
          }
        });

        // Try the new optimized path
        const row = payload && payload.row ? payload.row : null;
        const channelID = row?.channelID;
        const color =
          payload?.color ||
          payload?.newValue ||
          (Array.isArray(payload) && payload.length >= 3 ? payload[2] : null);

        if (
          channelID &&
          row &&
          color &&
          typeof handleChannelUpdate === "function"
        ) {
          console.log(
            "[COLOR HANDLER] ✅ Attempting optimized cheap color path..."
          );
          const handled = handleChannelUpdate(
            "color",
            { row, value: color },
            channelState,
            dataState,
            charts,
            chartsContainer,
            null, // No fallback needed for color-only changes
            (percent, message) => {
              // ✅ NEW: Progress callback from handleChannelUpdate
              callProgress(percent, message);
            }
          );

          if (handled) {
            console.log(
              "[COLOR HANDLER] ✅ Handled via cheap path - skipping legacy logic"
            );
            callProgress(100, "Color change complete!");
            return;
          }

          console.log(
            "[COLOR HANDLER] ⚠️ Cheap path failed, falling back to legacy logic"
          );
        }

        // LEGACY PATH (fallback if cheap path not available or failed)
        // Support payload shapes:
        // - legacy: { row: {...}, newValue: ... }
        // - tabulator: payload = [chartInstance, channelID, newValue]
        // - alt: { channelID, newValue }
        let legacyRow = payload && payload.row ? payload.row : null;
        let legacyChannelID = null;
        let legacyColor =
          payload && payload.newValue
            ? payload.newValue
            : payload && payload.color
            ? payload.color
            : null;

        if (!legacyRow) {
          if (Array.isArray(payload) && payload.length >= 3) {
            legacyChannelID = payload[1];
            legacyColor = payload[2];
          } else if (payload && payload.channelID) {
            legacyChannelID = payload.channelID;
          }
        }

        // ✅ STEP 1: Update channelState (UI update)
        if (legacyChannelID) {
          callProgress(50, "Updating color in state...");
          const updated = updateChannelFieldByID(
            legacyChannelID,
            "lineColors",
            legacyColor
          );
          if (updated) {
            console.log(
              `[COLOR HANDLER] ✅ Updated by channelID: ${legacyChannelID}`
            );
            callProgress(100, "Color change complete!");
            return;
          }
          // fall through to legacy behavior if update failed
        }

        if (!legacyRow) {
          hideProgress();
          return;
        }
        const t = (legacyRow.type || "").toLowerCase();
        const oi = Number(legacyRow.originalIndex ?? legacyRow.idx ?? -1);
        if ((t === "analog" || t === "digital") && oi >= 0) {
          // use helper with bounds checks
          console.log(
            `[COLOR HANDLER] 🎨 Updating ${t}[${oi}] color → ${legacyColor}`
          );
          callProgress(75, "Applying color to chart...");
          updateChannelFieldByIndex(t, oi, "lineColors", legacyColor);
          callProgress(100, "Color change complete!");
        } else {
          // fallback: match by label
          let idx = channelState.analog.yLabels.indexOf(
            legacyRow.id ?? legacyRow.name
          );
          if (idx >= 0) {
            updateChannelFieldByIndex("analog", idx, "lineColors", legacyColor);
            callProgress(100, "Color change complete!");
          }
          else {
            idx = channelState.digital.yLabels.indexOf(
              legacyRow.id ?? legacyRow.name
            );
            if (idx >= 0) {
              updateChannelFieldByIndex(
                "digital",
                idx,
                "lineColors",
                legacyColor
              );
              callProgress(100, "Color change complete!");
            } else {
              hideProgress();
            }
          }
        }
        break;
      }

      case "callback_computed_color": {
        // ✅ SEPARATE PIPELINE FOR COMPUTED CHANNELS
        // Uses ID-based lookup instead of index-based
        console.log(
          `[COMPUTED COLOR HANDLER] 📢 Computed channel color change received:`,
          payload
        );

        const color = payload?.color || payload?.newValue;
        // Canonical identifier for computed channels is `id`.
        const channelId = payload?.id || payload?.row?.id || payload?.row?.name;

        if (!color || !channelId) {
          console.warn(
            `[COMPUTED COLOR HANDLER] ❌ Missing color or id:`,
            { color, id: channelId }
          );
          break;
        }

        console.log(
          `[COMPUTED COLOR HANDLER] 🎯 Looking up channel by ID: "${channelId}"`
        );

        // ✅ STEP 1: Update UI state by ID (in computed state)
        const stateUpdated = updateComputedChannelColorInState(
          channelId,
          color
        );

        if (stateUpdated) {
          console.log(
            `[COMPUTED COLOR HANDLER] ✅ Updated state for channel: ${channelId}`
          );
        } else {
          console.warn(
            `[COMPUTED COLOR HANDLER] ⚠️ State update failed for channel: ${channelId}`
          );
          // 🔄 Directly update analog charts that have this computed merged
          updateAnalogMergedComputedColorById(channelId, color);
        }

        // ✅ STEP 2: Update chart using ID-based lookup
        console.log(
          `[COMPUTED COLOR HANDLER] 💾 Updating chart for channel: ${channelId}`
        );
        updateComputedChartColorById(channelId, color);

        // ✅ STEP 3: Update the computed channel color directly in globalData before saving
        try {
          // Get computed data
          let computedData =
            globalData?.computedData ||
            cfg?.computedChannels ||
            window.globalData?.computedData ||
            [];

          if (Array.isArray(computedData)) {
            // Find and update the channel in the data
            for (let i = 0; i < computedData.length; i++) {
              if (
                computedData[i].id === channelId ||
                computedData[i].name === channelId
              ) {
                computedData[i].color = color;
                console.log(
                  `[COMPUTED COLOR HANDLER] ✅ Updated color in computed data for "${channelId}"`
                );
                break;
              }
            }
          }
        } catch (e) {
          console.warn(
            `[COMPUTED COLOR HANDLER] ⚠️ Could not update computed data color:`,
            e.message
          );
        }

        // ✅ STEP 4: Save to localStorage using static import (already imported at top)
        try {
          // Get computed channels from any available source
          const computedChannelsData =
            cfg?.computedChannels ||
            globalData?.computedData ||
            window.globalData?.computedData ||
            [];

          if (
            !Array.isArray(computedChannelsData) ||
            computedChannelsData.length === 0
          ) {
            console.warn(
              `[COMPUTED COLOR HANDLER] ⚠️ No computed channels data to save`
            );
          } else {
            saveComputedChannelsToStorage(
              computedChannelsData,
              computedChannelsData
            );
            console.log(`[COMPUTED COLOR HANDLER] ✅ Saved to localStorage`);

            // 🎯 Broadcast to popup window after saving
            if (window.__channelListWindow && !window.__channelListWindow.closed) {
              try {
                console.log("[COMPUTED COLOR HANDLER] 📢 Broadcasting computed channels to popup:", {
                  count: computedChannelsData.length,
                  ids: computedChannelsData.map((ch) => ch.id || ch.name),
                });

                window.__channelListWindow.postMessage(
                  {
                    source: "MainApp",
                    type: "computed_channels_updated",
                    payload: {
                      computedChannels: computedChannelsData,
                    },
                  },
                  "*"
                );
              } catch (err) {
                console.warn("[COMPUTED COLOR HANDLER] Failed to broadcast to popup:", err);
              }
            }
          }
        } catch (e) {
          console.error(
            `[COMPUTED COLOR HANDLER] ❌ Storage save error:`,
            e.message
          );
        }

        break;
      }
      // ✅ DEPRECATED: callback_computed_group is now unified into CALLBACK_TYPE.GROUP
      // The channelList.js sends 'callback_group' for ALL channel types (analog, digital, computed)
      // and CALLBACK_TYPE.GROUP handler detects isComputed flag to route appropriately.
      // Keeping this comment for reference. Old handler removed ~300 lines.
      
      case CALLBACK_TYPE.SCALE: {
        // support channelID-based payloads: [chartInstance, channelID, newVal] or {channelID, newValue}
        let row = payload && payload.row ? payload.row : null;
        let channelID = null;
        const newVal =
          payload && payload.newValue !== undefined
            ? payload.newValue
            : payload && payload.scale !== undefined
            ? payload.scale
            : null;
        if (!row) {
          if (Array.isArray(payload) && payload.length >= 3)
            channelID = payload[1];
          else if (payload && payload.channelID) channelID = payload.channelID;
        }
        if (channelID) {
          const updated = updateChannelFieldByID(channelID, "scales", newVal);
          if (updated) return;
        }
        if (!row) return;
        const t = (row.type || "").toLowerCase();
        const oi = Number(row.originalIndex ?? row.idx ?? -1);
        if (
          (t === "analog" || t === "digital" || t === "computed") &&
          oi >= 0
        ) {
          updateChannelFieldByIndex(t, oi, "scales", newVal);
        } else {
          let idx = channelState.analog.yLabels.indexOf(row.id ?? row.name);
          if (idx >= 0)
            updateChannelFieldByIndex("analog", idx, "scales", newVal);
          else {
            idx = channelState.digital.yLabels.indexOf(row.id ?? row.name);
            if (idx >= 0)
              updateChannelFieldByIndex("digital", idx, "scales", newVal);
          }
        }
        break;
      }
      case CALLBACK_TYPE.START: {
        let row = payload && payload.row ? payload.row : null;
        let channelID = null;
        const newVal =
          payload && payload.newValue !== undefined
            ? payload.newValue
            : payload && payload.start !== undefined
            ? payload.start
            : null;
        try {
          debugLite.log("msg.start.received", { payload, row, newVal });
        } catch (e) {}
        if (!row) {
          if (Array.isArray(payload) && payload.length >= 3)
            channelID = payload[1];
          else if (payload && payload.channelID) channelID = payload.channelID;
        }
        if (channelID) {
          const updated = updateChannelFieldByID(channelID, "starts", newVal);
          if (updated) return;
          try {
            debugLite.log("msg.start.byChannelID", {
              channelID,
              newVal,
              updated,
            });
          } catch (e) {}
        }
        if (!row) return;
        const t = (row.type || "").toLowerCase();
        const oi = Number(row.originalIndex ?? row.idx ?? -1);
        if (
          (t === "analog" || t === "digital" || t === "computed") &&
          oi >= 0
        ) {
          updateChannelFieldByIndex(t, oi, "starts", newVal);
          try {
            debugLite.log("msg.start.byIndex", { type: t, oi, newVal, ok });
          } catch (e) {}
        } else {
          let idx = channelState.analog.yLabels.indexOf(row.id ?? row.name);
          if (idx >= 0)
            updateChannelFieldByIndex("analog", idx, "starts", newVal);
          else {
            idx = channelState.digital.yLabels.indexOf(row.id ?? row.name);
            if (idx >= 0)
              updateChannelFieldByIndex("digital", idx, "starts", newVal);
          }
        }
        break;
      }
      case CALLBACK_TYPE.DURATION: {
        let row = payload && payload.row ? payload.row : null;
        let channelID = null;
        const newVal =
          payload && payload.newValue !== undefined
            ? payload.newValue
            : payload && payload.duration !== undefined
            ? payload.duration
            : null;
        try {
          debugLite.log("msg.duration.received", { payload, row, newVal });
        } catch (e) {}
        if (!row) {
          if (Array.isArray(payload) && payload.length >= 3)
            channelID = payload[1];
          else if (payload && payload.channelID) channelID = payload.channelID;
        }
        if (channelID) {
          const updated = updateChannelFieldByID(
            channelID,
            "durations",
            newVal
          );
          if (updated) return;
          try {
            debugLite.log("msg.duration.byChannelID", {
              channelID,
              newVal,
              updated,
            });
          } catch (e) {}
        }
        if (!row) return;
        const t = (row.type || "").toLowerCase();
        const oi = Number(row.originalIndex ?? row.idx ?? -1);
        if (
          (t === "analog" || t === "digital" || t === "computed") &&
          oi >= 0
        ) {
          const ok = updateChannelFieldByIndex(t, oi, "durations", newVal);
          try {
            debugLite.log("msg.duration.byIndex", { type: t, oi, newVal, ok });
          } catch (e) {}
        } else {
          let idx = channelState.analog.yLabels.indexOf(row.id ?? row.name);
          if (idx >= 0) {
            const ok = updateChannelFieldByIndex(
              "analog",
              idx,
              "durations",
              newVal
            );
            try {
              debugLite.log("msg.duration.byLabel", {
                type: "analog",
                idx,
                newVal,
                ok,
              });
            } catch (e) {}
          } else {
            idx = channelState.digital.yLabels.indexOf(row.id ?? row.name);
            if (idx >= 0) {
              const ok = updateChannelFieldByIndex(
                "digital",
                idx,
                "durations",
                newVal
              );
              try {
                debugLite.log("msg.duration.byLabel", {
                  type: "digital",
                  idx,
                  newVal,
                  ok,
                });
              } catch (e) {}
            }
          }
        }
        break;
      }
      case CALLBACK_TYPE.TIME_WINDOW: {
        // ✅ NEW: Combined handler for start/duration changes
        // Routes to handleChannelUpdate for potential cheap path
        console.log("[TIME_WINDOW HANDLER] Received time window update:", payload);

        const row = payload?.row;
        const fieldName = payload?.field;
        const newVal = payload?.value;

        if (!row || !fieldName || newVal === undefined) {
          console.warn(
            "[TIME_WINDOW HANDLER] Missing data:",
            { row: !!row, fieldName, newVal }
          );
          break;
        }

        // Determine which field to update (start or duration)
        let fieldKey = null;
        if (fieldName === "start") {
          fieldKey = "starts";
        } else if (fieldName === "duration") {
          fieldKey = "durations";
        } else {
          console.warn("[TIME_WINDOW HANDLER] Unknown field:", fieldName);
          break;
        }

        const channelID = row.channelID;
        if (channelID) {
          const updated = updateChannelFieldByID(channelID, fieldKey, newVal);
          if (updated) {
            console.log("[TIME_WINDOW HANDLER] ✅ Updated via channelID");
            return;
          }
        }

        // Fallback: update by index
        const t = (row.type || "").toLowerCase();
        const oi = Number(row.originalIndex ?? row.idx ?? -1);

        if (
          (t === "analog" || t === "digital" || t === "computed") &&
          oi >= 0
        ) {
          const ok = updateChannelFieldByIndex(t, oi, fieldKey, newVal);
          console.log(
            "[TIME_WINDOW HANDLER] Updated via index:",
            { type: t, idx: oi, field: fieldKey, ok }
          );
        } else {
          // Fallback: search by label
          let idx = channelState.analog.yLabels.indexOf(row.id ?? row.name);
          if (idx >= 0) {
            updateChannelFieldByIndex("analog", idx, fieldKey, newVal);
          } else {
            idx = channelState.digital.yLabels.indexOf(row.id ?? row.name);
            if (idx >= 0) {
              updateChannelFieldByIndex("digital", idx, fieldKey, newVal);
            }
          }
        }
        break;
      }
      case CALLBACK_TYPE.INVERT: {
        let row = payload && payload.row ? payload.row : null;
        let channelID = null;
        const newVal =
          payload && payload.newValue !== undefined
            ? payload.newValue
            : payload && payload.invert !== undefined
            ? payload.invert
            : null;
        if (!row) {
          if (Array.isArray(payload) && payload.length >= 3)
            channelID = payload[1];
          else if (payload && payload.channelID) channelID = payload.channelID;
        }
        if (channelID) {
          const updated = updateChannelFieldByID(channelID, "inverts", newVal);
          if (updated) return;
        }
        if (!row) return;
        const t = (row.type || "").toLowerCase();
        const oi = Number(row.originalIndex ?? row.idx ?? -1);
        if (
          (t === "analog" || t === "digital" || t === "computed") &&
          oi >= 0
        ) {
          updateChannelFieldByIndex(t, oi, "inverts", newVal);
        } else {
          let idx = channelState.analog.yLabels.indexOf(row.id ?? row.name);
          if (idx >= 0)
            updateChannelFieldByIndex("analog", idx, "inverts", newVal);
          else {
            idx = channelState.digital.yLabels.indexOf(row.id ?? row.name);
            if (idx >= 0)
              updateChannelFieldByIndex("digital", idx, "inverts", newVal);
          }
        }
        break;
      }
      case CALLBACK_TYPE.CHANNEL_NAME: {
        try {
          debugLite.log("channel-name", {
            channelID: payload?.channelID,
            newValue: payload?.newValue ?? payload?.newName ?? null,
            rowId: payload?.row?.id ?? payload?.rowId ?? null,
          });
        } catch (e) {}
        let row = payload && payload.row ? payload.row : null;
        let channelID = null;
        const newName =
          payload && payload.newValue
            ? payload.newValue
            : payload && payload.newName
            ? payload.newName
            : null;
        if (!row) {
          if (Array.isArray(payload) && payload.length >= 3)
            channelID = payload[1];
          else if (payload && payload.channelID) channelID = payload.channelID;
        }
        if (channelID) {
          const updated = updateChannelFieldByID(channelID, "yLabels", newName);
          if (updated) return;
        }
        if (!row) return;
        const t = (row.type || "").toLowerCase();
        const oi = Number(row.originalIndex ?? row.idx ?? -1);
        if ((t === "analog" || t === "digital") && oi >= 0) {
          updateChannelFieldByIndex(t, oi, "yLabels", newName);
        } else {
          let idx = channelState.analog.yLabels.indexOf(row.id ?? row.name);
          if (idx >= 0)
            updateChannelFieldByIndex("analog", idx, "yLabels", newName);
          else {
            idx = channelState.digital.yLabels.indexOf(row.id ?? row.name);
            if (idx >= 0)
              updateChannelFieldByIndex("digital", idx, "yLabels", newName);
          }
        }
        break;
      }
      case CALLBACK_TYPE.GROUP: {
        // Unified handler for analog, digital, AND computed channel group changes
        const channelName = payload?.row?.name || payload?.row?.id || "Channel";
        const isComputed = payload?.isComputed === true || payload?.channelType === "computed";
        
        showProgress(0, `Changing group for ${channelName}...`);
        
        // Store progress callback BOTH in global and in state for subscriber access
        const progressCallback = (percent, message) => {
          updateProgress(percent, message);
          if (percent >= 100) setTimeout(() => hideProgress(), 800);
        };
        // Set global progress callback (used by handleChannelUpdate)
        setProgressCallback(progressCallback);
        // Also store in channelState for chartManager subscriber
        if (!channelState._meta) channelState._meta = {};
        channelState._meta.progressCallback = progressCallback;
        
        // payload shapes similar to other fields: { row, newValue } or [_, channelID, newValue]
        let row = payload && payload.row ? payload.row : null;
        let channelID = payload?.channelID || payload?.row?.channelID || null;
        const newGroup =
          payload && payload.newValue !== undefined
            ? payload.newValue
            : payload && payload.group !== undefined
            ? payload.group
            : null;
        
        // COMPUTED CHANNEL GROUP CHANGE PATH
        if (isComputed) {
          const channelId = payload?.id || payload?.channelID || payload?.row?.id;
          
          if (!channelId || !newGroup) {
            hideProgress();
            break;
          }
          
          // ✅ STEP 1: Find channel index and populate channelState FIRST (BEFORE updating cfg!)
          // Find channel index in cfg
          const computedChannelsCfg = cfg?.computedChannels || window.globalCfg?.computedChannels || [];
          const stateIdx = computedChannelsCfg.findIndex(ch => ch.id === channelId);
          
          // Force computed object to become a reactive proxy (workaround for lazy proxy issue)
          let computedProxy = channelState.computed;
          if (computedProxy && !computedProxy.__isReactive) {
            channelState.computed = { ...computedProxy };
            computedProxy = channelState.computed;
          }
          
          // Initialize channelState.computed if needed
          if (!computedProxy) {
            channelState.computed = { channelIDs: [], groups: [], colors: [], yLabels: [] };
            computedProxy = channelState.computed;
          }
          
          // Populate channelState from cfg BEFORE updating cfg (captures old values)
          if (stateIdx >= 0) {
            const currentChannelIDs = computedProxy.channelIDs;
            const currentGroups = computedProxy.groups;
            
            if (!Array.isArray(currentChannelIDs) || currentChannelIDs.length === 0) {
              computedProxy.channelIDs = computedChannelsCfg.map(ch => ch.id);
            }
            if (!Array.isArray(currentGroups) || currentGroups.length === 0) {
              computedProxy.groups = computedChannelsCfg.map(ch => ch.group);
            }
          }
          
          // STEP 2: Update group in localStorage
          const groupUpdateSuccess = updateComputedChannelGroupInStorage(channelId, newGroup);
          if (!groupUpdateSuccess) {
            console.warn(`[UNIFIED GROUP HANDLER] ⚠️ Failed to update group in storage for: ${channelId}`);
            hideProgress();
            break;
          }
          
          // STEP 3: Update cfg.computedChannels and window.globalCfg.computedChannels
          try {
            if (Array.isArray(cfg?.computedChannels)) {
              const cfgIdx = cfg.computedChannels.findIndex((ch) => ch.id === channelId);
              if (cfgIdx >= 0) cfg.computedChannels[cfgIdx].group = newGroup;
            }
            
            if (Array.isArray(window.globalCfg?.computedChannels)) {
              const globalCfgIdx = window.globalCfg.computedChannels.findIndex((ch) => ch.id === channelId);
              if (globalCfgIdx >= 0) window.globalCfg.computedChannels[globalCfgIdx].group = newGroup;
            }
          } catch (e) {
            // Non-fatal: cfg sync failed
          }
          
          // Update channelState.computed.groups to trigger reactive subscriber
          if (stateIdx >= 0) {
            const oldGroupValue = computedProxy.groups?.[stateIdx];
            
            if (oldGroupValue !== newGroup) {
              // Array replacement triggers the set trap which fires subscriptions
              const newGroups = [...(computedProxy.groups || [])];
              newGroups[stateIdx] = newGroup;
              computedProxy.groups = newGroups;
              updateProgress(25, `Processing computed group change...`);
            } else {
              hideProgress();
            }
          } else {
            hideProgress();
          }
          
          break;  // chartManager subscriber handles the rebuild
        }
        
        // ANALOG/DIGITAL CHANNEL GROUP CHANGE PATH
        if (!row) {
          if (Array.isArray(payload) && payload.length >= 3)
            channelID = payload[1];
          else if (payload && payload.channelID) channelID = payload.channelID;
        }
        if (channelID) {
          const found = findChannelByID(channelID);
          if (found) {
            channelState[found.type].groups = channelState[found.type].groups || [];
            channelState[found.type].groups[found.idx] = newGroup;
            updateProgress(25, `Processing group change...`);
            break;
          }
        }
        if (!row) {
          hideProgress();
          break;
        }
        const t = (row.type || "").toLowerCase();
        const oi = Number(row.originalIndex ?? row.idx ?? -1);
        if ((t === "analog" || t === "digital") && oi >= 0) {
          channelState[t].groups = channelState[t].groups || [];
          channelState[t].groups[oi] = newGroup;
          // ✅ NEW: Update progress after state change
          console.log(`[UNIFIED GROUP HANDLER] ✅ State updated via index, calling updateProgress(25)`);
          updateProgress(25, `Processing group change...`);
        } else {
          // fallback: find by label
          let idx = channelState.analog.yLabels.indexOf(row.id ?? row.name);
          if (idx >= 0) {
            channelState.analog.groups = channelState.analog.groups || [];
            channelState.analog.groups[idx] = newGroup;
            // ✅ NEW: Update progress after state change
            updateProgress(25, `Processing group change...`);
          } else {
            idx = channelState.digital.yLabels.indexOf(row.id ?? row.name);
            if (idx >= 0) {
              channelState.digital.groups = channelState.digital.groups || [];
              channelState.digital.groups[idx] = newGroup;
              // ✅ NEW: Update progress after state change
              updateProgress(25, `Processing group change...`);
            } else {
              hideProgress();
            }
          }
        }
        break;
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // UNIT CHANGE HANDLER - Updates channel unit and triggers Y-axis recalculation
      // ═══════════════════════════════════════════════════════════════════════════
      case CALLBACK_TYPE.UNIT: {
        const channelName = payload?.row?.name || payload?.row?.id || "Channel";
        const isComputed = payload?.isComputed === true || payload?.channelType === "computed";
        const newUnit = payload?.unit || payload?.value || payload?.newValue;
        
        console.log(`[UNIT HANDLER] 📐 Unit change for ${channelName}: ${newUnit}`);
        showProgress(0, `Changing unit for ${channelName}...`);
        
        if (!newUnit) {
          console.warn("[UNIT HANDLER] ⚠️ No unit value provided");
          hideProgress();
          break;
        }
        
        // Wrap async operations in IIFE since switch cases can't use await directly
        (async () => {
          // Capture cfg reference at start (fallback to globalCfg for safety)
          const currentCfg = cfg || window.globalCfg;
          const currentData = data || window.globalData;
          
          if (!currentCfg) {
            console.error("[UNIT HANDLER] ❌ No cfg available");
            hideProgress();
            return;
          }
          
          // COMPUTED CHANNEL UNIT CHANGE
          if (isComputed) {
            const channelId = payload?.id || payload?.channelID || payload?.row?.id;
            
            if (!channelId) {
              console.warn("[UNIT HANDLER] ⚠️ No channel ID for computed unit change");
              hideProgress();
              return;
            }
            
            // Update cfg.computedChannels
            if (Array.isArray(currentCfg?.computedChannels)) {
              const cfgIdx = currentCfg.computedChannels.findIndex((ch) => ch.id === channelId);
              if (cfgIdx >= 0) {
                currentCfg.computedChannels[cfgIdx].unit = newUnit;
                console.log(`[UNIT HANDLER] ✅ Updated cfg.computedChannels[${cfgIdx}].unit = ${newUnit}`);
              }
            }
            
            // Update window.globalCfg.computedChannels
            if (Array.isArray(window.globalCfg?.computedChannels)) {
              const globalIdx = window.globalCfg.computedChannels.findIndex((ch) => ch.id === channelId);
              if (globalIdx >= 0) {
                window.globalCfg.computedChannels[globalIdx].unit = newUnit;
              }
            }
            
            // Update localStorage
            try {
              const { updateComputedChannelInStorage } = await import("./utils/computedChannelStorage.js");
              if (typeof updateComputedChannelInStorage === "function") {
                updateComputedChannelInStorage(channelId, { unit: newUnit });
              }
            } catch (e) {
              console.warn("[UNIT HANDLER] Storage update failed:", e);
            }
            
            // Update channelState.computed.yUnits to trigger reactive rebuild
            let computedProxy = channelState.computed;
            if (computedProxy) {
              const computedChannelsCfg = currentCfg?.computedChannels || [];
              const stateIdx = computedChannelsCfg.findIndex(ch => ch.id === channelId);
              
              if (stateIdx >= 0) {
                if (!Array.isArray(computedProxy.yUnits)) {
                  computedProxy.yUnits = computedChannelsCfg.map(ch => ch.unit || "");
                }
                const newUnits = [...computedProxy.yUnits];
                newUnits[stateIdx] = newUnit;
                computedProxy.yUnits = newUnits;
                updateProgress(50, `Recalculating Y-axes...`);
              }
            }
            
            // Trigger full rebuild to recalculate axes
            try {
              const { renderComtradeCharts } = await import("./components/renderComtradeCharts.js");
              renderComtradeCharts(
                currentCfg,
                currentData,
                chartsContainer,
                charts,
                verticalLinesX,
                createState,
                calculateDeltas,
                TIME_UNIT,
                channelState
              );
              updateProgress(100, `Unit updated!`);
              setTimeout(() => hideProgress(), 800);
            } catch (e) {
              console.error("[UNIT HANDLER] Rebuild failed:", e);
              hideProgress();
            }
            
            return;
          }
          
          // ANALOG/DIGITAL CHANNEL UNIT CHANGE
          let row = payload?.row;
          let channelID = payload?.channelID || row?.channelID;
          
          if (channelID) {
            const found = findChannelByID(channelID);
            if (found) {
              // Update channelState yUnits
              channelState[found.type].yUnits = channelState[found.type].yUnits || [];
              const oldUnit = channelState[found.type].yUnits[found.idx];
              channelState[found.type].yUnits[found.idx] = newUnit;
              
              // Also update cfg for consistency
              if (found.type === "analog" && currentCfg?.analogChannels?.[found.idx]) {
                currentCfg.analogChannels[found.idx].unit = newUnit;
              } else if (found.type === "digital" && currentCfg?.digitalChannels?.[found.idx]) {
                currentCfg.digitalChannels[found.idx].unit = newUnit;
              }
              
              console.log(`[UNIT HANDLER] ✅ Updated ${found.type}[${found.idx}] unit: ${oldUnit} → ${newUnit}`);
              updateProgress(50, `Recalculating Y-axes...`);
              
              // Trigger full rebuild (unit change affects Y-axis calculation)
              try {
                const { renderComtradeCharts } = await import("./components/renderComtradeCharts.js");
                renderComtradeCharts(
                  currentCfg,
                  currentData,
                  chartsContainer,
                  charts,
                  verticalLinesX,
                  createState,
                  calculateDeltas,
                  TIME_UNIT,
                  channelState
                );
                updateProgress(100, `Unit updated!`);
                setTimeout(() => hideProgress(), 800);
              } catch (e) {
                console.error("[UNIT HANDLER] Rebuild failed:", e);
                hideProgress();
              }
              
              return;
            }
          }
          
          // Fallback: find by row data
          if (row) {
            const t = (row.type || "").toLowerCase();
            const oi = Number(row.originalIndex ?? row.idx ?? -1);
            
            if ((t === "analog" || t === "digital") && oi >= 0) {
              channelState[t].yUnits = channelState[t].yUnits || [];
              channelState[t].yUnits[oi] = newUnit;
              
              // Update cfg
              if (t === "analog" && currentCfg?.analogChannels?.[oi]) {
                currentCfg.analogChannels[oi].unit = newUnit;
              } else if (t === "digital" && currentCfg?.digitalChannels?.[oi]) {
                currentCfg.digitalChannels[oi].unit = newUnit;
              }
              
              updateProgress(50, `Recalculating Y-axes...`);
              
              // Trigger rebuild
              try {
                const { renderComtradeCharts } = await import("./components/renderComtradeCharts.js");
                renderComtradeCharts(
                  currentCfg,
                  currentData,
                  chartsContainer,
                  charts,
                  verticalLinesX,
                  createState,
                  calculateDeltas,
                  TIME_UNIT,
                  channelState
                );
                updateProgress(100, `Unit updated!`);
                setTimeout(() => hideProgress(), 800);
              } catch (e) {
                console.error("[UNIT HANDLER] Rebuild failed:", e);
                hideProgress();
              }
            } else {
              hideProgress();
            }
          } else {
            hideProgress();
          }
        })();
        
        break;
      }
      
      // ✅ NEW: Handle computed channel evaluation from child window
      case "evaluateComputedChannel": {
        try {
          // ✅ REFACTORED: Use new modular orchestrator instead of monolithic case block

          const { expression, unit } = payload || {};
          if (!expression) {
            console.warn(
              "[main.js] No expression provided for computed channel"
            );
            break;
          }

          console.log(
            "[main.js] 📨 Received computed channel expression from child:",
            expression
          );

          // Convert LaTeX to math.js format
          const mathJsExpr = convertLatexToMathJs(expression);
          console.log("[main.js] 📝 Expression conversion:", {
            original: expression,
            converted: mathJsExpr,
          });

          // ✅ Delegate to new orchestrator with ORIGINAL expression
          // (so it can extract channel name from "c1=sqrt(...)" format)
          if (typeof handleComputedChannelEvaluation === "function") {
            console.log("[main.js] 🎯 Delegating to new orchestrator...");
            handleComputedChannelEvaluation({
              expression: expression, // Pass ORIGINAL for channel name extraction
              unit: unit,
            });
          } else {
            console.error(
              "[main.js] ❌ Orchestrator not available - handleComputedChannelEvaluation not found"
            );
          }
        } catch (e) {
          console.error("[main.js] ❌ Error in evaluateComputedChannel:", e);
        }
        break;
      }
      /* Removed CALLBACK_TYPE.ADD_CHANNEL mechanism to avoid unintended re-renders and message acks */
      case CALLBACK_TYPE.DELETE: {
        // ✅ Get channel name for progress bar
        const deleteChannelName = payload?.name || payload?.row?.name || payload?.id || "Channel";
        showProgress(0, `Deleting ${deleteChannelName}...`);
        
        console.group(`[DELETE CALLBACK] 🗑️ DELETE MESSAGE RECEIVED`);
        console.log(`Payload received:`, payload);
        console.log(`Payload type:`, typeof payload);
        console.log(`Is array:`, Array.isArray(payload));
        console.log(`Payload keys:`, payload ? Object.keys(payload) : "N/A");
        console.groupEnd();

        // ✅ REACTIVE APPROACH: Let channelState updates trigger subscribers
        // Instead of calling renderComtradeCharts directly, update channelState
        // and let the reactive system handle it (chartManager.js subscribers will react)

        // Accept payload shapes: channelID-based or legacy row object
        // ✅ FIX: Also check payload.id for computed channels (which use 'id' as their identifier)
        let channelID =
          Array.isArray(payload) && payload.length >= 2
            ? payload[1]
            : payload && payload.channelID
            ? payload.channelID
            : payload && payload.id && (payload.type?.toLowerCase() === "computed")
            ? payload.id  // ✅ Computed channels may use 'id' instead of 'channelID'
            : payload && payload.name && (payload.type?.toLowerCase() === "computed")
            ? payload.name  // ✅ Also try 'name' for computed channels
            : null;

        const row = payload && !Array.isArray(payload) ? payload : null;
        const isComputedChannel = row?.type?.toLowerCase() === "computed";

        console.log(`[DELETE CALLBACK] 🔍 Parsed delete request:`, {
          channelID,
          hasRow: !!row,
          rowType: row?.type,
          rowIdx: row?.originalIndex ?? row?.idx,
          rowName: row?.name,
          isComputed: isComputedChannel,
        });

        if (channelID) {
          console.log(
            `[DELETE CALLBACK] 📍 Deleting by channelID: ${channelID}`
          );
          updateProgress(25, `Removing ${deleteChannelName} from state...`);
          try {
            const deleted = deleteChannelByID(channelID);
            console.log(
              `[DELETE CALLBACK] Result: ${
                deleted ? "✅ DELETED" : "❌ NOT FOUND"
              }`
            );

            if (deleted) {
              updateProgress(50, `Rebuilding charts...`);
              // ✅ FIX: Call renderComtradeCharts DIRECTLY instead of relying on subscribers
              // Subscribers fire too early, before all deletions are complete
              // Direct call ensures proper cleanup of empty containers
              console.log(
                `[DELETE CALLBACK] 🔄 Triggering renderComtradeCharts to rebuild with new state...`
              );

              (async () => {
                try {
                  const { renderComtradeCharts } = await import(
                    "./components/renderComtradeCharts.js"
                  );
                  renderComtradeCharts(
                    globalCfg,
                    globalData,
                    chartsContainer,
                    window.chartsArray,
                    verticalLinesX,
                    channelState,
                    createState,
                    calculateDeltas,
                    TIME_UNIT
                  );
                  updateExportButtonState();
                  updateProgress(100, `${deleteChannelName} deleted successfully!`);
                  setTimeout(() => hideProgress(), 800);
                  console.log(
                    `[DELETE CALLBACK] ✅ Charts rebuilt successfully - empty containers removed`
                  );
                } catch (err) {
                  console.error(
                    `[DELETE CALLBACK] ❌ Failed to rebuild charts:`,
                    err
                  );
                  hideProgress();
                }
              })();
              return;
            }
          } catch (err) {
            console.error(
              `[DELETE CALLBACK] ❌ Error deleting by channelID:`,
              err
            );
            hideProgress();
          }
          // fall through to legacy if delete by ID failed
        }

        // ✅ FALLBACK: Legacy row-based deletion
        if (!row) {
          console.warn(
            `[DELETE CALLBACK] ❌ No channelID and no row data, aborting`
          );
          hideProgress();
          return;
        }

        const t = (row.type || "").toLowerCase();
        const oi = Number(row.originalIndex ?? row.idx ?? -1);

        console.log(`[DELETE CALLBACK] 📍 Fallback: Deleting by row:`, {
          type: t,
          index: oi,
          name: row.name,
        });
        
        updateProgress(25, `Removing ${row.name || 'channel'} from state...`);

        const perChannelArrays = [
          "yLabels",
          "lineColors",
          "yUnits",
          "groups",
          "axesScales",
          "scales",
          "starts",
          "durations",
          "inverts",
          "channelIDs",
        ];

        const removeSeriesForType = (type, index) => {
          console.log(
            `[DELETE CALLBACK] 🔧 Splicing from ${type}[${index}]...`
          );
          const s = channelState[type];
          let splicedCount = 0;
          perChannelArrays.forEach((name) => {
            if (s[name] && Array.isArray(s[name])) {
              if (index >= 0 && index < s[name].length) {
                s[name].splice(index, 1);
                splicedCount++;
                console.log(`[DELETE CALLBACK]   ✓ Spliced ${name}`);
              }
            }
          });
          console.log(`[DELETE CALLBACK] ✅ Spliced ${splicedCount} arrays`);

          try {
            const arr = dataState && dataState[type];
            const raw = data && data[type];
            const seriesIdx = index + 1;
            if (
              Array.isArray(arr) &&
              seriesIdx >= 1 &&
              seriesIdx < arr.length
            ) {
              arr.splice(seriesIdx, 1);
              console.log(`[DELETE CALLBACK]   ✓ Spliced dataState`);
            }
            if (
              raw &&
              Array.isArray(raw) &&
              seriesIdx >= 1 &&
              seriesIdx < raw.length
            ) {
              raw.splice(seriesIdx, 1);
              console.log(`[DELETE CALLBACK]   ✓ Spliced raw data`);
            }
          } catch (e) {
            console.warn(`[DELETE CALLBACK] ⚠️ Error splicing data:`, e);
          }
        };

        const triggerRebuild = async () => {
          updateProgress(50, `Rebuilding charts...`);
          try {
            const { renderComtradeCharts } = await import(
              "./components/renderComtradeCharts.js"
            );
            renderComtradeCharts(
              globalCfg,
              globalData,
              chartsContainer,
              window.chartsArray,
              verticalLinesX,
              channelState,
              createState,
              calculateDeltas,
              TIME_UNIT
            );
            updateExportButtonState();
            updateProgress(100, `Channel deleted successfully!`);
            setTimeout(() => hideProgress(), 800);
            console.log(`[DELETE CALLBACK] ✅ Charts rebuilt successfully`);
          } catch (err) {
            console.error(
              `[DELETE CALLBACK] ❌ Failed to rebuild charts:`,
              err
            );
            hideProgress();
          }
        };

        if (t === "analog" && oi >= 0) {
          console.log(`[DELETE CALLBACK] ✅ Deleting analog[${oi}]`);
          removeSeriesForType("analog", oi);
          triggerRebuild();
          return;
        } else if (t === "digital" && oi >= 0) {
          console.log(`[DELETE CALLBACK] ✅ Deleting digital[${oi}]`);
          removeSeriesForType("digital", oi);
          triggerRebuild();
          return;
        } else if (t === "computed") {
          // ✅ FIX: Handle computed channel deletion via fallback path
          console.log(`[DELETE CALLBACK] ✅ Deleting computed channel by name: ${row.name || row.id}`);
          const computedId = row.id || row.name || row.channelID;
          if (computedId) {
            updateProgress(30, `Removing computed channel...`);
            const deleted = deleteChannelByID(computedId);
            if (deleted) {
              triggerRebuild();
              return;
            }
          }
          console.warn(`[DELETE CALLBACK] ❌ Could not find computed channel to delete`);
          hideProgress();
        } else {
          // fallback: delete by label match
          console.log(`[DELETE CALLBACK] 🔍 Fallback: Searching by label...`);
          let idx = channelState.analog.yLabels.indexOf(row.id ?? row.name);
          if (idx >= 0) {
            console.log(
              `[DELETE CALLBACK] ✅ Found analog[${idx}] by label match`
            );
            removeSeriesForType("analog", idx);
            triggerRebuild();
            return;
          } else {
            idx = channelState.digital.yLabels.indexOf(row.id ?? row.name);
            if (idx >= 0) {
              console.log(
                `[DELETE CALLBACK] ✅ Found digital[${idx}] by label match`
              );
              removeSeriesForType("digital", idx);
              triggerRebuild();
              return;
            }
          }
          console.warn(`[DELETE CALLBACK] ❌ Could not find channel to delete`);
          hideProgress();
        }
        break;
      }
      default:
        // unknown message type - ignore
        break;
    }
  } catch (err) {
    console.error("Error handling child message:", err);
  }

  // ⏱️ DIAGNOSTIC: Log detailed breakdown of where time was spent
  const msgEndTime = performance.now();
  const totalTime = msgEndTime - msgStartTime;

  if (totalTime > 30) {
    console.warn(`[Performance] ⚠️ SLOW Message processing: ${type}`, {
      totalMs: totalTime.toFixed(2),
      detail:
        "🐢 Check if: debugLite.log() is slow, subscribers are blocking, chart.redraw() is expensive",
      performance:
        totalTime > 500
          ? "🔴 VERY SLOW (FREEZE!)"
          : totalTime > 200
          ? "🔴 SLOW"
          : totalTime > 100
          ? "🟡 MEDIUM"
          : "🟡 OK",
    });
  } else if (totalTime > 10) {
    console.log(`[Performance] ✅ Message processing: ${type}`, {
      totalMs: totalTime.toFixed(2),
      performance: "🟢 FAST",
    });
  }
});
