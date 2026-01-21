import {
  calculateAxisCountsForAllGroups,
  didAxisCountChange,
} from "../utils/axisCalculator.js";

/**
 * @module Components/ChartCore
 * @description
 * Central reactive state manager for chart updates in the COMTRADE charting application.
 * Bridges between user-triggered state changes (via Tabulator editor) and uPlot chart
 * rendering. Provides intelligent update strategies: in-place updates for simple changes
 * (colors, labels) and full re-rendering for structural changes (channel add/remove, grouping).
 *
 * Key Responsibilities:
 * - Subscribe to reactive state (channelState, dataState, verticalLinesX)
 * - Detect change types: simple (label/color) vs structural (add/remove/group)
 * - Apply in-place updates for performance when possible
 * - Recreate charts on structural changes
 * - Handle amplitude inversion for selected channels
 * - Apply time-window filtering (start/duration)
 * - Manage vertical line overlays and delta calculations
 * - Publish maxYAxes changes to global store for all charts to consume
 * - Use analyzeGroupsAndPublishMaxYAxes() for functional group analysis
 *
 * Features:
 * - Automatic chart update on state mutation
 * - Dual-chart support (analog and digital)
 * - Time-windowing with start/duration filtering
 * - Series inversion with in-place optimization
 * - Deltastate-based change detection
 * - Fallback from in-place to full rebuild on errors
 * - Debug logging via debugPanelLite
 * - Global axis alignment published to centralized store via functional approach
 *
 * Dependencies:
 * - chartComponent.js: createChartOptions factory
 * - renderComtradeCharts.js: Full chart reconstruction
 * - debugPanelLite.js: Console debug logging
 * - createState.js: Reactive state management
 * - analyzeGroupsAndPublish.js: Pure function to analyze & publish axes
 *
 * @example
 * import { subscribeChartUpdates } from './components/chartManager.js';
 *
 * // After initializing state and rendering charts
 * subscribeChartUpdates(
 *   channelState,           // { analog: {...}, digital: {...} }
 *   dataState,              // { analog: [...], digital: [...] }
 *   charts,                 // [analogChart, digitalChart]
 *   chartsContainer,        // DOM element
 *   verticalLinesX          // Reactive array of marker positions
 * );
 *
 * // Now any changes trigger automatic updates:
 * channelState.analog.lineColors[0] = '#FF0000';  // Color change -> in-place update
 * channelState.analog.yLabels[0] = 'New Label';   // Label change -> in-place update
 * channelState.analog.groups[0] = 1;              // Group change -> full rebuild + publish axes to store
 */

/**
 * chartManager.js
 *
 * Purpose:
 *   Provides the main chart reactivity and update logic for the COMTRADE charting app.
 *   Handles efficient chart updates in response to state changes (channels, data, overlays).
 *   Integrates with uPlot for fast, interactive chart rendering.
 *
 * Features:
 *   - Subscribes to channel state and data state changes using the custom createState system.
 *   - Updates chart series colors and labels live (without full re-creation) when possible.
 *   - Recreates charts when structural channel changes occur (axes, order, units, etc).
 *   - Recreates charts when data changes (e.g., new file loaded).
 *   - Updates overlays (vertical lines) when their state changes.
 *   - Warns in the console if state/data is missing or malformed.
 *
 * Parameters:
 *   @param {Object} channelState - Reactive state for channel metadata (labels, colors, units, etc).
 *   @param {Object} dataState    - Reactive state for chart data (analog and digital arrays).
 *   @param {Array}  charts       - Array of uPlot chart instances [analogChart, digitalChart].
 *   @param {HTMLElement} chartsContainer - DOM element containing chart containers.
 *   @param {Object} verticalLinesX - Reactive state for vertical line overlays.
 *
 * Usage Example:
 *   import { subscribeChartUpdates } from './components/chartManager.js';
 *   // ...after initializing state and rendering charts...
 *   subscribeChartUpdates(channelState, dataState, charts, chartsContainer, verticalLinesX);
 *
 *   // Now, any changes to channelState or dataState will automatically update the charts.
 */

import { createChartOptions } from "./chartComponent.js";
// Use global uPlot if loaded via <script> in index.html
const uPlot = window.uPlot;
import { debugLite } from "./debugPanelLite.js";
import { renderComtradeCharts } from "./renderComtradeCharts.js";
import { loadComputedChannelsFromStorage } from "../utils/computedChannelStorage.js";


// Defensive: ensure uPlot is available to avoid runtime errors during subscription wiring
if (!uPlot) {
  console.warn(
    "[chartManager] window.uPlot is not available. Ensure uPlot.iife.js is loaded before modules."
  );
}

/**
 * Subscribe chart manager to reactive state changes.
 *
 * Establishes bidirectional reactive binding between channelState/dataState and
 * uPlot chart instances. Automatically updates charts when state mutates.
 *
 * Update Strategy:
 * - Check if change is structural (groups/units/order) -> full rebuild
 * - Check if change is cosmetic (colors/labels) -> in-place update
 * - Check if data changed -> full rebuild
 * - Check if vertical lines changed -> overlay update only
 *
 * In-place Updates (Performance-Critical):
 * - Series colors: Sets `chart.series[i].stroke`
 * - Series labels: Sets `chart.series[i].label`
 * - Both trigger via `chart.setSize()` to refresh
 *
 * Full Rebuild Operations:
 * - Adds/removes channels
 * - Changes grouping strategy
 * - Modifies units or scales
 * - Data array dimensions change
 * - Inverts series amplitude
 *
 * subscribeChartUpdates(channelState, dataState, charts, chartsContainer, verticalLinesX)
 *
 * Subscribes the chart manager to reactive state and maps channel-level
 * messages to uPlot updates. This function is the central bridge between the
 * `channelState` (mutations produced by Tabulator via the parent message
 * handler) and the uPlot instances that render the data.
 *
 * Key responsibilities:
 * - Maintain in-place updates for cheap operations (color, label) when possible.
 * - Recreate charts on structural changes (channel add/remove, grouping, axes).
 * - Apply x-axis windows when `start`/`duration` are provided and a time array
 *   is available in `dataState`.
 * - Handle `invert` toggles: attempt an in-place amplitude inversion on the
 *   affected series (works for series-only arrays as well as the uPlot-style
 *   `[time, ...series]` shape); fallback to recreate if unsafe.
 *
 * @function subscribeChartUpdates
 * @param {Object} channelState - Reactive channel metadata store. Expected shape:
 *   { analog: { yLabels: string[], lineColors: string[], channelIDs: string[], inverts: boolean[], groups: number[], units: string[], ... },
 *     digital: { yLabels: string[], lineColors: string[], ... } }
 * @param {Object} dataState - Reactive data arrays. Each type (`analog`/`digital`)
 *   normally follows uPlot's shape: either `[timeArray, series0, series1, ...]`
 *   or (in some legacy flows) series-only arrays. The manager detects the
 *   presence of a leading time array before acting on `start`/`duration`.
 * @param {uPlot[]} charts - Array of uPlot chart instances matching types [analog, digital].
 *   Each chart is expected to expose a `_channelIndices` array mapping chart-series
 *   positions (0-based) -> global channel indices in `channelState`.
 * @param {HTMLElement} chartsContainer - Parent DOM container for charts.
 * @param {Object} verticalLinesX - Reactive state holding vertical-line positions.
 * @param {Object} [cfg] - Optional config passed through to renderers.
 * @param {Object} [data] - Optional raw parsed data object.
 * @param {Function} [createState] - Optional state factory passed to renderers.
 * @param {Function} [calculateDeltas] - Optional helper for delta calculations.
 * @param {string} [TIME_UNIT] - Optional time unit string used by renderers.
 * @returns {void}
 *
 * @example
 * // Basic subscription after chart creation
 * subscribeChartUpdates(
 *   channelState,
 *   dataState,
 *   charts,
 *   document.getElementById('charts-container'),
 *   verticalLinesX
 * );
 *
 * @example
 * // State mutation triggering automatic color update
 * // Before: channelState.analog.lineColors = ['#FF0000', '#00FF00', '#0000FF']
 * channelState.analog.lineColors[0] = '#FF1111';  // Slight color shift
 * // After: All analog charts automatically update (in-place, no rebuild)
 *
 * @example
 * // Structural change triggering full rebuild
 * // Before: 3 analog channels displayed
 * channelState.analog.yLabels.splice(1, 1);      // Remove middle channel
 * channelState.analog.lineColors.splice(1, 1);
 * // After: Charts fully rebuilt with 2 channels, vertical lines refreshed
 *
 * @example
 * // Amplitude inversion (in-place if possible)
 * // Before: channelState.analog.inverts = [false, false, false]
 * channelState.analog.inverts[0] = true;         // Invert first channel
 * // After: First series amplitude inverted in-place
 */
