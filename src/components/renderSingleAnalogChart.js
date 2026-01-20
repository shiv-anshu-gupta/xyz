/**
 * @file renderSingleAnalogChart.js
 * @module components/renderSingleAnalogChart
 * 
 * @description
 * <h3>Single Analog Chart Renderer</h3>
 * 
 * <p>Core building block for analog chart visualization in COMTRADE viewers.
 * Renders a SINGLE uPlot instance for one channel group.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>Single Responsibility</td><td>One function → one chart</td></tr>
 *   <tr><td>DRY</td><td>Uses shared utilities to avoid duplication</td></tr>
 *   <tr><td>Ownership Rule</td><td>Computed channels render with their parent group</td></tr>
 *   <tr><td>Consistency</td><td>Same interface as <code>renderSingleDigitalChart</code></td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>Group-based rendering</strong> — Channels grouped by user or auto-grouping</li>
 *   <li><strong>Computed channel integration</strong> — Ownership rule merges computed into parent</li>
 *   <li><strong>Auto data validation</strong> — Filters invalid/empty channels</li>
 *   <li><strong>Shared event handlers</strong> — Click for vertical lines, hover for tooltip</li>
 *   <li><strong>Responsive charts</strong> — ResizeObserver auto-adjusts</li>
 * </ul>
 * 
 * <h4>Pipeline</h4>
 * <ol>
 *   <li>Input: groupId, channelIndices, cfg, data</li>
 *   <li>Validate Inputs → Invalid? Return null</li>
 *   <li>Build chartData Array</li>
 *   <li>Extract Labels / Colors / Units</li>
 *   <li><code>createDragBar()</code> → <code>createChartContainer()</code></li>
 *   <li><code>createChartOptions()</code> → <code>initUPlotChart()</code></li>
 *   <li>Attach Metadata → <code>attachChartEventHandlers()</code></li>
 *   <li>Return chart instance</li>
 * </ol>
 * 
 * @see {@link module:components/renderSingleDigitalChart} - Digital equivalent
 * @see {@link module:components/renderComtradeCharts} - Orchestrator
 * @see {@link module:utils/autoGroupChannels} - Grouping logic
 * 
 * @example
 * import { renderSingleAnalogChart } from "./renderSingleAnalogChart.js";
 * 
 * renderSingleAnalogChart(
 *   "G0",              // Group ID
 *   [0, 1, 2],         // Channel indices (IA, IB, IC)
 *   0,                 // Chart index
 *   cfg, data,         // COMTRADE data
 *   chartsContainer,   // DOM container
 *   charts,            // Charts array
 *   verticalLinesX,    // Vertical lines state
 *   { channelState, maxYAxes: 3, computedChannels: [] }
 * );
 * 
 * @mermaid
 * graph TD
 *     A[Input: groupId, channelIndices, cfg, data] --> B[Validate Inputs]
 *     B --> C{Valid?}
 *     C -->|No| D[Return null]
 *     C -->|Yes| E[Build chartData Array]
 *     E --> F[Extract Labels/Colors/Units]
 *     F --> G[createDragBar]
 *     G --> H[createChartContainer]
 *     H --> I[createChartOptions]
 *     I --> J[initUPlotChart]
 *     J --> K[Attach Metadata]
 *     K --> L[attachChartEventHandlers]
 *     L --> M[Return chart instance]
 */

import { createDragBar } from "./createDragBar.js";
import { createChartOptions } from "./chartComponent.js";
import { addChart } from "../utils/chartMetadataStore.js";
import { createChartContainer, initUPlotChart } from "../utils/chartDomUtils.js";
import verticalLinePlugin from "../plugins/verticalLinePlugin.js";
import { attachChartEventHandlers } from "../utils/chartInteractions.js";
import { resolveTimeArray } from "../utils/computedChannelDataProcessor.js";

