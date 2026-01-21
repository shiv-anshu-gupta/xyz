/**
 * @file renderComtradeCharts.js
 * @module Components/ChartRendering
 *
 * @description
 * <h3>Main Chart Rendering Orchestrator</h3>
 * 
 * <p>Entry point for chart visualization after COMTRADE file parsing.
 * Orchestrates rendering of all chart types: analog, digital, and computed.</p>
 * 
 * <h4>Responsibilities</h4>
 * <table>
 *   <tr><th>Task</th><th>Description</th></tr>
 *   <tr><td>Cleanup</td><td>Clear existing charts and metadata</td></tr>
 *   <tr><td>Drag &amp; Drop</td><td>Enable chart reordering</td></tr>
 *   <tr><td>Coordination</td><td>Render analog → digital → computed</td></tr>
 *   <tr><td>Subscriptions</td><td>Manage chart metadata updates</td></tr>
 *   <tr><td>Delta Calc</td><td>Trigger calculations for vertical markers</td></tr>
 * </table>
 * 
 * <h4>Rendering Pipeline</h4>
 * <ol>
 *   <li><code>destroyCharts()</code> + <code>clearContainer()</code></li>
 *   <li><code>analyzeGroupsAndPublishMaxYAxes()</code></li>
 *   <li><strong>Phase 1:</strong> Analog Charts (one per group)
 *       <br/>↳ Include computed channels with matching group</li>
 *   <li><strong>Phase 2:</strong> Digital Charts (one per group)</li>
 *   <li><strong>Phase 3:</strong> Standalone Computed Channels</li>
 *   <li>Setup delta calculations</li>
 * </ol>
 * 
 * <h4>Ownership Rule</h4>
 * <blockquote>
 *   Computed channels with <code>group</code> matching an analog group render
 *   <strong>inside</strong> that chart. Only unmatched groups get standalone charts.
 * </blockquote>
 * 
 * @see {@link module:components/renderSingleAnalogChart}
 * @see {@link module:components/renderSingleDigitalChart}
 * @see {@link module:utils/autoGroupChannels}
 * 
 * @example
 * import { renderComtradeCharts } from "./components/renderComtradeCharts.js";
 * 
 * renderComtradeCharts(
 *   cfg,              // Parsed COMTRADE config
 *   data,             // Parsed COMTRADE data
 *   chartsContainer,  // DOM container
 *   charts,           // Chart instances array
 *   verticalLinesX,   // Vertical lines state
 *   createState,      // State factory
 *   calculateDeltas,  // Delta calculator
 *   TIME_UNIT,        // "ms" or "s"
 *   channelState      // User customizations
 * );
 * 
 * @mermaid
 * graph TD
 *     A[renderComtradeCharts] --> B[clearAllCharts]
 *     B --> C[destroyCharts]
 *     C --> D[setupChartDragAndDrop]
 *     D --> E[analyzeGroupsAndPublishMaxYAxes]
 *     E --> F[Phase 1: Analog Charts]
 *     F --> G[For each analog group]
 *     G --> H[renderSingleAnalogChart]
 *     H --> I[Phase 2: Digital Charts]
 *     I --> J[For each digital group]
 *     J --> K[renderSingleDigitalChart]
 *     K --> L[Phase 3: Computed Charts]
 *     L --> M[renderComputedChart]
 *     M --> N[Setup delta calculations]
 */

import { setupChartDragAndDrop } from "./setupChartDragAndDrop.js";
import { renderSingleAnalogChart } from "./renderSingleAnalogChart.js";
import { renderSingleDigitalChart } from "./renderSingleDigitalChart.js";
import { renderComputedChart } from "./renderComputedChart.js";
import { destroyCharts } from "../utils/chartUtils.js";
import { buildChannelGroups } from "../utils/autoGroupChannels.js";
import { analyzeGroupsAndPublishMaxYAxes } from "../utils/analyzeGroupsAndPublish.js";
import { getMaxYAxes } from "../utils/maxYAxesStore.js";
import { findChangedDigitalChannelIndices } from "../utils/digitalChannelUtils.js";
import {
  getChartMetadataState,
  clearAllCharts,
} from "../utils/chartMetadataStore.js";

