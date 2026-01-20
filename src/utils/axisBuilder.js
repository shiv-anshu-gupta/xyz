/**
 * @file axisBuilder.js - Y-Axis Definition & Configuration Builder
 * @module axisBuilder
 * @category Architecture / Functional Approach
 * @since 2.0.0
 *
 * @description
 * Modular utility for building Y-axis configurations for uPlot charts.
 * Separates axis creation logic into reusable functions for both single
 * and multi-axis scenarios.
 *
 * **Role in Multi-Y-Axes Architecture:**
 * This module is the "renderer" that converts calculated axis requirements
 * into actual uPlot axis objects. It bridges the gap between:
 * - What we CALCULATED we need (from axisCalculator)
 * - What we're TOLD to create globally (from maxYAxesStore)
 * - What the CHART needs (uPlot axis definitions)
 *
 * ```
 * axisCalculator determines: "This group needs 2 axes"
 *             ↓
 * analyzeGroupsAndPublish publishes: "Global max is 2 axes"
 *             ↓
 * renderCharts reads maxYAxes = 2 and calls buildCompleteAxesArray()
 *             ↓
 * buildCompleteAxesArray creates actual Y-axis objects for uPlot
 * ```
 *
 * **Features:**
 * - Single Y-axis definition (for uniform single-unit groups)
 * - Multiple Y-axis definitions (for mixed-unit groups with global sync)
 * - Smart unit-based axis labeling with SI prefixes
 * - Theme color integration (reads CSS variables)
 * - Dynamic value formatter selection per axis
 *
 * **Key Insight: Global vs Local Axes**
 * - Local axisCount: How many this group actually needs
 * - maxYAxes (global): How many ALL charts should create for consistency
 * - finalAxisCount: max(axisCount, maxYAxes) → what we actually build
 *
 * This ensures all charts have the same visual height for Y-axes,
 * making group-to-group comparisons easier for the user.
 *
 * @example
 * import { buildCompleteAxesArray } from './axisBuilder.js';
 * import { getMaxYAxes } from './maxYAxesStore.js';
 *
 * const maxYAxes = getMaxYAxes(); // 2 (from global store)
 * const axes = buildCompleteAxesArray({
 *   xLabel: "Time",
 *   xUnit: "sec",
 *   xScale: 1,
 *   yLabels: ["Voltage", "Current"],
 *   yUnits: ["V", "A"],
 *   axesScales: [1, 1000, 1000], // [x-scale, y1-scale, y2-scale, ...]
 *   singleYAxis: false,
 *   maxYAxes: maxYAxes, // Force this global value
 * });
 * // Returns: [xAxis, yAxis1, yAxis2] even if group only needed 1
 */

import { getSiPrefix, makeAxisValueFormatter } from "./scaleUtils.js";
import { extractUnit } from "./helpers.js";
import { getChannelType, getAxisForType } from "./axisCalculator.js";

/**
 * Create a single Y-axis definition
 *
 * @function createSingleAxisDefinition
 * @category Axis Definition / Single-Axis
 *
 * @param {Object} config - Configuration object
 * @param {Array<string>} config.yLabels - Channel labels (e.g., ["Voltage Phase A", "Voltage Phase B"])
 * @param {Array<string>} config.yUnits - Channel units (e.g., ["V", "V"])
 * @param {number} config.scaleValue - Scale value for this axis (from axesScales[1])
 * @param {number} [config.labelIndex=0] - Which label to use for axis label
 * @returns {Object} uPlot axis configuration for single Y-axis
 *
 * @description
 * Builds a single Y-axis object suitable for uPlot charts.
 * Used when all channels are the same type (all voltage, all current, etc.)
 * and don't need axis splitting.
 *
 * **Features:**
 * - Automatic SI prefix application (µ, m, k, M for scaling)
 * - Theme color support via CSS variables (--chart-text, --chart-grid)
 * - Smart grid display with configurable stroke
 * - Value formatter based on unit and scale
 *
 * **Output Format:**
 * ```javascript
 * {
 *   scale: "y",          // uPlot scale key
 *   side: 3,             // Position on left side
 *   label: "(kV)",       // Axis label with SI prefix and unit
 *   stroke: () => ...,   // Dynamic color from theme
 *   grid: { show, stroke },
 *   values: function() {} // Custom value formatter
 * }
 * ```
 *
 * @example
 * const axis = createSingleAxisDefinition({
 *   yLabels: ["Current A", "Current B", "Current C"],
 *   yUnits: ["A", "A", "A"],
 *   scaleValue: 1000,
 *   labelIndex: 0  // Use first channel as label representative
 * });
 * // Returns: { scale: "y", label: "(kA)", ... }
 */

