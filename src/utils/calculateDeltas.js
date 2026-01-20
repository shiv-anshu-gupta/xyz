/*
 * Calculates ΔX and ΔY between consecutive vertical lines.
 * Accepts timeUnit for correct deltaX labeling.
 *
 * @param {number[]} verticalLinesX - X positions of vertical lines.
 * @param {uPlot} chart - Chart instance containing data.
 * @param {string} [timeUnit] - Time unit for ΔX label.
 */
import { crosshairColors } from "./constants.js";
import { getNearestIndex, createCustomElement } from "./helpers.js";

/**
 * Apply unit scaling and format value with SI prefix
 * @param {number} value - Raw value from data
 * @param {number} scaleFactor - Scale factor from axesScales (e.g., 0.001)
 * @param {string} unit - Unit string (e.g., "A", "V", "W")
 * @returns {string} Formatted value with SI prefix (e.g., "1.91 kA")
 */
function formatScaledValue(value, scaleFactor = 1, unit = "") {
  // Apply scale factor (e.g., 0.001 converts mA → A)
  const scaled = value * scaleFactor;

  // Determine SI prefix based on magnitude
  const absScaled = Math.abs(scaled);
  let siPrefix = "";
  let divisor = 1;

  if (absScaled >= 1e9) {
    siPrefix = "G";
    divisor = 1e9;
  } else if (absScaled >= 1e6) {
    siPrefix = "M";
    divisor = 1e6;
  } else if (absScaled >= 1e3) {
    siPrefix = "k";
    divisor = 1e3;
  } else if (absScaled >= 1) {
    siPrefix = "";
    divisor = 1;
  } else if (absScaled >= 1e-3) {
    siPrefix = "m";
    divisor = 1e-3;
  } else if (absScaled >= 1e-6) {
    siPrefix = "μ";
    divisor = 1e-6;
  } else if (absScaled >= 1e-9) {
    siPrefix = "n";
    divisor = 1e-9;
  }

  const finalValue = scaled / divisor;

  // Format with 2 decimal places - add space between number and unit
  const formatted = `${finalValue.toFixed(2)} ${siPrefix}${unit}`;

  // Debug logging
  console.log(
    `[formatScaledValue] value=${value}, scaleFactor=${scaleFactor}, scaled=${scaled}, absScaled=${absScaled}, siPrefix='${siPrefix}', divisor=${divisor}, result='${formatted}'`
  );

  return formatted;
}

/**
 * Collect delta data from a single chart (without updating UI)
 * @param {number[]} verticalLinesX - X positions of vertical lines
 * @param {uPlot} chart - Chart instance
 * @param {string} timeUnit - Time unit for labels
 * @returns {Object[]} Array of delta data sections
 */
