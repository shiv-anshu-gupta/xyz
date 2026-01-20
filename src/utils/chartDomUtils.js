// chartDomUtils.js
// Small abstractions for chart container and uPlot chart setup
import { createCustomElement } from "./helpers.js";

/**
 * Creates a chart parent container with a label, drag bar, and chart div.
 * @param {HTMLElement} dragBar - The drag bar element.
 * @param {string} chartContainerClass - The class for the chart container div.
 * @param {string|Array} label - Optional label to display on left side (string or array of channel names).
 * @param {Array} colors - Optional array of colors for each channel.
 * @param {string} typeLabel - Optional channel type label (e.g., "Analog Channels", "Digital Channels").
 * @param {string} groupId - Optional group ID to display once below type label (e.g., "G0", "G1"). Shows at group level, not per-channel.
 * @param {string} chartType - Chart type for data attribute ("analog", "digital", "computed").
 * @returns {{ parentDiv: HTMLElement, chartDiv: HTMLElement }}
 */
export function createChartContainer(
  dragBar,
  chartContainerClass = "chart-container",
  label = "",
  colors = [],
  typeLabel = "",
  groupId = "",
  chartType = ""
) {
  const parentDiv = createCustomElement("div", "chart-parent-container");

  // ✅ FIX: Set data-chart-type attribute for selective DOM clearing
  if (chartType) {
    parentDiv.setAttribute("data-chart-type", chartType);
  }

  // Add label on left side if provided
  if (label) {
    const labelDiv = createCustomElement("div", "chart-label");

    // If label is an array of channel names, display them vertically with colors
    if (Array.isArray(label)) {
      labelDiv.style.display = "flex";
      labelDiv.style.flexDirection = "column";
      labelDiv.style.alignItems = "center";
      labelDiv.style.justifyContent = "flex-start";
      labelDiv.style.gap = "12px";
      labelDiv.style.padding = "8px 4px";
      labelDiv.style.overflow = "auto";

      // Add type label at the top if provided
      if (typeLabel) {
        const typeSpan = document.createElement("span");
        typeSpan.textContent = typeLabel;
        typeSpan.style.fontSize = "0.7rem";
        typeSpan.style.fontWeight = "700";
        typeSpan.style.color = "var(--accent-cyan)";
        typeSpan.style.textAlign = "center";
        typeSpan.style.textTransform = "uppercase";
        typeSpan.style.letterSpacing = "0.05em";
        typeSpan.style.paddingBottom = "4px";
        typeSpan.style.width = "100%";
        labelDiv.appendChild(typeSpan);

        // NEW: Display group ID once below type label (if provided)
        // This shows the group assignment for all channels in this chart
        if (groupId) {
          const groupIdSpan = document.createElement("span");
          groupIdSpan.textContent = groupId;
          groupIdSpan.style.fontSize = "0.65rem";
          groupIdSpan.style.fontWeight = "700";
          groupIdSpan.style.color = "var(--accent-cyan)";
          groupIdSpan.style.textAlign = "center";
          groupIdSpan.style.paddingTop = "2px";
          groupIdSpan.style.paddingBottom = "4px";
          groupIdSpan.style.borderBottom = "1px solid var(--border-color)";
          groupIdSpan.style.width = "100%";
          labelDiv.appendChild(groupIdSpan);
        } else {
          // No group ID - just add border below type label
          typeSpan.style.borderBottom = "1px solid var(--border-color)";
        }
      }

      // Add channel names with color indicators
      label.forEach((channelName, idx) => {
        const channelContainer = document.createElement("div");
        channelContainer.style.display = "flex";
        channelContainer.style.flexDirection = "column";
        channelContainer.style.alignItems = "center";
        channelContainer.style.gap = "2px";
        channelContainer.style.width = "100%";

        // Color indicator dot
        const colorDot = document.createElement("span");
        colorDot.style.width = "10px";
        colorDot.style.height = "10px";
        colorDot.style.borderRadius = "50%";
        colorDot.style.background = (colors && colors[idx]) || "#888";
        colorDot.style.border = "1px solid var(--border-color)";
        channelContainer.appendChild(colorDot);

        // Channel name
        const nameSpan = document.createElement("span");
        nameSpan.textContent = channelName;
        nameSpan.style.fontSize = "0.7rem";
        nameSpan.style.fontWeight = "500";
        nameSpan.style.color = "var(--text-secondary)";
        nameSpan.style.textAlign = "center";
        nameSpan.style.wordBreak = "break-word";
        nameSpan.style.lineHeight = "1.1";
        channelContainer.appendChild(nameSpan);

        labelDiv.appendChild(channelContainer);
      });
    } else {
      // If label is a string, display normally
      labelDiv.textContent = label;
    }

    parentDiv.appendChild(labelDiv);
  }

  parentDiv.appendChild(dragBar);
  const chartDiv = createCustomElement("div", chartContainerClass);
  parentDiv.appendChild(chartDiv);
  return { parentDiv, chartDiv };
}

