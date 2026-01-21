import { createDragBar } from "./createDragBar.js";
import { getMaxYAxes } from "../utils/maxYAxesStore.js";
import {

/**
 * @module components_renderAnalogCharts_ORIGINAL_BEFORE_REFACTOR
 * @description renderAnalogCharts_ORIGINAL_BEFORE_REFACTOR module
 */

  buildGroupsWithUserAssignments,
  buildGroupsWithAutoGrouping,
  filterGroupsWithChannels,
  resolveGroupIndices,
} from "../utils/groupingUtils.js";
import {
  validateGroupIndices,
  prepareChartDataContext,
  createGroupDragBar,
} from "../utils/chartDataProcessor.js";
import {
  createChartMetadata,
  buildChartOptions,
  attachChartPlugins,
  initializeChartInstance,
  attachChartContainer,
} from "../utils/chartCreationUtils.js";
import { attachChartEventHandlers } from "../utils/chartInteractions.js";
// import { deltaBoxPlugin } from "../plugins/deltaBoxPlugin.js"; // DISABLED: Using DeltaWindow popup instead

export function renderAnalogCharts(
  cfg,
  data,
  chartsContainer,
  charts,
  verticalLinesX,
  channelState,
  autoGroupChannels
) {
  let groups;

  const optimizationStartTime = performance.now();
  const userGroups = channelState?.analog?.groups || [];

  // LOG: Debug group population
  console.log("[renderAnalogCharts] 📊 userGroups from state:", userGroups);
  console.log(
    "[renderAnalogCharts] Total analog channels:",
    cfg.analogChannels?.length
  );

  // Build groups using stable channelIDs when available.
  // Each group object will have: { name, ids: [channelID,...], indices: [globalIndex,...] }
  const totalAnalog = Array.isArray(cfg.analogChannels)
    ? cfg.analogChannels
    : [];
  const channelIDs = channelState?.analog?.channelIDs || [];
  
  console.log(
    "[renderAnalogCharts] channelIDs from state:",
    channelIDs
  );

  if (
    Array.isArray(userGroups) &&
    userGroups.length > 0 &&
    userGroups.some((g) => g !== undefined && g !== null && g !== "")
  ) {
    // ⚡ OPTIMIZATION: User has assigned groups - use them directly without autoGroupChannels
    console.log(
      `[renderAnalogCharts] ⚡ Using user-assigned groups (${userGroups.length} channels)`
    );

    groups = buildGroupsWithUserAssignments(
      userGroups,
      totalAnalog,
      channelIDs,
      autoGroupChannels
    );
  } else {
    // full auto grouping -> convert local indices to global indices and ids
    groups = buildGroupsWithAutoGrouping(
      totalAnalog,
      channelIDs,
      channelState,
      autoGroupChannels
    );
  }

  // ✅ Get global axis alignment from global store
  // The store gets updated when group changes in chartManager
  const globalMaxYAxes = getMaxYAxes();

  // ⏱️ TIMING: Start chart creation
  const chartsStartTime = performance.now();
  console.log(
    `[renderAnalogCharts] 🔧 Starting chart creation for ${groups.length} groups... maxYAxes=${globalMaxYAxes}`
  );
  
  // Log groups structure for debugging
  console.log(
    "[renderAnalogCharts] 📦 Groups structure:",
    groups.map((g) => ({
      name: g.name,
      ids: g.ids,
      indices: g.indices,
    }))
  );

  // ✅ FIX: Filter groups to only those with actual channels (prevent phantom empty containers)
  const groupsWithChannels = filterGroupsWithChannels(groups);

  // Render each group as a chart (only groups with actual channels)
  groupsWithChannels.forEach((group) => {
    const groupStartTime = performance.now();
    const created = processAnalogGroup({
      group,
      cfg,
      data,
      channelIDs,
      channelState,
      userGroups,
      charts,
      chartsContainer,
      verticalLinesX,
      globalMaxYAxes,
    });

    if (created) {
      const groupEndTime = performance.now();
      const groupTime = groupEndTime - groupStartTime;
      logGroupRenderTime(group.name, groupTime);
    }
  });

  // ⏱️ Log chart creation time
  const chartsEndTime = performance.now();
  const chartsTime = chartsEndTime - chartsStartTime;
  console.log(
    `[renderAnalogCharts] ✓ All ${
      groups.length
    } charts created in ${chartsTime.toFixed(0)}ms`
  );

  // ⏱️ Log total render time
  const optimizationEndTime = performance.now();
  const totalTime = optimizationEndTime - optimizationStartTime;
  if (totalTime > 1000) {
    console.warn(
      `[renderAnalogCharts] ⚠️ SLOW RENDER: ${totalTime.toFixed(0)}ms for ${
        groups.length
      } groups`
    );
  } else {
    console.log(
      `[renderAnalogCharts] ✅ Render complete in ${totalTime.toFixed(0)}ms`
    );
  }
}

