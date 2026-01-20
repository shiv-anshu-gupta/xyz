/**
 * @file chartUpdateHelpers.js
 * @module chartUpdateHelpers
 * @category Performance / Chart Updates
 * @since 2.1.0
 *
 * @description
 * Helper functions for incremental/in-place chart updates that avoid expensive full rebuilds.
 * Provides utilities for:
 * - Color updates in-place
 * - Scale/data transform updates
 * - Group change detection and simulation
 * - Channel deletion with axis count comparison
 * - Series manipulation without full rebuild
 *
 * These helpers are used by the new centralized handleChannelUpdate() flow
 * to decide whether a cheap in-place update is possible or a full rebuild is needed.
 */

import { getChartMetadataState } from "../utils/chartMetadataStore.js";
import {
  calculateAxisCountsForAllGroups,
  didAxisCountChange,
} from "../utils/axisCalculator.js";

/**
 * Find the chart metadata entry for a specific channel
 * @param {string} channelID - Channel ID to find
 * @returns {Object|null} Chart metadata entry or null if not found
 */
export function findChartEntryForChannel(channelID) {
  if (!channelID) return null;

  const metadata = getChartMetadataState();
  if (!metadata || !Array.isArray(metadata.charts)) return null;

  for (const chart of metadata.charts) {
    if (Array.isArray(chart.channels)) {
      const channelEntry = chart.channels.find((ch) => ch.channelID === channelID);
      if (channelEntry) {
        return {
          chart,
          channelEntry,
          channelIndex: chart.channels.indexOf(channelEntry),
        };
      }
    }
  }

  return null;
}

/**
 * Apply a color change in-place without rebuilding charts
 * @param {Object} payload - { row, value } where row has channelID and type
 * @param {Object} channelState - Reactive channel state
 * @returns {boolean} true if successful
 */
export function applyColorChangeInPlace(payload, channelState) {
  if (!payload || !payload.row) {
    console.warn("[applyColorChangeInPlace] Missing payload or row", payload);
    return false;
  }

  const { row, value: newColor } = payload;
  const { channelID, type } = row;

  if (!channelID) {
    console.warn("[applyColorChangeInPlace] Missing channelID in row", row);
    return false;
  }

  console.log("[applyColorChangeInPlace] Applying color change in-place", {
    channelID,
    newColor,
  });

  // Find chart entry
  const entry = findChartEntryForChannel(channelID);
  if (!entry) {
    console.warn(
      "[applyColorChangeInPlace] Chart entry not found for channel",
      channelID
    );
    return false;
  }

  const { chart, channelIndex } = entry;
  const uPlotInstance = chart.uPlotInstance ? window[chart.uPlotInstance] : null;

  if (!uPlotInstance || typeof uPlotInstance.setSeries !== "function") {
    console.warn(
      "[applyColorChangeInPlace] Cannot access uPlot instance",
      chart.uPlotInstance
    );
    return false;
  }

  try {
    // Series index = channel index + 1 (time array is at index 0)
    const seriesIdx = channelIndex + 1;

    // Update uPlot series color
    uPlotInstance.setSeries(seriesIdx, { stroke: newColor });
    console.log(
      "[applyColorChangeInPlace] ✅ Updated uPlot series",
      seriesIdx,
      "color to",
      newColor
    );

    // Update reactive state so future rebuilds use new color
    if (channelState && type) {
      const typeKey = (type || "").toLowerCase();
      if (typeKey === "analog" || typeKey === "digital" || typeKey === "computed") {
        if (!Array.isArray(channelState[typeKey].lineColors)) {
          channelState[typeKey].lineColors = [];
        }
        const found = findChannelIndex(channelState, channelID, typeKey);
        if (found >= 0) {
          channelState[typeKey].lineColors[found] = newColor;
          console.log(
            "[applyColorChangeInPlace] ✅ Updated channelState color for",
            typeKey,
            found
          );
        }
      }
    }

    return true;
  } catch (err) {
    console.error("[applyColorChangeInPlace] Error:", err);
    return false;
  }
}

/**
 * Apply data transform (scale/time_window) changes
 * For now, returns false to trigger full rebuild. Can be enhanced.
 * @param {Object} payload - { row, type, value }
 * @param {Object} channelState - Reactive channel state
 * @returns {boolean} true if successful in-place update
 */