/**
 * Helper function to get theme-aware colors from CSS variables
 * @returns {Object} Color values from current theme
 */
function getThemeColors() {
  const root = document.documentElement;
  const computedStyle = getComputedStyle(root);

  return {
    axisStroke:
      computedStyle.getPropertyValue("--chart-axis").trim() || "#64748b",
    gridStroke:
      computedStyle.getPropertyValue("--chart-grid").trim() || "#cbd5e1",
    textColor:
      computedStyle.getPropertyValue("--chart-text").trim() || "#1e293b",
  };
}

export function createSingleAxisDefinition({
  yLabels,
  yUnits,
  scaleValue,
  labelIndex = 0,
}) {
  const unit = yUnits[labelIndex] || extractUnit(yLabels[labelIndex]);
  const siPrefix = getSiPrefix(scaleValue);
  const labelWithUnit = unit ? `(${siPrefix}${unit})` : yLabels[labelIndex];

  return {
    scale: "y",
    side: 3,
    label: labelWithUnit,
    stroke: () => getThemeColors().axisStroke,
    grid: {
      show: true,
      stroke: () => getThemeColors().gridStroke,
      width: 1,
    },

    values: makeAxisValueFormatter(unit, scaleValue),
  };
}

/**
 * Create multiple Y-axis definitions (one per axis)
 *
 * @function createMultiAxisDefinition
 * @category Axis Definition / Multi-Axis
 *
 * @param {Object} config - Configuration object
 * @param {Array<string>} config.yLabels - Channel labels
 * @param {Array<string>} config.yUnits - Channel units
 * @param {Array<number>} config.axesScales - Scale values for all axes ([xScale, y1Scale, y2Scale, ...])
 * @param {number} config.axisCount - Number of Y-axes to create (typically 1 or 2)
 * @param {number} [config.maxYAxes] - Optional: Override to create this many axes instead of axisCount
 * @returns {Array<Object>} Array of uPlot axis configurations
 *
 * @description
 * Builds multiple Y-axis objects for mixed-unit scenarios.
 * **Key Feature (v2.1):** Detects which axes are actually used by series and hides
 * unused axes while reserving space for visual alignment across all charts.
 *
 * **Why Hide Unused Axes?**
 * When maxYAxes > needed axes:
 * - G0 [V, V, V] naturally needs 1 axis, but global max is 2
 * - G1 [V, A] needs 2 axes
 * - Without hiding: G0 chart is narrower than G1 (different left padding)
 * - With hiding: Both reserve same left-side space, visually align
 *
 * **Algorithm:**
 * 1. Determine final axis count: use maxYAxes if provided, else axisCount
 * 2. Detect which axes series actually use via unit-type mapping
 * 3. For each axis i in [0, finalAxisCount):
 *    - If axis is used: show with proper label, unit, and grid
 *    - If axis is unused: hide (show: false) but reserve 60px space
 * 4. Return array of axis objects with mixed visibility
 *
 * **Example Scenarios:**
 * Single-voltage group with maxYAxes=2:
 * ```
 * usedAxes = {0}  // Only y0 is used (all voltage)
 * y0: { show: true, label: "(kV)", grid: true }
 * y1: { show: false, size: 60, label: "" }
 * ```
 *
 * Mixed V+A group with maxYAxes=2:
 * ```
 * usedAxes = {0, 1}  // Both y0 and y1 are used
 * y0: { show: true, label: "(kV)", grid: true }
 * y1: { show: true, label: "(kA)", grid: false }
 * ```
 *
 * @example
 * // Single-unit group with global max = 2
 * const axes = createMultiAxisDefinition({
 *   yLabels: ["Voltage A", "Voltage B", "Voltage C"],
 *   yUnits: ["V", "V", "V"],
 *   axesScales: [1, 1000, 1000, 1000],
 *   axisCount: 1,  // Only needs 1
 *   maxYAxes: 2    // But global requires 2
 * });
 * // Returns: [
 * //   { scale: "y0", show: true, label: "(kV)", grid: { show: true } },
 * //   { scale: "y1", show: false, size: 60, label: "", grid: { show: false } }
 * // ]
 */
