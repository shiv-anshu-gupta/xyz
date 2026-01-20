/**
 * uPlot Plugin: Auto Unit & SI Prefix Scaling
 *
 * Features:
 * - Automatically applies the best SI prefix (e.g., m, k, M) to axis labels and tick values based on data range.
 * - Supports both x and y axes, and multiple y axes.
 * - Customizable user scaling for each axis.
 * - Preserves original axis label and unit for correct relabeling.
 * - Robust to missing or custom axis/tick definitions.
 * - Defensive programming for safe integration.
 *
 * Nuances, Limitations, and Known Issues:
 * - Assumes axis labels contain units in parentheses, e.g., 'Voltage (V)'.
 * - If axis.ticks is not a function, falls back to 8 evenly spaced ticks.
 * - User scale (opts.axesScales) must be an array: [xScale, y0Scale, y1Scale, ...].
 *   - userScale is a multiplicative factor applied to the raw axis values before SI prefix selection and tick label formatting.
 *   - For example, if your data is in millivolts but you want to display as volts, set userScale to 0.001 for that axis.
 *   - This allows you to convert or normalize units (e.g., from ms to s, or from kA to A) for display, without modifying your raw data.
 *   - The plugin will then choose the best SI prefix for the scaled values, and update axis labels and tick values accordingly.
 * - If axis label/unit is missing, SI prefix is still applied but unit may be omitted.
 * - Does not support dynamic unit changes after chart creation (unless axis.label is reset externally).
 * - If axis.values is already set by another plugin, this will override it.
 *
 * @param {Object} [opts]
 *   Plugin options.
 * @param {number[]} [opts.axesScales] - User scale factors for axes: [xScale, y0Scale, y1Scale, ...].
 *   - Each entry is a multiplicative factor for the corresponding axis (see above for details).
 *
 * @returns {Object} uPlot plugin object with hooks for init, setScale, and ready.
 *
 * @example <caption>Basic usage</caption>
 * import autoUnitScalePlugin from './plugins/autoUnitScalePlugin.js';
 *
 * const opts = {
 *   ...otherUplotOptions,
 *   plugins: [autoUnitScalePlugin({ scales: [1, 0.001, 1] })] // e.g., y0 axis in mV, display as V
 * };
 * new uPlot(opts, data, target);
 */
import { extractUnit } from "../utils/helpers.js";
import { getSiPrefix } from "../utils/scaleUtils.js";
import { SI_UNITS } from "../utils/constants.js";

function getUserScale(userScales, scaleKey) {
  /**
   * Get the user scale for a given axis.
   * @param {number[]} userScales - Array of user scale factors.
   * @param {string} scaleKey - Axis scale key (e.g., 'x', 'y0').
   * @returns {number} The scale factor for the axis.
   */
  if (scaleKey === "x") return userScales[0] || 1;
  if (scaleKey.startsWith("y")) {
    const idx = parseInt(scaleKey.slice(1), 10);
    return userScales[idx + 1] || 1;
  }
  return 1;
}

function getTickVals(axis, u, scaleKey, scale) {
  /**
   * Get tick values for an axis.
   * @param {Object} axis - uPlot axis object.
   * @param {Object} u - uPlot chart instance.
   * @param {string} scaleKey - Axis scale key.
   * @param {Object} scale - uPlot scale object.
   * @returns {number[]} Array of tick values.
   */
  if (typeof axis.ticks === "function") {
    return axis.ticks(u, scaleKey, scale.min, scale.max);
  }
  // Fallback: generate 8 ticks evenly spaced
  const n = 8;
  const step = (scale.max - scale.min) / (n - 1);
  return Array.from({ length: n }, (_, i) => scale.min + i * step);
}

function findBestSiUnit(tickVals, userScale) {
  /**
   * Find the best SI unit for tick values.
   * @param {number[]} tickVals - Array of tick values.
   * @param {number} userScale - User scale factor for the axis.
   * @returns {Object} The best SI unit object.
   */
  let bestIdx = 0;
  for (let siIdx = 0; siIdx < SI_UNITS.length; ++siIdx) {
    const scaledTicks = tickVals.map(v => v * userScale / SI_UNITS[siIdx].value);
    let minDiff = Infinity;
    for (let i = 1; i < scaledTicks.length; ++i) {
      let diff = Math.abs(scaledTicks[i] - scaledTicks[i - 1]);
      if (diff < minDiff) minDiff = diff;
    }
    if (minDiff > 0.5) bestIdx = siIdx;
  }
  return SI_UNITS[bestIdx];
}

// Helper: format tick label (first/last full, others LSB digits, configurable decimals)
function defaultTickLabelFormatter(scaled, i, total, lsbDigits = 3, decimals = 1) {
  /**
   * Default tick label formatter for the axis.
   * @param {number} scaled - The scaled tick value.
   * @param {number} i - The index of the tick.
   * @param {number} total - Total number of ticks.
   * @param {number} [lsbDigits=3] - Number of least significant digits for inner ticks.
   * @param {number} [decimals=1] - Number of decimals for formatting.
   * @returns {string} The formatted tick label.
   */
  if (i === 0 || i === total - 1) {
    return scaled.toFixed(decimals);
  }
  const absStr = Math.abs(scaled.toFixed(decimals)).toString();
  const lsb = absStr.slice(-lsbDigits);
  return (scaled < 0 ? '-' : '') + lsb;
}

