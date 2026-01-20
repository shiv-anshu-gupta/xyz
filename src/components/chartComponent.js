/**
 * @module chartComponent
 * @description
 * Factory module for building complete uPlot chart option configurations. Handles
 * the complex setup of axes, series, scales, and plugins needed for rendering
 * COMTRADE data with support for multiple Y-axes, auto-scaling, and interactive
 * features like vertical line markers and horizontal zoom/pan.
 *
 * Key Features:
 * - Single or multiple Y-axis support (adaptive layout)
 * - Auto-unit scaling plugin for SI prefix formatting
 * - Horizontal zoom and pan plugin
 * - Vertical line plugin for time markers
 * - Synchronized crosshair cursors across charts
 * - Smart axis labeling with units (A, V, kA, mV, etc)
 * - Y-axis alternation (left/right sides)
 * - Diagnostic logging for scale debugging
 *
 * Dependencies:
 * - uPlot.js: Main charting library
 * - scaleUtils.js: SI prefix and axis formatting
 * - createState.js: Reactive state management
 * - autoUnitScalePlugin: Auto-scaling plugin
 * - horizontalZoomPanPlugin: Zoom/pan functionality
 * - verticalLinePlugin: Vertical line markers
 *
 * @example
 * import { createChartOptions } from './chartComponent.js';
 * const opts = createChartOptions({
 *   title: "Analog Channels",
 *   yLabels: ["Phase A", "Phase B", "Phase C"],
 *   lineColors: ["#FF0000", "#00FF00", "#0000FF"],
 *   verticalLinesX: [],
 *   xLabel: "Time",
 *   xUnit: "seconds",
 *   getCharts: () => charts,
 *   yUnits: ["kA", "kA", "kA"],
 *   axesScales: [1000, 1000, 1000],  // x-scale, y0-scale, y1-scale, etc
 *   scales: { x: { auto: true }, y: { auto: true } },
 *   singleYAxis: false,               // Multiple Y-axes
 *   autoScaleUnit: { x: true, y: true }
 * });
 * const chart = new uPlot(opts, chartData, container);
 */

import { getSiPrefix, makeAxisValueFormatter } from "../utils/scaleUtils.js";
import { extractUnit, getNearestIndex } from "../utils/helpers.js";
import { unwrap, createState } from "./createState.js";
import { calculateDeltas } from "../utils/calculateDeltas.js";
import { crosshairColors } from "../utils/constants.js";
import autoUnitScalePlugin from "../plugins/autoUnitScalePlugin.js";
import verticalLinePlugin from "../plugins/verticalLinePlugin.js";
import horizontalZoomPanPlugin from "../plugins/horizontalZoomPanPlugin.js";
import { axisLinesPlugin } from "../plugins/axisLinesPlugin.js";
import { getChannelType, getAxisForType } from "../utils/axisCalculator.js";
import { buildCompleteAxesArray, getAxisCount } from "../utils/axisBuilder.js";
import {
  createSeriesDefinitions,
  createYAxisScales,
} from "../utils/seriesMapper.js";
import { getGlobalAxisAlignment } from "../utils/chartAxisAlignment.js";