/**
 * Flag to track if metadata subscription has been attached.
 * Prevents duplicate subscriptions on re-render.
 * @private
 * @type {boolean}
 */
let metadataSubscriptionAttached = false;

/**
 * Build computed channels data for a specific analog group.
 * Combines cfg.computedChannels metadata with data.computedData values.
 * Used to implement the "ownership rule" - computed channels render with their parent group.
 * 
 * @function getComputedChannelsForGroup
 * @private
 * @param {string} groupId - The analog group ID to filter by (e.g., "G0")
 * @param {Object} cfg - Config object with computedChannels array
 * @param {Object[]} cfg.computedChannels - Array of computed channel definitions
 * @param {string} cfg.computedChannels[].group - Group this channel belongs to
 * @param {Object} data - Data object with computedData array
 * @param {Array} data.computedData - Array of computed data (arrays or objects)
 * @returns {Object[]} Computed channel objects with data attached, filtered by group
 * 
 * @example
 * const computedForG0 = getComputedChannelsForGroup("G0", cfg, data);
 * // Returns computed channels where channel.group === "G0"
 */
function getComputedChannelsForGroup(groupId, cfg, data) {
  const cfgChannels = cfg?.computedChannels || [];
  const dataValues = data?.computedData || [];
  
  return cfgChannels
    .map((ch, idx) => ({
      ...ch,
      data: Array.isArray(dataValues[idx]) ? dataValues[idx] : (dataValues[idx]?.data || [])
    }))
    .filter(ch => ch.group === groupId && ch.data?.length > 0);
}

/**
 * Render all COMTRADE charts in the container.
 * This is the main orchestration function that coordinates rendering of
 * analog, digital, and computed channel charts.
 * 
 * **Execution Flow:**
 * ```
 * 1. Clear existing charts and metadata
 * 2. Setup drag-and-drop
 * 3. Analyze groups for Y-axis alignment
 * 4. Render analog charts (one per group)
 *    - Include computed channels that belong to each group
 * 5. Render digital charts (one per group)
 * 6. Render standalone computed channels
 * 7. Calculate deltas for vertical markers
 * ```
 * 
 * **Memory Management:**
 * - Properly destroys old chart instances before creating new ones
 * - Disconnects ResizeObservers and event listeners
 * - Clears chart metadata store
 * 
 * @function renderComtradeCharts
 * @memberof module:components/renderComtradeCharts
 * @since 1.0.0
 * 
 * @param {Object} cfg - COMTRADE configuration object from parseCFG()
 * @param {Object[]} cfg.analogChannels - Analog channel definitions
 * @param {Object[]} cfg.digitalChannels - Digital channel definitions
 * @param {Object[]} [cfg.computedChannels] - Computed channel definitions
 * 
 * @param {Object} data - Parsed COMTRADE data object from parseDAT()
 * @param {number[]} data.time - Time array
 * @param {number[][]} data.analogData - 2D array of analog data
 * @param {Array[]} data.digitalData - 2D array of digital data
 * @param {Array} [data.computedData] - Array of computed channel data
 * 
 * @param {HTMLElement} chartsContainer - DOM container to render charts into
 *   Will be cleared before rendering
 * 
 * @param {uPlot[]} charts - Array to store chart instances
 *   Cleared and repopulated during rendering
 *   Used for synchronized cursor and zoom
 * 
 * @param {Object} verticalLinesX - Reactive array for vertical line positions
 *   Shared across all charts for synchronized markers
 * 
 * @param {Function} createState - State creation utility (from state management)
 * 
 * @param {Function} calculateDeltas - Function to calculate delta values
 *   Called after chart creation for marker calculations
 * 
 * @param {string} TIME_UNIT - Time unit string ("ms", "s", "μs")
 *   Used for delta display formatting
 * 
 * @param {Object} channelState - User channel customizations
 * @param {Object} channelState.analog - Analog channel state (labels, colors, groups)
 * @param {Object} channelState.digital - Digital channel state (labels, colors, groups)
 * 
 * @returns {void}
 * 
 * @example
 * // Standard usage after parsing COMTRADE files
 * const cfg = parseCFG(cfgText);
 * const data = parseDAT(datBuffer, cfg);
 * 
 * renderComtradeCharts(
 *   cfg,
 *   data,
 *   document.getElementById("charts-container"),
 *   charts,
 *   verticalLinesX,
 *   createState,
 *   calculateDeltas,
 *   "ms",
 *   channelState
 * );
 * 
 * @example
 * // After rendering, charts array contains all uPlot instances
 * renderComtradeCharts(cfg, data, container, charts, ...);
 * console.log(`Created ${charts.length} charts`);
 * // Access individual charts:
 * charts.forEach(chart => {
 *   console.log(chart._userGroupId, chart._chartType);
 * });
 * 
 * @mermaid
 * sequenceDiagram
 *     Main->>Render: renderComtradeCharts
 *     Render->>Render: clearAllCharts
 *     Render->>Render: destroyCharts
 *     Render->>Render: setupChartDragAndDrop
 *     Render->>Analog: For each analog group
 *     Analog->>Analog: getComputedChannelsForGroup
 *     Analog->>Single: renderSingleAnalogChart
 *     Single-->>Render: chart instance
 *     Render->>Digital: For each digital group
 *     Digital->>Single: renderSingleDigitalChart
 *     Single-->>Render: chart instance
 *     Render->>Computed: renderComputedChart
 *     Computed-->>Render: standalone charts
 *     Render->>Delta: Calculate deltas
 *     Render-->>Main: void
 * 
 * @see {@link module:components/renderSingleAnalogChart} - Analog chart rendering
 * @see {@link module:components/renderSingleDigitalChart} - Digital chart rendering
 * @see {@link module:utils/autoGroupChannels~buildChannelGroups} - Grouping logic
 */
