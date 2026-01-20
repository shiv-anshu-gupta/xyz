import { createChartOptions } from "./chartComponent.js";
import { createDragBar } from "./createDragBar.js";
import { createCustomElement } from "../utils/helpers.js";
import {
  createTooltip,
  updateTooltip,
  hideTooltip,
} from "../components/Tooltip.js";
import {
  createChartContainer,
  initUPlotChart,
} from "../utils/chartDomUtils.js";
import verticalLinePlugin from "../plugins/verticalLinePlugin.js";
import { calculateAxisCountForGroup } from "../utils/axisCalculator.js";
import { getGlobalAxisAlignment } from "../utils/chartAxisAlignment.js";
import { getMaxYAxes } from "../utils/maxYAxesStore.js";
import { attachListenerWithCleanup } from "../utils/eventListenerManager.js";
import { addChart } from "../utils/chartMetadataStore.js";
import { loadComputedChannelsFromStorage } from "../utils/computedChannelStorage.js";
import {
  buildGroupsWithUserAssignments,
  buildGroupsWithAutoGrouping,
  filterGroupsWithChannels,
  resolveGroupIndices,
  filterValidIndices,
  extractGroupId,
} from "../utils/groupingUtils.js";
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
    // resolve any missing ids -> indices mapping defensively
    const resolvedIndices = resolveGroupIndices(group, channelIDs).filter(
      (idx) => Number.isFinite(idx) && idx >= 0
    );

    // skip empty groups
    if (!resolvedIndices || resolvedIndices.length === 0) return;

    const dragBar = createDragBar(
      { indices: resolvedIndices, name: group.name },
      cfg,
      channelState
    );

    // ✅ FIX: Defensive checks for undefined properties
    const yLabels = channelState?.analog?.yLabels || [];
    const lineColors = channelState?.analog?.lineColors || [];
    const yUnits = channelState?.analog?.yUnits || [];
    const axesScales = channelState?.analog?.axesScales || [];
    const xLabel = channelState?.analog?.xLabel || "";
    const xUnit = channelState?.analog?.xUnit || "";

    // Filter out indices that are out of bounds (after deletion)
    const validIndices = filterValidIndices(resolvedIndices, yLabels?.length || 0);

    // Skip this group if all indices are invalid
    if (validIndices.length === 0) {
      console.log(
        `[renderAnalogCharts] ⏭️ Group "${group.name}" has no valid channel indices, skipping`
      );
      return;
    }

    const groupYLabels = validIndices.map((idx) => yLabels[idx]);
    const groupLineColors = validIndices.map((idx) => lineColors[idx]);
    const groupYUnits = validIndices.map((idx) => yUnits[idx]);
    
    console.log(
      `[renderAnalogCharts] 📋 Group "${group.name}": yLabels=[${groupYLabels.join(", ")}]`
    );
    
    const groupAxesScales = [
      axesScales[0],
      ...validIndices.map((idx) => axesScales[idx + 1]),
    ];

    // Extract group ID from first channel in this group
    // All channels in the same group share the same groupId, so just take the first one
    const groupId = extractGroupId(validIndices, userGroups, group.name);

    // ✅ EARLY: Fetch computed channels that belong to this group
    // This must happen BEFORE creating the chart container so we can include computed channel names in the left sidebar
    const storedComputedChannels = loadComputedChannelsFromStorage();
    const computedForGroup = Array.isArray(storedComputedChannels)
      ? storedComputedChannels.filter((ch) => ch.group === groupId)
      : [];

    console.log(
      `[renderAnalogCharts] 🟪 Group "${groupId}": Found ${computedForGroup.length} computed channels to merge`
    );

    // (moved) Build container after data checks to avoid mismatches

    // Build chart data: time + analog series + computed series
    // ✅ Robust time + length harmonization: make all series match a common sampleCount
    // Resolve time array first
    let timeArray = data.time;
    if (!Array.isArray(timeArray) || timeArray.length === 0) {
      if (Array.isArray(data?.time?.data) && data.time.data.length > 0) {
        timeArray = data.time.data;
      } else if (Array.isArray(data?.timeArray) && data.timeArray.length > 0) {
        timeArray = data.timeArray;
      }
    }

    // ✅ Do NOT depend on data.time; derive sampleCount from available series and build synthetic time
    const analogSeriesWithData = validIndices.filter(
      (idx) => Array.isArray(data.analogData?.[idx]) && data.analogData[idx].length > 0
    );
    const seriesLengths = [];
    analogSeriesWithData.forEach((idx) => seriesLengths.push(data.analogData[idx].length));
    computedForGroup.forEach((ch) => {
      if (Array.isArray(ch?.data) && ch.data.length > 0) seriesLengths.push(ch.data.length);
    });
    let sampleCount = seriesLengths.length ? Math.min(...seriesLengths) : 0;
    if (!sampleCount) sampleCount = 62464; // fallback
    timeArray = Array.from({ length: sampleCount }, (_, i) => i * 0.01);
    console.log(
      `[renderAnalogCharts] ✅ Using synthetic time (${sampleCount} samples) from series data`
    );

    const chartData = [timeArray];
    // ✅ Use only analog indices that actually have data to avoid empty series
    const includedAnalogIndices = analogSeriesWithData.length ? analogSeriesWithData : [];
    if (includedAnalogIndices.length === 0 && computedForGroup.length === 0) {
      console.warn(
        `[renderAnalogCharts] ⏭️ Skipping group "${groupId}" (no analog data and no computed to merge)`
      );
      return; // skip creating this chart entirely (forEach callback)
    }
    includedAnalogIndices.forEach((idx) => {
      const series = data.analogData?.[idx];
      if (Array.isArray(series) && series.length > 0) {
        chartData.push(series.slice(0, sampleCount));
        if (series.length !== sampleCount) {
          console.log(
            `[renderAnalogCharts] 🔧 Trimmed analog series idx=${idx} from ${series.length} → ${sampleCount}`
          );
        }
      } else {
        // Skip pushing truly empty analog series
        console.warn(
          `[renderAnalogCharts] ⚠️ Skipping analog channel at index ${idx} (no data array)`
        );
      }
    });

    // ✅ Append computed channel data to chartData
    computedForGroup.forEach((computedCh) => {
      if (Array.isArray(computedCh.data) && computedCh.data.length > 0) {
        const normalizedComputed = computedCh.data.slice(0, sampleCount);
        chartData.push(normalizedComputed);

        console.log(
          `[renderAnalogCharts] 📈 Added computed channel data "${computedCh.name}" (${computedCh.id}) to chart for group "${groupId}" (len=${normalizedComputed.length})`
        );
      } else {
        console.warn(
          `[renderAnalogCharts] ⚠️ Computed channel "${computedCh.name}" has no data or empty array; skipping`
        );
      }
    });
    
    // Build merged labels/colors/units/scales to match included series
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
          `[renderAnalogCharts] 📈 Adding computed channel "${computedCh.name}" (${computedCh.id}) to labels for group "${groupId}"`
        );
      }
    });

    // Create chart metadata and container only when we have series
    const metadata = addChart({
      chartType: "analog",
      name: group.name,
      groupName: group.name,
      userGroupId: groupId,
      channels: includedAnalogIndices.map((idx) => {
        const ch = cfg.analogChannels?.[idx];
        return (
          ch?.id ||
          ch?.channelID ||
          ch?.name ||
          (typeof ch?.channelIdx === "number"
            ? `analog-${ch.channelIdx}`
            : `analog-${idx}`)
        );
      }),
      colors: mergedColors,
      indices: includedAnalogIndices.slice(),
      sourceGroupId: groupId,
    });

    console.log(
      `[renderAnalogCharts] Creating ${metadata.userGroupId} → ${metadata.uPlotInstance}`,
      metadata.name
    );

    const { parentDiv, chartDiv } = createChartContainer(
      dragBar,
      "chart-container",
      mergedLabels,
      mergedColors,
      "Analog Channels",
      metadata.userGroupId,
      "analog"
    );
    parentDiv.dataset.userGroupId = metadata.userGroupId;
    parentDiv.dataset.uPlotInstance = metadata.uPlotInstance;
    parentDiv.dataset.chartType = "analog";
    chartsContainer.appendChild(parentDiv);

    console.log(
      `[renderAnalogCharts] 📊 Group "${group.name}": analog=${includedAnalogIndices.length}, computed=${computedForGroup.length}, total series=${chartData.length - 1}`
    );

    const opts = createChartOptions({
      title: group.name || "",
      yLabels: mergedLabels,
      lineColors: mergedColors,
      verticalLinesX: verticalLinesX,
      xLabel,
      xUnit,
      getCharts: () => charts,
      yUnits: mergedUnits,
      axesScales: mergedAxesScales,
      singleYAxis: false,
      maxYAxes: globalMaxYAxes, // ✅ Use global axis alignment for all charts!
    });

    console.log(
      `[renderAnalogCharts] ✅ Chart config: group="${
        group.name
      }", globalMaxYAxes=${globalMaxYAxes}, analog=${
        groupYLabels.length
      }, computed=${computedForGroup.length}, total=${
        mergedLabels.length
      }, yUnits=[${mergedUnits.join(", ")}]`
    );

    opts.plugins = opts.plugins || [];
    opts.plugins = opts.plugins.filter(
      (p) => !(p && p.id === "verticalLinePlugin")
    );
    opts.plugins.push(verticalLinePlugin(verticalLinesX, () => charts));
    // opts.plugins.push(deltaBoxPlugin()); // DISABLED: Using DeltaWindow popup instead

    const chart = initUPlotChart(opts, chartData, chartDiv, charts);
    chart._metadata = metadata;
    chart._userGroupId = metadata.userGroupId;
    chart._uPlotInstance = metadata.uPlotInstance;
    chart._chartType = "analog";

    // ✅ NEW: Attach computed channel metadata to chart for reference
    chart._computedChannels = computedForGroup.map((ch) => ({
      id: ch.id,
      name: ch.name,
      color: ch.color,
      group: ch.group,
      unit: ch.unit,
    }));
    chart._computedChannelIds = computedForGroup.map((ch) => ch.id);
    chart._analogSeriesCount = includedAnalogIndices.length;
    chart._computedSeriesCount = computedForGroup.length;

    // Attach metadata for delta calculation scaling
    chart._axesScales = mergedAxesScales || [];
    chart._yUnits = mergedUnits || [];
    chart._seriesColors = mergedColors || [];

    // store mapping from chart series -> global channel indices so chartManager can map updates
    try {
      chart._channelIndices = validIndices.slice();
      chart._type = "analog";
    } catch (e) {}

    // tooltip
    const tooltip = createTooltip();

    // ✅ Create handlers and store for cleanup
    const mousemoveHandler = (e) => {
      const idx = chart.posToIdx(e.offsetX);
      if (idx >= 0 && idx < chart.data[0].length) {
        const time = chart.data[0][idx];
        const values = chart.data
          .slice(1)
          .map((series, i) => {
            const liveSeries =
              chart.series && chart.series[i + 1] ? chart.series[i + 1] : null;
            const label =
              (liveSeries && liveSeries.label) ||
              opts.series[i + 1]?.label ||
              `Ch${i + 1}`;
            const stroke =
              (liveSeries && liveSeries.stroke) ||
              opts.series[i + 1]?.stroke ||
              (chart._seriesColors && chart._seriesColors[i]);
            const val =
              series[idx] != null && series[idx].toFixed
                ? series[idx].toFixed(2)
                : String(series[idx]);
            return `<span style="color:${stroke}">${label}</span>: ${val}`;
          })
          .join("<br>");
        updateTooltip(
          e.pageX,
          e.pageY,
          `<b>t:</b> ${time.toFixed(2)}<br>${values}`
        );
      }
    };

    // ✅ Attach and track listeners
    attachListenerWithCleanup(chart.over, "mousemove", mousemoveHandler, chart);
    attachListenerWithCleanup(chart.over, "mouseleave", hideTooltip, chart);

    // Click handler to add/remove vertical lines
    const clickHandler = (e) => {
      if (!chart.scales || !chart.scales.x) return;

      const xVal = chart.posToVal(e.offsetX, "x");
      const currentLines = verticalLinesX.asArray();

      // Check if clicking near an existing line (within 2% of x-range)
      const xRange = chart.scales.x.max - chart.scales.x.min;
      const tolerance = xRange * 0.02;
      const existingIdx = currentLines.findIndex(
        (line) => Math.abs(line - xVal) < tolerance
      );

      if (existingIdx >= 0) {
        // Remove line if clicking near existing line
        verticalLinesX.value = currentLines.filter((_, i) => i !== existingIdx);
      } else {
        // Add new line
        verticalLinesX.value = [...currentLines, xVal];
        // Auto-trigger delta calculation and open delta window (only if 2+ lines)
        setTimeout(async () => {
          try {
            // Update polar chart with new vertical line position
            const { getPolarChart, getCfg, getData } = await import(
              "../main.js"
            );
            const polarChart = getPolarChart();
            const cfgData = getCfg();
            const dataObj = getData();

            if (polarChart && cfgData && dataObj) {
              console.log(
                "[renderAnalogCharts] Updating polar chart for new vertical line at:",
                xVal
              );
              // Find nearest time index for this vertical line position
              const timeIndex = dataObj.time
                ? dataObj.time.findIndex((t) => t >= xVal)
                : 0;
              console.log(
                "[renderAnalogCharts] Calculated timeIndex:",
                timeIndex
              );
              polarChart.updatePhasorAtTimeIndex(
                cfgData,
                dataObj,
                Math.max(0, timeIndex)
              );
            } else {
              console.warn(
                "[renderAnalogCharts] Missing polarChart, cfg, or data:",
                {
                  polarChart: !!polarChart,
                  cfgData: !!cfgData,
                  dataObj: !!dataObj,
                }
              );
            }

            const { deltaWindow } = await import("../main.js");
            // Only show delta window if there are 2 or more vertical lines
            if (deltaWindow && verticalLinesX.value.length > 1) {
              deltaWindow.show();
            }
          } catch (e) {
            console.error(
              "[renderAnalogCharts] Cannot update polar chart or deltaWindow:",
              e.message
            );
            console.error(e);
          }
          charts.forEach((c) => c.redraw());
        }, 0);
      }
    };

    // ✅ Attach click handler with cleanup tracking
    attachListenerWithCleanup(chart.over, "click", clickHandler, chart);

    // ⏱️ Log time for this group
    const groupEndTime = performance.now();
    const groupTime = groupEndTime - groupStartTime;
    if (groupTime > 1000) {
      console.warn(
        `[renderAnalogCharts] ⚠️ SLOW GROUP: "${
          group.name
        }" took ${groupTime.toFixed(0)}ms`
      );
    } else {
      console.log(
        `[renderAnalogCharts] ✓ Group "${
          group.name
        }" created in ${groupTime.toFixed(0)}ms`
      );
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