/**
 * Generate complete uPlot chart options configuration.
 *
 * Factory function that builds a comprehensive uPlot options object from
 * configuration parameters. Supports single and multiple Y-axis layouts,
 * auto-scaling with SI prefixes, synchronized cursors, and plugin support.
 *
 * Key responsibilities:
 * 1. Resolve scales and axis configuration
 * 2. Build series array with line colors and scales
 * 3. Configure X and Y axes with proper labeling
 * 4. Set up synchronized cursor and selection
 * 5. Attach plugins (auto-scale, zoom/pan, vertical lines)
 * 6. Return fully configured uPlot options
 *
 * @function createChartOptions
 * @param {Object} config - Configuration object
 * @param {string} config.title - Chart title displayed at top
 * @param {Array<string>} config.yLabels - Y-axis labels for each series
 * @param {Array<string>} config.lineColors - Stroke colors for each series (cycles if fewer than series)
 * @param {Array<number>|Object} config.verticalLinesX - Vertical line positions array (or createState)
 * @param {string} [config.xLabel=""] - X-axis label
 * @param {string} [config.xUnit="sec"] - X-axis unit
 * @param {number} [config.width=400] - Chart width in pixels
 * @param {number} [config.height=200] - Chart height in pixels
 * @param {Function} [config.getCharts] - Getter function returning all chart instances
 * @param {Array<string>} [config.yUnits=[]] - Y-axis units for each series
 * @param {Array<number>} [config.axesScales=[]] - Scale factors [xScale, y0Scale, y1Scale, ...]
 * @param {Object} [config.scales={}] - uPlot scales object: { x: {...}, y: {...}, y0: {...}, ... }
 * @param {Object} [config.select={show: true}] - Selection tool configuration
 * @param {boolean} [config.singleYAxis=true] - True for single Y-axis, false for multi
 * @param {Object} [config.autoScaleUnit={x: true, y: true}] - Auto-scale SI prefix formatting
 *
 * @returns {Object} Complete uPlot options object with:
 * - @property {string} title
 * - @property {number} width, height
 * - @property {Object} scales - uPlot scale configuration
 * - @property {Array} series - Series definitions with labels and colors
 * - @property {Array} axes - X and Y axis configurations
 * - @property {Object} cursor - Synchronized crosshair configuration
 * - @property {Array} plugins - [autoUnitScale, horizontalZoomPan, verticalLine]
 * - @property {Object} legend - { show: false }
 *
 * @example
 * // Single Y-axis for analog channels (grouped by phase)
 * const analogOpts = createChartOptions({
 *   title: "Three-Phase Current",
 *   yLabels: ["Phase A Current", "Phase B Current", "Phase C Current"],
 *   lineColors: ["#FF5733", "#33FF57", "#3357FF"],
 *   verticalLinesX: verticalLinesArray,
 *   xLabel: "Time",
 *   xUnit: "seconds",
 *   getCharts: () => charts,
 *   yUnits: ["A", "A", "A"],
 *   axesScales: [1000, 500],  // x: 1000, y: 500
 *   singleYAxis: true,
 *   autoScaleUnit: { x: true, y: true }
 * });
 *
 * @example
 * // Multiple Y-axes for mixed units
 * const mixedOpts = createChartOptions({
 *   title: "Voltage and Current",
 *   yLabels: ["Voltage", "Current", "Temperature"],
 *   lineColors: ["#FF0000", "#00FF00", "#0000FF"],
 *   verticalLinesX: [],
 *   yUnits: ["V", "A", "°C"],
 *   axesScales: [1000, 1000, 1000, 100],  // x, y0, y1, y2 scales
 *   scales: { x: { auto: true }, y0: { auto: true }, y1: { auto: true }, y2: { auto: true } },
 *   singleYAxis: false,
 *   autoScaleUnit: { x: false, y: false }
 * });
 *
 * @example
 * // Digital channels with fixed scale
 * const digitalOpts = createChartOptions({
 *   title: "Digital States",
 *   yLabels: ["State 0", "State 1", "State 2"],
 *   lineColors: ["#FFAA00", "#00AAFF", "#FF00AA"],
 *   scales: { x: { auto: true }, y: { min: -0.5, max: 8, auto: false } },
 *   singleYAxis: true,
 *   autoScaleUnit: { x: true, y: false }
 * });
 */