/**
 * Channel state object structure for analog channels
 * 
 * @typedef {Object} AnalogChannelState
 * @property {string[]} yLabels - Array of channel labels indexed by channel position
 * @property {string[]} lineColors - Array of hex color codes indexed by channel position
 * @property {string[]} yUnits - Array of unit strings (e.g., "V", "A", "Hz")
 * @property {number[]} axesScales - Array of Y-axis scale multipliers
 * @property {string[]} groups - Array of group IDs per channel (e.g., ["G0", "G0", "G1"])
 * @property {string} xLabel - X-axis label (default: "Time")
 * @property {string} xUnit - X-axis unit (default: "s" or "ms")
 * 
 * @example
 * const channelState = {
 *   analog: {
 *     yLabels: ["IA", "IB", "IC", "VA", "VB", "VC"],
 *     lineColors: ["#FF0000", "#00FF00", "#0000FF", "#FF6600", "#00FF66", "#6600FF"],
 *     yUnits: ["A", "A", "A", "V", "V", "V"],
 *     axesScales: [1, 1, 1, 1, 1, 1, 1],
 *     groups: ["G0", "G0", "G0", "G1", "G1", "G1"],
 *     xLabel: "Time",
 *     xUnit: "ms"
 *   }
 * };
 */

/**
 * Computed channel object structure
 * 
 * @typedef {Object} ComputedChannel
 * @property {string} id - Unique identifier (e.g., "computed_1")
 * @property {string} name - Display name (e.g., "RMS Current")
 * @property {string} color - Hex color code (e.g., "#4ECDC4")
 * @property {string} group - Parent group ID (e.g., "G0") - determines which analog chart owns it
 * @property {string} unit - Unit string (e.g., "A", "V")
 * @property {string} formula - Calculation formula (e.g., "sqrt(IA^2 + IB^2 + IC^2)")
 * @property {number[]} data - Calculated data array (same length as time array)
 * 
 * @example
 * const computedChannel = {
 *   id: "computed_rms_current",
 *   name: "RMS Current",
 *   color: "#4ECDC4",
 *   group: "G0",           // Will render in G0's analog chart
 *   unit: "A",
 *   formula: "sqrt(IA^2 + IB^2 + IC^2) / sqrt(3)",
 *   data: [1.23, 1.25, 1.24, ...]  // Pre-calculated values
 * };
 */

/**
 * Options object for renderSingleAnalogChart
 * 
 * @typedef {Object} RenderAnalogOptions
 * @property {Object} channelState - Channel state with analog/digital sub-objects
 * @property {AnalogChannelState} channelState.analog - Analog channel configuration
 * @property {number} [maxYAxes=1] - Maximum Y-axes for alignment across charts
 * @property {ComputedChannel[]} [computedChannels=[]] - Computed channels for this group
 * 
 * @example
 * const options = {
 *   channelState: {
 *     analog: { yLabels: [...], lineColors: [...], groups: [...] }
 *   },
 *   maxYAxes: 3,
 *   computedChannels: [
 *     { id: "rms", name: "RMS", color: "#4ECDC4", group: "G0", data: [...] }
 *   ]
 * };
 */

/**
 * Chart metadata object attached to uPlot instance
 * 
 * @typedef {Object} ChartMetadata
 * @property {string} chartType - Chart type ("analog", "digital", "computed")
 * @property {string} name - Chart name (same as groupId)
 * @property {string} groupName - Group name for display
 * @property {string} userGroupId - User-facing group ID (e.g., "G0")
 * @property {string[]} channels - Array of channel IDs (e.g., ["analog-0", "analog-1"])
 * @property {string[]} colors - Array of hex colors for each channel
 * @property {number[]} indices - Array of original channel indices
 * @property {string} sourceGroupId - Original group ID before any merging
 */