export function subscribeChartUpdates(
  channelState,
  dataState,
  charts,
  chartsContainer,
  verticalLinesX,
  cfg, // ✅ add
  data, // ✅ add
  createState, // ✅ add
  calculateDeltas, // ✅ add
  TIME_UNIT, // ✅ add
  getProgressCallback // ✅ NEW: Function to get current progress callback
) {
  const chartTypes = ["analog", "digital"];

  // Debounce group changes to prevent multiple rapid rebuilds
  let groupChangeTimeout = null;
  let isRebuildingFromGroup = false;

  // Store chart metadata for reuse detection
  let chartMetadata = {};

  // Store PREVIOUS group state to detect changes (needed for smart merge)
  let previousGroups = { analog: [], digital: [] };

  // ✅ NEW: Store previous axis counts to detect when rebuild is needed
  // Format: { analog: [1, 2, 1], digital: [1, 1] } - one entry per group
  let previousAxisCounts = { analog: [], digital: [] };

  // Store stroke functions to avoid recreating them on every color change
  // Cache key: `${type}-${globalIdx}` -> function
  const strokeFunctions = new Map();

  // ⚡ Fast index: channel -> array of charts that contain it
  // Format: { "analog-5": [chart0, chart2], "digital-3": [chart1] }
  // Rebuilt whenever chart structure changes
  const channelToChartsIndex = new Map();

  // ✅ Flag to prevent dataState subscriber from interfering during deletion
  let isHandlingDeletion = false;

  // ✅ FIX: Helper to get progress callback from state or global
  const callProgress = (percent, message) => {
    // Try channelState._meta first
    let callback = channelState?._meta?.progressCallback;
    // Fallback to global progress callback getter
    if (!callback && typeof getProgressCallback === "function") {
      callback = getProgressCallback();
    }
    console.log(`[callProgress] percent=${percent}%, message="${message}", hasCallback=${typeof callback === "function"}`);
    if (typeof callback === "function") {
      console.log(`[callProgress] ✅ Invoking callback with ${percent}%`);
      callback(percent, message);
    } else {
      console.warn(`[callProgress] ❌ No callback available at ${percent}%`);
    }
  };

  function rebuildChannelToChartsIndex() {
    channelToChartsIndex.clear();
    for (let ci = 0; ci < charts.length; ci++) {
      const chart = charts[ci];
      if (!chart || !chart._channelIndices || !chart._type) continue;

      const type = chart._type;
      chart._channelIndices.forEach((globalIdx) => {
        const key = `${type}-${globalIdx}`;
        if (!channelToChartsIndex.has(key)) {
          channelToChartsIndex.set(key, []);
        }
        channelToChartsIndex.get(key).push(chart);
      });
    }
  }

  // Initialize index on first call
  rebuildChannelToChartsIndex();

  // ⚡ RAF batch rendering: collect multiple chart redraws and execute in single frame
  let redrawBatch = new Set();
  let redrawRAFId = null;

  function scheduleChartRedraw(chart) {
    if (!chart) return;
    redrawBatch.add(chart);

    if (redrawRAFId === null) {
      redrawRAFId = requestAnimationFrame(() => {
        const t0 = performance.now();
        let count = 0;

        // Execute all pending redraws in batch
        for (const c of redrawBatch) {
          try {
            if (typeof c.redraw === "function") {
              c.redraw(false); // Don't clear canvas
              count++;
            }
          } catch (e) {
            console.warn("[scheduleChartRedraw] Batch redraw failed:", e);
          }
        }

        redrawBatch.clear();
        redrawRAFId = null;

        const elapsed = (performance.now() - t0).toFixed(2);
        if (count > 0 && elapsed > 5) {
          console.log(
            `[Performance] Batch redraw: ${count} charts in ${elapsed}ms`
          );
        }
      });
    }
  }

  /**
   * Efficiently update chart data in-place using setData().
   * Preserves event listeners, plugins, and DOM structure.
   * ~10x faster than full recreation (100ms vs 1000ms+)
   */
  function updateChartDataInPlace(chart, newData, type) {
    if (!chart || typeof chart.setData !== "function") {
      return false;
    }
    try {
      chart.setData(newData);
      chart.redraw();
      console.log(
        `[updateChartDataInPlace] ✓ Updated ${type} chart data (~100ms)`
      );
      return true;
    } catch (e) {
      console.warn(`[updateChartDataInPlace] Failed to update:`, e);
      return false;
    }
  }

  /**
   * Check if charts can be reused (same count, structure) without recreation.
   * Returns true if current charts match expected structure from groups.
   */
  function canReuseCharts(type, expectedGroupCount) {
    const typeCharts = charts.filter((c) => c && c._type === type);
    return typeCharts.length === expectedGroupCount;
  }

  /**
   * ✨ SMART CHART MERGING: Intelligently move channels between existing charts
   * Instead of full rebuild, this attempts to:
   * 1. Detect which channels moved between groups
   * 2. Find target group's existing chart
   * 3. Move channels into that chart (merge)
   * 4. Remove empty charts
   * 5. Update all affected charts efficiently
   *
   * Returns { succeeded: boolean, channelsMoved: number, chartsKept: number, chartsRemoved: number }
   */
  function attemptSmartChartMerge(
    existingCharts,
    newGroups,
    oldGroups,
    data,
    channelState,
    expectedGroupCount
  ) {
    try {
      // ✅ STEP 1: Build map of which channels should be in which group (NEW state)
      const newGroupStructure = {};
      newGroups.forEach((groupId, channelIdx) => {
        if (
          groupId === -1 ||
          groupId === "-1" ||
          groupId < 0 ||
          groupId === null
        )
          return;
        if (!newGroupStructure[groupId]) {
          newGroupStructure[groupId] = [];
        }
        newGroupStructure[groupId].push(channelIdx);
      });

      const targetGroupIds = Object.keys(newGroupStructure).sort((a, b) => {
        // Extract numeric part for sorting (e.g., "G2" -> 2)
        const aNum = parseInt(a.replace(/\D/g, ""));
        const bNum = parseInt(b.replace(/\D/g, ""));
        return aNum - bNum;
      });

      console.log(
        `[attemptSmartChartMerge] Target structure: ${targetGroupIds.length} groups`,
        targetGroupIds.map(
          (g) => `${g}: ${newGroupStructure[g].length} channels`
        )
      );

      // ✅ STEP 2: Build map of CURRENT chart structure using OLD groups
      // This is critical: use oldGroups to properly identify which chart belongs to which group
      const currentStructure = {};
      existingCharts.forEach((chart) => {
        if (
          chart &&
          chart._channelIndices &&
          chart._channelIndices.length > 0
        ) {
          // Find which group(s) these channels belonged to in OLD state
          const groupsInChart = new Set();
          chart._channelIndices.forEach((idx) => {
            if (idx < oldGroups.length) {
              const oldGroupId = oldGroups[idx];
              if (oldGroupId !== -1 && oldGroupId !== "-1" && oldGroupId >= 0) {
                groupsInChart.add(oldGroupId);
              }
            }
          });

          if (groupsInChart.size > 0) {
            const groupId = Array.from(groupsInChart)[0]; // Primary group
            if (!currentStructure[groupId]) {
              currentStructure[groupId] = { chart, indices: [] };
            }
            currentStructure[groupId].indices = chart._channelIndices.slice();
          }
        }
      });

      console.log(
        `[attemptSmartChartMerge] Current structure: ${
          Object.keys(currentStructure).length
        } charts`,
        Object.entries(currentStructure).map(
          ([g, info]) => `${g}: ${info.indices.length} channels`
        )
      );

      // ✅ STEP 3: Check if structure is compatible for merging
      // Compatible if:
      // - Same number of groups
      // - Groups haven't changed drastically
      if (
        targetGroupIds.length !== Object.keys(currentStructure).length &&
        Math.abs(targetGroupIds.length - Object.keys(currentStructure).length) >
          1
      ) {
        console.log(
          `[attemptSmartChartMerge] ❌ Group count differs too much (${
            targetGroupIds.length
          } vs ${Object.keys(currentStructure).length}), need full rebuild`
        );
        return { succeeded: false };
      }

      // ✅ STEP 4: Update each chart with merged data
      let chartsKept = 0;
      let chartsRemoved = 0;
      let channelsMoved = 0;

      targetGroupIds.forEach((groupId) => {
        const indices = newGroupStructure[groupId];

        if (currentStructure[groupId]) {
          // Chart exists for this group - update it
          const chart = currentStructure[groupId].chart;
          const oldIndices = currentStructure[groupId].indices;

          // Check if indices changed
          const indicesChanged =
            oldIndices.length !== indices.length ||
            !oldIndices.every((idx, i) => idx === indices[i]);

          if (indicesChanged) {
            console.log(
              `[attemptSmartChartMerge] 🔄 Updating ${groupId}: ${oldIndices.length} → ${indices.length} channels`
            );
            channelsMoved += Math.abs(indices.length - oldIndices.length);

            // Build new chart data
            const newChartData = [
              data.time,
              ...indices.map((idx) => data.analogData[idx]),
            ];

            // Update chart metadata
            chart._channelIndices = indices.slice();

            // Update chart data efficiently
            updateChartDataInPlace(chart, newChartData, "analog");
          } else {
            console.log(
              `[attemptSmartChartMerge] ✓ ${groupId}: No changes needed (${indices.length} channels)`
            );
          }
          chartsKept++;
        } else {
          // No existing chart for this group - shouldn't happen in merge mode
          console.warn(
            `[attemptSmartChartMerge] ⚠️ ${groupId} has no existing chart, need full rebuild`
          );
          return { succeeded: false };
        }
      });

      // ✅ STEP 5: Remove charts that are no longer needed (async destruction)
      const chartsToRemove = [];
      Object.keys(currentStructure).forEach((groupId) => {
        if (!newGroupStructure[groupId]) {
          const chart = currentStructure[groupId].chart;
          chartsToRemove.push(chart);
        }
      });

      // Batch remove charts asynchronously
      if (chartsToRemove.length > 0) {
        if (window.requestIdleCallback) {
          window.requestIdleCallback(
            () => {
              chartsToRemove.forEach((chart) => {
                try {
                  chart.destroy();
                  const chartIdx = charts.indexOf(chart);
                  if (chartIdx >= 0) {
                    charts.splice(chartIdx, 1);
                    chartsRemoved++;
                    rebuildChannelToChartsIndex();
                    console.log(
                      `[attemptSmartChartMerge] 🗑️ Removed empty chart (async)`
                    );
                  }
                } catch (e) {
                  console.warn(
                    `[attemptSmartChartMerge] Failed to remove chart:`,
                    e
                  );
                }
              });
            },
            { timeout: 1000 }
          );
        } else {
          // Fallback: batch in setTimeout
          setTimeout(() => {
            chartsToRemove.forEach((chart) => {
              try {
                chart.destroy();
                const chartIdx = charts.indexOf(chart);
                if (chartIdx >= 0) {
                  charts.splice(chartIdx, 1);
                  chartsRemoved++;
                  rebuildChannelToChartsIndex();
                  console.log(
                    `[attemptSmartChartMerge] 🗑️ Removed empty chart (async)`
                  );
                }
              } catch (e) {
                console.warn(
                  `[attemptSmartChartMerge] Failed to remove chart:`,
                  e
                );
              }
            });
          }, 0);
        }
      }

      console.log(
        `[attemptSmartChartMerge] ✅ Success: Moved ${channelsMoved} channels, kept ${chartsKept} charts, removed ${chartsRemoved} empty charts`
      );
      return {
        succeeded: true,
        channelsMoved,
        chartsKept,
        chartsRemoved,
      };
    } catch (err) {
      console.warn(`[attemptSmartChartMerge] Error during merge attempt:`, err);
      return { succeeded: false };
    }
  }

  function recreateChart(type, idx) {
    try {
      if (!channelState[type] || typeof channelState[type] !== "object") {
        console.warn(
          `[recreateChart] channelState[${type}] is undefined or not an object`
        );
        return;
      }
      if (!Array.isArray(dataState[type])) {
        console.warn(
          `[recreateChart] dataState[${type}] is not an array or is undefined`
        );
        return;
      }

      // ✅ SAFETY CHECK: If chart index is out of bounds, skip recreation
      // This prevents infinite loops when deletion removes all charts
      if (idx < 0 || idx >= (chartsContainer?.children.length || 0)) {
        console.warn(
          `[recreateChart] Chart index ${idx} is out of bounds (container has ${chartsContainer?.children.length || 0} children), skipping`
        );
        return;
      }

      // ✅ SAFETY CHECK: Ensure we have valid data to display
      const expectedSeriesCount = Math.max(0, channelState[type].yLabels?.length || 0);
      const actualSeriesCount = Math.max(0, (dataState[type]?.length || 1) - 1); // -1 for time array
      if (expectedSeriesCount !== actualSeriesCount) {
        console.warn(
          `[recreateChart] Data mismatch: expecting ${expectedSeriesCount} series but have ${actualSeriesCount}, skipping to avoid crash`
        );
        return;
      }

      // Step 1: Get container FIRST before destroying
      if (!chartsContainer || !chartsContainer.children[idx]) {
        console.warn(
          `[recreateChart] chartsContainer.children[${idx}] does not exist`
        );
        return;
      }
      const container = chartsContainer.children[idx];

      // Step 2: Destroy old chart if it exists
      if (charts[idx]) {
        try {
          charts[idx].destroy();
          console.log(`[recreateChart] ✓ Destroyed old chart at index ${idx}`);
        } catch (e) {
          console.warn(`[recreateChart] Failed to destroy chart[${idx}]:`, e);
        }
      }

      // Step 3: CLEAR container HTML to remove any leftover DOM elements
      try {
        container.innerHTML = "";
        console.log(`[recreateChart] ✓ Cleared container HTML`);
      } catch (e) {
        console.warn(`[recreateChart] Failed to clear container:`, e);
      }

      // Step 4: Set reference to null
      charts[idx] = null;

      // Step 5: Create chart options
      const options = createChartOptions(channelState[type], verticalLinesX);
      const chartData = dataState[type];

      console.log(
        `[recreateChart] type="${type}", idx=${idx}, dataLength=${
          chartData.length
        }, seriesCount=${chartData.length - 1}`
      );

      // Step 6: Create new uPlot instance
      try {
        const chart = new uPlot(options, chartData, container);
        charts[idx] = chart;
        console.log(`[recreateChart] ✓ Created new uPlot instance`);

        // ⚡ Rebuild the fast lookup index since we added a new chart
        rebuildChannelToChartsIndex();

        console.log(
          `[recreateChart] ✅ Successfully recreated chart[${idx}] for type "${type}"`
        );
      } catch (uplotErr) {
        console.error(`[recreateChart] ❌ Failed to create uPlot:`, uplotErr);
        throw uplotErr;
      }
    } catch (err) {
      console.error(
        `[recreateChart] ❌ Failed to recreate chart[${idx}] for type "${type}":`,
        err
      );
    }
  }

  // Direct synchronous updates - no debouncing
  // This ensures data is current when chart renders
  const recreateChartSync = (type, idx) => {
    console.log(`[recreateChartSync] Direct call for ${type}-${idx}`);
    recreateChart(type, idx);
  };

  /**
   * Force chart redraw without resizing (much faster than setSize)
   * Optimized to use chart.redraw() instead of expensive setSize() calls
   * ~5ms with redraw(false), vs ~100ms with setSize()
   * @param {uPlot} chart - uPlot instance
   */
  function forceRedraw(chart) {
    if (!chart) return;

    try {
      // Method 1: Direct redraw (fastest - ~5ms)
      if (typeof chart.redraw === "function") {
        chart.redraw(false); // false = don't clear canvas
        return;
      }

      // Method 2: Batch + noop scale update (slower - ~20ms)
      if (typeof chart.batch === "function") {
        chart.batch(() => {
          // Trigger internal recalculation without full resize
          const currentMin = chart.scales.x.min;
          const currentMax = chart.scales.x.max;

          if (currentMin !== undefined && currentMax !== undefined) {
            chart.setScale("x", { min: currentMin, max: currentMax });
          }
        });
        return;
      }

      // Method 3: Fallback to setSize (slowest - ~100ms)
      console.warn("[forceRedraw] Using slow setSize fallback");
      chart.setSize({ width: chart.width, height: chart.height });
    } catch (e) {
      console.warn("[forceRedraw] Failed:", e);
    }
  }

  // --- Boss-style subscription wiring (if channelState exposes subscribeProperty) ---
  // This wires friendly property names (color, name, scale, invert, channelIDs)
  // to uPlot updates or chart recreation so child callbacks update charts directly.
  console.log("[subscribeChartUpdates] Starting subscription wiring");
  if (channelState && typeof channelState.subscribeProperty === "function") {
    console.log(
      "[subscribeChartUpdates] channelState.subscribeProperty available, wiring subscriptions"
    );
    // ✨ Optimized color updates (5-10x faster than full recreation)
    channelState.subscribeProperty("color", (change) => {
      const t0 = performance.now();

      try {
        // 🔍 DIAGNOSTIC: Log color change event
        console.log(`[COLOR SUBSCRIBER] 📢 Fired! change:`, {
          path: change.path,
          newValue: change.newValue,
          oldValue: change.oldValue,
          type: change.type,
        });

        const t1 = performance.now();
        const type = change.path && change.path[0];
        const globalIdx = change.path && change.path[2];

        console.log(
          `[COLOR SUBSCRIBER] 📍 Extracted: type="${type}", globalIdx=${globalIdx}`
        );

        // ✅ Handle both cases:
        // 1. Single color change: path = ['analog', 'lineColors', 0], newValue = '#fff'
        // 2. Whole array replace: path = ['analog', 'lineColors'], newValue = [...colors]
        if (!type || (type !== "analog" && type !== "digital" && type !== "computed")) {
          console.warn(`[COLOR SUBSCRIBER] ❌ Invalid type: "${type}"`);
          return; // Invalid type, silently ignore
        }

        // Case 2: Whole lineColors array was replaced
        if (Array.isArray(change.newValue) && !Number.isFinite(globalIdx)) {
          console.log(
            `[COLOR SUBSCRIBER] 📋 CASE 2: Array replacement (${change.newValue.length} colors)`
          );
          // Update all colors for this type
          let arrayUpdateCount = 0;
          for (let ci = 0; ci < charts.length; ci++) {
            const chart = charts[ci];
            if (!chart || chart._type !== type) continue;

            console.log(
              `  🎨 Chart ${ci} (${type}): Updating ${
                chart._channelIndices?.length || 0
              } channels`
            );

            const mapping = chart._channelIndices || [];
            for (let pos = 0; pos < mapping.length; pos++) {
              const idx = mapping[pos];
              const color = change.newValue[idx];
              if (color) {
                try {
                  const seriesIdx = pos + 1;
                  const strokeFn = () => color;
                  chart.series[seriesIdx].stroke = strokeFn;
                  // ✅ FIX: Clear path cache to force regeneration
                  chart.series[seriesIdx]._paths = null;
                  if (chart.series[seriesIdx].points) {
                    chart.series[seriesIdx].points.stroke = strokeFn;
                  }
                  arrayUpdateCount++;
                  console.log(`    ✅ Series[${seriesIdx}] color → ${color}`);
                } catch (e) {
                  console.error(`    ❌ Series update failed:`, e);
                  // Ignore errors for individual series
                }
              }
            }
            try {
              // ✅ FIX: Immediate redraw instead of batched (forces path regeneration)
              chart.redraw(false);
              console.log(`  ✅ Chart ${ci} redrawn`);
            } catch (e) {
              console.error(`  ❌ Redraw failed for chart ${ci}:`, e);
              // Ignore
            }
          }
          console.log(
            `[COLOR SUBSCRIBER] ✅ Array case: Updated ${arrayUpdateCount} series`
          );

          // ✅ FIX: Update digital plugin colors if this is digital type
          if (type === "digital") {
            console.log(`[COLOR SUBSCRIBER] 🔌 Updating digitalFill plugin...`);
            console.log(`[COLOR SUBSCRIBER] 📋 Total charts: ${charts.length}`);

            for (let ci = 0; ci < charts.length; ci++) {
              const chart = charts[ci];
              console.log(`[COLOR SUBSCRIBER] 🔍 Checking chart ${ci}:`, {
                exists: !!chart,
                type: chart?._type,
                hasPlugins: !!chart?.plugins,
                pluginsCount: chart?.plugins?.length || 0,
              });

              if (!chart || chart._type !== "digital") {
                console.log(
                  `[COLOR SUBSCRIBER] ⏭️ Chart ${ci} skipped (not digital)`
                );
                continue;
              }

              // ✅ FIX: Use stored plugin reference instead of searching chart.plugins
              // (uPlot doesn't expose plugins array, so we stored it in renderDigitalCharts)
              const digitalPlugin = chart._digitalPlugin;

              console.log(`[COLOR SUBSCRIBER] 🎯 Found plugin:`, {
                found: !!digitalPlugin,
                hasUpdateColors:
                  typeof digitalPlugin?.updateColors === "function",
              });

              if (
                digitalPlugin &&
                typeof digitalPlugin.updateColors === "function"
              ) {
                // ✅ CRITICAL: Pass FULL color array (592 colors)
                // Plugin will use originalIndex to map correctly
                console.log(
                  `[COLOR SUBSCRIBER] 📞 Calling updateColors with array of ${change.newValue?.length} colors`
                );
                const colorsChanged = digitalPlugin.updateColors(
                  change.newValue
                );

                console.log(
                  `[color subscriber] 📊 Plugin updateColors returned:`,
                  colorsChanged
                );

                if (colorsChanged) {
                  // ✅ CRITICAL: Force complete redraw
                  try {
                    // Clear all canvas layers
                    const canvases = chart.root.querySelectorAll("canvas");
                    let clearedCount = 0;
                    canvases.forEach((canvas) => {
                      try {
                        const ctx = canvas.getContext("2d");
                        if (ctx) {
                          ctx.clearRect(0, 0, canvas.width, canvas.height);
                          clearedCount++;
                        }
                      } catch (e) {
                        // Ignore
                      }
                    });
                    console.log(
                      `[color subscriber] 🧹 Cleared ${clearedCount} canvas layers`
                    );

                    // ✅ Force redraw with true to clear canvas
                    chart.redraw(true);
                    console.log(
                      `[color subscriber] ✅ Chart ${ci} redrawn with plugin color updates`
                    );
                  } catch (e) {
                    console.error(`[color subscriber] ❌ Redraw failed:`, e);
                  }
                } else {
                  console.log(
                    `[color subscriber] ⏭️ Plugin returned no changes`
                  );
                }
              } else {
                console.warn(
                  `[COLOR SUBSCRIBER] ❌ Plugin not found or missing updateColors!`,
                  {
                    pluginExists: !!digitalPlugin,
                    isFunction: typeof digitalPlugin?.updateColors,
                  }
                );
              }
            }
          }

          // ✅ FIX: Handle computed charts (may be multiple charts, map by global ID order)
          if (type === "computed") {
            console.log(`[COLOR SUBSCRIBER] 🎨 Updating computed chart colors (global ID mapping)...`);
            const computedIdsState = channelState?.computed?.channelIDs || [];
            
            for (let ci = 0; ci < charts.length; ci++) {
              const chart = charts[ci];
              if (!chart || chart._type !== "computed") continue;

              const computedIds = chart._computedIds || [];
              let updated = 0;

              for (let seriesIdx = 1; seriesIdx < chart.series.length; seriesIdx++) {
                const localIdx = seriesIdx - 1;
                const channelId = computedIds[localIdx];
                const globalIdx = computedIdsState.indexOf(channelId);
                if (globalIdx < 0 || globalIdx >= change.newValue.length) continue;

                const color = change.newValue[globalIdx];
                try {
                  const strokeFn = () => color;
                  chart.series[seriesIdx].stroke = strokeFn;
                  chart.series[seriesIdx]._paths = null;
                  if (chart.series[seriesIdx].points) {
                    chart.series[seriesIdx].points.stroke = strokeFn;
                  }
                  updated++;
                  console.log(`[COLOR SUBSCRIBER] ✅ Computed "${channelId}" series[${seriesIdx}] color → ${color}`);
                } catch (e) {
                  console.error(`[COLOR SUBSCRIBER] ❌ Failed to update computed "${channelId}" series[${seriesIdx}]:`, e);
                }
              }

              if (updated > 0) {
                try { chart.redraw(false); } catch {}
                console.log(`[COLOR SUBSCRIBER] ✅ Computed chart ${ci} redrawn after ${updated} updates`);
              }
            }

            // ✅ NEW: Also update colors in analog charts for computed channels merged into them
            console.log(`[COLOR SUBSCRIBER] 🔄 Checking analog charts for merged computed channels...`);
            // Use state ID order for reliable mapping of color array indices (already defined above as computedIdsState)
            for (let ci = 0; ci < charts.length; ci++) {
              const chart = charts[ci];
              if (!chart || chart._type !== "analog") continue;

              const numAnalogChannels = chart._analogSeriesCount || 0;
              const computedIdsInChart = chart._computedChannelIds || [];
              if (!computedIdsInChart.length) continue;

              let updatedCount = 0;
              // For each computed channel present in this analog chart, find its global color index
              computedIdsInChart.forEach((computedId, positionInChart) => {
                const globalIdx = computedIdsState.indexOf(computedId);
                if (globalIdx >= 0 && globalIdx < change.newValue.length) {
                  const newColor = change.newValue[globalIdx];
                  const seriesIdx = 1 + numAnalogChannels + positionInChart; // +1 for time series
                  if (seriesIdx > 0 && seriesIdx < chart.series.length) {
                    try {
                      const strokeFn = () => newColor;
                      chart.series[seriesIdx].stroke = strokeFn;
                      chart.series[seriesIdx]._paths = null;
                      if (chart.series[seriesIdx].points) {
                        chart.series[seriesIdx].points.stroke = strokeFn;
                      }
                      updatedCount++;
                      console.log(`[COLOR SUBSCRIBER] ✅ Analog chart ${ci} - Computed "${computedId}" series[${seriesIdx}] color → ${newColor}`);
                    } catch (e) {
                      console.error(`[COLOR SUBSCRIBER] ❌ Failed to update analog merged computed "${computedId}":`, e);
                    }
                  }
                }
              });

              if (updatedCount > 0) {
                try {
                  chart.redraw(false);
                  console.log(`[COLOR SUBSCRIBER] ✅ Analog chart ${ci} redrawn after ${updatedCount} computed color updates`);
                } catch (e) {
                  console.error(`[COLOR SUBSCRIBER] ❌ Failed to redraw analog chart ${ci}:`, e);
                }
              }
            }
          }

          return;
        }

        // Case 1: Single color element was changed
        if (!Number.isFinite(globalIdx)) {
          console.warn(`[COLOR SUBSCRIBER] ❌ Invalid globalIdx: ${globalIdx}`);
          return; // Not a single-element update, ignore
        }

        console.log(`[COLOR SUBSCRIBER] 🎯 CASE 1: Single color change`);
        console.log(`  Channel: ${type}[${globalIdx}]`);
        console.log(`  New color: ${change.newValue}`);

        const newColor = change.newValue;
        let updateCount = 0;
        let failedCharts = [];

        // ✅ FIX 1: Create/reuse stroke function instead of passing string
        // uPlot expects stroke to be a function, not a string
        const t2 = performance.now();
        const cacheKey = `${type}-${globalIdx}`;
        let strokeFn = strokeFunctions.get(cacheKey);

        if (!strokeFn || strokeFn._color !== newColor) {
          // Create new function that returns the color
          strokeFn = () => newColor;
          strokeFn._color = newColor; // Store for comparison
          strokeFunctions.set(cacheKey, strokeFn);
        }
        const t3 = performance.now();

        // ✅ FIX 2: Update all charts that contain this channel using fast index
        const t4 = performance.now();
        const chartsWithThisChannel =
          channelToChartsIndex.get(`${type}-${globalIdx}`) || [];

        console.log(
          `[COLOR SUBSCRIBER] 🔍 Fast index lookup: "${type}-${globalIdx}"`
        );
        console.log(
          `  Found ${chartsWithThisChannel.length} charts with this channel`
        );
        console.log(`  Total charts in memory: ${charts.length}`);
        console.log(`  Charts by type: `, {
          analog: charts.filter((c) => c?._type === "analog").length,
          digital: charts.filter((c) => c?._type === "digital").length,
          computed: charts.filter((c) => c?._type === "computed").length,
        });

        for (const chart of chartsWithThisChannel) {
          try {
            // Find the series index in this specific chart
            const mapping = chart._channelIndices || [];
            const pos = mapping.indexOf(globalIdx);
            if (pos < 0) continue;

            const seriesIdx = pos + 1; // uPlot series index (0 is x-axis)

            console.log(
              `  🎨 Updating ${chart._type} chart, series[${seriesIdx}]...`
            );

            // Update both stroke and cached stroke
            chart.series[seriesIdx].stroke = strokeFn;
            chart.series[seriesIdx]._stroke = newColor; // Cached value

            // ✅ FIX: Clear path cache to force regeneration with new color
            chart.series[seriesIdx]._paths = null;

            if (chart.series[seriesIdx].points) {
              chart.series[seriesIdx].points.stroke = strokeFn;
              chart.series[seriesIdx].points._stroke = newColor;
            }

            updateCount++;
          } catch (err) {
            console.warn(`[color subscriber] Failed to update series:`, err);
            failedCharts.push(chart);
          }
        }
        const t5 = performance.now();

        // ✅ FIX: Immediate redraw for all affected charts (not batched!)
        // ⚠️ CRITICAL: Skip digital charts here - we'll redraw them AFTER updating plugin colors
        const t6 = performance.now();
        let redrawCount = 0;
        for (const chart of chartsWithThisChannel) {
          try {
            // ⚠️ Skip digital charts - they need plugin update first!
            if (type === "digital") {
              console.log(
                `[COLOR SUBSCRIBER] ⏭️ Skipping redraw for digital chart - will update plugin first`
              );
              continue;
            }
            // Immediate redraw (don't batch - we need paths regenerated NOW)
            chart.redraw(false); // false = don't clear canvas
            redrawCount++;
          } catch (e) {
            console.warn(`[color subscriber] Failed to redraw:`, e);
          }
        }

        // ✅ FIX: Update digital plugin colors if this is digital type
        if (type === "digital") {
          console.log(
            `[COLOR SUBSCRIBER] 🔌 Updating digitalFill plugin for single color change...`
          );
          console.log(
            `[COLOR SUBSCRIBER] 📋 Checking ${chartsWithThisChannel.length} charts with this channel`
          );

          // ⚠️ CRITICAL: Also check ALL digital charts, not just those in chartsWithThisChannel
          // because chartsWithThisChannel might be empty if chart hasn't been indexed yet
          const allDigitalCharts = charts.filter(
            (c) => c && c._type === "digital"
          );
          console.log(
            `[COLOR SUBSCRIBER] 📊 Total digital charts: ${allDigitalCharts.length}`
          );

          for (const chart of allDigitalCharts) {
            console.log(`[COLOR SUBSCRIBER] 🔍 Chart info:`, {
              type: chart._type,
              hasDigitalPlugin: !!chart._digitalPlugin,
              pluginId: chart._digitalPlugin?.id,
            });

            // ✅ FIX: Use stored plugin reference instead of trying to find it in chart.plugins
            // (uPlot doesn't expose plugins array)
            const digitalPlugin = chart._digitalPlugin;

            console.log(`[COLOR SUBSCRIBER] 🎯 Plugin lookup result:`, {
              pluginFound: !!digitalPlugin,
              hasUpdateColors:
                typeof digitalPlugin?.updateColors === "function",
            });

            if (
              digitalPlugin &&
              typeof digitalPlugin.updateColors === "function"
            ) {
              // ✅ CRITICAL: For SINGLE color change, we need to pass the FULL array
              // so plugin can use originalIndex to find the right signal
              const fullColors = channelState.digital?.lineColors || [];

              console.log(
                `[COLOR SUBSCRIBER] 📊 Single color update: ${type}[${globalIdx}] = ${newColor}`
              );
              console.log(
                `[COLOR SUBSCRIBER] 📞 Calling updateColors with ${fullColors.length} colors`
              );
              console.log(
                `[COLOR SUBSCRIBER] 📋 Color at index ${globalIdx}: ${fullColors[globalIdx]}`
              );

              const colorsChanged = digitalPlugin.updateColors(fullColors);

              console.log(
                `[COLOR SUBSCRIBER] 📊 updateColors returned: ${colorsChanged}`
              );

              if (colorsChanged) {
                // ✅ Clear all series paths to force regeneration
                if (chart.series) {
                  chart.series.forEach((s) => {
                    if (s && s._paths) s._paths = null;
                  });
                }

                // ✅ FORCE COMPLETE REDRAW
                try {
                  const canvases = chart.root.querySelectorAll("canvas");
                  canvases.forEach((canvas) => {
                    const ctx = canvas.getContext("2d");
                    if (ctx) {
                      ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }
                  });
                  chart.redraw(true);
                  console.log(
                    `[COLOR SUBSCRIBER] ✅ Chart redrawn with new plugin colors`
                  );
                } catch (err) {
                  console.warn(`[COLOR SUBSCRIBER] Failed to redraw:`, err);
                }
              } else {
                console.log(
                  `[COLOR SUBSCRIBER] ⏭️ Plugin returned no changes, skipping redraw`
                );
              }
            } else {
              console.warn(
                `[COLOR SUBSCRIBER] ❌ Plugin not found or updateColors not callable`
              );
            }
          }
        }

        const t7 = performance.now();

        // ✅ NEW: For single computed color change, update computed charts and analog charts that include it
        if (type === "computed") {
          console.log(`[COLOR SUBSCRIBER] 🔄 Checking analog charts for single computed color update...`);
          // Use channelState.computed.channelIDs as source of truth for index → ID mapping
          const computedIds = channelState?.computed?.channelIDs || [];
          const changedComputedId = computedIds[globalIdx];

          if (changedComputedId) {
            // Update standalone computed charts containing this ID
            for (let ci = 0; ci < charts.length; ci++) {
              const chart = charts[ci];
              if (!chart || chart._type !== "computed") continue;
              const ids = chart._computedIds || [];
              const pos = ids.indexOf(changedComputedId);
              if (pos < 0) continue;
              const seriesIdx = 1 + pos;
              if (chart.series && chart.series[seriesIdx]) {
                try {
                  const strokeFn = () => newColor;
                  chart.series[seriesIdx].stroke = strokeFn;
                  chart.series[seriesIdx]._stroke = newColor;
                  chart.series[seriesIdx]._paths = null;
                  if (chart.series[seriesIdx].points) {
                    chart.series[seriesIdx].points.stroke = strokeFn;
                    chart.series[seriesIdx].points._stroke = newColor;
                  }
                  chart.redraw(false);
                  console.log(`[COLOR SUBSCRIBER] ✅ Computed chart ${ci} - "${changedComputedId}" series[${seriesIdx}] color → ${newColor}`);
                } catch (e) {
                  console.error(`[COLOR SUBSCRIBER] ❌ Failed to update computed chart for "${changedComputedId}":`, e);
                }
              }
            }

            for (let ci = 0; ci < charts.length; ci++) {
              const chart = charts[ci];
              if (!chart || chart._type !== "analog") continue;

              const numAnalogChannels = chart._analogSeriesCount || 0;
              const computedIdsInChart = chart._computedChannelIds || [];
              const posInChart = computedIdsInChart.indexOf(changedComputedId);
              if (posInChart < 0) continue; // This analog chart doesn't include the computed channel

              const seriesIdx = 1 + numAnalogChannels + posInChart;
              if (seriesIdx > 0 && seriesIdx < chart.series.length) {
                try {
                  const strokeFn = () => newColor;
                  chart.series[seriesIdx].stroke = strokeFn;
                  chart.series[seriesIdx]._stroke = newColor;
                  chart.series[seriesIdx]._paths = null;
                  if (chart.series[seriesIdx].points) {
                    chart.series[seriesIdx].points.stroke = strokeFn;
                    chart.series[seriesIdx].points._stroke = newColor;
                  }
                  chart.redraw(false);
                  console.log(`[COLOR SUBSCRIBER] ✅ Analog chart ${ci} - Computed "${changedComputedId}" series[${seriesIdx}] color → ${newColor}`);
                } catch (e) {
                  console.error(`[COLOR SUBSCRIBER] ❌ Failed to update analog merged computed color:`, e);
                }
              }
            }
          }
        }

        const t8 = performance.now();
        console.log(`Successfully updated: ${updateCount} charts`);
        console.log(`Redraws scheduled: ${redrawCount}`);

        for (
          let diagIdx = 0;
          diagIdx < chartsWithThisChannel.length;
          diagIdx++
        ) {
          const chart = chartsWithThisChannel[diagIdx];
          const mapping = chart._channelIndices || [];
          const pos = mapping.indexOf(globalIdx);

          if (pos >= 0) {
            const seriesIdx = pos + 1;
            const series = chart.series[seriesIdx];

            console.log(`\n  📊 Chart ${diagIdx} (${chart._type}):`, {
              seriesIdx,
              strokeType: typeof series.stroke,
              strokeFunction: series.stroke.toString().substring(0, 50),
              strokeReturns:
                typeof series.stroke === "function"
                  ? series.stroke(chart, seriesIdx)
                  : "N/A",
              pathsCleared: series._paths === null,
              pointsStroke: series.points ? typeof series.points.stroke : "N/A",
              chartWidth: chart.width,
              chartHeight: chart.height,
            });

            // ✅ CRITICAL: Verify stroke function is correct
            if (typeof series.stroke === "function") {
              const strokeResult = series.stroke(chart, seriesIdx);
              if (strokeResult !== newColor) {
                console.warn(
                  `    ⚠️ STROKE MISMATCH: Expected "${newColor}", got "${strokeResult}"`
                );
              } else {
                console.log(
                  `    ✅ Stroke returns correct color: "${strokeResult}"`
                );
              }
            } else {
              console.error(
                `    ❌ STROKE NOT A FUNCTION: ${typeof series.stroke}`
              );
            }

            // ✅ Check if redraw was called
            if (typeof chart.redraw === "function") {
              console.log(`    ✅ chart.redraw() method exists`);
            } else {
              console.error(`    ❌ chart.redraw() method NOT FOUND`);
            }

            // ✅ Check draw hooks
            if (chart.hooks && chart.hooks.draw) {
              console.log(
                `    ℹ️ Draw hooks: ${chart.hooks.draw.length} hook(s)`
              );
            }

            // ✅ Check series visibility
            if (series.show !== false) {
              console.log(`    ✅ Series is VISIBLE (show: ${series.show})`);
            } else {
              console.error(`    ❌ Series is HIDDEN (show: ${series.show})`);
            }

            // ✅ Check axis configuration
            if (series.scale) {
              console.log(`    ℹ️ Scale: ${series.scale}`);
            }
          }
        }
        console.groupEnd();

        // ✅ FIX 6: Only recreate charts that actually failed
        if (failedCharts.length > 0 && updateCount === 0) {
          console.warn(
            `[color subscriber] All updates failed, recreating ${failedCharts.length} charts`
          );
          failedCharts.forEach((chart) => {
            const type = chart._type;
            const idx = charts.indexOf(chart);
            if (idx >= 0) recreateChartSync(type, idx);
          });
        }

        const totalTime = t8 - t0;

        // Detailed timing breakdown
        const timings = {
          pathExtract: (t1 - t0).toFixed(2),
          cacheFunc: (t3 - t2).toFixed(2),
          seriesUpdate: (t5 - t4).toFixed(2),
          redraw: (t7 - t6).toFixed(2),
          groupedComputed: (t8 - t7).toFixed(2),
          total: totalTime.toFixed(2),
        };

        // Log only if slow or in debug mode
        if (totalTime > 20) {
          console.warn(
            `[Performance] 🐢 Color update SLOW: ${totalTime.toFixed(0)}ms | ` +
              `[Extract: ${timings.pathExtract}ms | Cache: ${timings.cacheFunc}ms | ` +
              `Series: ${timings.seriesUpdate}ms | Redraw: ${timings.redraw}ms] | ` +
              `Charts: ${updateCount}, Redraws: ${redrawCount}`
          );
        } else if (updateCount > 0) {
          console.log(
            `[Performance] ✅ Color update FAST: ${totalTime.toFixed(
              1
            )}ms for ${updateCount} charts`
          );
        }
      } catch (err) {
        console.error("[color subscriber] Unhandled error:", err);
      }
    });
  } else {
    console.log(
      "[subscribeChartUpdates] channelState.subscribeProperty not available, skipping property subscriptions"
    );
  }

  // Name/label updates (in-place)
  // Request descendant notifications so we receive per-series changes
  channelState.subscribeProperty(
    "name",
    (change) => {
      const t0 = performance.now();
      const type = change.path && change.path[0];
      if (!type) return;
      const globalIdx = change.path && change.path[2];
      try {
        // Whole-array replacement: update labels for each chart based on its mapping
        if (
          change.path &&
          change.path.length === 2 &&
          Array.isArray(change.newValue)
        ) {
          for (let ci = 0; ci < charts.length; ci++) {
            const chart = charts[ci];
            if (!chart || chart._type !== type) continue;
            const mapping = chart._channelIndices || [];
            mapping.forEach((global, pos) => {
              try {
                const lbl = change.newValue[global];
                if (typeof chart.setSeries === "function")
                  chart.setSeries(pos + 1, { label: lbl });
              } catch (e) {}
            });
            try {
              // Schedule redraw with RAF instead of immediate
              scheduleChartRedraw(chart);
            } catch (e) {}
          }
          const elapsed = (performance.now() - t0).toFixed(2);
          if (elapsed > 20) {
            console.warn(
              `[Performance] Name update scheduled: ${elapsed}ms (array replace)`
            );
          }
          return;
        }

        // Single-series update: find the chart containing this global index
        if (Number.isFinite(globalIdx)) {
          for (let ci = 0; ci < charts.length; ci++) {
            const chart = charts[ci];
            if (!chart || chart._type !== type) continue;
            const mapping = chart._channelIndices || [];
            const pos = mapping.indexOf(globalIdx);
            if (pos >= 0) {
              try {
                if (typeof chart.setSeries === "function")
                  chart.setSeries(pos + 1, { label: change.newValue });
                try {
                  // Schedule redraw with RAF instead of immediate
                  scheduleChartRedraw(chart);
                } catch (e) {}
                const elapsed = (performance.now() - t0).toFixed(2);
                if (elapsed > 10) {
                  console.warn(
                    `[Performance] Name update scheduled: ${elapsed}ms for 1 channel`
                  );
                }
                return;
              } catch (e) {
                console.warn(
                  "chartManager: in-place label update failed on chart",
                  ci,
                  e
                );
              }
            }
          }
        }
      } catch (err) {
        console.warn(
          "chartManager: in-place label update failed, recreating charts",
          err
        );
        // Recreate all charts of this type as fallback
        for (let ci = 0; ci < charts.length; ci++) {
          if (charts[ci] && charts[ci]._type === type) recreateChart(type, ci);
        }
      }
    },
    { descendants: true }
  );

  // Structural updates: scale/invert should recreate the chart
  channelState.subscribeProperty(
    "scale",
    (change) => {
      const type = change.path && change.path[0];
      const typeIdx = chartTypes.indexOf(type);
      if (typeIdx === -1) return;
      recreateChart(type, typeIdx);
    },
    { descendants: true }
  );
  channelState.subscribeProperty(
    "group",
    (change) => {
      try { debugLite.log("chart.group.change", change); } catch (e) {}

      const changeType = change.path && change.path[0]; // 'analog', 'digital', or 'computed'
      
      // Handle computed channel group changes (route to full rebuild)
      if (changeType === "computed") {
        if (isRebuildingFromGroup) return;
        
        if (groupChangeTimeout) clearTimeout(groupChangeTimeout);
        
        // Computed group changes require full rebuild (channels may merge with analog/digital)
        groupChangeTimeout = setTimeout(async () => {
          isRebuildingFromGroup = true;
          
          try {
            callProgress(25, "Processing computed group change...");
            
            const { renderComtradeCharts } = await import("./renderComtradeCharts.js");
            
            // Destroy all charts
            charts.forEach((chart) => {
              if (chart && typeof chart.destroy === "function") {
                try {
                  if (chart._resizeObserver) {
                    chart._resizeObserver.disconnect();
                    chart._resizeObserver = null;
                  }
                  chart.destroy();
                } catch (err) {}
              }
            });
            charts.length = 0;
            
            callProgress(50, "Rebuilding charts with new groups...");
            
            // Clear DOM container
            const chartsContainer = document.querySelector(".charts-container") || document.querySelector("#charts");
            if (chartsContainer) chartsContainer.innerHTML = "";
            
            // Full rebuild
            renderComtradeCharts(cfg, data, chartsContainer, charts, verticalLinesX, null, null, null, channelState);
            
            callProgress(100, "Computed group change complete!");
          } catch (err) {
            console.error(`[chartManager] Computed group rebuild failed:`, err);
          } finally {
            isRebuildingFromGroup = false;
            groupChangeTimeout = null;
          }
        }, 200);
        
        return;
      }

      // Sync cfg with new group assignment for Tabulator consistency
      try {
        const channelIdx = change.path && change.path[2];
        const newGroup = change.newValue;

        if (changeType && Number.isFinite(channelIdx) && cfg && cfg[changeType + "Channels"]) {
          const channels = cfg[changeType + "Channels"];
          if (channels[channelIdx]) {
            const groupString = typeof newGroup === "number" ? `G${newGroup}` : String(newGroup);
            channels[channelIdx].group = groupString;
          }
        }
      } catch (syncErr) {}

      if (isRebuildingFromGroup) return;
      if (groupChangeTimeout) clearTimeout(groupChangeTimeout);

      // Debounce: wait 200ms to collect all group changes before processing
      groupChangeTimeout = setTimeout(async () => {
        isRebuildingFromGroup = true;

        try {
          callProgress(30, "Analyzing group structure...");

          const { analyzeGroupsAndPublishMaxYAxes } = await import("../utils/analyzeGroupsAndPublish.js");
          const newMaxYAxes = analyzeGroupsAndPublishMaxYAxes(charts, channelState, cfg);

          const previousGlobalAxes = previousAxisCounts?.analog?.globalMax || 1;
          const axisCountChanged = newMaxYAxes !== previousGlobalAxes;

          callProgress(40, `Axis count: ${axisCountChanged ? "changing" : "stable"}...`);

          // Build currentGroups for state tracking
          const userGroups = channelState?.analog?.groups || [];
          const expectedGroupCount = Math.max(...userGroups.map((g) => (g === -1 ? 0 : g)), 0) + 1;

          const { calculateAxisCountForGroup } = await import("../utils/axisCalculator.js");

          const currentGroups = Array.from({ length: expectedGroupCount }, (_, groupId) => {
            const groupIndices = userGroups
              .map((g, idx) => (g === groupId ? idx : -1))
              .filter((idx) => idx >= 0);

            return {
              indices: groupIndices,
              axisCount: calculateAxisCountForGroup(
                groupIndices.map((idx) => cfg?.analogChannels?.[idx] || {})
              ),
            };
          });

          // Only rebuild charts if axis count actually changed
          if (axisCountChanged) {
            callProgress(50, "Rebuilding chart structure...");

            const { renderComtradeCharts } = await import("./renderComtradeCharts.js");

            // Destroy all analog charts (and digital if axes changed)
            const chartsToDestroy = charts.filter((c) => c && c._type === "analog");
            if (axisCountChanged) {
              chartsToDestroy.push(...charts.filter((c) => c && c._type === "digital"));
            }

            chartsToDestroy.forEach((chart) => {
              if (chart && typeof chart.destroy === "function") {
                try {
                  if (chart._resizeObserver) {
                    chart._resizeObserver.disconnect();
                    chart._resizeObserver = null;
                  }
                  chart.destroy();
                } catch (err) {}
              }
            });

            // Remove destroyed charts from array
            const typesToRemove = axisCountChanged ? ["analog", "digital"] : ["analog"];
            const remainingCharts = charts.filter((c) => c && !typesToRemove.includes(c._type));
            charts.length = 0;
            charts.push(...remainingCharts);

            // Remove DOM containers for destroyed chart types
            const targetContainer = chartsContainer || document.querySelector(".charts-container") || document.querySelector("#charts");
            if (targetContainer) {
              Array.from(targetContainer.children).forEach((child) => {
                const chartType = child.getAttribute("data-chart-type");
                if (chartType === "analog") {
                  child.remove();
                  return;
                }

                // Remove digital containers ONLY if axes changed
                if (axisCountChanged && chartType === "digital") {
                  child.remove();
                }
              });
            }

            callProgress(65, "Rendering new charts...");

            renderComtradeCharts(cfg, data, targetContainer, charts, verticalLinesX, null, null, null, channelState);

            callProgress(80, "Finalizing group structure...");

            // Render digital charts if needed
            const digitalChartExists = charts.some((c) => c && c._type === "digital");
            const shouldRenderDigital = !digitalChartExists && cfg.digitalChannels?.length > 0 && data.digitalData?.length > 0;

            if (shouldRenderDigital) {
              try {
                const { renderDigitalCharts: renderDigital } = await import("./renderDigitalCharts.js");
                renderDigital(cfg, data, chartsContainer, charts, verticalLinesX, channelState);
              } catch (err) {
                console.error(`[chartManager] Digital render failed:`, err);
              }
            }

            // Render computed channels
            try {
              const { renderComputedChart } = await import("./renderComputedChart.js");
              renderComputedChart(window.globalCfg, data, chartsContainer, charts, verticalLinesX, channelState);
            } catch (err) {}

            // Update state
            previousGroups.analog = userGroups.slice();
            previousAxisCounts.analog = {
              globalMax: newMaxYAxes,
              perGroup: currentGroups.map((g) => g.axisCount),
            };
            isRebuildingFromGroup = false;

            callProgress(100, "Group change complete!");
            return;
          } else {
            callProgress(50, "Reusing existing charts...");
          }

          // SUPER-FAST PATH: If chart count hasn't changed, just reorder data
          const analogCharts = charts.filter((c) => c?._type === "analog");
          if (!axisCountChanged && analogCharts.length === expectedGroupCount && expectedGroupCount > 0) {
            try {
              const groupData = new Map();
              userGroups.forEach((groupId, channelIdx) => {
                if (groupId < 0) return;
                if (!groupData.has(groupId)) groupData.set(groupId, []);
                groupData.get(groupId).push(channelIdx);
              });

              let chartIdx = 0;
              for (const [groupId, channelIndices] of Array.from(groupData.entries()).sort()) {
                if (chartIdx >= analogCharts.length) break;

                const chart = analogCharts[chartIdx];
                const newChartData = [data.time, ...channelIndices.map((idx) => data.analogData[idx])];

                if (typeof chart.setData === "function") {
                  try {
                    chart.setData(newChartData);
                    chart._channelIndices = channelIndices.slice();
                    chart.redraw();
                    chartIdx++;
                  } catch (e) {
                    throw e;
                  }
                }
              }

              rebuildChannelToChartsIndex();

              previousGroups.analog = userGroups.slice();
              previousAxisCounts.analog = {
                globalMax: newMaxYAxes,
                perGroup: currentGroups.map((g) => g.axisCount),
              };
              isRebuildingFromGroup = false;
              return;
            } catch (e) {
              // Fall back to smart merge
            }
          }

          // ULTRA-FAST PATH: Smart chart merging (moves channels between existing charts)
          if (!axisCountChanged && analogCharts.length > 0 && previousGroups.analog.length > 0) {
            const mergeResult = attemptSmartChartMerge(
              analogCharts,
              userGroups,
              previousGroups.analog,
              data,
              channelState,
              expectedGroupCount
            );

            if (mergeResult.succeeded) {
              previousGroups.analog = userGroups.slice();
              previousAxisCounts.analog = {
                globalMax: newMaxYAxes,
                perGroup: currentGroups.map((g) => g.axisCount),
              };
              isRebuildingFromGroup = false;
              return;
            }
          }

          // FAST PATH: Try to REUSE charts instead of recreating
          if (!axisCountChanged && canReuseCharts("analog", expectedGroupCount)) {
            const groupData = new Map();

            userGroups.forEach((groupId, channelIdx) => {
              if (groupId < 0) return;
              if (!groupData.has(groupId)) groupData.set(groupId, { indices: [], data: [] });
              groupData.get(groupId).indices.push(channelIdx);
            });

            let groupIdx = 0;
            for (const [groupId, groupInfo] of groupData.entries()) {
              const chart = charts.find(
                (c) =>
                  c && c._type === "analog" &&
                  charts.indexOf(c) >= groupIdx &&
                  charts.indexOf(c) < groupIdx + expectedGroupCount
              );
              if (!chart) continue;

              const newChartData = [data.time, ...groupInfo.indices.map((idx) => data.analogData[idx])];
              updateChartDataInPlace(chart, newChartData, "analog");
              groupIdx++;
            }

            previousGroups.analog = userGroups.slice();
            previousAxisCounts.analog = {
              globalMax: newMaxYAxes,
              perGroup: currentGroups.map((g) => g.axisCount),
            };
            isRebuildingFromGroup = false;
            return;
          }

          // SLOW PATH: Charts structure changed, need full rebuild
          for (let i = 0; i < charts.length; i++) {
            try {
              if (charts[i] && typeof charts[i].destroy === "function") {
                charts[i].destroy();
              }
            } catch (e) {}
          }

          charts.length = 0;
          chartsContainer.innerHTML = "";

          callProgress(60, "Rendering analog charts...");

          const { renderComtradeCharts } = await import("./renderComtradeCharts.js");
          renderComtradeCharts(cfg, data, chartsContainer, charts, verticalLinesX, null, null, null, channelState);

          callProgress(90, "Finalizing chart layout...");

          previousGroups.analog = userGroups.slice();
          previousAxisCounts.analog = {
            globalMax: newMaxYAxes,
            perGroup: currentGroups.map((g) => g.axisCount),
          };

          callProgress(100, "Group change complete!");
        } catch (err) {
          console.error(`[chartManager] Group change processing failed:`, err);
          try {
            callProgress(90, "Fallback rebuild in progress...");
            renderComtradeCharts(cfg, data, chartsContainer, charts, verticalLinesX, createState, calculateDeltas, TIME_UNIT, channelState);
            callProgress(100, "Group change complete!");
          } catch (fallbackErr) {
            console.error(`[chartManager] Full rebuild also failed:`, fallbackErr);
          }
        } finally {
          isRebuildingFromGroup = false;
          groupChangeTimeout = null;
        }
      }, 200);
    },
    { descendants: true }
  );
  channelState.subscribeProperty(
    "invert",
    (change) => {
      const type = change.path && change.path[0];
      const typeIdx = chartTypes.indexOf(type);
      if (typeIdx === -1) return;

      // If the whole-array was replaced, fallback to full recreate
      if (
        change.path &&
        change.path.length === 2 &&
        Array.isArray(change.newValue)
      ) {
        recreateChart(type, typeIdx);
        return;
      }

      const globalIdx = change.path && change.path[2];
      if (!Number.isFinite(globalIdx)) {
        // No specific series index provided — safe fallback
        recreateChart(type, typeIdx);
        return;
      }

      try {
        const arr = dataState && dataState[type];
        if (!Array.isArray(arr)) {
          recreateChart(type, typeIdx);
          return;
        }

        // Determine whether arr has a leading time array.
        // We treat it as having time iff the first element is an array AND
        // channelState[type].channelIDs exists and arr.length === channelCount + 1
        const chState = channelState[type] || {};
        const hasChannelIDs = Array.isArray(chState.channelIDs);
        const channelCount = hasChannelIDs ? chState.channelIDs.length : null;
        const firstIsArray = Array.isArray(arr[0]);
        const hasTime =
          firstIsArray &&
          channelCount != null &&
          arr.length === channelCount + 1;

        const seriesPos = hasTime ? globalIdx + 1 : globalIdx;
        const oldSeries = arr[seriesPos];
        if (!Array.isArray(oldSeries)) {
          recreateChart(type, typeIdx);
          return;
        }

        const isAnalog = type === "analog";
        const newSeries = oldSeries.map((v) => {
          if (isAnalog) return Number.isFinite(v) ? -v : v;
          return v ? 0 : 1;
        });

        // Apply in-place to dataState so other parts of app see the change.
        arr[seriesPos] = newSeries;

        // Try to update the uPlot chart(s) that contain this channel without full recreate
        let applied = false;
        for (let ci = 0; ci < charts.length; ci++) {
          const chart = charts[ci];
          if (!chart || chart._type !== type) continue;
          const mapping = chart._channelIndices || [];
          const pos = mapping.indexOf(globalIdx);
          if (pos < 0) continue;
          try {
            if (typeof chart.setData === "function") {
              // uPlot expects the full data array; pass our mutated arr reference
              chart.setData(arr);
              applied = true;
            }
          } catch (e) {
            applied = false;
          }
        }

        if (!applied) recreateChart(type, typeIdx);
      } catch (e) {
        recreateChart(type, typeIdx);
      }
    },
    { descendants: true }
  );

  // ✨ SIMPLE DELETION HANDLER: Reuses same render logic as group change
  // When channels are deleted, just trigger a full rebuild
  // The render functions will only create containers for groups with channels
  // Empty groups will naturally have no container (clean DOM!)
  channelState.subscribeProperty(
    "channelIDs",
    (change) => {
      const t0 = performance.now();
      const type = change.path && change.path[0];
      
      if (!type) return;

      // ✅ CRITICAL: Set flag to prevent dataState subscriber from interfering
      isHandlingDeletion = true;

      try {
        const oldLength = Array.isArray(change.oldValue) ? change.oldValue.length : 0;
        const newLength = Array.isArray(change.newValue) ? change.newValue.length : 0;
        
        console.log(
          `[DELETE HANDLER] 🗑️ Channel deletion detected: ${type} (${oldLength} → ${newLength})`
        );

        debugLite.log("channel.delete.detected", {
          type,
          oldLength,
          newLength,
        });

        // ✅ STEP 1: Detect if this is a deletion event (not addition)
        const isChannelDeleted = oldLength > newLength;

        if (!isChannelDeleted) {
          // Not a deletion - ignore and let other subscribers handle it
          console.log(`[DELETE HANDLER] ℹ️ Not a deletion event, skipping`);
          return;
        }

        console.log(
          `[DELETE HANDLER] ✅ Deletion confirmed: ${oldLength - newLength} channel(s) removed`
        );

        // ✅ STEP 2: Rebuild all charts (reusing group change logic)
        // This will re-render all containers, but only create containers for groups with channels
        // Empty groups will have NO container (perfect solution!)
        (async () => {
          try {
            console.log(`[DELETE HANDLER] 🔄 Rebuilding all charts with renderComtradeCharts()...`);

            // Import the same render function that group change uses
            const { renderComtradeCharts: renderAllCharts } = await import(
              "./renderComtradeCharts.js"
            );

            // Clear and rebuild - this intelligently creates only non-empty containers
            renderAllCharts(
              cfg,
              data,
              chartsContainer,
              charts,
              verticalLinesX,
              channelState,
              createState,
              calculateDeltas,
              TIME_UNIT
            );

            const elapsed = (performance.now() - t0).toFixed(2);
            console.log(
              `[DELETE HANDLER] ✅ Rebuild complete: ${elapsed}ms - empty containers removed, remaining groups rendered`
            );
          } catch (err) {
            console.error(`[DELETE HANDLER] ❌ Rebuild failed:`, err);
          }
        })();
      } catch (err) {
        console.error(`[DELETE HANDLER] ❌ Error in deletion handler:`, err);
      } finally {
        // ✅ CRITICAL: Always reset deletion flag when done
        isHandlingDeletion = false;
        console.log("[DELETE HANDLER] ✅ Deletion handling complete, released flag");
      }
    },
    { descendants: true }
  );

  // Start / Duration: prefer setting x scale (time window) when possible
  // Robustness: starts/durations may be provided as sample indices or as timestamps.
  // Use dataState[type][0] (time array) to map indices -> time when necessary.
  function resolveTimeRange(type, seriesIdx) {
    const timeArr =
      Array.isArray(dataState[type]) && Array.isArray(dataState[type][0])
        ? dataState[type][0]
        : null;

    // Debug check
    if (!timeArr) {
      console.warn(
        `[resolveTimeRange] Missing or invalid time array for ${type}`
      );
    }

    const starts = channelState[type]?.starts || [];
    const durations = channelState[type]?.durations || [];

    const sRaw = starts[seriesIdx];
    const dRaw = durations[seriesIdx];

    let sNum = sRaw == null ? NaN : Number(sRaw);
    let dNum = dRaw == null ? NaN : Number(dRaw);

    try {
      debugLite.log("resolveTimeRange.request", {
        type,
        seriesIdx,
        sRaw,
        dRaw,
        timeArrLength: timeArr ? timeArr.length : 0,
      });
    } catch (e) {}

    if (Array.isArray(timeArr) && timeArr.length) {
      const first = timeArr[0];
      const last = timeArr[timeArr.length - 1];
      const totalSamples = timeArr.length;

      // If start is sample index, map to time
      if (Number.isInteger(sNum) && sNum >= 0 && sNum < totalSamples) {
        sNum = timeArr[sNum];
      }

      // If duration is sample count, map to time duration
      if (Number.isInteger(dNum) && dNum > 0 && dNum < totalSamples) {
        const dt = (last - first) / Math.max(1, totalSamples - 1);
        dNum = dNum * dt;
      }

      // Clamp start/duration
      if (Number.isFinite(sNum)) {
        if (sNum < first) sNum = first;
        if (sNum > last) sNum = last;
      }

      if (Number.isFinite(dNum) && Number.isFinite(sNum)) {
        if (sNum + dNum > last) dNum = Math.max(0, last - sNum);
      }
    }

    try {
      debugLite.log("resolveTimeRange.result", {
        type,
        seriesIdx,
        sNum,
        dNum,
        hasTime: !!(timeArr && timeArr.length),
      });
    } catch (e) {}

    return {
      sNum,
      dNum,
      hasTime: Array.isArray(timeArr) && timeArr.length > 0,
    };
  }

  // Helper: apply x-scale robustly with a cheap redraw and single retry
  function applyScale(chart, type, typeIdx, min, max) {
    try {
      // Attempt immediate apply (batched when possible)
      if (typeof chart.batch === "function") {
        try {
          chart.batch(() => chart.setScale("x", { min, max }));
        } catch (e) {
          chart.setScale("x", { min, max });
        }
      } else {
        chart.setScale("x", { min, max });
      }

      try {
        debugLite.log("subscriber.apply.attempt", { type, min, max });
      } catch (e) {}

      // 🩵 Force re-render after short delay to avoid race with uPlot DOM initialization
      setTimeout(() => {
        try {
          if (chart.setScale) chart.setScale("x", { min, max });
          if (chart.redraw) chart.redraw();
          forceRedraw(chart);
          debugLite.log("subscriber.apply.redraw.ok", { type, min, max });
        } catch (err) {
          debugLite.log("subscriber.apply.redraw.error", { type, err });
        }
      }, 50);

      // schedule a single short retry if needed to work around timing races
      if (!chart._scaleRetryScheduled) {
        chart._scaleRetryScheduled = true;
        setTimeout(() => {
          chart._scaleRetryScheduled = false;
          try {
            if (typeof chart.batch === "function") {
              chart.batch(() => chart.setScale("x", { min, max }));
            } else {
              chart.setScale("x", { min, max });
            }
            try {
              forceRedraw(chart);
            } catch (e) {}
            try {
              debugLite.log("subscriber.apply.retry", { type, min, max });
            } catch (e) {}
          } catch (err) {
            try {
              debugLite.log("subscriber.apply.retry.error", { type, err });
            } catch (e) {}
            // fallback to recreate if still failing
            try {
              debugLite.log("subscriber.apply.retry.fallback", { type });
            } catch (e) {}
            recreateChart(type, typeIdx);
          }
        }, 50);
      }
    } catch (err) {
      try {
        debugLite.log("subscriber.apply.error", { type, err });
      } catch (e) {}
      recreateChart(type, typeIdx);
    }
  }

  // Note: we intentionally do not schedule retries here to avoid extra timers.
  // Initial start/duration application is handled once after initial render
  // by the parent (`main.js`) using a small helper.

  channelState.subscribeProperty(
    "start",
    (change) => {
      const subscriberStartTime = performance.now();
      const type = change.path && change.path[0];
      const seriesIdx = change.path && change.path[2];
      const typeIdx = chartTypes.indexOf(type);
      if (typeIdx === -1) return;
      const chart = charts[typeIdx];
      if (!chart || typeof chart.setScale !== "function") return;
      try {
        try {
          debugLite.log("subscriber.start.received", { change });
        } catch (e) {}
        const { sNum, dNum, hasTime } = resolveTimeRange(type, seriesIdx);
        try {
          debugLite.log("subscriber.start.resolved", {
            type,
            seriesIdx,
            sNum,
            dNum,
            hasTime,
          });
        } catch (e) {}
        if (!hasTime) return;
        if (Number.isFinite(sNum) && Number.isFinite(dNum)) {
          const min = sNum;
          const max = sNum + dNum;
          applyScale(chart, type, typeIdx, min, max);
        } else if (Number.isFinite(sNum)) {
          const min = sNum;
          applyScale(chart, type, typeIdx, min, null);
        }

        const subscriberEndTime = performance.now();
        const subscriberTime = subscriberEndTime - subscriberStartTime;
        if (subscriberTime > 50) {
          console.log(
            `[Performance] 'start' subscriber: ${type} series ${seriesIdx}`,
            {
              timeMs: subscriberTime.toFixed(2),
              performance: subscriberTime > 200 ? "🔴 VERY SLOW" : "🟡 SLOW",
            }
          );
        }
      } catch (err) {
        // fallback to full recreate if setScale fails - use debounced update
        try {
          debugLite.log("subscriber.start.fallback.recreate", {
            type,
            err,
          });
        } catch (e) {}
        recreateChartSync(type, typeIdx);
      }
    },
    { descendants: true }
  );

  channelState.subscribeProperty(
    "duration",
    (change) => {
      const subscriberStartTime = performance.now();
      const type = change.path && change.path[0];
      const seriesIdx = change.path && change.path[2];
      const typeIdx = chartTypes.indexOf(type);
      if (typeIdx === -1) return;
      const chart = charts[typeIdx];
      if (!chart || typeof chart.setScale !== "function") return;
      try {
        try {
          debugLite.log("subscriber.duration.received", { change });
        } catch (e) {}
        const { sNum, dNum, hasTime } = resolveTimeRange(type, seriesIdx);
        try {
          debugLite.log("subscriber.duration.resolved", {
            type,
            seriesIdx,
            sNum,
            dNum,
            hasTime,
          });
        } catch (e) {}
        if (!hasTime) return;
        if (Number.isFinite(sNum) && Number.isFinite(dNum)) {
          const min = sNum;
          const max = sNum + dNum;
          applyScale(chart, type, typeIdx, min, max);
        } else if (Number.isFinite(dNum) && Number.isFinite(sNum) === false) {
          // if duration present but no start, treat as max only (no min)
          const max = dNum;
          applyScale(chart, type, typeIdx, null, max);
        }

        const subscriberEndTime = performance.now();
        const subscriberTime = subscriberEndTime - subscriberStartTime;
        if (subscriberTime > 50) {
          console.log(
            `[Performance] 'duration' subscriber: ${type} series ${seriesIdx}`,
            {
              timeMs: subscriberTime.toFixed(2),
              performance: subscriberTime > 200 ? "🔴 VERY SLOW" : "🟡 SLOW",
            }
          );
        }
      } catch (err) {
        try {
          debugLite.log("subscriber.duration.fallback.recreate", {
            type,
            err,
          });
        } catch (e) {}
        recreateChartSync(type, typeIdx);
      }
    },
    { descendants: true }
  );

  // Subscribe to channelState changes
  try {
    console.log("[subscribeChartUpdates] Setting up channelState.subscribe");
    channelState.subscribe(
      (change) => {
        try {
          if (!Array.isArray(change.path) || !change.path[0]) return;
          chartTypes.forEach((type, idx) => {
            // Skip color/label here - those are handled by subscribeProperty to
            // avoid duplicate handling and duplicate debug logs.
            if (
              change.path[0] === type &&
              (change.path[1] === "lineColors" || change.path[1] === "yLabels")
            ) {
              return;
            }

            // Structural changes: axes, order, units, etc.
            if (
              change.path[0] === type &&
              (change.path[1] === "axesScales" ||
                change.path[1] === "order" ||
                change.path[1] === "yUnits" ||
                change.path[1] === "xLabel" ||
                change.path[1] === "xUnit")
            ) {
              recreateChart(type, idx);
              return;
            }
          });
        } catch (err) {
          console.error("[channelState subscriber] Error:", err);
        }
      },
      { descendants: true }
    );
    console.log("[subscribeChartUpdates] channelState.subscribe set up");
  } catch (err) {
    console.error(
      "[subscribeChartUpdates] Failed to set up channelState subscription:",
      err
    );
  }

  // Subscribe to data changes (full re-create)
  try {
    console.log("[subscribeChartUpdates] Setting up dataState.subscribe");
    dataState.subscribe((change) => {
      // ✅ CRITICAL: Skip if deletion handler is managing the update
      if (isHandlingDeletion) {
        console.log(
          "[dataState subscriber] 🚫 Skipping during deletion (isHandlingDeletion=true)"
        );
        return;
      }

      try {
        const type = change.path && change.path[0];
        const idx = chartTypes.indexOf(type);
        if (idx !== -1) {
          console.log(
            "[dataState subscriber] 🔄 Data changed, recreating chart",
            { type }
          );
          recreateChart(type, idx);
        }
      } catch (err) {
        console.error("[dataState subscriber] Error:", err);
      }
    });
    console.log("[subscribeChartUpdates] dataState.subscribe set up");
  } catch (err) {
    console.error(
      "[subscribeChartUpdates] Failed to set up dataState subscription:",
      err
    );
  }

  // Subscribe to verticalLinesX changes (re-apply overlays)
  try {
    console.log("[subscribeChartUpdates] Setting up verticalLinesX.subscribe");
    verticalLinesX.subscribe(() => {
      try {
        if (!Array.isArray(charts)) return;
        chartTypes.forEach((type, idx) => {
          if (charts[idx]) {
            // Assuming you have a function to update vertical lines overlay
            updateVerticalLinesOverlay(charts[idx], verticalLinesX);
          }
        });
      } catch (err) {
        console.error("[verticalLinesX subscriber] Error:", err);
      }
    });
    console.log("[subscribeChartUpdates] verticalLinesX.subscribe set up");
  } catch (err) {
    console.error(
      "[subscribeChartUpdates] Failed to set up verticalLinesX subscription:",
      err
    );
  }

  console.log("[subscribeChartUpdates] All subscriptions set up successfully");
}

