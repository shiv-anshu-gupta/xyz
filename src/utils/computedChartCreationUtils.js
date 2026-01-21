import { addChart } from "../utils/chartMetadataStore.js";
import {

/**
 * @module Utils/ComputedChannels
 * @description computedChartCreationUtils module
 */

  createChartContainer,
  initUPlotChart,
} from "../utils/chartDomUtils.js";
import { createChartOptions } from "../components/chartComponent.js";
import verticalLinePlugin from "../plugins/verticalLinePlugin.js";

/**
 * Create computed chart metadata record
 * @param {Object} config - Metadata configuration
 * @returns {Object} Metadata object from addChart
 */
export function createComputedChartMetadata({
  unitKey,
  unitChannels,
  lineColors,
}) {
  return addChart({
    chartType: "computed",
    name: `Computed (${unitKey})`,
    expression: unitChannels
      .map((ch) => ch.expression || ch.mathJsExpression || ch.name)
      .filter(Boolean)
      .join(" | "),
    channels: unitChannels.map((ch) => ch.id),
    colors: lineColors.slice(),
    userGroupId: unitKey,
    sourceGroupId: unitKey,
  });
}

/**
 * Build computed chart options
 * @param {Object} config - Configuration
 * @returns {Object} uPlot options
 */
export function buildComputedChartOptions({
  unitKey,
  groupYLabels,
  groupLineColors,
  verticalLinesX,
  data,
  charts,
  maxYAxes,
  unitChannels,
}) {
  return createChartOptions({
    title: `Computed (${unitKey})`,
    yLabels: groupYLabels,
    lineColors: groupLineColors,
    verticalLinesX,
    xLabel: data.xLabel || "Time",
    xUnit: data.xUnit || "s",
    getCharts: () => charts,
    yUnits: unitChannels.map((ch) => ch.unit || unitKey),
    axesScales: [1, ...unitChannels.map(() => 1)],
    singleYAxis: false,
    maxYAxes: maxYAxes,
  });
}

/**
 * Attach plugins to computed chart options
 * @param {Object} opts - Chart options
 * @param {Array} verticalLinesX - Vertical lines state
 * @param {Array} charts - Chart instances
 */
export function attachComputedChartPlugins(opts, verticalLinesX, charts) {
  opts.plugins = opts.plugins || [];
  opts.plugins = opts.plugins.filter(
    (p) => !(p && p.id === "verticalLinePlugin")
  );
  opts.plugins.push(verticalLinePlugin(verticalLinesX, () => charts));
}

/**
 * Create and attach computed chart container
 * @param {Object} config - Container configuration
 * @returns {Object} {parentDiv, chartDiv}
 */
export function attachComputedChartContainer({
  dragBar,
  unitKey,
  groupYLabels,
  groupLineColors,
  metadata,
  chartsContainer,
}) {
  const { parentDiv, chartDiv } = createChartContainer(
    dragBar,
    "chart-container",
    groupYLabels,
    groupLineColors,
    `Computed (${unitKey})`,
    metadata.userGroupId,
    "computed"
  );

  parentDiv.dataset.userGroupId = metadata.userGroupId;
  parentDiv.dataset.uPlotInstance = metadata.uPlotInstance;
  parentDiv.dataset.chartType = "computed";
  chartsContainer.appendChild(parentDiv);

  return { parentDiv, chartDiv };
}

/**
 * Initialize computed uPlot chart instance
 * @param {Object} config - Chart initialization config
 * @returns {Object} Initialized chart instance
 */
export function initializeComputedChartInstance({
  opts,
  chartData,
  chartDiv,
  charts,
  metadata,
  unitKey,
  unitChannels,
  groupYLabels,
  groupLineColors,
}) {
  const chart = initUPlotChart(opts, chartData, chartDiv, charts);

  // Tag as computed
  chart._computed = true;
  chart._computedIds = unitChannels.map((ch) => ch.id);
  chart._type = "computed";
  chart._metadata = metadata;
  chart._userGroupId = metadata.userGroupId;
  chart._uPlotInstance = metadata.uPlotInstance;
  chart._chartType = "computed";
  chart._axesScales = [1, ...unitChannels.map(() => 1)];
  chart._yUnits = unitChannels.map((ch) => ch.unit || unitKey);
  chart._seriesColors = groupLineColors || [];
  chart._unitKey = unitKey;

  console.log(
    `[computedChartCreationUtils] ✅ Chart (${unitKey}) created with ${unitChannels.length} series`
  );

  return chart;
}
