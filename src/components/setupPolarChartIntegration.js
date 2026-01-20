/**
 * Phasor Chart Integration with Vertical Lines
 * Updates polar chart when vertical line moves on the timeline
 */
import { debounce } from "../utils/computedChannelOptimization.js";

export function setupPolarChartWithVerticalLines(
  polarChart,
  cfg,
  data,
  verticalLinesX,
  charts
) {
  console.log("[setupPolarChartWithVerticalLines] CALLED with params:", {
    polarChartExists: !!polarChart,
    cfgExists: !!cfg,
    dataExists: !!data,
    verticalLinesXType: verticalLinesX
      ? verticalLinesX.constructor.name
      : "null",
    chartsLength: charts ? charts.length : 0,
  });

  if (!polarChart || !cfg || !data) {
    console.warn("[setupPolarChartWithVerticalLines] Missing parameters");
    return;
  }

  /**
   * Update polar chart based on vertical line position
   * @param {number} verticalLineX - X position of the vertical line (in time units)
   */
  function updatePolarFromVerticalLine(verticalLineX) {
    if (!data.time || data.time.length === 0) {
      console.warn("[updatePolarFromVerticalLine] No time data available");
      return;
    }

    // Find the closest time index to the vertical line position
    const timeIndex = findNearestTimeIndex(data.time, verticalLineX);

    // Update polar chart with data at this time index
    polarChart.updatePhasorAtTimeIndex(cfg, data, timeIndex);

    // Log for debugging
    console.log(
      `[Phasor] Updated at vertical line x=${verticalLineX.toFixed(
        4
      )}, timeIndex=${timeIndex}, time=${
        data.time[timeIndex]?.toFixed(4) || "N/A"
      }`
    );
  }

  /**
   * Find the nearest time index for a given x position
   * @param {number[]} timeArray - Array of time values
   * @param {number} xValue - Target x value
   * @returns {number} Index of nearest time value
   */
  function findNearestTimeIndex(timeArray, xValue) {
    if (timeArray.length === 0) return 0;

    let nearestIndex = 0;
    let minDistance = Math.abs(timeArray[0] - xValue);

    for (let i = 1; i < timeArray.length; i++) {
      const distance = Math.abs(timeArray[i] - xValue);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = i;
      }
      // Early exit if we're moving away (time is typically sorted)
      if (timeArray[i] > xValue) break;
    }

    return nearestIndex;
  }

  // ✅ Debounce the polar chart update
  const debouncedUpdatePolar = debounce((newLines) => {
    console.log(
      "[setupPolarChartWithVerticalLines] Debounced subscription triggered with lines:",
      newLines
    );
    if (newLines && newLines.length > 0) {
      // Use the first vertical line (primary reference)
      updatePolarFromVerticalLine(newLines[0]);
    }
  }, 100); // 100ms debounce

  // Subscribe to vertical line changes
  console.log("[setupPolarChartWithVerticalLines] Attempting subscription...");
  console.log(
    "[setupPolarChartWithVerticalLines] verticalLinesX properties:",
    Object.keys(verticalLinesX || {})
  );

  if (verticalLinesX && typeof verticalLinesX.subscribe === "function") {
    // If verticalLinesX is a reactive state, subscribe to changes
    console.log("[setupPolarChartWithVerticalLines] Using .subscribe() method");
    verticalLinesX.subscribe((newLines) => {
      console.log(
        "[setupPolarChartWithVerticalLines] Subscription triggered, calling debounced update"
      );
      debouncedUpdatePolar(newLines);
    });

    console.log(
      "[setupPolarChartWithVerticalLines] ✅ Subscribed to vertical line changes"
    );
  } else if (
    verticalLinesX &&
    (Array.isArray(verticalLinesX) || Array.isArray(verticalLinesX.value))
  ) {
    // Fallback: watch for array changes (less efficient)
    console.warn(
      "[setupPolarChartWithVerticalLines] ⚠️  verticalLinesX is not reactive, using interval polling"
    );
    let lastValue = null;

    setInterval(() => {
      const currentLines = verticalLinesX.value || verticalLinesX;
      if (
        Array.isArray(currentLines) &&
        currentLines.length > 0 &&
        currentLines[0] !== lastValue
      ) {
        lastValue = currentLines[0];
        console.log(
          "[setupPolarChartWithVerticalLines] Interval update triggered with line:",
          lastValue
        );
        updatePolarFromVerticalLine(lastValue);
      }
    }, 100);
    console.log(
      "[setupPolarChartWithVerticalLines] ✅ Started interval polling"
    );
  } else {
    console.error(
      "[setupPolarChartWithVerticalLines] ❌ Cannot subscribe to verticalLinesX, type:",
      typeof verticalLinesX
    );
  }

  // Manual update function for external callers
  return {
    updatePolarFromVerticalLine,
    findNearestTimeIndex,
  };
}

export default setupPolarChartWithVerticalLines;