/**
 * Render a SINGLE uPlot instance for one analog channel group.
 * 
 * This function creates a complete analog chart with:
 * - Multiple analog channels from the same group
 * - Optional computed channels that belong to this group (ownership rule)
 * - Drag bar for chart reordering
 * - Click handler for vertical line markers
 * - Tooltip on hover showing all channel values
 * - Responsive resize handling
 * 
 * **Ownership Rule:**
 * Computed channels are rendered in the analog chart whose groupId matches
 * the computed channel's `group` property. This ensures computed channels
 * appear alongside their source data.
 * 
 * **Data Flow:**
 * ```
 * cfg.analogChannels[idx] → channel metadata (id, unit, etc.)
 * data.analogData[idx]    → actual waveform data arrays
 * channelState.analog     → user customizations (colors, labels, groups)
 * options.computedChannels → pre-calculated computed channel data
 * ```
 * 
 * @function renderSingleAnalogChart
 * @memberof module:components/renderSingleAnalogChart
 * @since 1.0.0
 * 
 * @param {string} groupId - Group identifier (e.g., "G0", "G1", "Currents")
 *   Used for chart title, metadata, and computed channel ownership matching
 * 
 * @param {number[]} channelIndices - Array of channel indices belonging to this group
 *   These indices map to `cfg.analogChannels[idx]` and `data.analogData[idx]`
 *   Example: [0, 1, 2] for channels IA, IB, IC
 * 
 * @param {number} chartIndex - Chart position/number (0-based)
 *   Used for ordering and dataset attributes
 * 
 * @param {Object} cfg - COMTRADE configuration object from parseCFG()
 * @param {Object[]} cfg.analogChannels - Array of analog channel definitions
 * @param {string} cfg.analogChannels[].id - Channel identifier (e.g., "IA")
 * @param {string} cfg.analogChannels[].unit - Channel unit (e.g., "A", "V")
 * @param {number} cfg.analogChannels[].multiplier - Scaling multiplier
 * 
 * @param {Object} data - Parsed COMTRADE data object from parseDAT()
 * @param {number[]} data.time - Time array in seconds or milliseconds
 * @param {number[][]} data.analogData - 2D array of analog channel data
 *   `data.analogData[channelIndex][sampleIndex]`
 * 
 * @param {HTMLElement} chartsContainer - DOM container to append chart to
 *   Typically `document.getElementById("charts-container")`
 * 
 * @param {uPlot[]} charts - Array to push new chart instance into
 *   Shared across all charts for synchronized cursor/zoom
 * 
 * @param {Object} verticalLinesX - Reactive array for vertical line positions
 * @param {number[]} verticalLinesX.value - Current line X positions
 * @param {Function} verticalLinesX.asArray - Returns positions as array
 * 
 * @param {RenderAnalogOptions} [options={}] - Additional options
 * 
 * @returns {uPlot|null} The created uPlot instance, or null if:
 *   - No valid channel indices provided
 *   - Missing time or analogData
 *   - All channels have empty data
 *   - uPlot creation failed
 * 
 * @throws {Error} Does not throw - returns null on failure with console warnings
 * 
 * @example
 * // Example 1: Basic analog chart with 3 current channels
 * const chart = renderSingleAnalogChart(
 *   "G0",                              // Group ID
 *   [0, 1, 2],                         // Indices for IA, IB, IC
 *   0,                                 // First chart
 *   cfg,                               // From parseCFG()
 *   data,                              // From parseDAT()
 *   document.getElementById("charts"), // Container
 *   charts,                            // Charts array
 *   verticalLinesX,                    // Vertical lines state
 *   {
 *     channelState: {
 *       analog: {
 *         yLabels: ["IA", "IB", "IC"],
 *         lineColors: ["#FF0000", "#00FF00", "#0000FF"],
 *         groups: ["G0", "G0", "G0"]
 *       }
 *     },
 *     maxYAxes: 3
 *   }
 * );
 * 
 * @example
 * // Example 2: Analog chart with computed channel (ownership rule)
 * const computedChannels = [
 *   {
 *     id: "rms_current",
 *     name: "I_RMS",
 *     color: "#4ECDC4",
 *     group: "G0",        // ← Matches groupId, will render in this chart
 *     unit: "A",
 *     data: calculateRMS(data.analogData, [0, 1, 2])
 *   }
 * ];
 * 
 * const chart = renderSingleAnalogChart(
 *   "G0", [0, 1, 2], 0, cfg, data,
 *   container, charts, verticalLinesX,
 *   { channelState, maxYAxes: 3, computedChannels }
 * );
 * // Chart will have 4 series: IA, IB, IC, I_RMS
 * 
 * @example
 * // Example 3: Handling return value
 * const chart = renderSingleAnalogChart(...);
 * 
 * if (chart) {
 *   console.log("Chart created:", chart._userGroupId);
 *   console.log("Channels:", chart._channelIndices);
 *   console.log("Computed:", chart._computedChannelIds);
 *   
 *   // Access chart data
 *   const timeArray = chart.data[0];
 *   const firstChannel = chart.data[1];
 * } else {
 *   console.warn("Chart creation failed");
 * }
 * 
 * @mermaid
 * sequenceDiagram
 *     Caller->>Func: groupId, indices, cfg, data
 *     Func->>Func: Validate inputs
 *     Func->>DragBar: createDragBar
 *     DragBar-->>Func: dragBar element
 *     Func->>Container: createChartContainer
 *     Container-->>Func: parentDiv, chartDiv
 *     Func->>Options: createChartOptions
 *     Options-->>Func: opts
 *     Func->>uPlot: initUPlotChart
 *     uPlot-->>Func: chart
 *     Func->>Events: attachChartEventHandlers
 *     Func-->>Caller: return chart
 * 
 * @see {@link module:components/chartComponent~createChartOptions} - Options builder
 * @see {@link module:utils/chartDomUtils~initUPlotChart} - uPlot initialization
 * @see {@link module:utils/chartInteractions~attachChartEventHandlers} - Event binding
 * @see {@link module:components/renderComtradeCharts} - Caller/orchestrator
 */