// Helper: update vertical lines overlay (implement as needed)
function updateVerticalLinesOverlay(chart, verticalLines) {
  // Your logic to update vertical lines on the chart
  // For example, re-draw or update plugin state
}

/**
 * ============================================================================
 * CENTRALIZED CHANNEL UPDATE HANDLER (NEW OPTIMIZATION PATH)
 * ============================================================================
 *
 * Central entry point for all channel updates from the ChannelList popup.
 * Decides whether to apply cheap in-place updates or fall back to expensive
 * full rebuild based on the update type and impact analysis.
 *
 * This function is imported and called from main.js message handler to
 * replace the scattered update logic for better performance.
 */

import {
  applyColorChangeInPlace,
  applyDataTransformInPlace,
  simulateChannelGroupChange,
  simulateChannelDeletion,
  getChannelStateSnapshot,
  axisCountDidChange,
  applyGroupChangeInPlace,
  removeSeriesInPlace,
} from "./chartUpdateHelpers.js";

/**
 * Central handler for channel updates coming from the Tabulator / ChannelList.
 * Decides whether we can apply a cheap in-place update or must rebuild.
 *
 * @param {string} type - Update type ('color', 'scale', 'time_window', 'group', 'delete', 'update', etc.)
 * @param {any} payload - Payload from ChannelList (usually { row, value } or raw rowData)
 * @param {Object} channelState - Reactive channel state (required for some update types)
 * @param {Object} dataState - Reactive data state (used for data recalculation)
 * @param {Array} charts - Chart instances array [analogChart, digitalChart, ...]
 * @param {HTMLElement} chartsContainer - Container element for charts
 * @param {Function} onFullRebuild - Callback to trigger full rebuild if needed
 * @param {Function} [onProgress] - Optional progress callback: (percent, message) => void
 *
 * @returns {boolean} true if handled via cheap path, false if fallback to rebuild
 *
 * @example
 * import { handleChannelUpdate } from './components/chartManager.js';
 * 
 * handleChannelUpdate(
 *   'color',
 *   { row: {...}, value: '#ff0000' },
 *   channelState,
 *   dataState,
 *   charts,
 *   chartsContainer,
 *   () => fullRebuildFromState(),
 *   (percent, message) => updateProgress(percent, message)
 * );
 */