export function createMultiAxisDefinition({
  yLabels,
  yUnits,
  axesScales,
  axisCount,
  maxYAxes,
}) {
  const axes = [];
  const finalAxisCount = maxYAxes !== undefined ? maxYAxes : axisCount;

  // ✅ PERFORMANCE: Only log in debug mode
  const debugMode =
    typeof localStorage !== "undefined" && localStorage.getItem("DEBUG_CHARTS");
  if (debugMode) {
    console.log("[createMultiAxisDefinition] Called with:", {
      yLabelsCount: yLabels.length,
      yUnits,
      axisCount,
      maxYAxes,
      finalAxisCount,
    });
  }

  // ✅ SPECIAL CASE: If maxYAxes=1, force all channels to use axis 0
  // This prevents current/power/frequency channels from mapping to non-existent axis 1
  let usedAxes = new Set();

  if (finalAxisCount === 1) {
    // Force all to axis 0
    usedAxes.add(0);
    if (debugMode) {
      console.log(
        `[createMultiAxisDefinition] maxYAxes=1: Forcing all channels to axis 0`
      );
    }
  } else {
    // Multi-axis mode: detect which axes are actually used
    yLabels.forEach((label, idx) => {
      const unit = yUnits[idx] || extractUnit(label);
      const type = getChannelType(unit);
      const axisIdx = getAxisForType(type) - 1; // 0-based (voltage→0, current→1)
      usedAxes.add(axisIdx);
      if (debugMode) {
        console.log(
          `  Channel ${idx}: unit="${unit}", type="${type}", axisIdx=${axisIdx}`
        );
      }
    });
  }

  if (debugMode) {
    console.log(
      `[createMultiAxisDefinition] Creating ${finalAxisCount} axes, ` +
        `${usedAxes.size} used: [${Array.from(usedAxes).join(", ")}]`
    );
  }

  for (let i = 0; i < finalAxisCount; i++) {
    const isUsedAxis = usedAxes.has(i);
    if (debugMode) {
      console.log(`  Creating axis ${i}: used=${isUsedAxis}`);
    }

    // Get representative channel for this axis
    let representativeUnit;
    let representativeScaleVal;

    if (isUsedAxis) {
      // Find first channel that maps to this axis
      const firstChannelIdx = yLabels.findIndex((label, idx) => {
        const unit = yUnits[idx] || extractUnit(label);
        const type = getChannelType(unit);
        const axisIdx = getAxisForType(type) - 1;
        return axisIdx === i;
      });

      representativeUnit =
        yUnits[firstChannelIdx] || extractUnit(yLabels[firstChannelIdx]);
      representativeScaleVal = axesScales[firstChannelIdx + 1] || 1;
    } else {
      // Dummy axis - use first channel's unit as placeholder
      representativeUnit = yUnits[0] || extractUnit(yLabels[0]);
      representativeScaleVal = axesScales[1] || 1;
    }

    const siPrefix = getSiPrefix(representativeScaleVal);
    const labelWithUnit = representativeUnit
      ? `(${siPrefix}${representativeUnit})`
      : yLabels[0];

    axes.push({
      scale: `y${i}`,
      side: 3,
      label: isUsedAxis ? labelWithUnit : "", // Empty label for unused axes
      show: true, // ✅ CRITICAL: Always show to reserve space (even if unused)
      size: 60, // Fixed width for alignment
      stroke: () => (isUsedAxis ? getThemeColors().axisStroke : "transparent"),
      grid: {
        show: isUsedAxis, // ✅ SHOW ON ALL USED AXES
        stroke: () => getThemeColors().gridStroke,
        width: i === 0 ? 1 : 0.5, // First axis thicker, others lighter
      },
      // ✅ NEW: Hide ticks and gap for unused axes
      ticks: {
        show: isUsedAxis,
        size: isUsedAxis ? 10 : 0,
      },
      gap: isUsedAxis ? 5 : 0,
      values: isUsedAxis
        ? makeAxisValueFormatter(representativeUnit, representativeScaleVal)
        : () => [], // No tick values for unused axes
    });
  }

  return axes;
}