function processAnalogGroup({
  group,
  cfg,
  data,
  channelIDs,
  channelState,
  userGroups,
  charts,
  chartsContainer,
  verticalLinesX,
  globalMaxYAxes,
}) {
  const resolvedIndices = resolveGroupIndices(group, channelIDs).filter(
    (idx) => Number.isFinite(idx) && idx >= 0
  );

  if (!resolvedIndices || resolvedIndices.length === 0) {
    return false;
  }

  const validIndices = validateGroupIndices({
    resolvedIndices,
    channelState,
    groupName: group.name,
  });

  if (!validIndices) {
    return false;
  }

  const dataContext = prepareChartDataContext({
    validIndices,
    userGroups,
    channelState,
    data,
    groupName: group.name,
  });

  if (!dataContext) {
    return false;
  }

  const dragBar = createGroupDragBar({
    validIndices,
    groupName: group.name,
    cfg,
    channelState,
  });

  const metadata = createChartMetadata({
    groupName: group.name,
    groupId: dataContext.groupId,
    analogIndices: dataContext.analogSeriesWithData,
    mergedColors: dataContext.mergedMetadata.mergedColors,
  });

  const opts = buildChartOptions({
    groupName: group.name,
    mergedLabels: dataContext.mergedMetadata.mergedLabels,
    mergedColors: dataContext.mergedMetadata.mergedColors,
    mergedUnits: dataContext.mergedMetadata.mergedUnits,
    mergedAxesScales: dataContext.mergedMetadata.mergedAxesScales,
    channelMetadata: dataContext.channelMetadata,
    verticalLinesX,
    charts,
    globalMaxYAxes,
  });

  attachChartPlugins(opts, verticalLinesX, charts);

  const { chartDiv } = attachChartContainer({
    dragBar,
    mergedLabels: dataContext.mergedMetadata.mergedLabels,
    mergedColors: dataContext.mergedMetadata.mergedColors,
    metadata,
    chartsContainer,
  });

  const chart = initializeChartInstance({
    opts,
    chartData: dataContext.chartData,
    chartDiv,
    charts,
    metadata,
    computedForGroup: dataContext.computedForGroup,
    analogIndices: dataContext.analogSeriesWithData,
    mergedMetadata: dataContext.mergedMetadata,
    validIndices: dataContext.validIndices,
  });

  attachChartEventHandlers(chart, charts, verticalLinesX, opts);

  logChartCreationDetails({
    groupName: group.name,
    metadata,
    analogCount: dataContext.analogSeriesWithData.length,
    computedCount: dataContext.computedForGroup.length,
    seriesCount: dataContext.chartData.length - 1,
    channelMetadata: dataContext.channelMetadata,
    mergedMetadata: dataContext.mergedMetadata,
    globalMaxYAxes,
  });

  return true;
}

function logGroupRenderTime(groupName, groupTime) {
  if (groupTime > 1000) {
    console.warn(
      `[renderAnalogCharts] ⚠️ SLOW GROUP: "${groupName}" took ${groupTime.toFixed(0)}ms`
    );
  } else {
    console.log(
      `[renderAnalogCharts] ✓ Group "${groupName}" created in ${groupTime.toFixed(0)}ms`
    );
  }
}

function logChartCreationDetails({
  groupName,
  metadata,
  analogCount,
  computedCount,
  seriesCount,
  channelMetadata,
  mergedMetadata,
  globalMaxYAxes,
}) {
  console.log(
    `[renderAnalogCharts] Creating ${metadata.userGroupId} → ${metadata.uPlotInstance}`,
    metadata.name
  );

  console.log(
    `[renderAnalogCharts] 📊 Group "${groupName}": analog=${analogCount}, computed=${computedCount}, total series=${seriesCount}`
  );

  console.log(
    `[renderAnalogCharts] ✅ Chart config: group="${groupName}", globalMaxYAxes=${globalMaxYAxes}, analog=${
      channelMetadata.groupYLabels.length
    }, computed=${computedCount}, total=${
      mergedMetadata.mergedLabels.length
    }, yUnits=[${mergedMetadata.mergedUnits.join(", ")}]`
  );
}