export function renderSingleAnalogChart(
  groupId,
  channelIndices,
  chartIndex,
  cfg,
  data,
  chartsContainer,
  charts,
  verticalLinesX,
  options = {}
) {
  const { channelState, maxYAxes = 1, computedChannels = [] } = options;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DETERMINE MODE: COMTRADE mode (has indices) vs Computed-only mode (empty indices)
  // ═══════════════════════════════════════════════════════════════════════════
  const hasComtradeChannels = channelIndices?.length > 0;
  const hasComputedChannels = computedChannels?.length > 0;

  console.log(`[renderSingleAnalogChart] 📊 Creating chart #${chartIndex} for group "${groupId}" - Mode: ${hasComtradeChannels ? 'COMTRADE' : 'Computed-only'} (${channelIndices?.length || 0} COMTRADE + ${computedChannels.length} computed)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATE INPUTS
  // ═══════════════════════════════════════════════════════════════════════════
  // Need at least COMTRADE channels OR computed channels
  if (!hasComtradeChannels && !hasComputedChannels) {
    console.warn(`[renderSingleAnalogChart] ⚠️ No channels for "${groupId}"`);
    return null;
  }

  // For COMTRADE mode, need time and analogData
  if (hasComtradeChannels && (!data?.time?.length || !data?.analogData?.length)) {
    console.warn(`[renderSingleAnalogChart] ⚠️ Missing time or analogData for COMTRADE mode`);
    return null;
  }

  // Resolve time array using centralized utility (handles multiple fallback sources)
  // For COMTRADE mode: uses data.time
  // For computed-only mode: tries data.time, data.time.data, data.timeArray, or generates synthetic
  let timeArray = resolveTimeArray(data, computedChannels);
  
  if (!timeArray?.length) {
    console.warn(`[renderSingleAnalogChart] ⚠️ No time data available for "${groupId}"`);
    return null;
  }

  // Filter to valid COMTRADE indices that have data
  const validIndices = hasComtradeChannels 
    ? channelIndices.filter(idx => 
        idx >= 0 && 
        idx < data.analogData.length && 
        Array.isArray(data.analogData[idx]) && 
        data.analogData[idx].length > 0
      )
    : [];

  if (validIndices.length === 0 && computedChannels.length === 0) {
    console.warn(`[renderSingleAnalogChart] ⚠️ No valid data for group "${groupId}"`);
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD CHART DATA: [time, ...analogSeries, ...computedSeries]
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Determine sample count (minimum of all series)
  const allLengths = [
    timeArray.length,
    ...validIndices.map(idx => data.analogData[idx].length),
    ...computedChannels.filter(ch => ch.data?.length).map(ch => ch.data.length)
  ];
  const sampleCount = Math.min(...allLengths);

  // Build data array
  const chartData = [timeArray.slice(0, sampleCount)];
  
  // Add analog series (COMTRADE channels)
  validIndices.forEach(idx => {
    chartData.push(data.analogData[idx].slice(0, sampleCount));
  });
  
  // Add computed series (if any belong to this group)
  const computedWithData = computedChannels.filter(ch => ch.data?.length > 0);
  computedWithData.forEach(ch => {
    chartData.push(ch.data.slice(0, sampleCount));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD METADATA: labels, colors, units
  // ═══════════════════════════════════════════════════════════════════════════
  const analog = channelState?.analog || {};
  
  // Build labels from COMTRADE channels + computed channels
  const yLabels = [
    ...validIndices.map(idx => analog.yLabels?.[idx] || cfg?.analogChannels?.[idx]?.id || `Ch${idx}`),
    ...computedWithData.map(ch => ch.name || ch.id)
  ];
  
  // Build colors from COMTRADE channels + computed channels
  const lineColors = [
    ...validIndices.map(idx => analog.lineColors?.[idx] || "#888"),
    ...computedWithData.map(ch => ch.color || "#4ECDC4")
  ];
  
  // Build units from COMTRADE channels + computed channels
  const yUnits = [
    ...validIndices.map(idx => analog.yUnits?.[idx] || cfg?.analogChannels?.[idx]?.unit || ""),
    ...computedWithData.map(ch => ch.unit || "")
  ];
  
  // Build axes scales (1 for computed channels)
  const axesScales = [
    analog.axesScales?.[0] || 1,
    ...validIndices.map(idx => analog.axesScales?.[idx + 1] || 1),
    ...computedWithData.map(() => 1)
  ];

  const xLabel = analog.xLabel || "Time";
  const xUnit = analog.xUnit || "";

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE CHART METADATA
  // ═══════════════════════════════════════════════════════════════════════════
  const metadata = addChart({
    chartType: "analog",
    name: groupId,
    groupName: groupId,
    userGroupId: groupId,
    channels: validIndices.map(idx => `analog-${idx}`),
    colors: lineColors,
    indices: validIndices.slice(),
    sourceGroupId: groupId,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE DOM: Drag bar + Container
  // ═══════════════════════════════════════════════════════════════════════════
  const dragBar = createDragBar({ indices: validIndices, name: groupId }, cfg, channelState);
  
  const { parentDiv, chartDiv } = createChartContainer(
    dragBar,
    "chart-container",
    yLabels,
    lineColors,
    "Analog Channels",
    groupId,
    "analog"
  );
  
  parentDiv.dataset.userGroupId = groupId;
  parentDiv.dataset.chartType = "analog";
  parentDiv.dataset.chartIndex = chartIndex;
  chartsContainer.appendChild(parentDiv);

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE UPLOT OPTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  const opts = createChartOptions({
    title: groupId,
    yLabels,
    lineColors,
    verticalLinesX,
    xLabel,
    xUnit,
    getCharts: () => charts,
    yUnits,
    axesScales,
    singleYAxis: false,
    maxYAxes,
  });
  
  // Add vertical line plugin
  opts.plugins = opts.plugins || [];
  opts.plugins.push(verticalLinePlugin(verticalLinesX, () => charts));

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE UPLOT INSTANCE
  // ═══════════════════════════════════════════════════════════════════════════
  const chart = initUPlotChart(opts, chartData, chartDiv, charts);
  
  if (!chart) {
    console.warn(`[renderSingleAnalogChart] ⚠️ Failed to create uPlot for "${groupId}"`);
    parentDiv.remove();
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTACH METADATA TO CHART INSTANCE
  // ═══════════════════════════════════════════════════════════════════════════
  chart._metadata = metadata;
  chart._userGroupId = groupId;
  chart._groupId = groupId;
  chart._chartType = "analog";
  chart._chartIndex = chartIndex;
  chart._type = "analog";
  chart._channelIndices = validIndices.slice();
  chart._validIndices = validIndices.slice();
  
  // Computed channel metadata
  chart._computedChannels = computedWithData.map(ch => ({
    id: ch.id, name: ch.name, color: ch.color, group: ch.group, unit: ch.unit
  }));
  chart._computedChannelIds = computedWithData.map(ch => ch.id);
  chart._analogSeriesCount = validIndices.length;
  chart._computedSeriesCount = computedWithData.length;
  
  // Scaling metadata
  chart._axesScales = axesScales;
  chart._yUnits = yUnits;
  chart._seriesColors = lineColors;

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTACH EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════
  attachChartEventHandlers(chart, charts, verticalLinesX, opts);

  console.log(`[renderSingleAnalogChart] ✅ Created chart #${chartIndex} "${groupId}" with ${chartData.length - 1} series (${validIndices.length} analog + ${computedWithData.length} computed)`);
  
  return chart;
}