function autoScaleAxis(u, scaleKey, userScales, lsbDigits = 3, decimals = 1, tickLabelFormatter, autoScaleUnit) {
  /**
   * Automatically scale axis and update label/formatter.
   * @param {Object} u - uPlot chart instance.
   * @param {string} scaleKey - Axis scale key.
   * @param {number[]} userScales - Array of user scale factors.
   * @param {number} [lsbDigits=3] - Number of least significant digits for inner ticks.
   * @param {number} [decimals=1] - Number of decimals for formatting.
   * @param {Function} [tickLabelFormatter] - Custom tick label formatter.
   * @param {Object} [autoScaleUnit] - Object with x/y boolean flags for scaling.
   */
  const scale = u.scales[scaleKey];
  const axis = u.axes.find(a => a.scale === scaleKey);
  if (!axis || !scale) return;
  // Check autoScaleUnit property
  if (autoScaleUnit) {
    if (scaleKey === 'x' && autoScaleUnit.x === false) return;
    if (scaleKey.startsWith('y') && autoScaleUnit.y === false) return;
  }

  // Store the original label and unit if not already done
  if (!axis._labelOriginal) {
    axis._labelOriginal = axis.label || "";
    axis._unitOriginal = extractUnit(axis._labelOriginal);
  }

  const userScale = getUserScale(userScales, scaleKey);
  const tickVals = getTickVals(axis, u, scaleKey, scale);
  const bestSi = findBestSiUnit(tickVals, userScale);

  // Update axis label with SI prefix and original unit
  const baseLabel = axis._labelOriginal.split("(")[0].trim();
  const unit = axis._unitOriginal || "";
  axis.label = unit ? `${baseLabel} (${bestSi.symbol}${unit})` : baseLabel;

  // Update axis value formatter: use custom or default formatter
  axis.values = (u, vals) => {
    if (!Array.isArray(vals) || vals.length === 0) return [];
    return vals.map((v, i) => {
      const scaled = (v * userScale / bestSi.value);
      if (typeof tickLabelFormatter === 'function') {
        return tickLabelFormatter(scaled, i, vals.length, lsbDigits, decimals);
      }
      return defaultTickLabelFormatter(scaled, i, vals.length, lsbDigits, decimals);
    });
  };
}

/**
 * uPlot Plugin: Auto Unit & SI Prefix Scaling
 * @param {Object} [opts]
 *   @param {number[]} [opts.axesScales] - User scale factors for axes: [xScale, y0Scale, y1Scale, ...].
 *   @param {number} [opts.lsbDigits=3] - Number of least significant digits for inner ticks.
 *   @param {number} [opts.decimals=1] - Number of decimals for formatting.
 *   @param {Function} [opts.tickLabelFormatter] - Custom tick label formatter: (scaled, i, total, lsbDigits, decimals) => string
 *   @param {Object} [opts.autoScaleUnit] - Object with x/y boolean flags for scaling (e.g., {x: true, y: false})
 * @returns {Object} uPlot plugin object
 */
export default function autoUnitScalePlugin(opts = {}) {
  /**
   * uPlot Plugin: Auto Unit & SI Prefix Scaling
   * @param {Object} [opts]
   *   @param {number[]} [opts.axesScales] - User scale factors for axes: [xScale, y0Scale, y1Scale, ...].
   *   @param {number} [opts.lsbDigits=3] - Number of least significant digits for inner ticks.
   *   @param {number} [opts.decimals=1] - Number of decimals for formatting.
   *   @param {Function} [opts.tickLabelFormatter] - Custom tick label formatter: (scaled, i, total, lsbDigits, decimals) => string
   *   @param {Object} [opts.autoScaleUnit] - Object with x/y boolean flags for scaling (e.g., {x: true, y: false})
   * @returns {Object} uPlot plugin object
   */
  const userScales = Array.isArray(opts.axesScales) ? opts.axesScales : [];
  const lsbDigits = typeof opts.lsbDigits === 'number' ? opts.lsbDigits : 3;
  const decimals = typeof opts.decimals === 'number' ? opts.decimals : 1;
  const tickLabelFormatter = typeof opts.tickLabelFormatter === 'function' ? opts.tickLabelFormatter : undefined;
  const autoScaleUnit = typeof opts.autoScaleUnit === 'object' ? opts.autoScaleUnit : { x: true, y: true };

  return {
    id: 'autoUnitScalePlugin',
    hooks: {
      init: u => {
        u.axes.forEach(axis => {
          if (!axis._labelOriginal) {
            axis._labelOriginal = axis.label || "";
            axis._unitOriginal = extractUnit(axis._labelOriginal);
          }
        });
      },
      setScale: (u, scaleKey) => {
        autoScaleAxis(u, scaleKey, userScales, lsbDigits, decimals, tickLabelFormatter, autoScaleUnit);
      },
      ready: u => {
        if (autoScaleUnit.x !== false) autoScaleAxis(u, "x", userScales, lsbDigits, decimals, tickLabelFormatter, autoScaleUnit);
        u.axes.forEach(axis => {
          if (axis.scale.startsWith("y") && autoScaleUnit.y !== false) autoScaleAxis(u, axis.scale, userScales, lsbDigits, decimals, tickLabelFormatter, autoScaleUnit);
        });
      }
    }
  };
}
// This plugin automatically applies SI prefixes to axis labels and tick values
// based on the data range, enhancing readability and usability of uPlot charts.