export function createChartOptions({
  title,
  yLabels,
  lineColors,
  verticalLinesX,
  xLabel = "",
  xUnit,
  width = null,
  height = 200,
  getCharts = null, // Optional getter for all charts
  yUnits = [],
  axesScales = [], // Optional: scales for axes, e.g. { x: 1, y0: 1, y1: 1 }\\
  scales = {}, // Unified: scales[0] is x, rest are y
  select = { show: true },
  singleYAxis = true,
  maxYAxes = 1, // ✅ NEW: Number of Y-axes to create
  autoScaleUnit = { x: true, y: true }, // NEW: default autoScaleUnit
}) {
  const verticalLinesXVal = unwrap(verticalLinesX);

  const xScaleVal = axesScales[0] || 1;

  const axisCount = getAxisCount(yLabels.length, maxYAxes, singleYAxis);

  // ✅ PERFORMANCE: Only log in debug mode
  const debugMode =
    typeof localStorage !== "undefined" && localStorage.getItem("DEBUG_CHARTS");
  if (debugMode) {
    console.log("[createChartOptions] Creating chart with:", {
      yLabelsCount: yLabels.length,
      singleYAxis,
      maxYAxes,
      calculatedAxisCount: axisCount,
    });
  }

  const yAxisScales = createYAxisScales(axisCount);

  if (debugMode) {
    console.log(
      "[createChartOptions] Created scales:",
      Object.keys(yAxisScales)
    );
  }

  return {
    title,
    width,
    height,
    scales:
      Object.keys(scales).length > 0
        ? scales
        : {
            x: { time: false, auto: true },
            ...yAxisScales,
          },
    series: [
      {},
      ...createSeriesDefinitions({
        yLabels,
        lineColors,
        yUnits,
        singleYAxis,
        maxYAxes,
      }),
    ],
    axes: buildCompleteAxesArray({
      xLabel,
      xUnit,
      xScale: xScaleVal,
      yLabels,
      yUnits,
      axesScales,
      singleYAxis,
      maxYAxes,
    }),
    cursor: {
      sync: { key: "globalAllSync", setSeries: true },
      x: true,
      y: true,
    },
    plugins: [
      autoUnitScalePlugin({
        axesScales: axesScales,
        autoScaleUnit: autoScaleUnit,
      }),
      horizontalZoomPanPlugin("globalSync", getCharts),
      verticalLinePlugin(verticalLinesX, getCharts), // verticalLinePlugin intentionally NOT added here; must be added last in the caller after any other plugins
      axisLinesPlugin(), // ✅ Draw Y-axis lines at chart edges
    ],
    legend: {
      show: false, // Hides the legend at the bottom
    },
  };
}

// Diagnostic: Track changes to scales after createChartOptions
export function logScalesDiagnostics(opts, context = "") {
  if (opts && opts.scales) {
    console.log(`[${context}] opts.scales:`, opts.scales);
    if (opts.scales.y) {
      console.log(`[${context}] opts.scales.y:`, opts.scales.y);
      console.log(`[${context}] opts.scales.y.auto:`, opts.scales.y.auto);
    } else {
      // Check for y0, y1, etc.
      Object.keys(opts.scales).forEach((key) => {
        if (key.startsWith("y")) {
          console.log(`[${context}] opts.scales.${key}:`, opts.scales[key]);
          console.log(
            `[${context}] opts.scales.${key}.auto:`,
            opts.scales[key].auto
          );
        }
      });
    }
  } else {
    console.log(`[${context}] opts.scales is missing!`);
  }
}

/**
 * Update all chart colors when theme changes
 * Redraws charts to re-evaluate axis color functions from CSS variables
 * @param {Array} chartsArray - Array of uPlot chart instances
 */
export function updateAllChartAxisColors(chartsArray = null) {
  if (!chartsArray || !Array.isArray(chartsArray)) {
    return;
  }

  console.log(
    `[updateAllChartAxisColors] 🎨 Redrawing ${chartsArray.length} charts for theme change`
  );

  chartsArray.forEach((chart) => {
    if (chart && typeof chart.redraw === "function") {
      try {
        // ✅ Redraw forces re-evaluation of stroke/grid.stroke functions
        // These functions read from CSS variables, so theme changes are applied
        chart.redraw();
      } catch (err) {
        console.error("[updateAllChartAxisColors] Redraw error:", err);
      }
    }
  });
}

// Listen for theme changes and update chart colors
if (typeof window !== "undefined") {
  window.addEventListener("themeChanged", () => {
    console.log("[chartComponent] 🎨 Theme changed, redrawing charts");

    // Update charts if available in window
    if (window.__charts && Array.isArray(window.__charts)) {
      updateAllChartAxisColors(window.__charts);
    }
  });
}
