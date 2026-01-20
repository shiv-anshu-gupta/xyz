/**
 * @file analyzeGroupsAndPublish.js - Group Analysis & Y-Axes Synchronization
 * @module analyzeGroupsAndPublish
 * @category Architecture / Functional Approach
 * @since 2.0.0
 *
 * @description
 * Pure functional approach to analyze chart groups and publish the required number of Y-axes
 * to the global store. Replaces imperative destroy/rebuild logic with reactive state management.
 *
 * **Architecture Overview:**
 * This module is the "calculator" in the multi-Y-axes functional approach:
 * ```
 * Event: Group changed (user reassigns channel to different group)
 *     ↓
 * chartManager.js detects change via group subscriber
 *     ↓
 * Calls analyzeGroupsAndPublishMaxYAxes(charts, channelState, cfg)
 *     ↓
 * This function:
 *   1. Reads group assignments from channelState
 *   2. For each group, calls calculateAxisCountForGroup()
 *   3. Finds max axis count across all groups
 *   4. Calls setMaxYAxes() to publish to global store
 *     ↓
 * renderAnalogCharts, renderDigitalCharts, renderComputedChannels
 * read updated maxYAxes via getMaxYAxes() and create correct axis count
 * ```
 *
 * **Key Feature: Pure Function**
 * - No side effects except calling setMaxYAxes()
 * - Deterministic: same input = same output
 * - Easy to test: no global state pollution
 * - Memory safe: no subscriptions to manage
 *
 * **What Gets Analyzed:**
 * - User-assigned groups from channelState.analog.groups
 * - Channel units (V, A, W, Hz) from cfg.analogChannels
 * - Axis requirements per group (via axisCalculator.js)
 *
 * **Automatic Chart Updates:**
 * When maxYAxes is published, charts don't automatically re-render.
 * They must be destroyed and rebuilt by the group subscriber to apply new axis count.
 * The global store just maintains the "correct" value for all new chart renders.
 *
 * @example
 * // In a group change subscriber (chartManager.js)
 * import { analyzeGroupsAndPublishMaxYAxes } from '../utils/analyzeGroupsAndPublish.js';
 *
 * const newMaxYAxes = analyzeGroupsAndPublishMaxYAxes(charts, channelState, cfg);
 * console.log(`New axis count published: ${newMaxYAxes}`);
 * // Then, elsewhere in the group subscriber, charts are destroyed and re-rendered
 * // with the updated maxYAxes value
 */

import { calculateAxisCountForGroup } from "./axisCalculator.js";
import { setMaxYAxes } from "./maxYAxesStore.js";

/**
 * Analyze group composition and publish maxYAxes to global store
 *
 * Scans all groups, counts axis requirements per group, and publishes
 * the maximum count to the global store. This ensures all charts create
 * the same number of Y-axes for consistent visual alignment.
 *
 * @function analyzeGroupsAndPublishMaxYAxes
 * @category Group Analysis
 *
 * @param {Array} charts - Array of chart instances (for reference/logging only)
 * @param {Object} channelState - Reactive channel state object
 * @param {Array} channelState.analog - Analog channel state
 * @param {Array} channelState.analog.groups - Group assignment array (indices align with channels)
 * @param {Object} cfg - COMTRADE configuration object
 * @param {Array} cfg.analogChannels - Array of analog channel definitions with unit/name
 *
 * @returns {number} The calculated and published maxYAxes value (1, 2, 3, etc.)
 *
 * @description
 * **Algorithm:**
 * 1. Extract group assignments from channelState.analog.groups
 * 2. Convert string IDs ("G0", "G1") to numeric (0, 1) for consistency
 * 3. For each unique group ID:
 *    - Collect all channels in that group
 *    - Call calculateAxisCountForGroup() to determine axis requirements
 *    - Store result in groupsWithAxisCounts array
 * 4. Find maximum axisCount across all groups
 * 5. Publish to global store via setMaxYAxes()
 * 6. Log detailed analysis for debugging
 * 7. Return published value
 *
 * **Error Handling:**
 * If any error occurs during analysis, logs the error and falls back to maxYAxes=1.
 * This ensures the app never breaks due to analysis failures.
 *
 * @example
 * // In a group change handler
 * const maxYAxes = analyzeGroupsAndPublishMaxYAxes(charts, channelState, cfg);
 * // Output: 2 (if any group needs 2+ axes)
 * // Side effect: setMaxYAxes(2) called internally
 * // All future chart renders will use 2 Y-axes
 *
 * @example
 * // Console output shows group analysis:
 * // [analyzeGroupsAndPublishMaxYAxes] 📊 Analysis: G0(3ch,1ax:[V,V,V]) | G1(2ch,2ax:[A,A])
 * // [analyzeGroupsAndPublishMaxYAxes] 🎯 Publishing maxYAxes: 2
 */