/**
 * Creates a simple container for holding analysis sidebar/phasor diagram
 * @param {string} containerClass - The class for the container div.
 * @returns {HTMLElement}
 */
export function createSimpleContainer(containerClass = "analysis-container") {
  const container = createCustomElement("div", containerClass);
  return container;
}

/**
 * Initializes a uPlot chart, sets series colors, adds to array, and attaches ResizeObserver.
 * ✅ FIXED: Now calculates initial width dynamically from container and uses contentBoxSize for better accuracy
 * @param {Object} opts - Chart options (width can be null, will be calculated from container)
 * @param {Array} chartData
 * @param {HTMLElement} chartDiv - The chart container element
 * @param {Array} charts - Array to store chart references
 * @returns {uPlot}
 */
export function initUPlotChart(opts, chartData, chartDiv, charts) {
  const computeContentWidth = (el) => {
    if (!el) return 800;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const paddingX =
      parseFloat(style.paddingLeft || "0") + parseFloat(style.paddingRight || "0");
    const width = rect.width ? rect.width - paddingX : el.clientWidth - paddingX;
    return Math.max(Math.floor(width), 0);
  };

  // ✅ FIX #1: Calculate width from the chart container itself (excludes label + drag bar)
  const containerWidth = computeContentWidth(chartDiv) || 800;

  // Only set width if not already provided or is placeholder
  if (!opts.width || opts.width === 400) {
    opts.width = Math.max(containerWidth, 200); // Ensure minimum 200px width
    console.log(
      `[initUPlotChart] 📊 Calculated chart width: ${opts.width}px from container ${containerWidth}px`
    );
  }

  const chart = new uPlot(opts, chartData, chartDiv);
  chart._seriesColors = opts.series.slice(1).map((s) => s.stroke);

  charts.push(chart);

  // ✅ FIX #2: Improved ResizeObserver with contentBoxSize for accuracy
  // ✅ FIX #4: Add debouncing to prevent ResizeObserver loop during animations
  let resizeTimeout = null;
  let lastSize = { width: 0, height: 0 };

  const ro = new ResizeObserver((entries) => {
    // Clear pending resize
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }

    resizeTimeout = setTimeout(() => {
      for (let entry of entries) {
        // Use contentBoxSize if available (more accurate), fallback to contentRect
        const target = entry.target;
        let newWidth;
        let newHeight;

        if (entry.contentBoxSize) {
          newWidth = Math.floor(entry.contentBoxSize[0].inlineSize);
          newHeight = Math.floor(entry.contentBoxSize[0].blockSize);
        } else {
          newWidth = Math.floor(entry.contentRect.width);
          newHeight = Math.floor(entry.contentRect.height);
        }

        if (target) {
          const widthFromTarget = computeContentWidth(target);
          if (widthFromTarget > 0) {
            newWidth = widthFromTarget;
          }

          const rect = target.getBoundingClientRect();
          const style = window.getComputedStyle(target);
          const paddingY =
            parseFloat(style.paddingTop || "0") + parseFloat(style.paddingBottom || "0");
          const heightFromTarget = Math.max(Math.floor(rect.height - paddingY), 0);
          if (heightFromTarget > 0) {
            newHeight = heightFromTarget;
          }
        }

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
          console.log(
            `[ResizeObserver] 📊 Chart resized to ${newWidth}x${newHeight}px`
          );
        }
      }
    }, 50); // Debounce resize calls by 50ms
  });

  // ✅ FIX #3: Observe parent container to catch width changes from sidebar toggle
  // This ensures chart resizes when parent container width changes (sidebar open/close)
  ro.observe(chartDiv);

  return chart;
}
