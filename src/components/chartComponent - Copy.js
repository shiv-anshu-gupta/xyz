// uplotUtils.js

/**
 * Predefined set of colors for vertical lines and markers.
 */
import { getSiPrefix, makeAxisValueFormatter } from "../utils/scaleUtils.js";
import { extractUnit, getNearestIndex } from "../utils/helpers.js";
import { unwrap, createState } from "./createState.js";
import { calculateDeltas } from "../utils/calculateDeltas.js";
import { crosshairColors } from "../utils/constants.js";
import autoUnitScalePlugin from "../plugins/autoUnitScalePlugin.js";
import verticalLinePlugin from "../plugins/verticalLinePlugin.js";
import horizontalZoomPanPlugin from "../plugins/horizontalZoomPanPlugin.js";

/**
 * Factory Function to Generate uPlot Chart Options.
 * All major parameters should be arrays/values (no createState except for verticalLinesX).
 *
 * @param {Object} config - Configuration for chart.
 * @param {string} config.title - Chart title (string).
 * @param {string[]} config.yLabels - Labels for Y-series (array).
 * @param {string[]} config.lineColors - Stroke colors for series (array).
 * @param {number[]|object} config.verticalLinesX - Reference array for vertical lines plugin (array or createState).
 * @param {string} [config.xLabel] - Label for x-axis (string).
 * @param {number} [config.width] - Width of the chart.
 * @param {number} [config.height] - Height of the chart.
 * @param {function} [config.getCharts] - Optional getter for all charts.
 * @param {string[]} [config.yUnits] - Array of units for each y axis (array).
 * @param {number[]} [config.scales] - Array of scale factors for each y axis (array).
 * @param {boolean} [config.singleYAxis] - If true, use only one y axis for all series; if false, use multiple y axes (default: false)
 * @param {Object} [config.autoScaleUnit] - Auto scale units for x and y axes (default: { x: true, y: true })
 * @returns {Object} uPlot options.
 */
export function createChartOptions({
  title,
  yLabels,
  lineColors,
  verticalLinesX,
  xLabel = "",
  xUnit,
  width = 400,
  height = 200,
  getCharts = null, // Optional getter for all charts
  yUnits = [],
  axesScales = [], // Optional: scales for axes, e.g. { x: 1, y0: 1, y1: 1 }\\
  scales = {}, // Unified: scales[0] is x, rest are y
  select = { show: true },
  singleYAxis = true,
  autoScaleUnit = { x: true, y: true }, // NEW: default autoScaleUnit
}) {
  // Only verticalLinesX may be a createState object, others are plain values/arrays
  const verticalLinesXVal = unwrap(verticalLinesX);

  // xScale is now always axesScales[0]
  const xScaleVal = axesScales[0] || 1;

  return {
    title,
    width,
    height,
    scales:
      Object.keys(scales).length > 0
        ? scales
        : {
            x: { time: false, auto: true },
            ...yLabels.reduce((acc, _, idx) => {
              acc[`y${idx}`] = { auto: true };
              return acc;
            }, {}),
          },
    series: [
      {},
      ...yLabels.map((label, idx) => ({
        label,
        stroke: lineColors[idx % lineColors.length],
        width: 1,
        scale: singleYAxis ? "y" : `y${idx}`,
        points: {
          size: 4,
          fill: "white",
          stroke: lineColors[idx % lineColors.length],
        },
      })),
    ],
    axes: [
      {
        scale: "x",
        side: 2,
        label: `${xLabel}(${xUnit})`,
        grid: { show: true },
        values: makeAxisValueFormatter(
          xUnit || extractUnit(xLabel) || "sec",
          xScaleVal
        ),
      },
      ...(singleYAxis
        ? [
            {
              scale: "y",
              side: 3,
              label: (() => {
                const unit = yUnits[0] || extractUnit(yLabels[0]);
                const scaleVal = axesScales[1] || 1;
                const siPrefix = getSiPrefix(scaleVal);
                return unit ? `(${siPrefix}${unit})` : yLabels[0];
              })(),
              grid: { show: true },
              values: makeAxisValueFormatter(
                yUnits[0] || extractUnit(yLabels[0]),
                axesScales[1] || 1
              ),
            },
          ]
        : yLabels.map((label, idx) => {
            const unit = yUnits[idx] || extractUnit(label);
            const scaleVal = axesScales[idx + 1] || 1;
            const siPrefix = getSiPrefix(scaleVal);
            const labelWithUnit = unit ? `(${siPrefix}${unit})` : label;
            return {
              scale: `y${idx}`,
              side: idx % 2 === 0 ? 3 : 1,
              label: labelWithUnit,
              grid: { show: idx === 0 },
              values: makeAxisValueFormatter(unit, scaleVal),
            };
          })),
    ],
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
