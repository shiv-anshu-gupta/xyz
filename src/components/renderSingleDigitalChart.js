/**
 * @file renderSingleDigitalChart.js
 * @module components/renderSingleDigitalChart
 * 
 * @description
 * <h3>Single Digital Chart Renderer</h3>
 * 
 * <p>Visualizes binary/boolean signals from protection relays and power quality meters.
 * Renders a SINGLE uPlot instance for one digital channel group.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>Single Responsibility</td><td>One function → one chart</td></tr>
 *   <tr><td>DRY</td><td>Uses shared utilities to avoid duplication</td></tr>
 *   <tr><td>Stacked Display</td><td>Color-coded HIGH/LOW states</td></tr>
 *   <tr><td>Consistency</td><td>Same interface as <code>renderSingleAnalogChart</code></td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>Group-based rendering</strong> — Channels grouped by user or auto-grouping</li>
 *   <li><strong>Stacked display</strong> — Configurable <code>DigChannelOffset</code> between channels</li>
 *   <li><strong>Color-coded fill</strong> — HIGH states shown as filled rectangles</li>
 *   <li><strong>Auto filtering</strong> — Channels with no HIGH values are hidden</li>
 *   <li><strong>Computed support</strong> — Can render computed digital channels</li>
 *   <li><strong>Responsive</strong> — ResizeObserver auto-adjusts</li>
 * </ul>
 * 
 * <h4>Operating Modes</h4>
 * <table>
 *   <tr><th>Mode</th><th>channelIndices</th><th>computedChannels</th><th>Result</th></tr>
 *   <tr><td>COMTRADE</td><td><code>[0,1,2]</code></td><td><code>[]</code></td><td>Renders COMTRADE channels</td></tr>
 *   <tr><td>Computed-only</td><td><code>[]</code></td><td><code>[...]</code></td><td>Renders only computed</td></tr>
 *   <tr><td>Mixed</td><td><code>[0,1,2]</code></td><td><code>[...]</code></td><td>Both in same chart</td></tr>
 * </table>
 * 
 * <h4>Digital Signal Display</h4>
 * <ul>
 *   <li><strong>HIGH (1)</strong> — Filled rectangles</li>
 *   <li><strong>LOW (0)</strong> — Baseline</li>
 *   <li><strong>Stacked</strong> — Vertical offset between channels</li>
 * </ul>
 * 
 * @see {@link module:components/renderSingleAnalogChart} - Analog equivalent
 * @see {@link module:components/renderComtradeCharts} - Orchestrator
 * @see {@link module:plugins/digitalFillPlugin} - Fill plugin
 * 
 * @example
 * import { renderSingleDigitalChart } from "./renderSingleDigitalChart.js";
 * 
 * renderSingleDigitalChart(
 *   "G0",              // Group ID
 *   [0, 1, 2, 3],      // Channel indices (TRIP, CLOSE, 52A, 52B)
 *   1,                 // Chart index
 *   cfg, data,         // COMTRADE data
 *   chartsContainer,   // DOM container
 *   charts,            // Charts array
 *   verticalLinesX,    // Vertical lines state
 *   { channelState }   // Options
 * );
 * 
 * @mermaid
 * graph TD
 *     A[Input: groupId, channelIndices, cfg, data] --> B[Validate Inputs]
 *     B --> C{Has HIGH values?}
 *     C -->|No| D[Return null]
 *     C -->|Yes| E[Build channel metadata]
 *     E --> F[createDragBar]
 *     F --> G[createChartContainer]
 *     G --> H[Build chartData with 0/1 values]
 *     H --> I[createDigitalFillPlugin]
 *     I --> J[createChartOptions]
 *     J --> K[initUPlotChart]
 *     K --> L[Attach Metadata]
 *     L --> M[attachChartEventHandlers]
 *     M --> N[Return chart instance]
 */

import { createDragBar } from "./createDragBar.js";
import { createChartOptions } from "./chartComponent.js";
import { addChart } from "../utils/chartMetadataStore.js";
import { createChartContainer, initUPlotChart } from "../utils/chartDomUtils.js";
import verticalLinePlugin from "../plugins/verticalLinePlugin.js";
import { createDigitalFillPlugin } from "../plugins/digitalFillPlugin.js";
import { attachChartEventHandlers } from "../utils/chartInteractions.js";
import { getMaxYAxes } from "../utils/maxYAxesStore.js";
import { resolveTimeArray } from "../utils/computedChannelDataProcessor.js";