/**
 * Build complete axes array including X-axis and Y-axes
 *
 * @function buildCompleteAxesArray
 * @category Axis Definition / Complete
 *
 * @param {Object} config - Configuration object
 * @param {string} config.xLabel - X-axis label (e.g., "Time")
 * @param {string} config.xUnit - X-axis unit (e.g., "sec")
 * @param {number} config.xScale - X-axis scale value (typically 1 for time)
 * @param {Array<string>} config.yLabels - Y-axis channel labels
 * @param {Array<string>} config.yUnits - Y-axis channel units
 * @param {Array<number>} config.axesScales - Scale values for all axes
 * @param {boolean} config.singleYAxis - Force single Y-axis mode
 * @param {number} [config.maxYAxes] - Global axis count override
 * @returns {Array<Object>} Complete axes array [xAxis, yAxis1, yAxis2, ...]
 *
 * @description
 * Top-level function that builds the complete axes array for a chart.
 * Combines X-axis definition with intelligently chosen Y-axes (single or multi).
 *
 * **Axis Count Decision Logic:**
 * ```
 * if (maxYAxes is specified) {
 *   axisCount = maxYAxes;  // Use global override
 * } else if (singleYAxis is true) {
 *   axisCount = 1;  // Force single axis
 * } else {
 *   axisCount = yLabels.length;  // Use natural count from channels
 * }
 * ```
 *
 * **Key Change in v2.0:**
 * Previously, singleYAxis would override everything.
 * Now, maxYAxes takes priority to ensure global synchronization.
 * This allows digital charts (which set singleYAxis=true for custom formatting)
 * to still respect the global axis count for visual consistency.
 *
 * **Return Format:**
 * ```javascript
 * [
 *   { scale: "x", ... },    // X-axis (time or index)
 *   { scale: "y0", ... },   // Y-axis 1
 *   { scale: "y1", ... },   // Y-axis 2 (if applicable)
 *   ...
 * ]
 * ```
 *
 * @example
 * // Mixed group with voltage and current
 * const axes = buildCompleteAxesArray({
 *   xLabel: "Time",
 *   xUnit: "sec",
 *   xScale: 1,
 *   yLabels: ["Voltage", "Current A", "Current B"],
 *   yUnits: ["V", "A", "A"],
 *   axesScales: [1, 1000, 1000, 1000],
 *   singleYAxis: false,
 *   maxYAxes: 2  // Global requirement
 * });
 * // Returns: [xAxis, yAxis1Voltage, yAxis2Current]
 *
 * @example
 * // Digital channels with singleYAxis=true but maxYAxes=2 from global
 * const axes = buildCompleteAxesArray({
 *   xLabel: "Time",
 *   xUnit: "sec",
 *   xScale: 1,
 *   yLabels: ["Digital Ch 1", "Digital Ch 2"],
 *   yUnits: ["", ""],
 *   axesScales: [1, 1],
 *   singleYAxis: true,   // Digital charts set this
 *   maxYAxes: 2          // But global max is 2, takes priority
 * });
 * // Returns: [xAxis, yAxis1, yAxis2Padded]
 * // Even though digital naturally needs 1, global sync requires 2
 */
