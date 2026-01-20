import { calculateAxisCountForGroup } from "./axisCalculator.js";
import { resolveTimeArray } from "./computedChannelDataProcessor.js";

/**
 * Build groups from user-assigned groups and auto-group unassigned channels
 * @param {Array} userGroups - Array of group names assigned to each channel
 * @param {Array} totalAnalog - Array of all analog channel objects
 * @param {Array} channelIDs - Array of channel IDs
 * @param {Function} autoGroupChannels - Function to auto-group channels
 * @returns {Array} Array of group objects with { name, indices, ids, axisCount, colors }
 */
export function buildGroupsWithUserAssignments(
  userGroups,
  totalAnalog,
  channelIDs,
  autoGroupChannels
) {
  console.log("[groupingUtils] Building groups with user assignments...");

  const explicit = {};
  const autoIndices = [];

  // Separate explicit groups from unassigned channels
  for (let i = 0; i < totalAnalog.length; i++) {
    const g = userGroups[i];
    if (g === undefined || g === null || g === "") {
      autoIndices.push(i);
    } else {
      if (!explicit[g]) explicit[g] = [];
      explicit[g].push(i);
    }
  }

  // Build groups from explicit assignments
  const groups = Object.entries(explicit).map(([name, idxs]) => ({
    name,
    indices: idxs.slice(),
    ids: idxs.map((j) => channelIDs[j]),
    axisCount: calculateAxisCountForGroup(
      idxs.map((idx) => totalAnalog[idx])
    ),
  }));

  // Auto-group any remaining unassigned channels
  if (autoIndices.length > 0) {
    console.log(
      `[groupingUtils] ⚡ Auto-grouping ${autoIndices.length} unassigned channels`
    );
    const autoStartTime = performance.now();

    const remainingChannels = autoIndices.map((i) => totalAnalog[i]);
    const autoGroups = autoGroupChannels(remainingChannels || []);

    const autoEndTime = performance.now();
    console.log(
      `[groupingUtils] ✓ Auto-grouping took ${(autoEndTime - autoStartTime).toFixed(2)}ms`
    );

    autoGroups.forEach((ag) => {
      const globalIndices = ag.indices.map(
        (localIdx) => autoIndices[localIdx]
      );
      groups.push({
        name: ag.name,
        indices: globalIndices,
        ids: globalIndices.map((gi) => channelIDs[gi]),
        colors: ag.colors,
        axisCount: calculateAxisCountForGroup(
          globalIndices.map((idx) => totalAnalog[idx])
        ),
      });
    });
  }

  return groups;
}

/**
 * Build groups using full auto-grouping for all channels
 * @param {Array} totalAnalog - Array of all analog channel objects
 * @param {Array} channelIDs - Array of channel IDs
 * @param {Object} channelState - Channel state object with yLabels, yUnits, etc.
 * @param {Function} autoGroupChannels - Function to auto-group channels
 * @returns {Array} Array of group objects with { name, indices, ids, axisCount, colors }
 */
export function buildGroupsWithAutoGrouping(
  totalAnalog,
  channelIDs,
  channelState,
  autoGroupChannels
) {
  console.log(
    `[groupingUtils] 🔄 Running full autoGroupChannels on ${totalAnalog.length} channels...`
  );
  const autoStartTime = performance.now();

  // Build current channel objects from state instead of using stale cfg.analogChannels
  // This ensures indices are correct after deletions
  const currentChannels = channelIDs.map((id, idx) => ({
    id: id || `analog-${idx}`,
    channelID: id,
    unit: channelState.analog.yUnits?.[idx] || "",
    name: channelState.analog.yLabels?.[idx] || `Ch ${idx}`,
    index: idx,
  }));

  const autoGroups = autoGroupChannels(currentChannels || []);

  const autoEndTime = performance.now();
  console.log(
    `[groupingUtils] ✓ Full autoGroupChannels took ${(autoEndTime - autoStartTime).toFixed(2)}ms`
  );

  return autoGroups.map((g) => ({
    name: g.name,
    indices: (g.indices || []).slice(),
    ids: (g.indices || []).map((idx) => channelIDs[idx]),
    colors: g.colors,
    axisCount: calculateAxisCountForGroup(
      (g.indices || []).map((idx) => currentChannels[idx])
    ),
  }));
}

/**
 * Filter groups to only include those with actual channels
 * @param {Array} groups - Array of group objects
 * @returns {Array} Filtered array of groups with channels
 */
