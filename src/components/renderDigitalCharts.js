/**
 * @file renderDigitalCharts.js
 * @module Components/ChartRendering
 *
 * @description
 * <h3>Digital Channel Chart Renderer</h3>
 * 
 * <p>Renders binary/digital channel waveforms as stepped graphs showing HIGH (1) and LOW (0)
 * states over time. Each digital group gets its own chart with channels stacked vertically.
 * Uses a specialized fill plugin for clear state visualization.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>Group Rendering</td><td>One chart per digital group with stacked channels</td></tr>
 *   <tr><td>Smart Filtering</td><td>Skips channels with no HIGH values (all zeros)</td></tr>
 *   <tr><td>Fill Plugin</td><td>Visual state indication via filled regions</td></tr>
 *   <tr><td>Drag Support</td><td>Drag bars for chart reordering</td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>Binary Display</strong> — Shows 0/1 states as stepped waveforms</li>
 *   <li><strong>Stacked Layout</strong> — Multiple channels per chart with vertical offset</li>
 *   <li><strong>Empty Channel Skip</strong> — Filters out channels with no state changes</li>
 *   <li><strong>Fill Plugin</strong> — Visual fills for HIGH state regions</li>
 *   <li><strong>Vertical Lines</strong> — Supports measurement markers</li>
 *   <li><strong>Drag Bar</strong> — Reorderable via drag handle</li>
 * </ul>
 * 
 * <h4>Data Validation</h4>
 * <table>
 *   <tr><th>Check</th><th>Action</th></tr>
 *   <tr><td>Channel has all zeros</td><td>Skip rendering (no meaningful data)</td></tr>
 *   <tr><td>Group has no visible channels</td><td>Skip entire chart</td></tr>
 *   <tr><td>Invalid data array</td><td>Log warning and skip</td></tr>
 * </table>
 * 
 * @see {@link module:plugins/digitalFillPlugin} - Visual fill plugin
 * @see {@link module:components/renderComtradeCharts} - Parent orchestrator
 * @see {@link module:utils/digitalChannelUtils} - Digital channel utilities
 * 
 * @example
 * // Render digital charts for a specific group
 * renderDigitalCharts(
 *   cfg,              // COMTRADE config
 *   data,             // COMTRADE data
 *   chartsContainer,  // DOM container
 *   charts,           // Chart instances array
 *   verticalLinesX,   // Vertical lines state
 *   channelState,     // Channel state object
 *   { name: "G1", indices: [0, 1, 2] }  // Optional group
 * );
 * 
 * @mermaid
 * graph TD
 *     A[renderDigitalCharts] --> B{Group Provided?}
 *     B -->|Yes| C[Use Provided Group]
 *     B -->|No| D[Get All Digital Indices]
 *     C --> E[filterIndicesWithData]
 *     D --> E
 *     E --> F{Any Visible Channels?}
 *     F -->|No| G[Return - Nothing to Render]
 *     F -->|Yes| H[createChartContainer]
 *     H --> I[Create Drag Bar]
 *     I --> J[Create uPlot Options]
 *     J --> K[Add digitalFillPlugin]
 *     K --> L[Add verticalLinePlugin]
 *     L --> M[Build Series Array]
 *     M --> N[New uPlot Instance]
 *     N --> O[addChart to Metadata Store]
 *     O --> P[Return Chart Instance]
 *     
 *     style A fill:#4CAF50,color:white
 *     style N fill:#2196F3,color:white
 *     style P fill:#FF9800,color:white
 */

import { createChartOptions } from "./chartComponent.js";
import { createDragBar } from "./createDragBar.js";
import { createDigitalFillPlugin } from "../plugins/digitalFillPlugin.js";
import { findChangedDigitalChannelIndices } from "../utils/digitalChannelUtils.js";
import { createCustomElement } from "../utils/helpers.js";
import { createChartContainer } from "../utils/chartDomUtils.js";
import verticalLinePlugin from "../plugins/verticalLinePlugin.js";
import { getMaxYAxes } from "../utils/maxYAxesStore.js";
import { attachListenerWithCleanup } from "../utils/eventListenerManager.js";
import { addChart } from "../utils/chartMetadataStore.js";

