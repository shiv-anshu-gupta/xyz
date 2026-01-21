/**
 * @file autoUnitScalePlugin.js
 * @module Plugins/Chart
 *
 * @description
 * <h3>uPlot Plugin: Auto Unit & SI Prefix Scaling</h3>
 * 
 * <p>Automatically applies the best SI prefix (p, n, µ, m, k, M, G, T) to axis labels
 * and tick values based on the visible data range. Supports both X and Y axes with
 * user-configurable scale factors for unit conversion.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>Auto-Scaling</td><td>Dynamically selects SI prefix based on visible data magnitude</td></tr>
 *   <tr><td>User Override</td><td>axesScales allows manual unit conversion (mV→V, ms→s)</td></tr>
 *   <tr><td>Label Preservation</td><td>Original axis labels stored and restored with prefix updates</td></tr>
 *   <tr><td>Defensive Coding</td><td>Gracefully handles missing axis definitions and custom ticks</td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>SI Prefix Auto-Selection</strong> — p, n, µ, m, (base), k, M, G, T</li>
 *   <li><strong>Multi-Axis Support</strong> — Works with X and multiple Y axes</li>
 *   <li><strong>User Scale Factors</strong> — Multiply raw values before prefix selection</li>
 *   <li><strong>Dynamic Updates</strong> — Recalculates on zoom/pan via setScale hook</li>
 *   <li><strong>Label Format</strong> — Expects "Label (Unit)" format, e.g., "Voltage (V)"</li>
 * </ul>
 * 
 * <h4>User Scale Explanation</h4>
 * <p>The <code>axesScales</code> array provides multiplicative factors for each axis:</p>
 * <ul>
 *   <li><code>[1, 0.001, 1]</code> — Y0 axis data is in mV, display as V</li>
 *   <li><code>[0.001, 1, 1]</code> — X axis data is in ms, display as s</li>
 * </ul>
 * 
 * <h4>Limitations</h4>
 * <ul>
 *   <li>Assumes axis labels contain units in parentheses</li>
 *   <li>Does not support dynamic unit changes after chart creation</li>
 *   <li>Overrides any existing axis.values function</li>
 * </ul>
 * 
 * @see {@link module:utils/scaleUtils} - SI prefix calculation utilities
 * @see {@link module:utils/constants} - SI_UNITS table
 * 
 * @example
 * import autoUnitScalePlugin from './plugins/autoUnitScalePlugin.js';
 * 
 * const opts = {
 *   ...otherUplotOptions,
 *   plugins: [autoUnitScalePlugin({ axesScales: [1, 0.001, 1] })]
 *   // Y0 axis: data in mV, displayed as V with appropriate SI prefix
 * };
 * new uPlot(opts, data, target);
 * 
 * @mermaid
 * graph TD
 *     subgraph Plugin_Hooks
 *         A[init hook] --> B[Store original axis labels]
 *         B --> C[Setup axis.values functions]
 *         
 *         D[setScale hook] --> E[Get visible range]
 *         E --> F[Apply user scale factor]
 *         F --> G[Calculate best SI prefix]
 *         G --> H[Update axis label with prefix]
 *     end
 *     
 *     subgraph SI_Prefix_Selection
 *         I[Visible Range: 0.001 to 0.005] --> J[Apply userScale: 1]
 *         J --> K[Magnitude: ~0.003]
 *         K --> L[Select: m (milli)]
 *         L --> M[Label: Voltage mV]
 *     end
 *     
 *     subgraph Tick_Formatting
 *         N[Raw Value: 0.00345] --> O[Apply userScale]
 *         O --> P[Divide by SI prefix]
 *         P --> Q[Format: 3.45]
 *     end
 *     
 *     style A fill:#4CAF50,color:white
 *     style G fill:#2196F3,color:white
 *     style Q fill:#FF9800,color:white
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