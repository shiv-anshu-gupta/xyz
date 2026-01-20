// src/components/renderComputedChannels.js
// Renders computed channels - one chart per unit group with computed channels as series
// Orchestrates data preparation, chart creation, interactions, and label rendering

import { createChartOptions } from "./chartComponent.js";
import { createDragBar } from "./createDragBar.js";
import { getMaxYAxes } from "../utils/maxYAxesStore.js";
import { renderLatex } from "../utils/mathJaxLoader.js";
import {
  createChartContainer,
  initUPlotChart,
} from "../utils/chartDomUtils.js";
import verticalLinePlugin from "../plugins/verticalLinePlugin.js";
import { addChart } from "../utils/chartMetadataStore.js";
import {
  filterUnassignedComputedChannels,
  groupChannelsByUnit,
  cleanupOldComputedCharts,
  resolveTimeArray,
  buildUnitChartData,
} from "../utils/computedChannelDataProcessor.js";
import {
  createComputedChartMetadata,
  buildComputedChartOptions,
  attachComputedChartPlugins,
  attachComputedChartContainer,
  initializeComputedChartInstance,
} from "../utils/computedChartCreationUtils.js";
import { attachComputedChartEventHandlers } from "../utils/computedChartInteractions.js";
import {
  buildComputedChannelLabels,
  renderChannelLabelContainer,
} from "../utils/computedChannelLabelRenderer.js";

/**
 * Render computed channels - all in one group/chart with multiple series
 * Matches the pattern used for analog/digital channels
 * @param {Object} data - Parsed COMTRADE data with time array
 * @param {HTMLElement} chartsContainer - The container for charts
 * @param {Array} charts - Array to store chart instances
 * @param {Array} verticalLinesX - Array of vertical line X positions
 * @param {Object} channelState - Reactive state for channels
 */