export function handleChannelUpdate(
  type,
  payload,
  channelState,
  dataState,
  charts,
  chartsContainer,
  onFullRebuild,
  onProgress
) {
  const startTime = performance.now();

  // ✅ NEW: Support progress callback
  const updateProgress = (percent, message) => {
    if (typeof onProgress === "function") {
      onProgress(percent, message);
    }
  };

  console.log("[handleChannelUpdate] Processing update:", {
    type,
    hasPayload: !!payload,
    hasChannelState: !!channelState,
    hasProgressCallback: !!onProgress,
  });

  try {
    switch (type) {
      case "color": {
        // Try cheap color update in-place
        console.log("[handleChannelUpdate] Attempting cheap color update...");
        const success = applyColorChangeInPlace(payload, channelState);

        if (success) {
          const elapsed = (performance.now() - startTime).toFixed(2);
          console.log(
            `[handleChannelUpdate] ✅ Cheap color update succeeded (${elapsed}ms)`
          );
          return true;
        }

        console.log(
          "[handleChannelUpdate] Color update failed, falling back to rebuild"
        );
        break; // Fallback to full rebuild
      }

      case "scale":
      case "time_window": {
        // Try cheap data transform (or defer to rebuild)
        console.log(
          "[handleChannelUpdate] Attempting cheap data transform update..."
        );
        const success = applyDataTransformInPlace(payload, channelState);

        if (success) {
          const elapsed = (performance.now() - startTime).toFixed(2);
          console.log(
            `[handleChannelUpdate] ✅ Cheap data transform succeeded (${elapsed}ms)`
          );
          return true;
        }

        console.log(
          "[handleChannelUpdate] Data transform deferred, using full rebuild"
        );
        break; // Fallback to full rebuild
      }

      case "group": {
        // Compare axis counts before and after simulated change
        console.log(
          "[handleChannelUpdate] Analyzing group change for structural impact..."
        );
        updateProgress(35, "Analyzing group change impact...");

        const row = payload?.row;
        const newGroup = payload?.value || payload?.group;

        if (!row || !newGroup || !channelState) {
          console.warn(
            "[handleChannelUpdate] Missing data for group change:",
            { row: !!row, newGroup, channelState: !!channelState }
          );
          break; // Fallback to full rebuild
        }

        // Simulate the change
        const beforeState = getChannelStateSnapshot(channelState);
        const channelID = row.channelID;

        const simulatedState = simulateChannelGroupChange(
          beforeState,
          channelID,
          newGroup
        );

        if (!simulatedState) {
          console.warn("[handleChannelUpdate] Could not simulate group change");
          break; // Fallback to full rebuild
        }

        // Check if axis count changed
        const axisChanged = axisCountDidChange(beforeState, simulatedState);
        updateProgress(50, "Comparing axis structures...");

        if (!axisChanged) {
          // Cheap path: just update group without axis change
          console.log(
            "[handleChannelUpdate] ✅ Group change does not affect axis count - using cheap path"
          );
          applyGroupChangeInPlace(channelID, newGroup, channelState);
          updateProgress(100, "Group change complete!");
          const elapsed = (performance.now() - startTime).toFixed(2);
          console.log(
            `[handleChannelUpdate] ✅ Cheap group change succeeded (${elapsed}ms)`
          );
          return true;
        }

        console.log(
          "[handleChannelUpdate] Group change affects axis count - using full rebuild"
        );
        updateProgress(75, "Rebuilding chart structure...");
        break; // Fallback to full rebuild
      }

      case "delete": {
        // Compare axis counts before and after simulated deletion
        console.log(
          "[handleChannelUpdate] Analyzing deletion for structural impact..."
        );

        const row = payload;

        if (!row || !channelState) {
          console.warn(
            "[handleChannelUpdate] Missing data for deletion:",
            { row: !!row, channelState: !!channelState }
          );
          break; // Fallback to full rebuild
        }

        // Simulate the deletion
        const beforeState = getChannelStateSnapshot(channelState);
        const channelID = row.channelID;

        const simulatedState = simulateChannelDeletion(beforeState, channelID);

        if (!simulatedState) {
          console.warn("[handleChannelUpdate] Could not simulate deletion");
          break; // Fallback to full rebuild
        }

        // Check if axis count changed
        const axisChanged = axisCountDidChange(beforeState, simulatedState);

        if (!axisChanged) {
          // Cheap path: just remove series without axis change
          console.log(
            "[handleChannelUpdate] ✅ Deletion does not affect axis count - using cheap path"
          );
          removeSeriesInPlace(channelID);
          const elapsed = (performance.now() - startTime).toFixed(2);
          console.log(
            `[handleChannelUpdate] ✅ Cheap deletion succeeded (${elapsed}ms)`
          );
          return true;
        }

        console.log(
          "[handleChannelUpdate] Deletion affects axis count - using full rebuild"
        );
        break; // Fallback to full rebuild
      }

      default: {
        // Unknown or complex update type
        console.log(
          `[handleChannelUpdate] Unknown or generic update type: "${type}" - using full rebuild`
        );
        break;
      }
    }
  } catch (err) {
    console.error("[handleChannelUpdate] Error in update handler:", err);
    // Fallback to full rebuild on error
  }

  // Fallback: execute full rebuild
  console.log(
    "[handleChannelUpdate] Falling back to full rebuild via onFullRebuild callback"
  );
  updateProgress(75, "Rebuilding charts...");
  
  if (typeof onFullRebuild === "function") {
    try {
      onFullRebuild();
      updateProgress(100, "Update complete!");
    } catch (err) {
      console.error("[handleChannelUpdate] Error calling onFullRebuild:", err);
    }
  }

  const elapsed = (performance.now() - startTime).toFixed(2);
  console.log(`[handleChannelUpdate] Full rebuild path (${elapsed}ms)`);

  return false;
}