/**
 * Digital channel offset for stacked display.
 * Each digital channel is offset by this amount on the Y-axis.
 * @constant {number}
 * @default 2
 */
const DigChannelOffset = 2;

/**
 * Check if a digital channel has any HIGH (true/1) values.
 * Digital signals that are always LOW (0/false) are typically not useful to display.
 * 
 * @function hasDigitalData
 * @private
 * @param {Array<boolean|number>} channelData - Boolean or numeric array for one channel
 * @returns {boolean} True if channel has at least one HIGH value
 * 
 * @example
 * hasDigitalData([0, 0, 1, 0, 0]);  // true - has HIGH
 * hasDigitalData([false, false]);    // false - all LOW
 * hasDigitalData([true, false]);     // true - has HIGH
 */
function hasDigitalData(channelData) {
  if (!Array.isArray(channelData)) return false;
  return channelData.some(v => v === true || v === 1);
}

/**
 * Filter channel indices to only those with actual HIGH values.
 * Removes channels that are always LOW from the display.
 * 
 * @function filterIndicesWithData
 * @private
 * @param {number[]} indices - Channel indices to filter
 * @param {Array<Array<boolean|number>>} digitalData - Digital data arrays
 * @returns {number[]} Filtered indices with valid data (at least one HIGH)
 * 
 * @example
 * const digitalData = [
 *   [0, 0, 0],  // Channel 0: always LOW
 *   [0, 1, 0],  // Channel 1: has HIGH
 *   [1, 1, 1],  // Channel 2: always HIGH
 * ];
 * filterIndicesWithData([0, 1, 2], digitalData);  // [1, 2]
 */
function filterIndicesWithData(indices, digitalData) {
  return indices.filter(idx => {
    if (idx < 0 || idx >= digitalData.length) return false;
    return hasDigitalData(digitalData[idx]);
  });
}

/**
 * Digital channel state object structure
 * 
 * @typedef {Object} DigitalChannelState
 * @property {string[]} yLabels - Array of channel labels indexed by channel position
 * @property {string[]} lineColors - Array of hex color codes indexed by channel position
 * @property {string[]} groups - Array of group IDs per channel (e.g., ["G0", "G0", "G1"])
 * 
 * @example
 * const channelState = {
 *   digital: {
 *     yLabels: ["TRIP", "CLOSE", "52A", "52B"],
 *     lineColors: ["#f97316", "#06b6d4", "#a855f7", "#10b981"],
 *     groups: ["G0", "G0", "G0", "G0"]
 *   }
 * };
 */

/**
 * Options object for renderSingleDigitalChart
 * 
 * @typedef {Object} RenderDigitalOptions
 * @property {Object} channelState - Channel state with digital sub-object
 * @property {DigitalChannelState} channelState.digital - Digital channel configuration
 * @property {ComputedDigitalChannel[]} [computedChannels=[]] - Computed digital channels for this group
 * 
 * @example
 * const options = {
 *   channelState: {
 *     digital: { yLabels: [...], lineColors: [...], groups: [...] }
 *   },
 *   computedChannels: [
 *     { id: "fault_detect", name: "Fault Detect", color: "#FF6B6B", data: [0,0,1,1,0] }
 *   ]
 * };
 */

/**
 * Computed digital channel object structure
 * 
 * @typedef {Object} ComputedDigitalChannel
 * @property {string} id - Unique identifier (e.g., "computed_fault")
 * @property {string} name - Display name (e.g., "Fault Detection")
 * @property {string} color - Hex color code (e.g., "#FF6B6B")
 * @property {string} group - Parent group ID (e.g., "DigitalComputed")
 * @property {string} [unit] - Unit string (optional for digital)
 * @property {number[]} data - Calculated data array (boolean-like: 0/1 or true/false)
 */

/**
 * Digital fill signal configuration for the digitalFillPlugin
 * 
 * @typedef {Object} DigitalFillSignal
 * @property {number} signalIndex - Series index in uPlot (1-based, 0 is time)
 * @property {number} offset - Y-axis offset for stacking
 * @property {string} color - Fill color for HIGH states
 * @property {number} targetVal - Value to fill (always 1 for digital)
 * @property {number} originalIndex - Original channel index in cfg.digitalChannels
 */

