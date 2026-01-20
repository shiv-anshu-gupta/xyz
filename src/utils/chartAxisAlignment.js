/**
 * @module chartAxisAlignment
 * @description
 * Utility for calculating global Y-axis count across all chart instances.
 * Ensures that if any chart needs multiple Y-axes, all charts display
 * the same number of Y-axes for visual consistency.
 */

/**
 * Calculate the maximum number of Y-axes needed across all groups
 * Ensures all charts will have the same number of axes
 * @param {Array} groups - Array of channel groups from autoGroupChannels
 * @returns {number} Maximum number of Y-axes needed globally
 */
export function getGlobalAxisAlignment(groups) {
  if (!groups || groups.length === 0) return 1;

  // Find the maximum axis count needed across all groups
  const maxAxesNeeded = Math.max(
    ...groups.map((g) => g.axisCount || 1),
    1 // At least 1
  );

  return maxAxesNeeded;
}