export function collectChartDeltas(
  verticalLinesX,
  chart,
  timeUnit = "microseconds"
) {
  const deltaData = [];

  // Defensive: Check if we have valid data
  if (!Array.isArray(verticalLinesX) || verticalLinesX.length < 1) {
    return deltaData;
  }
  if (!chart || !chart.data || !Array.isArray(chart.data[0])) {
    return deltaData;
  }

  const timeArr = chart.data[0]; // X-axis data
  const seriesData = chart.data.slice(1); // All Y-series data

  if (!Array.isArray(seriesData) || seriesData.length === 0) {
    return deltaData;
  }

  // Get scale factors and units from chart configuration
  const axesScales = chart._axesScales || [];
  const yUnits = chart._yUnits || [];

  // Handle single line: show position values
  if (verticalLinesX.length === 1) {
    const idx = getNearestIndex(timeArr, verticalLinesX[0]);
    if (idx === -1) return deltaData;

    const section = {
      deltaTime: `Line 1: ${timeArr[idx].toFixed(2)}`,
      series: [],
    };

    chart.series.slice(1).forEach((series, j) => {
      if (!seriesData[j] || !Array.isArray(seriesData[j])) return;

      const value = seriesData[j][idx];
      if (typeof value !== "number") return;

      const seriesColor = chart._seriesColors
        ? chart._seriesColors[j]
        : series.stroke || "black";

      // Apply scaling for display
      const scaleFactor = axesScales[j + 1] || 1;
      const channelUnit = yUnits[j] || "";
      const formattedValue = formatScaledValue(value, scaleFactor, channelUnit);

      section.series.push({
        name: series.label || `Series ${j + 1}`,
        color: seriesColor,
        v1: value,
        v2: value,
        deltaY: 0,
        percentage: 0,
        v1Formatted: formattedValue,
        v2Formatted: formattedValue,
        deltaFormatted: `0.00 ${channelUnit}`,
        unit: channelUnit,
      });
    });

    deltaData.push(section);
    return deltaData;
  }

  // Handle multiple lines: show deltas between consecutive pairs
  for (let i = 0; i < verticalLinesX.length - 1; i++) {
    const idx1 = getNearestIndex(timeArr, verticalLinesX[i]);
    const idx2 = getNearestIndex(timeArr, verticalLinesX[i + 1]);

    if (idx1 === -1 || idx2 === -1) continue; // Guard: skip if indices invalid

    const deltaX = (timeArr[idx2] - timeArr[idx1]).toFixed(2);

    // Create delta data section
    const deltaTimeStr = `${deltaX}${
      timeUnit === "seconds"
        ? " s"
        : timeUnit === "milliseconds"
        ? " ms"
        : " μs"
    }`;
    const section = {
      deltaTime: deltaTimeStr,
      series: [],
    };

    // Loop through each data series (skip index 0 because it's x-axis)
    // chart.series[0] is typically the x-axis, so we start from index 1
    chart.series.slice(1).forEach((series, j) => {
      // seriesData[j] corresponds to chart.series[j+1] because chart.data[0] is time
      if (!seriesData[j] || !Array.isArray(seriesData[j])) {
        console.log(
          `[collectChartDeltas] Skipping series ${j} (${
            series.label || "unknown"
          }): data missing or not array`,
          {
            hasData: !!seriesData[j],
            isArray: Array.isArray(seriesData[j]),
          }
        );
        return; // Guard: skip if data missing
      }

      const v1 = seriesData[j][idx1];
      const v2 = seriesData[j][idx2];

      if (typeof v1 !== "number" || typeof v2 !== "number") {
        // This is expected for some digital channels or missing data points
        console.log(
          `[collectChartDeltas] Skipping series ${j} (${
            series.label || "unknown"
          }): values not numeric`,
          {
            v1Type: typeof v1,
            v2Type: typeof v2,
            v1: v1,
            v2: v2,
            idx1,
            idx2,
          }
        );
        return; // Guard: skip if not numbers
      }

      const deltaY = v2 - v1;
      const percentage =
        v1 !== 0 ? ((deltaY / Math.abs(v1)) * 100).toFixed(1) : 0;

      const seriesLabel = series.label || `Series ${j + 1}`;

      // Fetch color from stored metadata or series stroke
      const seriesColor = chart._seriesColors
        ? chart._seriesColors[j]
        : series.stroke || "black";

      // Apply scaling for display
      const scaleFactor = axesScales[j + 1] || 1;
      const channelUnit = yUnits[j] || "";

      const v1Formatted = formatScaledValue(v1, scaleFactor, channelUnit);
      const v2Formatted = formatScaledValue(v2, scaleFactor, channelUnit);
      const deltaFormatted = formatScaledValue(
        deltaY,
        scaleFactor,
        channelUnit
      );

      // Add to delta data
      section.series.push({
        name: seriesLabel,
        color: seriesColor,
        v1, // Keep raw values for calculations
        v2,
        deltaY,
        percentage,
        v1Formatted, // Add formatted values for display
        v2Formatted,
        deltaFormatted,
        unit: channelUnit,
      });
    });

    deltaData.push(section);
  }

  console.log(
    `[collectChartDeltas] Returning ${
      deltaData.length
    } delta sections with ${deltaData.reduce(
      (s, d) => s + (d.series ? d.series.length : 0),
      0
    )} total series`
  );
  return deltaData;
}