/**
 * Render a SINGLE uPlot instance for one digital channel group.
 * 
 * This function creates a complete digital chart with:
 * - Multiple digital channels from the same group stacked vertically
 * - Color-coded fill for HIGH states
 * - Drag bar for chart reordering
 * - Click handler for vertical line markers
 * - Automatic filtering of always-LOW channels
 * - Responsive resize handling
 * 
 * **Display Format:**
 * ```
 * Channel 2: ████░░░░████░░░░  (HIGH/LOW pattern)
 * Channel 1: ░░░░████░░░░████
 * Channel 0: ████████░░░░░░░░
 *            ─────────────────> Time
 * ```
 * 
 * **Data Transformation:**
 * - Input: Boolean or numeric arrays from COMTRADE
 * - Output: Normalized 0/1 values for consistent display
 * - Channels with no HIGH values are filtered out
 * 
 * @function renderSingleDigitalChart
 * @memberof module:components/renderSingleDigitalChart
 * @since 1.0.0
 * 
 * @param {string} groupId - Group identifier (e.g., "G0", "G1", "Protection")
 *   Used for chart title and metadata
 * 
 * @param {number[]} channelIndices - Array of channel indices belonging to this group
 *   These indices map to `cfg.digitalChannels[idx]` and `data.digitalData[idx]`
 *   Example: [0, 1, 2, 3] for channels TRIP, CLOSE, 52A, 52B
 * 
 * @param {number} chartIndex - Chart position/number (0-based)
 *   Used for ordering and dataset attributes
 * 
 * @param {Object} cfg - COMTRADE configuration object from parseCFG()
 * @param {Object[]} cfg.digitalChannels - Array of digital channel definitions
 * @param {string} cfg.digitalChannels[].id - Channel identifier (e.g., "TRIP")
 * @param {boolean} cfg.digitalChannels[].normalState - Normal state (0 or 1)
 * 
 * @param {Object} data - Parsed COMTRADE data object from parseDAT()
 * @param {Array<Array<boolean|number>>} data.digitalData - 2D array of digital channel data
 *   `data.digitalData[channelIndex][sampleIndex]` = true/false or 1/0
 * 
 * @param {HTMLElement} chartsContainer - DOM container to append chart to
 * 
 * @param {uPlot[]} charts - Array to push new chart instance into
 *   Shared across all charts for synchronized cursor/zoom
 * 
 * @param {Object} verticalLinesX - Reactive array for vertical line positions
 * 
 * @param {RenderDigitalOptions} [options={}] - Additional options
 * 
 * @returns {uPlot|null} The created uPlot instance, or null if:
 *   - No valid channel indices provided
 *   - Missing digitalData
 *   - All channels have no HIGH values
 *   - uPlot creation failed
 * 
 * @throws {Error} Does not throw - returns null on failure with console warnings
 * 
 * @example
 * // Example 1: Basic digital chart with protection signals
 * const chart = renderSingleDigitalChart(
 *   "G0",                              // Group ID
 *   [0, 1, 2, 3],                       // Indices for TRIP, CLOSE, 52A, 52B
 *   1,                                  // Second chart
 *   cfg,                                // From parseCFG()
 *   data,                               // From parseDAT()
 *   document.getElementById("charts"), // Container
 *   charts,                             // Charts array
 *   verticalLinesX,                     // Vertical lines state
 *   {
 *     channelState: {
 *       digital: {
 *         yLabels: ["TRIP", "CLOSE", "52A", "52B"],
 *         lineColors: ["#f97316", "#06b6d4", "#a855f7", "#10b981"]
 *       }
 *     }
 *   }
 * );
 * 
 * @example
 * // Example 2: Accessing chart metadata after creation
 * const chart = renderSingleDigitalChart(...);
 * 
 * if (chart) {
 *   console.log("Group:", chart._userGroupId);      // "G0"
 *   console.log("Type:", chart._chartType);         // "digital"
 *   console.log("Channels:", chart._channelIndices); // [0, 1, 2, 3]
 *   console.log("Plugin:", chart._digitalPlugin);   // digitalFillPlugin instance
 * }
 * 
 * @mermaid
 * sequenceDiagram
 *     Caller->>Func: groupId, indices, cfg, data
 *     Func->>Func: filterIndicesWithData
 *     Func->>DragBar: createDragBar
 *     DragBar-->>Func: dragBar element
 *     Func->>Container: createChartContainer
 *     Container-->>Func: parentDiv, chartDiv
 *     Func->>Func: Build digitalFillSignals
 *     Func->>Plugin: createDigitalFillPlugin
 *     Plugin-->>Func: digitalPlugin
 *     Func->>Options: createChartOptions
 *     Options-->>Func: opts
 *     Func->>uPlot: initUPlotChart
 *     uPlot-->>Func: chart
 *     Func->>Events: attachChartEventHandlers
 *     Func-->>Caller: return chart
 * 
 * @see {@link module:components/renderSingleAnalogChart} - Analog chart equivalent
 * @see {@link module:plugins/digitalFillPlugin} - Plugin for digital visualization
 * @see {@link module:components/renderComtradeCharts} - Caller/orchestrator
 */