export function buildCompleteAxesArray({
  xLabel,
  xUnit,
  xScale,
  yLabels,
  yUnits,
  axesScales,
  singleYAxis,
  maxYAxes,
}) {
  // Determine axis count
  // If maxYAxes is specified, use it UNLESS we truly need single axis mode
  let axisCount;
  if (maxYAxes !== undefined) {
    // Use maxYAxes for global synchronization across all charts
    axisCount = Math.max(1, maxYAxes);
  } else if (singleYAxis) {
    // Only use singleYAxis=1 if maxYAxes is NOT specified
    axisCount = 1;
  } else {
    // Otherwise use number of labels
    axisCount = yLabels.length;
  }

  // X-Axis
  const xAxis = {
    scale: "x",
    side: 2,
    label: `${xLabel}(${xUnit || "sec"})`,
    labelGap: 8,
    labelSize: 14,
    stroke: () => getThemeColors().axisStroke, // Match theme axis color
    gap: 5,
    grid: {
      show: true,
      stroke: () => getThemeColors().gridStroke,
    },
    ticks: {
      show: true,
      size: 10,
    },
    values: (u, splits) =>
      splits.map((v) => {
        const scaled = v * (xScale || 1);
        return scaled.toFixed(3);
      }),
  };

  // Y-Axes
  // ✅ CRITICAL FIX: When maxYAxes is set (even to 1), always use multi-axis definition
  // This ensures proper handling of different unit types even in single-axis mode
  const yAxes =
    singleYAxis && maxYAxes === undefined && axisCount === 1
      ? [
          createSingleAxisDefinition({
            yLabels,
            yUnits,
            scaleValue: axesScales[1] || 1,
            labelIndex: 0,
          }),
        ]
      : createMultiAxisDefinition({
          yLabels,
          yUnits,
          axesScales,
          axisCount,
          maxYAxes, // ← Pass maxYAxes so all charts have same axis count
        });

  return [xAxis, ...yAxes];
}

/**
 * Get axis count based on configuration
 *
 * @function getAxisCount
 * @category Axis Calculation
 * @param {number} yLabelsCount - Number of Y-series
 * @param {number} maxYAxes - Global max axes count
 * @param {boolean} singleYAxis - Force single-axis mode
 * @returns {number} Number of Y-axes to create (1, 2, 3, etc.)
 *
 * @description
 * Determines the final axis count for a chart based on:
 * - Global maxYAxes requirement (takes priority)
 * - Local singleYAxis flag
 * - Number of Y-series/labels
 *
 * **Decision Logic:**
 * 1. If maxYAxes is specified → use it (global sync requirement)
 * 2. Else if singleYAxis is true → use 1 (forced single axis)
 * 3. Else → use yLabelsCount (natural count from channels)
 *
 * This ensures global synchronization while respecting special cases.
 *
 * @example
 * getAxisCount(3, 2, false)  // Returns: 2 (use maxYAxes)
 * getAxisCount(3, 2, true)   // Returns: 2 (maxYAxes overrides singleYAxis)
 * getAxisCount(3, undefined, true)  // Returns: 1 (singleYAxis takes effect)
 * getAxisCount(3, undefined, false) // Returns: 3 (use yLabelsCount)
 */
export function getAxisCount(yLabelsCount, maxYAxes, singleYAxis) {
  // maxYAxes takes priority for global synchronization
  if (maxYAxes !== undefined) {
    return Math.max(1, maxYAxes);
  }
  // Only apply singleYAxis if maxYAxes is NOT specified
  if (singleYAxis) {
    return 1;
  }
  // Fall back to natural count from channels
  return Math.max(1, yLabelsCount);
}