export function applyDataTransformInPlace(payload, channelState) {
  // Placeholder: scale and time_window changes often require data recalculation
  // For a v1 implementation, we can update state but trigger a rebuild
  // A more sophisticated v2 could recalculate data and call setData() on uPlot
  console.log("[applyDataTransformInPlace] Data transform (scale/time_window) - deferring to rebuild");
  return false; // Fallback to full rebuild
}

/**
 * Find the index of a channel within its type section
 * @param {Object} channelState - Reactive state
 * @param {string} channelID - Channel ID to find
 * @param {string} typeKey - "analog", "digital", or "computed"
 * @returns {number} Index if found, -1 otherwise
 */
export function findChannelIndex(channelState, channelID, typeKey) {
  if (!channelState || !channelState[typeKey]) return -1;

  const channelIDs = channelState[typeKey].channelIDs || [];
  return channelIDs.indexOf(channelID);
}

/**
 * Simulate a group change without committing it
 * Returns a cloned state with the channel moved to a new group
 * @param {Object} currentState - Current channel state
 * @param {string} channelID - Channel to move
 * @param {string} newGroup - Target group ID
 * @returns {Object|null} Simulated state or null if channel not found
 */
export function simulateChannelGroupChange(currentState, channelID, newGroup) {
  if (!currentState || !channelID || !newGroup) {
    console.warn(
      "[simulateChannelGroupChange] Invalid inputs",
      { channelID, newGroup }
    );
    return null;
  }

  try {
    // Find which type and index the channel belongs to
    let found = null;
    let typeKey = null;

    for (const type of ["analog", "digital", "computed"]) {
      const state = currentState[type];
      if (!state) continue;

      const channelIDs = state.channelIDs || [];
      const idx = channelIDs.indexOf(channelID);

      if (idx >= 0) {
        found = idx;
        typeKey = type;
        break;
      }
    }

    if (found === null || !typeKey) {
      console.warn("[simulateChannelGroupChange] Channel not found:", channelID);
      return null;
    }

    // Clone the entire state (shallow clone for arrays is fine)
    const simulatedState = {
      analog: currentState.analog ? { ...currentState.analog } : {},
      digital: currentState.digital ? { ...currentState.digital } : {},
      computed: currentState.computed ? { ...currentState.computed } : {},
    };

    // Clone groups array for the affected type
    if (!Array.isArray(simulatedState[typeKey].groups)) {
      simulatedState[typeKey].groups = [];
    } else {
      simulatedState[typeKey].groups = [...simulatedState[typeKey].groups];
    }

    // Apply the change
    simulatedState[typeKey].groups[found] = newGroup;

    console.log("[simulateChannelGroupChange] Simulated group change:", {
      channelID,
      type: typeKey,
      index: found,
      newGroup,
    });

    return simulatedState;
  } catch (err) {
    console.error("[simulateChannelGroupChange] Error:", err);
    return null;
  }
}

/**
 * Simulate a channel deletion without committing it
 * Returns a cloned state with the channel removed
 * @param {Object} currentState - Current channel state
 * @param {string} channelID - Channel to delete
 * @returns {Object|null} Simulated state or null if channel not found
 */
export function simulateChannelDeletion(currentState, channelID) {
  if (!currentState || !channelID) {
    console.warn("[simulateChannelDeletion] Invalid inputs");
    return null;
  }

  try {
    // Find which type and index the channel belongs to
    let found = null;
    let typeKey = null;

    for (const type of ["analog", "digital", "computed"]) {
      const state = currentState[type];
      if (!state) continue;

      const channelIDs = state.channelIDs || [];
      const idx = channelIDs.indexOf(channelID);

      if (idx >= 0) {
        found = idx;
        typeKey = type;
        break;
      }
    }

    if (found === null || !typeKey) {
      console.warn("[simulateChannelDeletion] Channel not found:", channelID);
      return null;
    }

    // Clone the entire state
    const simulatedState = {
      analog: currentState.analog ? { ...currentState.analog } : {},
      digital: currentState.digital ? { ...currentState.digital } : {},
      computed: currentState.computed ? { ...currentState.computed } : {},
    };

    // List of per-channel arrays that must stay synchronized
    const arrayNames = [
      "yLabels",
      "lineColors",
      "yUnits",
      "groups",
      "axesScales",
      "scales",
      "starts",
      "durations",
      "inverts",
      "channelIDs",
    ];

    // Clone and splice each array
    for (const arrayName of arrayNames) {
      if (Array.isArray(simulatedState[typeKey][arrayName])) {
        simulatedState[typeKey][arrayName] = [
          ...simulatedState[typeKey][arrayName],
        ];
        simulatedState[typeKey][arrayName].splice(found, 1);
      }
    }

    console.log("[simulateChannelDeletion] Simulated deletion:", {
      channelID,
      type: typeKey,
      index: found,
    });

    return simulatedState;
  } catch (err) {
    console.error("[simulateChannelDeletion] Error:", err);
    return null;
  }
}