export function renderComputedChannels(
  data,
  chartsContainer,
  charts,
  verticalLinesX,
  channelState
) {
  const renderStartTime = performance.now();
  console.log(
    `[renderComputedChannels] 🟪 Starting computed channels rendering...`
  );

  const allComputedChannels =
    data?.computedData && Array.isArray(data.computedData)
      ? data.computedData
      : [];

  // ✅ NEW: Filter out computed channels that are assigned to analog groups
  // A computed channel should NOT render in standalone computed chart if its group
  // matches an analog group (it's already merged into that analog group's chart)
  const analogGroupIds = new Set(channelState?.analog?.groups || []);
  const computedChannels = allComputedChannels.filter((ch) => {
    // If channel has a group and it matches an analog group ID, exclude it
    if (ch && ch.group && analogGroupIds.has(ch.group)) {
      console.log(
        `[renderComputedChannels] ⏭️ Skipping computed channel "${ch.id}" (group="${ch.group}" matches analog group)`
      );
      return false;
    }
    return true;
  });

  if (computedChannels.length === 0) {
    console.log("[renderComputedChannels] ℹ️ No unassigned computed channels to render");
    return;
  }

  // ✅ NEW: Group standalone computed channels by unit and render one chart per unit
  // Normalization: empty/unknown units fall into 'unknown'
  const unitGroups = new Map();
  for (const ch of computedChannels) {
    const unitKey = (ch?.unit || "unknown").trim();
    if (!unitGroups.has(unitKey)) unitGroups.set(unitKey, []);
    unitGroups.get(unitKey).push(ch);
  }

  console.log(
    `[renderComputedChannels] 📊 Rendering ${unitGroups.size} computed chart(s) grouped by unit`
  );

  // ✅ FIX: Remove ALL existing computed charts/containers before re-rendering
  const oldComputedCharts = charts.filter((c) => c && (c._type === "computed" || c._computed === true));
  oldComputedCharts.forEach((oldChart) => {
    try { oldChart.destroy?.(); } catch {}
    const idx = charts.indexOf(oldChart);
    if (idx >= 0) charts.splice(idx, 1);
  });
  const oldContainers = chartsContainer.querySelectorAll('[data-chartType="computed"]');
  oldContainers.forEach((container) => { try { container.remove(); } catch {} });

  // Get time array
  let timeArray = data.time;
  if (!Array.isArray(data.time) || data.time.length === 0) {
    if (
      data.time?.data &&
      Array.isArray(data.time.data) &&
      data.time.data.length > 0
    ) {
      timeArray = data.time.data;
    } else if (
      data.timeArray &&
      Array.isArray(data.timeArray) &&
      data.timeArray.length > 0
    ) {
      timeArray = data.timeArray;
    } else {
      // Generate synthetic time array
      const firstChannelData = computedChannels[0]?.data || [];
      const sampleCount = firstChannelData.length || 62464;
      console.log(
        `[renderComputedChannels] ✅ Generating synthetic time array (${sampleCount} samples)`
      );
      timeArray = Array.from({ length: sampleCount }, (_, i) => i * 0.01);
    }
  }

  // Get global axis alignment
  const maxYAxes = getMaxYAxes() || 1;

  // Render one computed chart per unit group
  for (const [unitKey, unitChannels] of unitGroups.entries()) {
    const groupYLabels = unitChannels.map((ch) => ch.id || "Computed");
    const groupLineColors = unitChannels.map((ch) =>
      ch.color && typeof ch.color === "string" ? ch.color.trim() : ""
    );
    const groupYUnits = unitChannels.map((ch) => ch.unit || unitKey);

    const metadata = addChart({
      chartType: "computed",
      name: `Computed (${unitKey})`,
      expression: unitChannels
        .map((ch) => ch.expression || ch.mathJsExpression || ch.name)
        .filter(Boolean)
        .join(" | "),
      channels: unitChannels.map((ch) => ch.id),
      colors: groupLineColors.slice(),
      userGroupId: unitKey,
      sourceGroupId: unitKey,
    });

    // Chart data for this unit
    const channelDataArrays = unitChannels.map((ch) => ch.data || []);
    const chartData = [timeArray, ...channelDataArrays];

    const dragBar = createDragBar(
      {
        indices: Array.from({ length: unitChannels.length }, (_, i) => i),
        name: `Computed (${unitKey})`,
      },
      {},
      channelState
    );

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

    const opts = createChartOptions({
      title: `Computed (${unitKey})`,
      yLabels: groupYLabels,
      lineColors: groupLineColors,
      verticalLinesX,
      xLabel: data.xLabel || "Time",
      xUnit: data.xUnit || "s",
      getCharts: () => charts,
      yUnits: groupYUnits,
      axesScales: [1, ...unitChannels.map(() => 1)],
      singleYAxis: false,
      maxYAxes: maxYAxes,
    });

    // Plugin
    opts.plugins = opts.plugins || [];
    opts.plugins = opts.plugins.filter((p) => !(p && p.id === "verticalLinePlugin"));
    opts.plugins.push(verticalLinePlugin(verticalLinesX, () => charts));

    const chartStartTime = performance.now();
    const chart = initUPlotChart(opts, chartData, chartDiv, charts);
    const chartTime = performance.now() - chartStartTime;
    console.log(`[renderComputedChannels] ⏱️ uPlot chart (${unitKey}) in ${chartTime.toFixed(2)}ms`);

    // Tag chart
    chart._computed = true;
    chart._computedIds = unitChannels.map((ch) => ch.id);
    chart._type = "computed";
    chart._metadata = metadata;
    chart._userGroupId = metadata.userGroupId;
    chart._uPlotInstance = metadata.uPlotInstance;
    chart._chartType = "computed";
    chart._axesScales = [1, ...unitChannels.map(() => 1)];
    chart._yUnits = groupYUnits || [];
    chart._seriesColors = groupLineColors || [];
    chart._unitKey = unitKey;

    console.log(`[renderComputedChannels] ✅ Chart (${unitKey}) created with ${unitChannels.length} series`);

    // Tooltip & interactions (reuse existing handlers)
    const tooltip = createTooltip();
    const mousemoveHandler = (e) => {
      const idx = chart.posToIdx(e.offsetX);
      if (idx >= 0 && idx < chart.data[0].length) {
        const time = chart.data[0][idx];
        const values = chart.data
          .slice(1)
          .map((series, i) => {
            const label = groupYLabels[i] || `Computed${i + 1}`;
            const stroke = groupLineColors[i];
            const val = series[idx] != null && series[idx].toFixed ? series[idx].toFixed(2) : String(series[idx]);
            return `<span style="color:${stroke}">${label}</span>: ${val}`;
          })
          .join("<br>");
        updateTooltip(e.pageX, e.pageY, `<b>t:</b> ${time.toFixed(2)}<br>${values}`);
      }
    };
    attachListenerWithCleanup(chart.over, "mousemove", mousemoveHandler, chart);
    attachListenerWithCleanup(chart.over, "mouseleave", hideTooltip, chart);

    const clickHandler = (e) => {
      if (!chart.scales || !chart.scales.x) return;
      const xVal = chart.posToVal(e.offsetX, "x");
      const currentLines = verticalLinesX.asArray?.() || verticalLinesX.value || [];
      const xRange = chart.scales.x.max - chart.scales.x.min;
      const tolerance = xRange * 0.02;
      const existingIdx = currentLines.findIndex((line) => Math.abs(line - xVal) < tolerance);
      if (existingIdx >= 0) {
        verticalLinesX.value = currentLines.filter((_, i) => i !== existingIdx);
      } else {
        verticalLinesX.value = [...currentLines, xVal];
        setTimeout(async () => {
          try {
            const { getPolarChart, getCfg, getData, deltaWindow } = await import("../main.js");
            const polarChart = getPolarChart();
            const cfgData = getCfg();
            const dataObj = getData();
            if (polarChart && cfgData && dataObj) {
              const timeIndex = dataObj.time ? dataObj.time.findIndex((t) => t >= xVal) : 0;
              polarChart.updatePhasorAtTimeIndex(cfgData, dataObj, Math.max(0, timeIndex));
            }
            if (deltaWindow && verticalLinesX.value.length > 1) { deltaWindow.show(); }
          } catch (e) {}
          charts.forEach((c) => { if (c && c.redraw) c.redraw(); });
        }, 0);
      }
    };
    attachListenerWithCleanup(chart.over, "click", clickHandler, chart);

    // Labels with equations (reuse)
    const labelDiv = parentDiv.querySelector(".chart-label");
    if (labelDiv) {
      labelDiv.innerHTML = "";
      const typeSpan = document.createElement("span");
      typeSpan.textContent = `Computed (${unitKey})`;
      typeSpan.style.cssText = `font-size: 0.7rem; font-weight: 700; color: var(--accent-cyan); text-align: center; text-transform: uppercase; letter-spacing: 0.05em; padding-bottom: 4px; border-bottom: 1px solid var(--border-color); width: 100%;`;
      labelDiv.appendChild(typeSpan);
      unitChannels.forEach((channel, idx) => {
        const channelContainer = document.createElement("div");
        channelContainer.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;padding:6px 4px;border:1px solid var(--border-color,#e0e0e0);border-radius:3px;background:var(--bg-tertiary,#f9f9f9);color:var(--chart-text,#333)`;
        const nameContainer = document.createElement("div");
        nameContainer.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:4px;width:100%`;
        const colorDot = document.createElement("span");
        colorDot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${groupLineColors[idx % groupLineColors.length]};border:1px solid var(--border-color)`;
        nameContainer.appendChild(colorDot);
        const nameSpan = document.createElement("span");
        nameSpan.textContent = channel.id;
        nameSpan.style.cssText = `font-size:0.7rem;font-weight:500;color:var(--text-secondary);text-align:center;word-break:break-word;line-height:1.1`;
        nameContainer.appendChild(nameSpan);
        channelContainer.appendChild(nameContainer);
        if (channel.equation) {
          const formulaMatch = channel.equation.match(/=\s*(.+)$/);
          const formulaOnly = formulaMatch ? formulaMatch[1] : channel.equation;
          const latex = formatEquationForLatex(formulaOnly);
          const formulaSpan = document.createElement("span");
          formulaSpan.innerHTML = latex;
          formulaSpan.style.cssText = `font-size:0.65rem;color:var(--text-secondary);text-align:center;line-height:1.1`;
          labelDiv.appendChild(channelContainer);
          renderLatex(labelDiv);
        } else {
          labelDiv.appendChild(channelContainer);
        }
      });
    }
  }

  const renderEndTime = performance.now();
  const totalTime = renderEndTime - renderStartTime;
  const chartCount = unitGroups.size;
  const seriesCount = computedChannels.length;
  console.log(
    `[renderComputedChannels] ✅ Render complete: ${chartCount} computed chart(s) with ${seriesCount} series in ${totalTime.toFixed(1)}ms`
  );
}
