import { addChart } from "./chartMetadataStore.js";
import { createChartContainer, initUPlotChart } from "./chartDomUtils.js";
import { createChartOptions } from "../components/chartComponent.js";
import verticalLinePlugin from "../plugins/verticalLinePlugin.js";

/**
 * @module Utils/Chart
 * @description chartCreationUtils module
 */


/**
 * Create chart metadata record for tracking and reference
 * @param {Object} params - Chart metadata parameters
 * @returns {Object} Metadata object from addChart
 */
export function createChartMetadata({
  groupName,
  groupId,
  analogIndices,
  mergedColors,
}) {
  return addChart({
    chartType: "analog",
    name: groupName,
    groupName: groupName,
    userGroupId: groupId,
    channels: analogIndices.map((idx) => `analog-${idx}`),
    colors: mergedColors,
    indices: analogIndices.slice(),
    sourceGroupId: groupId,
  });
}

/**
 * Build chart options configuration from metadata
 * @param {Object} config - Configuration object
 * @returns {Object} uPlot chart options
 */
export function buildChartOptions({
  groupName,
  mergedLabels,
  mergedColors,
  mergedUnits,
  mergedAxesScales,
  channelMetadata,
  verticalLinesX,
  charts,
  globalMaxYAxes,
}) {
  return createChartOptions({
    title: groupName || "",
    yLabels: mergedLabels,
    lineColors: mergedColors,
    verticalLinesX,
    xLabel: channelMetadata.xLabel,
    xUnit: channelMetadata.xUnit,
    getCharts: () => charts,
    yUnits: mergedUnits,
    axesScales: mergedAxesScales,
    singleYAxis: false,
    maxYAxes: globalMaxYAxes,
  });
}

/**
 * Attach plugins to chart options
 * @param {Object} opts - Chart options
 * @param {Array} verticalLinesX - Vertical line positions
 * @param {Array} charts - Chart instances
 * @returns {Object} Updated options with plugins
 */
export function attachChartPlugins(opts, verticalLinesX, charts) {
  opts.plugins = opts.plugins || [];
  opts.plugins = opts.plugins.filter(
    (p) => !(p && p.id === "verticalLinePlugin")
  );
  opts.plugins.push(verticalLinePlugin(verticalLinesX, () => charts));
  return opts;
}

/**
 * Initialize uPlot chart instance with metadata
 * @param {Object} config - Chart initialization config
 * @returns {Object} Initialized chart instance
 */
export function initializeChartInstance({
  opts,
  chartData,
  chartDiv,
  charts,
  metadata,
  computedForGroup,
  analogIndices,
  mergedMetadata,
  validIndices,
}) {
  const chart = initUPlotChart(opts, chartData, chartDiv, charts);

  // Attach metadata
  chart._metadata = metadata;
  chart._userGroupId = metadata.userGroupId;
  chart._uPlotInstance = metadata.uPlotInstance;
  chart._chartType = "analog";

  // Attach computed channel info
  chart._computedChannels = computedForGroup.map((ch) => ({
    id: ch.id,
    name: ch.name,
    color: ch.color,
    group: ch.group,
    unit: ch.unit,
  }));
  chart._computedChannelIds = computedForGroup.map((ch) => ch.id);
  chart._analogSeriesCount = analogIndices.length;
  chart._computedSeriesCount = computedForGroup.length;

  // Attach scaling metadata
  chart._axesScales = mergedMetadata.mergedAxesScales || [];
  chart._yUnits = mergedMetadata.mergedUnits || [];
  chart._seriesColors = mergedMetadata.mergedColors || [];

  // Attach channel mapping for updates
  chart._channelIndices = validIndices.slice();
  chart._type = "analog";

  return chart;
}

/**
 * Create and attach chart container to DOM
 * @param {Object} config - Container configuration
 * @returns {Object} Parent and chart divs
 */
export function attachChartContainer({
  dragBar,
  mergedLabels,
  mergedColors,
  metadata,
  chartsContainer,
}) {
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

  return { parentDiv, chartDiv };
}