export function filterGroupsWithChannels(groups) {
  const groupsWithChannels = groups.filter((group) => {
    const hasChannels =
      (group.ids && group.ids.length > 0) ||
      (group.indices && group.indices.filter((i) => i >= 0).length > 0);
    if (!hasChannels) {
      console.log(
        `[groupingUtils] ⏭️ Skipping group "${group.name}" - no channels assigned`
      );
    }
    return hasChannels;
  });

  console.log(
    `[groupingUtils] ✅ Filtered ${groups.length} → ${groupsWithChannels.length} groups with channels`
  );

  return groupsWithChannels;
}

/**
 * Resolve channel indices for a group from IDs and fallback indices
 * @param {Object} group - Group object with ids and indices properties
 * @param {Array} channelIDs - Array of all channel IDs for lookup
 * @returns {Array} Array of resolved indices
 */
export function resolveGroupIndices(group, channelIDs) {
  // Resolve any missing ids -> indices mapping defensively
  const resolvedIndicesRaw = (group.ids || []).map((id, i) => {
    if (id == null) return group.indices ? group.indices[i] : -1;
    const idx = channelIDs.indexOf(id);
    return idx >= 0 ? idx : group.indices ? group.indices[i] : -1;
  });

  console.log(
    `[groupingUtils] 🔍 Group "${group.name}": ids=[${(group.ids || []).join(", ")}], resolvedIndicesRaw=[${resolvedIndicesRaw.join(", ")}]`
  );

  // Filter out unresolved indices
  const resolvedIndices = resolvedIndicesRaw.filter(
    (idx) => Number.isFinite(idx) && idx >= 0
  );

  return resolvedIndices;
}

/**
 * Filter indices to only those within valid bounds
 * @param {Array} indices - Array of channel indices
 * @param {number} maxLength - Maximum valid index (exclusive)
 * @returns {Array} Filtered array of valid indices
 */
export function filterValidIndices(indices, maxLength) {
  return indices.filter((idx) => idx >= 0 && idx < maxLength);
}

/**
 * Extract group ID from first valid channel in group
 * @param {Array} validIndices - Array of valid channel indices
 * @param {Array} userGroups - Array of group names per channel
 * @param {string} groupName - Fallback group name if no valid indices
 * @returns {string} Group ID or empty string
 */
export function extractGroupId(validIndices, userGroups, groupName) {
  if (validIndices.length > 0) {
    const groupId = userGroups[validIndices[0]];
    console.log(
      `[groupingUtils] 🏷️ Extracted groupId "${groupId}" from first channel at index ${validIndices[0]}`
    );
    return groupId || "";
  }
  return "";
}

/**
 * Extract channel metadata from state for valid indices
 * @param {Array} validIndices - Array of valid channel indices
 * @param {Object} channelState - Channel state object
 * @returns {Object} Object with yLabels, lineColors, yUnits, axesScales, xLabel, xUnit
 */
export function extractChannelMetadata(validIndices, channelState) {
  const yLabels = channelState?.analog?.yLabels || [];
  const lineColors = channelState?.analog?.lineColors || [];
  const yUnits = channelState?.analog?.yUnits || [];
  const axesScales = channelState?.analog?.axesScales || [];
  const xLabel = channelState?.analog?.xLabel || "";
  const xUnit = channelState?.analog?.xUnit || "";

  return {
    yLabels,
    lineColors,
    yUnits,
    axesScales,
    xLabel,
    xUnit,
    groupYLabels: validIndices.map((idx) => yLabels[idx]),
    groupLineColors: validIndices.map((idx) => lineColors[idx]),
    groupYUnits: validIndices.map((idx) => yUnits[idx]),
    groupAxesScales: [
      axesScales[0],
      ...validIndices.map((idx) => axesScales[idx + 1]),
    ],
  };
}

/**
 * Find analog series with data and compute sample count
 * @param {Array} validIndices - Array of valid channel indices
 * @param {Object} data - Data object containing analogData
 * @param {Array} computedForGroup - Array of computed channels for this group
 * @returns {Object} Object with analogSeriesWithData, sampleCount, timeArray
 */