export function renderComtradeCharts(
  cfg,
  data,
  chartsContainer,
  charts,
  verticalLinesX,
  createState,
  calculateDeltas,
  TIME_UNIT,
  channelState
) {
  const renderStartTime = performance.now();

  clearAllCharts();
  console.log(`[renderComtradeCharts] Cleared chart metadata for new file`);

  // ✅ CRITICAL FIX: Properly destroy old charts BEFORE clearing array
  // This disconnects ResizeObservers, removes event listeners, and prevents memory leaks
  destroyCharts(charts);
  chartsContainer.innerHTML = "";
  setupChartDragAndDrop(chartsContainer);

  console.log(`[renderComtradeCharts] Starting: ${cfg.analogChannels?.length || 0} analog, ${cfg.digitalChannels?.length || 0} digital, ${cfg.computedChannels?.length || 0} computed`);

  // Analyze groups and publish max Y-axes for consistent axis alignment
  analyzeGroupsAndPublishMaxYAxes(charts, channelState, cfg);

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 1: Render analog charts (one per group)
  // ═══════════════════════════════════════════════════════════════════════════
  const analogChannels = cfg.analogChannels || [];
  let chartIndex = 0;  // Shared counter for all chart types
  
  if (analogChannels.length > 0) {
    const userGroups = channelState?.analog?.groups || [];
    const maxYAxes = getMaxYAxes() || 1;
    
    // Get groups from centralized grouping logic with "GA" prefix
    // Format: { "GA0": [0,1,2], "GA1": [3,4,5] }
    const analogGroups = buildChannelGroups(userGroups, analogChannels, "GA");
    
    // Render each group as a chart
    for (const [groupId, channelIndices] of Object.entries(analogGroups)) {
      if (channelIndices?.length > 0) {
        // Get computed channels that belong to this analog group (ownership rule)
        const computedForGroup = getComputedChannelsForGroup(groupId, cfg, data);
        
        // ✅ NEW SIGNATURE: renderSingleAnalogChart(groupId, channelIndices, chartIndex, cfg, data, ...)
        renderSingleAnalogChart(
          groupId,                  // Group identifier
          channelIndices,           // Array of channel indices
          chartIndex,               // Chart number
          cfg,                      // Configuration
          data,                     // Data
          chartsContainer,          // Container
          charts,                   // Charts array
          verticalLinesX,           // Vertical lines
          {                         // Options
            channelState,
            maxYAxes,
            computedChannels: computedForGroup,
          }
        );
        chartIndex++;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 2: Render computed channels (standalone, not owned by analog groups)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // 🔍 DEBUG: Log what cfg/data is being passed to renderComputedChart
  console.log("[renderComtradeCharts] 🔍 DEBUG - Before calling renderComputedChart:");
  console.log("  cfg.computedChannels:", cfg?.computedChannels?.map(c => ({ id: c.id, group: c.group, madeFrom: c.madeFrom })));
  console.log("  data.computedData format:", data?.computedData?.length > 0 ? 
    (Array.isArray(data.computedData[0]) ? "NEW (arrays)" : "LEGACY (objects)") : "empty");
  console.log("  window.globalCfg.computedChannels:", window.globalCfg?.computedChannels?.map(c => ({ id: c.id, group: c.group, madeFrom: c.madeFrom })));
  
  renderComputedChart(cfg, data, chartsContainer, charts, verticalLinesX, channelState);

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 3: Render digital channels in ONE chart (single "GD0" group)
  // ═══════════════════════════════════════════════════════════════════════════
  // Digital channels are NOT grouped like analog - all go in single chart
  // Only show channels that have state changes (0↔1 or 1↔0 transitions)
  // Channels that are always 0 or always 1 are filtered out
  const digitalChannels = cfg.digitalChannels || [];
  if (digitalChannels.length > 0 && data.digitalData?.length > 0) {
    // Use findChangedDigitalChannelIndices to get only channels with state changes
    const changedDigitalIndices = findChangedDigitalChannelIndices(data.digitalData);
    
    console.log(`[renderComtradeCharts] 📊 Digital channels: ${changedDigitalIndices.length}/${digitalChannels.length} have state changes`);
    
    if (changedDigitalIndices.length > 0) {
      // Render ONE chart with filtered digital channels (groupId = "GD0")
      renderSingleDigitalChart(
        "GD0",                     // Single group ID for digital uPlot instance
        changedDigitalIndices,     // Only channels with state changes
        chartIndex,                // Chart position
        cfg,                       // Configuration
        data,                      // Data
        chartsContainer,           // Container
        charts,                    // Charts array
        verticalLinesX,            // Vertical lines
        { channelState }           // Options
      );
      chartIndex++;
    } else {
      console.log(`[renderComtradeCharts] ⏭️ No digital channels with state changes - skipping digital chart`);
    }
  }

  const metadataState = getChartMetadataState();
  if (!metadataSubscriptionAttached && metadataState?.subscribe) {
    metadataState.subscribe((change) => {
      console.log(
        "[MetadataChange]",
        change.path,
        "changed to",
        change.newValue
      );
    });
    metadataSubscriptionAttached = true;
  }

  const chartsMeta = Array.isArray(metadataState?.charts)
    ? metadataState.charts
    : [];

  if (charts.length > 0) {
    // Process deltas
    (async () => {
      try {
        const { collectChartDeltas } = await import(
          "../utils/calculateDeltas.js"
        );
        const allDeltaData = [];

        for (const chart of charts) {
          const chartDeltas = collectChartDeltas(
            verticalLinesX,
            chart,
            TIME_UNIT
          );
          if (chartDeltas.length > 0) {
            allDeltaData.push(...chartDeltas);
          }
        }

        if (allDeltaData.length > 0) {
          try {
            const { deltaWindow, verticalLinesX } = await import("../main.js");
            if (deltaWindow) {
              const linesLength = verticalLinesX?.length || 0;
              deltaWindow.update(allDeltaData, linesLength);
            }
          } catch (e) {
            console.warn(
              "[renderComtradeCharts] Failed to update deltaWindow:",
              e.message
            );
          }
        }
      } catch (e) {
        console.error(
          "[renderComtradeCharts] Error processing deltas:",
          e.message
        );
      }
    })();
  }
}
