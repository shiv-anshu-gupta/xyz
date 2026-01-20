import { createDragBar } from "../components/createDragBar.js";
import {
  filterValidIndices,
  extractChannelMetadata,
  extractGroupId,
  computeChartDataDimensions,
  buildChartData,
  mergeAnalogAndComputedMetadata,
} from "./groupingUtils.js";
import { loadComputedChannelsFromStorage } from "./computedChannelStorage.js";

/**
 * Load and filter computed channels for a specific group
 * @param {string} groupId - The group ID to filter by
 * @returns {Array} Array of computed channels for the group
 */
export function loadComputedChannelsForGroup(groupId) {
  const storedComputedChannels = loadComputedChannelsFromStorage();
  return Array.isArray(storedComputedChannels)
    ? storedComputedChannels.filter((ch) => ch.group === groupId)
    : [];
}

/**
 * Validate and prepare group for chart rendering
 * @param {Object} config - Configuration object
 * @returns {Object|null} Validated indices or null if invalid
 */
export function validateGroupIndices({
  resolvedIndices,
  channelState,
  groupName,
}) {
  const analogState = channelState?.analog || {};
  const yLabelsLength = analogState.yLabels?.length || 0;

  const validIndices = filterValidIndices(resolvedIndices, yLabelsLength);

  if (validIndices.length === 0) {
    console.log(
      `[chartDataProcessor] ⏭️ Group "${groupName}" has no valid channel indices, skipping`
    );
    return null;
  }

  return validIndices;
}

/**
 * Extract and prepare all data needed for chart rendering
 * @param {Object} config - Configuration with validIndices, data, etc.
 * @returns {Object|null} Complete context or null if no data
 */
export function prepareChartDataContext({
  validIndices,
  userGroups,
  channelState,
  data,
  groupName,
}) {
  const channelMetadata = extractChannelMetadata(validIndices, channelState);
  const groupId = extractGroupId(validIndices, userGroups, groupName);

  const computedForGroup = loadComputedChannelsForGroup(groupId);

  console.log(
    `[chartDataProcessor] 🟪 Group "${groupId}": Found ${computedForGroup.length} computed channels to merge`
  );

  const { analogSeriesWithData, sampleCount, timeArray } =
    computeChartDataDimensions(validIndices, data, computedForGroup);

  if (analogSeriesWithData.length === 0 && computedForGroup.length === 0) {
    console.warn(
      `[chartDataProcessor] ⏭️ Skipping group "${groupId}" (no analog data and no computed to merge)`
    );
    return null;
  }

  const chartData = buildChartData(
    timeArray,
    analogSeriesWithData,
    data,
    sampleCount,
    computedForGroup
  );

  const mergedMetadata = mergeAnalogAndComputedMetadata(
    analogSeriesWithData,
    channelMetadata,
    computedForGroup
  );

  console.log(
    `[chartDataProcessor] 📋 Group "${groupName}": yLabels=[${mergedMetadata.includedYLabels.join(", ")}]`
  );

  return {
    channelMetadata,
    validIndices,
    groupId,
    computedForGroup,
    analogSeriesWithData,
    chartData,
    mergedMetadata,
  };
}

/**
 * Create drag bar for group
 * @param {Object} config - Drag bar configuration
 * @returns {Object} Drag bar instance
 */
export function createGroupDragBar({ validIndices, groupName, cfg, channelState }) {
  return createDragBar({ indices: validIndices, name: groupName }, cfg, channelState);
}