export function computeChartDataDimensions(validIndices, data, computedForGroup) {
  const analogSeriesWithData = validIndices.filter(
    (idx) => Array.isArray(data.analogData?.[idx]) && data.analogData[idx].length > 0
  );

  const seriesLengths = [];
  analogSeriesWithData.forEach((idx) =>
    seriesLengths.push(data.analogData[idx].length)
  );
  computedForGroup.forEach((ch) => {
    if (Array.isArray(ch?.data) && ch.data.length > 0) {
      seriesLengths.push(ch.data.length);
    }
  });

  let sampleCount = seriesLengths.length ? Math.min(...seriesLengths) : 0;
  if (!sampleCount) sampleCount = 62464; // fallback

  // Use centralized time array resolution (handles data.time, data.timeArray, or synthetic)
  const timeArray = resolveTimeArray(data, computedForGroup);

  console.log(
    `[groupingUtils] ✅ Computed dimensions: sampleCount=${sampleCount}, analogSeries=${analogSeriesWithData.length}, computed=${computedForGroup.length}`
  );

  return { analogSeriesWithData, sampleCount, timeArray };
}

/**
 * Build chart data array combining analog and computed channels
 * @param {Array} timeArray - Time array for X-axis
 * @param {Array} analogSeriesWithData - Indices of analog series with data
 * @param {Object} data - Data object containing analogData
 * @param {number} sampleCount - Number of samples to use
 * @param {Array} computedForGroup - Array of computed channels
 * @returns {Array} Chart data array [timeArray, ...series]
 */
export function buildChartData(
  timeArray,
  analogSeriesWithData,
  data,
  sampleCount,
  computedForGroup
) {
  const chartData = [timeArray];

  // Add analog series
  analogSeriesWithData.forEach((idx) => {
    const series = data.analogData?.[idx];
    if (Array.isArray(series) && series.length > 0) {
      chartData.push(series.slice(0, sampleCount));
      if (series.length !== sampleCount) {
        console.log(
          `[groupingUtils] 🔧 Trimmed analog series idx=${idx} from ${series.length} → ${sampleCount}`
        );
      }
    } else {
      console.warn(
        `[groupingUtils] ⚠️ Skipping analog channel at index ${idx} (no data array)`
      );
    }
  });

  // Add computed series
  computedForGroup.forEach((computedCh) => {
    if (Array.isArray(computedCh.data) && computedCh.data.length > 0) {
      const normalizedComputed = computedCh.data.slice(0, sampleCount);
      chartData.push(normalizedComputed);
      console.log(
        `[groupingUtils] 📈 Added computed channel "${computedCh.name}" (len=${normalizedComputed.length})`
      );
    } else {
      console.warn(
        `[groupingUtils] ⚠️ Computed channel "${computedCh.name}" has no data`
      );
    }
  });

  return chartData;
}

/**
 * Merge analog and computed channel metadata for chart display
 * @param {Array} includedAnalogIndices - Indices of included analog channels
 * @param {Object} metadata - Object with yLabels, lineColors, yUnits, axesScales
 * @param {Array} computedForGroup - Array of computed channels
 * @returns {Object} Object with merged labels, colors, units, scales
 */
export function mergeAnalogAndComputedMetadata(
  includedAnalogIndices,
  metadata,
  computedForGroup
) {
  const { yLabels, lineColors, yUnits, axesScales } = metadata;

  const includedYLabels = includedAnalogIndices.map((idx) => yLabels[idx]);
  const includedLineColors = includedAnalogIndices.map((idx) => lineColors[idx]);
  const includedYUnits = includedAnalogIndices.map((idx) => yUnits[idx]);
  const includedAxesScales = [
    axesScales[0],
    ...includedAnalogIndices.map((idx) => axesScales[idx + 1]),
  ];

  let mergedLabels = [...includedYLabels];
  let mergedColors = [...includedLineColors];
  let mergedUnits = [...includedYUnits];
  let mergedAxesScales = [...includedAxesScales];

  computedForGroup.forEach((computedCh) => {
    if (Array.isArray(computedCh.data) && computedCh.data.length > 0) {
      mergedLabels.push(computedCh.name || computedCh.id);
      mergedColors.push(computedCh.color || "#4ECDC4");
      mergedUnits.push(computedCh.unit || "");
      mergedAxesScales.push(1);

      console.log(
        `[groupingUtils] 📈 Merged computed channel "${computedCh.name}" to labels`
      );
    }
  });

  return {
    mergedLabels,
    mergedColors,
    mergedUnits,
    mergedAxesScales,
    includedYLabels,
    includedLineColors,
    includedYUnits,
    includedAxesScales,
  };
}
