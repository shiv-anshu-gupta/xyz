import {

/**
 * @module Utils/ComputedChannels
 * @description computedChartInteractions module
 */

  createTooltip,
  updateTooltip,
  hideTooltip,
} from "../components/Tooltip.js";
import { attachListenerWithCleanup } from "../utils/eventListenerManager.js";

/**
 * Create mousemove handler for computed chart tooltip
 * @param {Object} chart - uPlot chart instance
 * @param {Array} groupYLabels - Channel labels
 * @param {Array} groupLineColors - Channel colors
 * @returns {Function} Mousemove handler
 */
export function createComputedMousemoveHandler(
  chart,
  groupYLabels,
  groupLineColors
) {
  return (e) => {
    const idx = chart.posToIdx(e.offsetX);
    if (idx >= 0 && idx < chart.data[0].length) {
      const time = chart.data[0][idx];
      const values = chart.data
        .slice(1)
        .map((series, i) => {
          const label = groupYLabels[i] || `Computed${i + 1}`;
          const stroke = groupLineColors[i];
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
}

/**
 * Create click handler for vertical line management
 * @param {Object} chart - uPlot chart instance
 * @param {Array} charts - All chart instances
 * @param {Object} verticalLinesX - Vertical lines state
 * @returns {Function} Click handler
 */
export function createComputedClickHandler(chart, charts, verticalLinesX) {
  return (e) => {
    if (!chart.scales || !chart.scales.x) return;

    const xVal = chart.posToVal(e.offsetX, "x");
    const currentLines = verticalLinesX.asArray?.() || verticalLinesX.value || [];

    const xRange = chart.scales.x.max - chart.scales.x.min;
    const tolerance = xRange * 0.02;
    const existingIdx = currentLines.findIndex(
      (line) => Math.abs(line - xVal) < tolerance
    );

    if (existingIdx >= 0) {
      // Remove nearby line
      verticalLinesX.value = currentLines.filter((_, i) => i !== existingIdx);
    } else {
      // Add new line and update polar chart
      verticalLinesX.value = [...currentLines, xVal];
      handleComputedVerticalLineAddition(xVal, charts, verticalLinesX);
    }
  };
}

/**
 * Handle vertical line addition - update polar chart and delta window
 * @param {number} xVal - X position of new line
 * @param {Array} charts - Chart instances
 * @param {Object} verticalLinesX - Vertical lines state
 */
async function handleComputedVerticalLineAddition(xVal, charts, verticalLinesX) {
  setTimeout(async () => {
    try {
      const { getPolarChart, getCfg, getData, deltaWindow } = await import(
        "../main.js"
      );
      const polarChart = getPolarChart();
      const cfgData = getCfg();
      const dataObj = getData();

      if (polarChart && cfgData && dataObj) {
        const timeIndex = dataObj.time
          ? dataObj.time.findIndex((t) => t >= xVal)
          : 0;
        polarChart.updatePhasorAtTimeIndex(
          cfgData,
          dataObj,
          Math.max(0, timeIndex)
        );
      }

      if (deltaWindow && verticalLinesX.value.length > 1) {
        deltaWindow.show();
      }
    } catch (err) {
      console.error(
        "[computedChartInteractions] Cannot update polar chart:",
        err.message
      );
    }

    // Redraw all charts
    charts.forEach((c) => {
      if (c && c.redraw) c.redraw();
    });
  }, 0);
}

/**
 * Attach all event handlers to computed chart
 * @param {Object} chart - uPlot chart instance
 * @param {Array} charts - All chart instances
 * @param {Object} verticalLinesX - Vertical lines state
 * @param {Array} groupYLabels - Channel labels
 * @param {Array} groupLineColors - Channel colors
 */
export function attachComputedChartEventHandlers(
  chart,
  charts,
  verticalLinesX,
  groupYLabels,
  groupLineColors
) {
  const tooltip = createTooltip();

  // Tooltip on mousemove
  const mousemoveHandler = createComputedMousemoveHandler(
    chart,
    groupYLabels,
    groupLineColors
  );
  attachListenerWithCleanup(chart.over, "mousemove", mousemoveHandler, chart);
  attachListenerWithCleanup(chart.over, "mouseleave", hideTooltip, chart);

  // Vertical line click handler
  const clickHandler = createComputedClickHandler(chart, charts, verticalLinesX);
  attachListenerWithCleanup(chart.over, "click", clickHandler, chart);
}