export function renderSingleDigitalChart(
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
  const { channelState, computedChannels = [] } = options;
  const renderStartTime = performance.now();

  // ═══════════════════════════════════════════════════════════════════════════
  // DETERMINE MODE: COMTRADE mode (has indices) vs Computed-only mode (empty indices)
  // ═══════════════════════════════════════════════════════════════════════════
  const hasComtradeChannels = channelIndices?.length > 0;
  const hasComputedChannels = computedChannels?.length > 0;

  console.log(`[renderSingleDigitalChart] 📊 Creating digital chart #${chartIndex} for group "${groupId}" - Mode: ${hasComtradeChannels ? 'COMTRADE' : 'Computed-only'} (${channelIndices?.length || 0} COMTRADE + ${computedChannels.length} computed)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATE INPUTS
  // ═══════════════════════════════════════════════════════════════════════════
  // Need at least COMTRADE channels OR computed channels
  if (!hasComtradeChannels && !hasComputedChannels) {
    console.warn(`[renderSingleDigitalChart] ⚠️ No channels for "${groupId}"`);
    return null;
  }

  // For COMTRADE mode, need digitalData
  if (hasComtradeChannels && !data?.digitalData?.length) {
    console.warn(`[renderSingleDigitalChart] ⚠️ Missing digitalData for COMTRADE mode`);
    return null;
  }

  // Filter to valid COMTRADE indices that have HIGH values
  const validIndices = hasComtradeChannels
    ? filterIndicesWithData(channelIndices, data.digitalData)
    : [];

  // Filter computed channels with valid data
  const computedWithData = computedChannels.filter(ch => ch.data?.length > 0);

  if (validIndices.length === 0 && computedWithData.length === 0) {
    console.log(`[renderSingleDigitalChart] ⏭️ Skipping group "${groupId}" - no channels with data`);
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD CHANNEL INFO FROM CFG + COMPUTED
  // ═══════════════════════════════════════════════════════════════════════════
  const digitalChannels = cfg?.digitalChannels || [];
  const digital = channelState?.digital || {};
  
  // Build COMTRADE channels to display with their metadata
  const digitalChannelsToShow = validIndices.map(idx => {
    const ch = digitalChannels[idx] || { id: `D${idx}` };
    return {
      ...ch,
      originalIndex: idx,
      isComputed: false,
    };
  });

  // Add computed channels to display list
  const computedChannelsToShow = computedWithData.map(ch => ({
    id: ch.id,
    name: ch.name || ch.id,
    color: ch.color,
    originalIndex: -1,  // Not from COMTRADE
    isComputed: true,
    computedData: ch.data,
    unit: ch.unit || "",
  }));

  // Combine COMTRADE + computed channels
  const allChannelsToShow = [...digitalChannelsToShow, ...computedChannelsToShow];

  if (allChannelsToShow.length === 0) {
    console.log(`[renderSingleDigitalChart] ⏭️ Skipping group "${groupId}" - no channels to display`);
    return null;
  }

  // Build labels and colors (COMTRADE + computed)
  const digitalYLabels = allChannelsToShow.map((ch, i) => {
    if (ch.isComputed) {
      return ch.name || ch.id;
    }
    // Prefer label from channelState if available
    if (Array.isArray(digital.yLabels) && digital.yLabels[ch.originalIndex]) {
      return digital.yLabels[ch.originalIndex];
    }
    return ch.id || `D${ch.originalIndex}`;
  });

  const displayedColors = allChannelsToShow.map((ch, i) => {
    if (ch.isComputed) {
      return ch.color || "#4ECDC4";
    }
    if (Array.isArray(digital.lineColors) && digital.lineColors[ch.originalIndex]) {
      return digital.lineColors[ch.originalIndex];
    }
    // Default digital colors (from original)
    const defaultColors = ["#f97316", "#06b6d4", "#a855f7", "#10b981", "#ef4444", "#eab308"];
    return defaultColors[i % defaultColors.length];
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE CHART METADATA
  // ═══════════════════════════════════════════════════════════════════════════
  const dragBar = createDragBar({ indices: validIndices, name: groupId }, cfg, channelState);

  // Build channel IDs (COMTRADE + computed)
  const channelIds = allChannelsToShow.map((ch, idx) => {
    if (ch.isComputed) {
      return `computed-${ch.id}`;
    }
    return ch.originalIndex !== undefined ? `digital-${ch.originalIndex}` : `digital-${idx}`;
  });

  const metadata = addChart({
    userGroupId: groupId,
    type: "digital",
    yLabels: digitalYLabels.slice(),
    channelIds: channelIds,
    colors: displayedColors.slice(),
    indices: validIndices.slice(),
    computedChannelIds: computedWithData.map(ch => ch.id),
    sourceGroupId: groupId,
  });

  console.log(`[renderSingleDigitalChart] Creating ${metadata.userGroupId} → ${metadata.uPlotInstance}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE CHART CONTAINER
  // ═══════════════════════════════════════════════════════════════════════════
  const { parentDiv, chartDiv } = createChartContainer(
    dragBar,
    "chart-container",
    digitalYLabels,
    displayedColors,
    "Digital Channels",
    metadata.userGroupId,
    "digital"
  );
  parentDiv.dataset.userGroupId = metadata.userGroupId;
  parentDiv.dataset.uPlotInstance = metadata.uPlotInstance;
  parentDiv.dataset.chartType = "digital";
  chartsContainer.appendChild(parentDiv);

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD CHART DATA (COMTRADE + computed)
  // ═══════════════════════════════════════════════════════════════════════════
  // Get COMTRADE digital data (converted to 0/1)
  const digitalDataToShow = validIndices.map(idx => data.digitalData[idx]);
  const digitalDataZeroOne = digitalDataToShow.map(arr => arr.map(v => (v ? 1 : 0)));

  // Get computed digital data (converted to 0/1)
  const computedDataZeroOne = computedChannelsToShow.map(ch => 
    ch.computedData.map(v => (v ? 1 : 0))
  );

  // Combine all data series
  const allDataSeries = [...digitalDataZeroOne, ...computedDataZeroOne];

  // Derive sample count from all series
  const allLengths = allDataSeries
    .filter(arr => Array.isArray(arr) && arr.length > 0)
    .map(arr => arr.length);
  const sampleCount = allLengths.length ? Math.min(...allLengths) : 0;

  if (!sampleCount) {
    console.log(`[renderSingleDigitalChart] ⏭️ Skipping group "${groupId}" - no valid sample count`);
    return null;
  }

  // Resolve time array using centralized utility (handles multiple fallback sources)
  let timeArray = resolveTimeArray(data, computedChannelsToShow.map(ch => ({ data: ch.computedData })));
  
  // Trim to sample count
  if (timeArray?.length > sampleCount) {
    timeArray = timeArray.slice(0, sampleCount);
  }
  
  if (!timeArray?.length) {
    console.log(`[renderSingleDigitalChart] ⏭️ Skipping group "${groupId}" - no time data`);
    return null;
  }
  
  // Trim all data series to sample count
  const trimmedDigital = allDataSeries.map((arr, idx) => {
    if (!Array.isArray(arr)) {
      console.warn(`[renderSingleDigitalChart] ⚠️ Digital channel at idx=${idx} missing data`);
      return [];
    }
    return arr.slice(0, sampleCount);
  });

  const hasAnyDigital = trimmedDigital.some(arr => Array.isArray(arr) && arr.length > 0);
  if (!hasAnyDigital) {
    console.log(`[renderSingleDigitalChart] ⏭️ Skipping group "${groupId}" - no data available`);
    return null;
  }

  const chartData = [timeArray, ...trimmedDigital];

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE DIGITAL FILL PLUGIN SIGNALS (COMTRADE + computed)
  // ═══════════════════════════════════════════════════════════════════════════
  const digitalFillSignals = allChannelsToShow.map((ch, i) => ({
    signalIndex: i + 1,
    offset: (allChannelsToShow.length - 1 - i) * DigChannelOffset,
    color: displayedColors[i],
    targetVal: 1,
    originalIndex: ch.isComputed ? -1 : ch.originalIndex,
    isComputed: ch.isComputed,
    computedId: ch.isComputed ? ch.id : null,
  }));

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURE CHART OPTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  const yMin = -0.5;
  const yMax = (allChannelsToShow.length - 1) * DigChannelOffset + 2;
  const scales = {
    x: { time: false, auto: true },
    y: { min: yMin, max: yMax, auto: false },
  };

  const maxYAxes = getMaxYAxes() || 1;

  const opts = createChartOptions({
    title: "Digital Channels",
    yLabels: digitalYLabels,
    lineColors: displayedColors,
    verticalLinesX: verticalLinesX,
    xLabel: "Time",
    xUnit: "s",
    getCharts: () => charts,
    yUnits: [],
    axesScales: [],
    scales,
    singleYAxis: true,
    autoScaleUnit: { x: true, y: false },
    maxYAxes: maxYAxes,
  });

  // Configure digital Y-axis with custom formatting
  const firstAxis = {
    ...opts.axes[1],
    scale: "y",
    side: 3,
    show: true,
    size: 60,
    stroke: "#d1d5db",
    label: "Digital States",
    grid: { show: true },
    ticks: { show: true, size: 10 },
    gap: 5,
    values: (u, vals) =>
      vals.map(v => {
        for (let i = 0; i < allChannelsToShow.length; ++i) {
          if (Math.abs(v - i * DigChannelOffset) < 0.5) return "0";
          if (Math.abs(v - (i * DigChannelOffset + 1)) < 0.5) return "1";
        }
        return "";
      }),
    splits: allChannelsToShow.flatMap((_, i) => [
      i * DigChannelOffset,
      i * DigChannelOffset + 1,
    ]),
  };

  opts.axes = [opts.axes[0], firstAxis, ...opts.axes.slice(2)];

  // Configure series (COMTRADE + computed)
  opts.series = [
    {},
    ...allChannelsToShow.map((ch, i) => {
      let label;
      if (ch.isComputed) {
        label = ch.name || ch.id;
      } else {
        label = ch.id;
        if (Array.isArray(digital.yLabels) && digital.yLabels[ch.originalIndex]) {
          label = digital.yLabels[ch.originalIndex];
        }
      }
      return {
        label,
        stroke: "transparent",
        show: true,
      };
    }),
  ];

  // Add plugins
  opts.plugins = opts.plugins || [];
  opts.plugins = opts.plugins.filter(p => !(p && p.id === "verticalLinePlugin"));
  
  const digitalPlugin = createDigitalFillPlugin(digitalFillSignals);
  opts.plugins.push(digitalPlugin);
  opts.plugins.push(verticalLinePlugin(verticalLinesX, () => charts));

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE UPLOT INSTANCE (using shared utility - handles ResizeObserver)
  // ═══════════════════════════════════════════════════════════════════════════
  const chart = initUPlotChart(opts, chartData, chartDiv, charts);

  if (!chart) {
    console.warn(`[renderSingleDigitalChart] ⚠️ Failed to create uPlot for "${groupId}"`);
    parentDiv.remove();
    return null;
  }

  // Store plugin reference for later access
  chart._digitalPlugin = digitalPlugin;
  chart._metadata = metadata;
  chart._userGroupId = metadata.userGroupId;
  chart._uPlotInstance = metadata.uPlotInstance;
  chart._chartType = "digital";
  chart._chartIndex = chartIndex;
  chart._type = "digital";
  chart._channelIndices = validIndices.slice();
  chart._computedChannelIds = computedWithData.map(ch => ch.id);

  console.log(`[renderSingleDigitalChart] ✅ Digital chart created with ${allChannelsToShow.length} channel(s) (${validIndices.length} COMTRADE + ${computedWithData.length} computed)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTACH EVENT HANDLERS (using shared utility - handles click + tooltip)
  // ═══════════════════════════════════════════════════════════════════════════
  attachChartEventHandlers(chart, charts, verticalLinesX, opts);

  const renderEndTime = performance.now();
  console.log(`[renderSingleDigitalChart] ✓ Render complete in ${(renderEndTime - renderStartTime).toFixed(1)}ms`);

  return chart;
}