/**
 * Get a snapshot of the current channel state
 * Used for comparison before and after simulated changes
 * @param {Object} channelState - Reactive channel state
 * @returns {Object} Snapshot of state (suitable for comparison)
 */
export function getChannelStateSnapshot(channelState) {
  if (!channelState) return { analog: {}, digital: {}, computed: {} };

  return {
    analog: channelState.analog || {},
    digital: channelState.digital || {},
    computed: channelState.computed || {},
  };
}

/**
 * Check if axis count changed between two states
 * Uses existing axisCalculator to determine if a rebuild is needed
 * @param {Object} beforeState - Channel state before change
 * @param {Object} afterState - Channel state after change
 * @returns {boolean} true if axis count changed
 */
export function axisCountDidChange(beforeState, afterState) {
  try {
    const beforeCounts = calculateAxisCountsForAllGroups(beforeState);
    const afterCounts = calculateAxisCountsForAllGroups(afterState);

    const changed = didAxisCountChange(beforeCounts, afterCounts);
    console.log("[axisCountDidChange] Axis comparison:", {
      before: beforeCounts,
      after: afterCounts,
      changed,
    });

    return changed;
  } catch (err) {
    console.error("[axisCountDidChange] Error:", err);
    return true; // Assume change if we can't determine
  }
}

/**
 * Apply a group change in-place by moving series between uPlot instances
 * This is a simplified approach; complex scenarios still need full rebuild
 * @param {string} channelID - Channel to move
 * @param {string} newGroup - New group ID
 * @param {Object} channelState - Reactive state (used to find new chart)
 * @returns {boolean} true if successful
 */
export function applyGroupChangeInPlace(
  channelID,
  newGroup,
  channelState
) {
  console.log("[applyGroupChangeInPlace] Attempting in-place group change:", {
    channelID,
    newGroup,
  });

  // This is a complex operation requiring coordination between multiple uPlot instances.
  // For v1, we'll return false to trigger full rebuild.
  // Future enhancement: implement series moving logic if needed.

  return false; // Fallback to full rebuild
}

/**
 * Remove a series from its uPlot instance in-place
 * @param {string} channelID - Channel to remove
 * @returns {boolean} true if successful
 */
export function removeSeriesInPlace(channelID) {
  console.log("[removeSeriesInPlace] Attempting in-place deletion:", {
    channelID,
  });

  if (!channelID) return false;

  try {
    const entry = findChartEntryForChannel(channelID);
    if (!entry) {
      console.warn(
        "[removeSeriesInPlace] Chart entry not found for channel",
        channelID
      );
      return false;
    }

    const { chart, channelIndex } = entry;
    const uPlotInstance = chart.uPlotInstance
      ? window[chart.uPlotInstance]
      : null;

    if (!uPlotInstance || typeof uPlotInstance.delSeries !== "function") {
      console.warn("[removeSeriesInPlace] Cannot access uPlot delSeries");
      return false;
    }

    // Series index = channel index + 1 (time array is at index 0)
    const seriesIdx = channelIndex + 1;

    // Remove the series
    uPlotInstance.delSeries(seriesIdx);
    console.log("[removeSeriesInPlace] ✅ Deleted series", seriesIdx);

    // Update metadata to remove the channel
    chart.channels.splice(channelIndex, 1);

    return true;
  } catch (err) {
    console.error("[removeSeriesInPlace] Error:", err);
    return false;
  }
}
