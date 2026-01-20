/**
 * @file seriesMapper.js - Series-to-Axis Mapping & Configuration
 * @module seriesMapper
 * @category Architecture / Functional Approach
 * @since 2.0.0
 *
 * @description
 * Modular utility for mapping data series to Y-axes in uPlot charts.
 * Handles intelligent axis assignment based on channel types and units.
 *
 * **Role in Multi-Y-Axes Architecture:**
 * When maxYAxes > 1, we need to decide which axis each series uses.
 * This module provides that mapping logic.
 *
 * Two mapping strategies:
 * 1. **Natural Mapping:** Series i → axis i (when maxYAxes undefined)
 *    - Use when each group naturally has different unit types
 *    - Example: [V, A, W] → each on separate axis
 *
 * 2. **Unit-Based Mapping:** By channel type (when maxYAxes defined)
 *    - Group compatible units together
 *    - Voltage → axis 0, Current/Power/Frequency → axis 1
 *    - Ensures single-unit groups don't arbitrarily split
 *    - Empty axes remain for visual consistency
 *
 * **Features:**
 * - Unit-based axis mapping (voltage→axis 0, current→axis 1, etc.)
 * - Single vs multi-axis configuration
 * - Smart fallback to series index when type mapping unavailable
 * - Line color cycling
 * - Scale definition generation for all Y-axes
 *
 * @example
 * import { createSeriesDefinitions } from './seriesMapper.js';
 * const series = createSeriesDefinitions({
 *   yLabels: ["Voltage", "Current A", "Current B"],
 *   lineColors: ["#FF0000", "#00FF00", "#0000FF"],
 *   yUnits: ["V", "A", "A"],
 *   singleYAxis: false,
 *   maxYAxes: 2  // Group by type, not by index
 * });
 * // Returns:
 * // [
 * //   { label: "Voltage", scale: "y0", ... },      // Voltage on axis 0
 * //   { label: "Current A", scale: "y1", ... },    // Current on axis 1
 * //   { label: "Current B", scale: "y1", ... }     // Current on axis 1
 * // ]
 */

import { extractUnit } from "./helpers.js";
import { getChannelType, getAxisForType } from "./axisCalculator.js";

/**
 * Create Y-series definitions for uPlot chart
 *
 * @function createSeriesDefinitions
 * @category Series Configuration
 *
 * @param {Object} config - Configuration object
 * @param {Array<string>} config.yLabels - Channel/series labels
 * @param {Array<string>} config.lineColors - Line colors for each series
 * @param {Array<string>} [config.yUnits=[]] - Channel units for axis mapping
 * @param {boolean} [config.singleYAxis=true] - Force all series to single axis
 * @param {number} [config.maxYAxes] - Global max axes count (activates smart mapping)
 * @returns {Array<Object>} Array of uPlot series configurations
 *
 * @description
 * Defines each Y-series (data line) in the chart, including which axis it uses.
 *
 * **Series Mapping Logic:**
 * 1. If singleYAxis=true → all series use "y" (single axis)
 * 2. Else if maxYAxes=undefined → use natural mapping (series[i] → y[i])
 * 3. Else if maxYAxes is defined → **smart unit-based mapping**:
 *    - Voltage series → y0 (axis 1)
 *    - Current/Power/Frequency series → y1 (axis 2)
 *    - This groups compatible units together
 *
 * **Why Unit-Based Mapping?**
 * When maxYAxes > natural axis count, we still want proper grouping:
 * - A single-voltage chart with maxYAxes=2 shouldn't arbitrarily split voltage
 * - Instead, all voltages stay on y0 (axis 1)
 * - Axis 2 (y1) remains empty but visible for consistency
 *
 * **Return Format:**
 * ```javascript
 * {
 *   label: "Channel Name",
 *   stroke: "#color",
 *   scale: "y" or "y0" or "y1",  // Which axis to use
 *   width: 1,
 *   points: { size, fill, stroke }
 * }
 * ```
 *
 * @example
 * // Single-axis mode (digital channels)
 * const series = createSeriesDefinitions({
 *   yLabels: ["Digital 1", "Digital 2", "Digital 3"],
 *   lineColors: ["#red", "#blue", "#green"],
 *   singleYAxis: true
 * });
 * // All series use scale: "y" (single axis)
 *
 * @example
 * // Multi-axis with unit-based mapping
 * const series = createSeriesDefinitions({
 *   yLabels: ["Voltage", "Current A", "Current B"],
 *   lineColors: ["#red", "#blue", "#green"],
 *   yUnits: ["V", "A", "A"],
 *   maxYAxes: 2
 * });
 * // Returns:
 * // - Voltage → scale: "y0" (voltage maps to axis 1 = y0)
 * // - Current A → scale: "y1" (current maps to axis 2 = y1)
 * // - Current B → scale: "y1" (current maps to axis 2 = y1)
 */