export function analyzeGroupsAndPublishMaxYAxes(charts, channelState, cfg) {
  try {
    // Extract group assignments from state
    let userGroups = channelState?.analog?.groups || [];

    if (!userGroups || userGroups.length === 0) {
      console.log(
        "[analyzeGroupsAndPublishMaxYAxes] ℹ️ No groups found, setting maxYAxes to 1"
      );
      setMaxYAxes(1);
      return 1;
    }

    // Convert string group IDs ("G0", "G1") to numeric (0, 1) if needed
    userGroups = userGroups.map((g) => {
      if (typeof g === "string" && g.startsWith("G")) {
        return parseInt(g.substring(1), 10); // "G0" → 0, "G1" → 1
      }
      return g === -1 ? -1 : parseInt(g, 10); // Handle -1 (unassigned)
    });

    // Calculate how many groups exist
    const maxGroupId = Math.max(
      ...userGroups.map((g) => (g === -1 ? 0 : g)),
      0
    );
    const expectedGroupCount = maxGroupId + 1;

    // Build group objects with axis requirements
    const groupsWithAxisCounts = Array.from(
      { length: expectedGroupCount },
      (_, groupId) => {
        // Find all analog channel indices in this group
        const groupIndices = userGroups
          .map((g, idx) => (g === groupId ? idx : -1))
          .filter((idx) => idx >= 0);

        // Get analog channel configs for this group
        const groupChannels = groupIndices.map(
          (idx) => cfg?.analogChannels?.[idx] || {}
        );

        // ✅ FIX: Also include computed channels that belong to this group
        // Computed channels have a `group` field that stores their group ID
        const groupIdStr = `G${groupId}`; // Convert numeric to string format
        const computedChannelsInGroup = (cfg?.computedChannels || [])
          .filter(ch => {
            const chGroup = ch.group;
            // Match both "G0" string format and numeric 0 format
            return chGroup === groupIdStr || chGroup === groupId || chGroup === String(groupId);
          })
          .map(ch => ({ unit: ch.unit || "?" }));

        // Combine analog + computed channels for axis calculation
        const allChannelsInGroup = [...groupChannels, ...computedChannelsInGroup];

        // Calculate how many Y-axes this group needs (based on ALL channel units)
        const axisCount = calculateAxisCountForGroup(allChannelsInGroup);

        return {
          id: groupId,
          indices: groupIndices,
          channelCount: groupChannels.length,
          computedCount: computedChannelsInGroup.length,
          axisCount: axisCount,
          units: allChannelsInGroup.map((ch) => ch.unit || "?"),
        };
      }
    );

    // Find the maximum Y-axes needed across ALL groups
    const maxYAxesNeeded = Math.max(
      ...groupsWithAxisCounts.map((g) => g.axisCount || 1),
      1 // At least 1
    );

    // Log analysis
    const groupSummary = groupsWithAxisCounts
      .map(
        (g) =>
          `G${g.id}(${g.channelCount}an+${g.computedCount || 0}comp,${g.axisCount}ax:[${g.units.join(
            ","
          )}])`
      )
      .join(" | ");

    console.log(`[analyzeGroupsAndPublishMaxYAxes] 📊 Analysis:`, groupSummary);
    console.log(
      `[analyzeGroupsAndPublishMaxYAxes] 🎯 Publishing maxYAxes: ${maxYAxesNeeded}`
    );

    // Publish to global store - this is the ONLY side effect
    setMaxYAxes(maxYAxesNeeded);

    return maxYAxesNeeded;
  } catch (err) {
    console.error("[analyzeGroupsAndPublishMaxYAxes] ❌ Error:", err);
    // Fallback to default
    setMaxYAxes(1);
    return 1;
  }
}

/**
 * Analyze a specific group's axis requirements (internal utility)
 *
 * Useful for validation or debugging specific groups without analyzing all groups.
 * Does NOT publish to global store - just returns the axis count.
 *
 * @function analyzeSpecificGroup
 * @category Group Analysis / Advanced
 * @param {number|string} groupId - The group to analyze (0, 1, "G0", "G1", etc.)
 * @param {Object} channelState - Reactive channel state object
 * @param {Object} cfg - COMTRADE configuration object
 * @returns {number} Axis count needed for this specific group (1, 2, etc.)
 *
 * @description
 * This is a lower-level utility for when you need to check a single group.
 * It does NOT call setMaxYAxes(), so it won't affect the global state.
 * Useful for:
 * - Validation before publishing
 * - Debugging individual groups
 * - Testing group analysis logic
 *
 * @example
 * const axisCount = analyzeSpecificGroup(0, channelState, cfg);
 * console.log(`Group 0 needs ${axisCount} axes`);
 *
 * @internal
 */
export function analyzeSpecificGroup(groupId, channelState, cfg) {
  let userGroups = channelState?.analog?.groups || [];

  // Convert string group IDs ("G0", "G1") to numeric (0, 1) if needed
  userGroups = userGroups.map((g) => {
    if (typeof g === "string" && g.startsWith("G")) {
      return parseInt(g.substring(1), 10);
    }
    return g === -1 ? -1 : parseInt(g, 10);
  });

  // Convert groupId parameter if it's a string
  if (typeof groupId === "string" && groupId.startsWith("G")) {
    groupId = parseInt(groupId.substring(1), 10);
  }

  const groupIndices = userGroups
    .map((g, idx) => (g === groupId ? idx : -1))
    .filter((idx) => idx >= 0);

  const groupChannels = groupIndices.map(
    (idx) => cfg?.analogChannels?.[idx] || {}
  );

  return calculateAxisCountForGroup(groupChannels);
}
