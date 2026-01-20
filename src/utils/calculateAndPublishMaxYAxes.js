/**
 * @module calculateAndPublishMaxYAxes
 * @description Calculate the global maxYAxes count and publish to the global store
 * This is the single place where axis calculation happens
 */

import { calculateAxisCountForGroup } from "./axisCalculator.js";
import { getGlobalAxisAlignment } from "./chartAxisAlignment.js";
import { setMaxYAxes } from "./maxYAxesStore.js";

/**
 * Calculate maxYAxes based on group composition and publish to store
 * @param {Array} groups - Array of group objects with channels
 * @returns {number} The calculated maxYAxes value
 *
 * @example
 * const groups = [
 *   { indices: [0,1,2], name: "G0" },
 *   { indices: [3], name: "G1" }
 * ];
 * const maxYAxes = calculateAndPublishMaxYAxes(groups);
 * // Returns: 2
 */
export function calculateAndPublishMaxYAxes(groups) {
  if (!groups || groups.length === 0) {
    console.log(
      "[calculateAndPublishMaxYAxes] ℹ️ No groups, setting maxYAxes to 1"
    );
    setMaxYAxes(1);
    return 1;
  }

  // Calculate how many axes each group needs
  const groupsWithAxisCounts = groups.map((group) => ({
    ...group,
    axisCount: calculateAxisCountForGroup(
      group.indices.map((idx) => global.cfg?.analogChannels?.[idx] || {})
    ),
  }));

  // Find the global maximum
  const maxYAxes = getGlobalAxisAlignment(groupsWithAxisCounts);

  console.log(
    `[calculateAndPublishMaxYAxes] 🔧 Calculated maxYAxes: ${maxYAxes}`,
    `(from groups: ${groupsWithAxisCounts.map((g) => g.axisCount).join(", ")})`
  );

  // Publish to global store
  setMaxYAxes(maxYAxes);

  return maxYAxes;
}

/**
 * Batch calculate for both analog and digital if available
 * @param {Object} channelState - Channel state object
 * @param {Object} cfg - COMTRADE config object
 * @returns {number} The calculated maxYAxes value
 */
export function calculateAndPublishMaxYAxesFromState(channelState, cfg) {
  if (!channelState?.analog?.groups) {
    console.warn(
      "[calculateAndPublishMaxYAxesFromState] Missing analog groups"
    );
    setMaxYAxes(1);
    return 1;
  }

  const userGroups = channelState.analog.groups;
  const expectedGroupCount =
    Math.max(...userGroups.map((g) => (g === -1 ? 0 : g)), 0) + 1;

  // Reconstruct groups from state
  const analogGroups = Array.from(
    { length: expectedGroupCount },
    (_, groupId) => {
      const groupIndices = userGroups
        .map((g, idx) => (g === groupId ? idx : -1))
        .filter((idx) => idx >= 0);

      return {
        indices: groupIndices,
        name: `G${groupId}`,
        axisCount: calculateAxisCountForGroup(
          groupIndices.map((idx) => cfg?.analogChannels?.[idx] || {})
        ),
      };
    }
  );

  console.log(
    `[calculateAndPublishMaxYAxesFromState] 📊 Recalculated from state`,
    `groups: ${analogGroups
      .map((g) => `${g.name}:${g.axisCount}axes`)
      .join(", ")}`
  );

  return calculateAndPublishMaxYAxes(analogGroups);
}