export function createSeriesDefinitions({
  yLabels,
  lineColors,
  yUnits = [],
  singleYAxis = true,
  maxYAxes,
}) {
  // ✅ PERFORMANCE: Only log in debug mode (check localStorage)
  const debugMode =
    typeof localStorage !== "undefined" && localStorage.getItem("DEBUG_CHARTS");
  if (debugMode && yLabels.length > 0) {
    console.log(
      `[createSeriesDefinitions] Mapping ${yLabels.length} series: ` +
        `singleYAxis=${singleYAxis}, maxYAxes=${maxYAxes}`
    );
  }

  // First series (index 0) is X-axis, so data series start at index 1
  // Return array of Y-series configs
  return yLabels.map((label, idx) => {
    // ✅ CRITICAL FIX: Determine which axis this series belongs to
    let seriesAxisIdx;

    // ✅ NEW LOGIC: If maxYAxes=1, FORCE all series to axis 0
    // This prevents current/power/frequency from mapping to non-existent y1
    if (maxYAxes === 1) {
      seriesAxisIdx = 0;
    } else if (singleYAxis) {
      seriesAxisIdx = 0;
    } else if (maxYAxes !== undefined) {
      // Multi-axis mode: map by channel type
      const unit = yUnits[idx] || extractUnit(label);
      const type = getChannelType(unit);
      seriesAxisIdx = getAxisForType(type) - 1; // Convert from 1-based to 0-based
    } else {
      // Natural mapping
      seriesAxisIdx = idx;
    }

    const scaleKey = singleYAxis ? "y" : `y${seriesAxisIdx}`;

    return {
      label,
      stroke: lineColors[idx % lineColors.length],
      width: 1,
      scale: scaleKey,
      points: {
        size: 4,
        fill: "white",
        stroke: lineColors[idx % lineColors.length],
      },
    };
  });
}

/**
 * Get the axis index for a specific series
 *
 * @function getSeriesAxisIndex
 * @category Series Configuration
 *
 * @param {number} seriesIndex - 0-based index in yLabels/yUnits arrays
 * @param {Array<string>} yLabels - All channel labels
 * @param {Array<string>} yUnits - All channel units (for type mapping)
 * @param {boolean} singleYAxis - Whether single-axis mode is forced
 * @param {number} [maxYAxes] - Global max axes count (enables smart mapping)
 * @returns {number} 0-based axis index (0 for y0, 1 for y1, etc.)
 *
 * @description
 * Determines which Y-axis a specific series should be plotted on.
 * Similar logic to createSeriesDefinitions but for a single series.
 *
 * **Mapping Rules:**
 * 1. If singleYAxis=true → always return 0 (use y0)
 * 2. Else if maxYAxes is undefined → return seriesIndex (natural mapping)
 * 3. Else if maxYAxes is defined → map by unit type:
 *    - Voltage units → axis 0 (y0)
 *    - Current/Power/Frequency → axis 1 (y1)
 *
 * **Use Case:**
 * Used when needing to query which axis a series is on,
 * or when updating data mapping dynamically.
 *
 * @example
 * const axisIdx = getSeriesAxisIndex(
 *   2,                                      // series 2
 *   ["V", "A", "A"],                       // yLabels
 *   ["Voltage", "Current A", "Current B"], // yUnits
 *   false,                                  // not singleYAxis
 *   2                                       // maxYAxes=2
 * );
 * // Returns: 1 (series 2 is current, which maps to axis 1)
 */
export function getSeriesAxisIndex(
  seriesIndex,
  yLabels,
  yUnits,
  singleYAxis,
  maxYAxes
) {
  if (singleYAxis) return 0;
  if (!maxYAxes) return seriesIndex;

  // Map by channel type
  const unit = yUnits[seriesIndex] || extractUnit(yLabels[seriesIndex]);
  const type = getChannelType(unit);
  return getAxisForType(type) - 1; // Convert from 1-based to 0-based
}

/**
 * Create scale definitions for all Y-axes
 *
 * @function createYAxisScales
 * @category Scale Configuration
 *
 * @param {number} axisCount - Number of Y-axes to create
 * @returns {Object} Object mapping axis names to scale definitions
 *
 * @description
 * Creates the scale configuration object for uPlot's scales parameter.
 * Each axis gets its own scale with auto-scaling enabled.
 *
 * **Output Format:**
 * ```javascript
 * {
 *   y0: { auto: true },    // First Y-axis
 *   y1: { auto: true },    // Second Y-axis
 *   y2: { auto: true },    // Third Y-axis (if axisCount >= 3)
 *   ...
 * }
 * ```
 *
 * **Auto-Scaling:**
 * Each axis has `auto: true`, meaning uPlot will automatically determine
 * min/max values based on the data plotted on that axis.
 * This ensures each axis properly scales to fit its data.
 *
 * **uPlot Integration:**
 * These scales are passed to uPlot via:
 * ```javascript
 * const opts = {
 *   scales: {
 *     x: { time: false, auto: true },
 *     ...createYAxisScales(2)  // Adds y0, y1
 *   }
 * };
 * ```
 *
 * @example
 * const scales = createYAxisScales(2);
 * // Returns: { y0: { auto: true }, y1: { auto: true } }
 *
 * @example
 * const scales = createYAxisScales(3);
 * // Returns: { y0: { auto: true }, y1: { auto: true }, y2: { auto: true } }
 */
export function createYAxisScales(axisCount) {
  const yScales = {};
  for (let i = 0; i < axisCount; i++) {
    yScales[`y${i}`] = {
      auto: true,
      range: (u, min, max) => {
        // If no series use this scale, return fixed range to prevent errors
        if (min == null || max == null) {
          return [0, 1]; // Dummy range for unused axes
        }
        return [min, max];
      },
    };
  }
  return yScales;
}