/**
 * Check if a digital channel has meaningful data to display
 * Returns true if channel has at least one HIGH (1/true) value
 * 
 * Digital signals are 0 (LOW) or 1 (HIGH)
 * If all values are 0, there's nothing to show (no state changes)
 */
function hasDigitalData(channelData) {
  if (!Array.isArray(channelData)) return false;
  if (channelData.length === 0) return false;
  
  // Check if there's at least one HIGH value (1, true, or truthy non-zero)
  return channelData.some(v => v === 1 || v === true || (typeof v === 'number' && v > 0));
}

/**
 * Filter indices to only include channels with meaningful data (has HIGH values)
 */
function filterIndicesWithData(indices, digitalData) {
  return indices.filter(idx => {
    const channelData = digitalData[idx];
    const hasData = hasDigitalData(channelData);
    if (!hasData) {
      console.log(`[renderDigitalCharts] ⏭️ Channel index ${idx} has no HIGH values - skipping`);
    }
    return hasData;
  });
}

export function renderDigitalCharts(
  cfg,
  data,
  chartsContainer,
  charts,
  verticalLinesX,
  channelState,
  group = null  // NEW: Optional group { name: "G2", indices: [0,1,2] }
) {
  const renderStartTime = performance.now();
  console.log("[renderDigitalCharts] 🟦 Starting digital chart rendering...");

  const DigChannelOffset = 3;

  // If group is provided, use its indices; otherwise use all/changed channels
  let digitalIndicesToShow;
  
  if (group && group.indices) {
    // Use provided group indices, but filter out channels with no data
    const originalCount = group.indices.length;
    digitalIndicesToShow = filterIndicesWithData(group.indices, data.digitalData);
    
    if (digitalIndicesToShow.length === 0) {
      console.log(`[renderDigitalCharts] ⏭️ Skipping group ${group.name} - all ${originalCount} channels have no data`);
      return; // Skip rendering this group entirely
    }
    
    if (digitalIndicesToShow.length < originalCount) {
      console.log(`[renderDigitalCharts] 📊 Rendering group ${group.name}: ${digitalIndicesToShow.length}/${originalCount} channels have data`);
    } else {
      console.log(`[renderDigitalCharts] 📊 Rendering group ${group.name} with ${digitalIndicesToShow.length} channels`);
    }
  } else {
    // Legacy behavior: find changed or show all
    const changedIndices = findChangedDigitalChannelIndices(data.digitalData);
    console.log(
      `[renderDigitalCharts] 📊 Found ${changedIndices.length} changed digital channels:`,
      changedIndices
    );

    digitalIndicesToShow =
      changedIndices.length > 0
        ? changedIndices
        : Array.isArray(cfg.digitalChannels)
        ? cfg.digitalChannels.map((_, i) => i)
        : [];
    
    // Filter out channels with no data
    digitalIndicesToShow = filterIndicesWithData(digitalIndicesToShow, data.digitalData);
    
    if (digitalIndicesToShow.length === 0) {
      console.log(`[renderDigitalCharts] ⏭️ No digital channels with data to render`);
      return;
    }
  }

  // Keep originalIndex on displayed channel objects so mapping is stable
  const digitalChannelsToShow = digitalIndicesToShow.map((i) => ({
    ...cfg.digitalChannels[i],
    originalIndex: i,
  }));
  const digitalDataToShow = digitalIndicesToShow.map((i) => data.digitalData[i]);
  const yLabels = channelState.digital.yLabels;
  const lineColors = channelState.digital.lineColors;
  const yUnits = channelState.digital.yUnits;
  const axesScales = channelState.digital.axesScales;
  const xLabel = channelState.digital.xLabel;
  const xUnit = channelState.digital.xUnit;
  // Colors corresponding to the displayed channels (map from full channelState)
  const displayedColors = digitalIndicesToShow.map((i) => lineColors[i]);

  // Get digital channel names for display on left side
  const digitalYLabels = digitalIndicesToShow.map((i) => yLabels[i]);

  console.log(
    `[renderDigitalCharts] 📋 Channel labels: ${digitalYLabels.join(", ")}`
  );
  console.log(
    `[renderDigitalCharts] 🎨 Line colors: [${displayedColors.join(", ")}]`
  );

  // Use provided group name or extract from channelState
  const groupId = group?.name || (
    digitalIndicesToShow.length > 0 && channelState.digital?.groups?.length > 0
      ? channelState.digital.groups[digitalIndicesToShow[0]]
      : "Digital"
  );

  console.log(`[renderDigitalCharts] 🏷️ Digital groupId = "${groupId}"`);

  const dragBar = createDragBar(
    {
      indices: digitalChannelsToShow.map((_, i) => i),
      colors: displayedColors,
    },
    { analogChannels: digitalChannelsToShow },
    channelState
  );

  const metadata = addChart({
    chartType: "digital",
    name: groupId,
    userGroupId: groupId,
    channels: digitalChannelsToShow.map((ch, idx) => {
      return (
        ch?.id ||
        ch?.channelID ||
        ch?.name ||
        (typeof ch?.originalIndex === "number"
          ? `digital-${ch.originalIndex}`
          : `digital-${idx}`)
      );
    }),
    colors: displayedColors.slice(),
    indices: digitalIndicesToShow.slice(),
    sourceGroupId: groupId,
  });

  console.log(
    `[renderDigitalCharts] Creating ${metadata.userGroupId} → ${metadata.uPlotInstance}`
  );

  // Create chart container with individual digital channel names, colors, and type label
  const { parentDiv, chartDiv } = createChartContainer(
    dragBar,
    "chart-container",
    digitalYLabels,
    displayedColors,
    "Digital Channels",
    metadata.userGroupId,
    "digital"
  );
  parentDiv.dataset.userGroupId = metadata.userGroupId;
  parentDiv.dataset.uPlotInstance = metadata.uPlotInstance;
  parentDiv.dataset.chartType = "digital";
  chartsContainer.appendChild(parentDiv);
  console.log(`[renderDigitalCharts] 🏗️ Chart container created`);

  //const verticalLinesXState = verticalLinesX;
  const digitalDataZeroOne = digitalDataToShow.map((arr) =>
    arr.map((v) => (v ? 1 : 0))
  );
  // ✅ Do NOT depend on data.time; derive sampleCount from digital series and build synthetic time
  const digitalLengths = digitalDataZeroOne
    .filter((arr) => Array.isArray(arr) && arr.length > 0)
    .map((arr) => arr.length);
  const sampleCount = digitalLengths.length ? Math.min(...digitalLengths) : 0;
  const timeArray = Array.from({ length: sampleCount }, (_, i) => i * 0.01);
  const trimmedDigital = digitalDataZeroOne.map((arr, idx) => {
    if (!Array.isArray(arr)) {
      console.warn(`[renderDigitalCharts] ⚠️ Digital channel at originalIndex=${digitalChannelsToShow[idx].originalIndex} missing data; using empty`);
      return [];
    }
    if (sampleCount && arr.length !== sampleCount) {
      console.log(
        `[renderDigitalCharts] 🔧 Trimmed digital series originalIndex=${digitalChannelsToShow[idx].originalIndex} from ${arr.length} → ${sampleCount}`
      );
    }
    return sampleCount ? arr.slice(0, sampleCount) : [];
  });
  // If no valid sampleCount or all digital arrays are empty, skip rendering
  const hasAnyDigital = trimmedDigital.some((arr) => Array.isArray(arr) && arr.length > 0);
  if (!sampleCount || !hasAnyDigital) {
    console.log(`[renderDigitalCharts] ⏭️ Skipping digital chart (no data available)`);
    return;
  }
  const chartData = [timeArray, ...trimmedDigital];
  const digitalFillSignals = digitalChannelsToShow.map((ch, i) => ({
    signalIndex: i + 1,
    offset: (digitalChannelsToShow.length - 1 - i) * DigChannelOffset,
    color: displayedColors[i],
    targetVal: 1,
    originalIndex: ch.originalIndex,
  }));
  const yMin = -0.5;
  const yMax = (digitalChannelsToShow.length - 1) * DigChannelOffset + 2;
  const scales = {
    x: { time: false, auto: true },
    y: { min: yMin, max: yMax, auto: false },
  };

  // ✅ Get global axis alignment from global store (default 1 for digital)
  const maxYAxes = getMaxYAxes() || 1;
  console.log(
    `[renderDigitalCharts] ✅ Chart config: maxYAxes=${maxYAxes}, channels=${digitalChannelsToShow.length}, yMin=${yMin}, yMax=${yMax}`
  );

  const chartOptionsStartTime = performance.now();
  const opts = createChartOptions({
    title: "Digital Channels",
    yLabels,
    lineColors,
    verticalLinesX: verticalLinesX,
    xLabel,
    xUnit,
    getCharts: () => charts,
    yUnits,
    axesScales,
    scales,
    singleYAxis: true,
    autoScaleUnit: { x: true, y: false },
    maxYAxes: maxYAxes,
  });

  // ✅ DEBUG: Log Y-Axes Configuration
  console.log(`[renderDigitalCharts] 📏 Y-Axes Configuration:`, {
    maxYAxes,
    optsAxesLength: opts.axes?.length,
    firstAxisExists: !!opts.axes?.[1],
    additionalAxes: opts.axes?.slice(2).length,
    digitalChannelsCount: digitalChannelsToShow.length,
    originalAxes: opts.axes,
  });

  // ✅ Keep digital-specific formatting on first Y-axis, preserve additional axes for multi-axis sync
  const firstAxis = {
    ...opts.axes[1], // Preserve original axis properties
    scale: "y", // Ensure correct scale
    side: 3, // Left side
    show: true, // Ensure axis is visible
    size: 60, // Reserve space for axis
    stroke: "#d1d5db", // Visible stroke
    label: "Digital States", // Add label for clarity
    grid: { show: true },
    ticks: { show: true, size: 10 },
    gap: 5,
    values: (u, vals) =>
      vals.map((v) => {
        for (let i = 0; i < digitalChannelsToShow.length; ++i) {
          if (Math.abs(v - i * DigChannelOffset) < 0.5) return "0";
          if (Math.abs(v - (i * DigChannelOffset + 1)) < 0.5) return "1";
        }
        return "";
      }),
    splits: digitalChannelsToShow.flatMap((_, i) => [
      i * DigChannelOffset,
      i * DigChannelOffset + 1,
    ]),
    // Remove range - let scale handle it
  };

  console.log(`[renderDigitalCharts] 📏 First Axis Configuration:`, {
    originalAxis: opts.axes[1],
    modifiedAxis: firstAxis,
  });

  // Build axes array: [x-axis, first y-axis with digital formatting, ...additional axes]
  opts.axes = [opts.axes[0], firstAxis, ...opts.axes.slice(2)];

  console.log(`[renderDigitalCharts] 📏 Final Axes Array:`, opts.axes);

  opts.series = [
    {},
    ...digitalChannelsToShow.map((ch, i) => {
      // Prefer the authoritative label from channelState if available.
      const original = ch.originalIndex;
      let label = ch.id;
      try {
        if (
          Array.isArray(channelState.digital?.yLabels) &&
          channelState.digital.yLabels[original]
        ) {
          if (channelState.digital.yLabels[original] !== ch.id) {
            // small debug hint when label sources disagree
            console.debug(
              "renderDigitalCharts: label mismatch for originalIndex",
              original,
              "cfg.id=",
              ch.id,
              "state.label=",
              channelState.digital.yLabels[original]
            );
          }
          label = channelState.digital.yLabels[original];
        }
      } catch (e) {}
      return {
        label,
        stroke: "transparent",
        show: true,
      };
    }),
  ];
  opts.plugins = opts.plugins || [];
  opts.plugins = opts.plugins.filter(
    (p) => !(p && p.id === "verticalLinePlugin")
  );

  console.log(`[renderDigitalCharts] 🔌 Before adding digitalFill plugin:`, {
    pluginsCount: opts.plugins.length,
    pluginIds: opts.plugins.map((p) => p?.id || "unknown"),
  });

  const digitalPlugin = createDigitalFillPlugin(digitalFillSignals);
  opts.plugins.push(digitalPlugin);

  console.log(`[renderDigitalCharts] 🔌 After adding digitalFill plugin:`, {
    pluginsCount: opts.plugins.length,
    pluginIds: opts.plugins.map((p) => p?.id || "unknown"),
    digitalPluginExists: !!digitalPlugin,
    digitalPluginId: digitalPlugin?.id,
  });

  opts.plugins.push(verticalLinePlugin(verticalLinesX, () => charts));

  const chartOptionsEndTime = performance.now();
  console.log(
    `[renderDigitalCharts] ⏱️ createChartOptions took ${(
      chartOptionsEndTime - chartOptionsStartTime
    ).toFixed(1)}ms`
  );

  const chartStartTime = performance.now();
  const chart = new uPlot(opts, chartData, chartDiv);
  const chartEndTime = performance.now();

  // ✅ CRITICAL FIX: Store digital plugin reference on chart for later access
  // (uPlot doesn't expose plugins array, so we need to keep our own reference)
  chart._digitalPlugin = digitalPlugin;

  console.log(`[renderDigitalCharts] 📊 After uPlot creation:`, {
    chartPluginsCount: chart.plugins?.length || 0,
    digitalPluginStored: !!chart._digitalPlugin,
    digitalPluginId: chart._digitalPlugin?.id,
  });

  // ✅ FIX: For digital charts, use displayedColors (actual colors) instead of series.stroke (transparent)
  // This ensures delta table shows correct colors for digital channels
  chart._seriesColors = displayedColors.slice();
  chart._metadata = metadata;
  chart._userGroupId = metadata.userGroupId;
  chart._uPlotInstance = metadata.uPlotInstance;
  chart._chartType = "digital";

  // Attach metadata for delta calculation scaling
  chart._axesScales = axesScales || [];
  chart._yUnits = yUnits || [];
  charts.push(chart);
  try {
    // store mapping from chart series -> global channel indices
    chart._channelIndices = digitalChannelsToShow.map((ch) => ch.originalIndex);
    chart._type = "digital";
  } catch (e) {}

  console.log(
    `[renderDigitalCharts] ✅ Digital chart created in ${(
      chartEndTime - chartStartTime
    ).toFixed(1)}ms with ${digitalChannelsToShow.length} channels`
  );

  const clickHandlerStartTime = performance.now();

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
          const { getPolarChart, getCfg, getData } = await import("../main.js");
          const polarChart = getPolarChart();
          const cfgData = getCfg();
          const dataObj = getData();

          if (polarChart && cfgData && dataObj) {
            console.log(
              "[renderDigitalCharts] Updating polar chart for new vertical line at:",
              xVal
            );
            // Find nearest time index for this vertical line position
            const timeIndex = dataObj.time
              ? dataObj.time.findIndex((t) => t >= xVal)
              : 0;
            console.log(
              "[renderDigitalCharts] Calculated timeIndex:",
              timeIndex
            );
            polarChart.updatePhasorAtTimeIndex(
              cfgData,
              dataObj,
              Math.max(0, timeIndex)
            );
          } else {
            console.warn(
              "[renderDigitalCharts] Missing polarChart, cfg, or data:",
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
            "[renderDigitalCharts] Cannot update polar chart or deltaWindow:",
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

  const clickHandlerEndTime = performance.now();
  console.log(
    `[renderDigitalCharts] ⏱️ Click handler setup took ${(
      clickHandlerEndTime - clickHandlerStartTime
    ).toFixed(1)}ms`
  );

  const resizeObserverStartTime = performance.now();
  // ✅ FIX: Add debouncing to prevent ResizeObserver loop during animations
  let resizeTimeout = null;
  let lastSize = { width: 0, height: 0 };

  const ro = new ResizeObserver((entries) => {
    // Clear pending resize
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }

    resizeTimeout = setTimeout(() => {
      for (let entry of entries) {
        const newWidth = Math.floor(entry.contentRect.width);
        const newHeight = Math.floor(entry.contentRect.height);

        // Only resize if dimensions actually changed (prevents resize loops)
        if (
          newWidth > 0 &&
          newHeight > 0 &&
          (newWidth !== lastSize.width || newHeight !== lastSize.height)
        ) {
          lastSize = { width: newWidth, height: newHeight };
          chart.setSize({
            width: newWidth,
            height: newHeight,
          });
        }
      }
    }, 50); // Debounce resize calls by 50ms
  });
  ro.observe(chartDiv);

  const resizeObserverEndTime = performance.now();
  console.log(
    `[renderDigitalCharts] ⏱️ ResizeObserver.observe took ${(
      resizeObserverEndTime - resizeObserverStartTime
    ).toFixed(1)}ms`
  );

  const renderEndTime = performance.now();
  const totalTime = renderEndTime - renderStartTime;
  console.log(
    `[renderDigitalCharts] ✓ Render complete in ${totalTime.toFixed(1)}ms`
  );
}
