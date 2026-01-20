import {
  createTooltip,
  updateTooltip,
  hideTooltip,
} from "../components/Tooltip.js";
import { attachListenerWithCleanup } from "./eventListenerManager.js";

/**
 * Create and return mousemove handler for tooltips
 * @param {Object} chart - uPlot chart instance
 * @param {Object} opts - Chart options with series config
 * @returns {Function} Mousemove event handler
 */
export function createMousemoveHandler(chart, opts) {
  return (e) => {
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
}

/**
 * Create and return vertical line add/remove handler
 * @param {Object} chart - uPlot chart instance
 * @param {Array} charts - All chart instances
 * @param {Object} verticalLinesX - Vertical lines state manager
 * @returns {Function} Click event handler
 */
export function createVerticalLineClickHandler(chart, charts, verticalLinesX) {
  return (e) => {
    if (!chart.scales || !chart.scales.x) return;

    const xVal = chart.posToVal(e.offsetX, "x");
    const currentLines = verticalLinesX.asArray();

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
      handleVerticalLineAddition(xVal, charts, verticalLinesX);
    }
  };
}

/**
 * Handle addition of new vertical line - update polar chart and show delta window
 * @param {number} xVal - X position of new vertical line
 * @param {Array} charts - Chart instances
 * @param {Object} verticalLinesX - Vertical lines state
 */
async function handleVerticalLineAddition(xVal, charts, verticalLinesX) {
  setTimeout(async () => {
    try {
      const { getPolarChart, getCfg, getData } = await import("../main.js");
      const polarChart = getPolarChart();
      const cfgData = getCfg();
      const dataObj = getData();

      if (polarChart && cfgData && dataObj) {
        console.log(
          "[chartInteractions] Updating polar chart for new vertical line at:",
          xVal
        );
        const timeIndex = dataObj.time
          ? dataObj.time.findIndex((t) => t >= xVal)
          : 0;
        console.log("[chartInteractions] Calculated timeIndex:", timeIndex);
        polarChart.updatePhasorAtTimeIndex(
          cfgData,
          dataObj,
          Math.max(0, timeIndex)
        );
      } else {
        console.warn("[chartInteractions] Missing polarChart, cfg, or data:", {
          polarChart: !!polarChart,
          cfgData: !!cfgData,
          dataObj: !!dataObj,
        });
      }

      const { deltaWindow } = await import("../main.js");
      if (deltaWindow && verticalLinesX.value.length > 1) {
        deltaWindow.show();
      }
    } catch (err) {
      console.error(
        "[chartInteractions] Cannot update polar chart or deltaWindow:",
        err.message
      );
    }
    charts.forEach((c) => c.redraw());
  }, 0);
}

/**
 * Attach all event handlers and interactions to chart
 * @param {Object} chart - uPlot chart instance
 * @param {Array} charts - All chart instances
 * @param {Object} verticalLinesX - Vertical lines state
 * @param {Object} opts - Chart options
 */
export function attachChartEventHandlers(chart, charts, verticalLinesX, opts) {
  const tooltip = createTooltip();

  // Attach tooltip on mousemove
  const mousemoveHandler = createMousemoveHandler(chart, opts);
  attachListenerWithCleanup(chart.over, "mousemove", mousemoveHandler, chart);
  attachListenerWithCleanup(chart.over, "mouseleave", hideTooltip, chart);

  // Attach click handler for vertical lines
  const clickHandler = createVerticalLineClickHandler(chart, charts, verticalLinesX);
  attachListenerWithCleanup(chart.over, "click", clickHandler, chart);
}