export async function calculateDeltas(
  verticalLinesX,
  chart,
  timeUnit = "microseconds"
) {
  const output = document.getElementById("fixed-results");
  if (!output) return; // Guard: exit if output element doesn't exist

  output.innerHTML = "";

  // Defensive: Check if we have valid data
  if (!Array.isArray(verticalLinesX) || verticalLinesX.length < 1) return;
  if (!chart || !chart.data || !Array.isArray(chart.data[0])) return;

  const timeArr = chart.data[0]; // X-axis data
  const seriesData = chart.data.slice(1); // All Y-series data

  if (!Array.isArray(seriesData) || seriesData.length === 0) return;

  // Format data for delta window
  const deltaData = [];

  // Calculate deltas between consecutive vertical lines
  for (let i = 0; i < verticalLinesX.length - 1; i++) {
    const idx1 = getNearestIndex(timeArr, verticalLinesX[i]);
    const idx2 = getNearestIndex(timeArr, verticalLinesX[i + 1]);

    if (idx1 === -1 || idx2 === -1) continue; // Guard: skip if indices invalid

    const deltaX = (timeArr[idx2] - timeArr[idx1]).toFixed(2);

    const border = createCustomElement("div", "border-bottom");
    output.appendChild(border);

    // Create delta data section
    const deltaTimeStr = `${deltaX}${
      timeUnit === "seconds"
        ? " s"
        : timeUnit === "milliseconds"
        ? " ms"
        : " μs"
    }`;
    const section = {
      deltaTime: deltaTimeStr,
      series: [],
    };

    // Loop through each data series (skip index 0 because it's x-axis)
    // chart.series[0] is typically the x-axis, so we start from index 1
    chart.series.slice(1).forEach((series, j) => {
      // seriesData[j] corresponds to chart.series[j+1] because chart.data[0] is time
      if (!seriesData[j] || !Array.isArray(seriesData[j])) {
        console.warn(
          `[calculateDeltas] Series ${j} data missing or not array`,
          {
            seriesLabel: series.label,
            hasData: !!seriesData[j],
            isArray: Array.isArray(seriesData[j]),
          }
        );
        return; // Guard: skip if data missing
      }

      const v1 = seriesData[j][idx1];
      const v2 = seriesData[j][idx2];

      if (typeof v1 !== "number" || typeof v2 !== "number") {
        // This is expected for some digital channels or missing data points
        return; // Guard: skip if not numbers
      }

      const deltaY = v2 - v1;
      const percentage =
        v1 !== 0 ? ((deltaY / Math.abs(v1)) * 100).toFixed(1) : 0;

      const result = createCustomElement("div");

      const seriesLabel = series.label || `Series ${j + 1}`;

      // Fetch color from stored metadata or series stroke
      const seriesColor = chart._seriesColors
        ? chart._seriesColors[j]
        : series.stroke || "black";

      const crosshairColor1 = crosshairColors[i % crosshairColors.length];
      const crosshairColor2 = crosshairColors[(i + 1) % crosshairColors.length];

      let deltaXLabel = `Δtime: ${deltaX}`;
      if (timeUnit === "seconds") deltaXLabel += " s";
      else if (timeUnit === "milliseconds") deltaXLabel += " ms";
      else deltaXLabel += " μs";

      result.innerHTML = `
        <span style="color:${seriesColor}">
          ${seriesLabel}
        </span> 
        <span style="color:${crosshairColor1}">
          ${deltaXLabel},
        </span>
        <span style="color:${crosshairColor2}">
          ΔY: ${deltaY.toFixed(2)}
        </span>
      `;
      output.appendChild(result);

      // Add to delta data
      section.series.push({
        name: seriesLabel,
        color: seriesColor,
        v1,
        v2,
        deltaY,
        percentage,
      });
    });

    deltaData.push(section);
  }

  // Update delta drawer if available
  // Show drawer whenever there are vertical lines (even if just 1)
  try {
    const { deltaWindow } = await import("../main.js");
    if (deltaWindow && verticalLinesX.length > 0) {
      deltaWindow.show(); // Open the drawer
      deltaWindow.update(deltaData, verticalLinesX.length);
    }
  } catch (e) {
    // Delta window not available yet, that's okay
  }
}
