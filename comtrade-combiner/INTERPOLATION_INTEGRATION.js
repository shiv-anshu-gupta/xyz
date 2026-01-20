/**
 * INTEGRATION GUIDE: Using Interpolation with Vertical Lines in Combined Files
 *
 * This guide explains how to:
 * 1. Use the interpolation module with vertical line plugin
 * 2. Display correct values when combining files with different sampling rates
 * 3. Handle multi-file synchronization
 */

// ============================================================================
// PART 1: SETUP - Importing Required Modules
// ============================================================================

import {
  linearInterpolate,
  getInterpolatedValue,
  findNearestIndex,
  interpolateArray,
  resampleData,
} from "./utils/interpolation.js";

import verticalLinePlugin from "../src/plugins/verticalLinePlugin.js";
import { createState } from "../src/components/createState.js";
import { calculateDeltas } from "../src/utils/calculateDeltas.js";

// ============================================================================
// PART 2: SETUP VERTICAL LINES WITH INTERPOLATION
// ============================================================================

/**
 * Create a vertical line plugin with interpolation support
 * for combined COMTRADE files with different sampling rates
 */
function setupVerticalLinesWithInterpolation(charts, combinedFileData) {
  // Create reactive state for vertical lines
  const verticalLinesX = createState([]);

  // Configure vertical line plugin with interpolation
  const verticalLineOpts = {
    lineColors: ["#e41a1c", "#377eb8", "#4daf4a"],
    lineWidth: 2,
    pointRadius: 5,
    labelFormatter: (color) => `T: ${color}`,

    // INTERPOLATION CONFIGURATION
    enableInterpolation: true, // Enable on-the-fly interpolation
    samplingRates: combinedFileData.samplingRates || {}, // Map of series to their rates
    timeColumn: 0, // X-axis is time (column 0)
  };

  // Create the plugin instance
  const plugin = verticalLinePlugin(
    verticalLinesX,
    () => charts,
    verticalLineOpts
  );

  return { verticalLinesX, plugin };
}

// ============================================================================
// PART 3: HANDLING DIFFERENT SAMPLING RATES
// ============================================================================

/**
 * When vertical line is placed on chart with mixed sampling rates,
 * this function calculates interpolated values
 */
function onVerticalLineMoved(verticalLinePosition, chartsData) {
  console.log(
    `[verticalLineInterpolation] Line moved to position: ${verticalLinePosition}`
  );

  chartsData.forEach((chartData, chartIdx) => {
    const { times, values, samplingRate } = chartData;

    // Find the two surrounding time points
    const nearestIdx = findNearestIndex(times, verticalLinePosition);

    // Get interpolated value at vertical line position
    const interpolatedValue = getInterpolatedValue(
      times,
      values,
      verticalLinePosition,
      nearestIdx
    );

    console.log(
      `[verticalLineInterpolation] Chart ${chartIdx}:`,
      `Position: ${verticalLinePosition},`,
      `Interpolated Value: ${interpolatedValue.toFixed(3)}`
    );

    // Update display with interpolated value
    updateValueDisplay(chartIdx, interpolatedValue, samplingRate);
  });
}

// ============================================================================
// PART 4: COMBINING FILES WITH INTERPOLATION
// ============================================================================

/**
 * When combining COMTRADE files with different sampling rates,
 * use interpolation to align data
 *
 * @example
 * const file1 = { times: [0, 0.01, 0.02, ...], values: [100, 110, 120, ...], rate: 100 }
 * const file2 = { times: [0, 0.001, 0.002, ...], values: [50, 51, 52, ...], rate: 1000 }
 * const combined = combineWithInterpolation([file1, file2])
 */
function combineFilesWithInterpolation(filesToCombine) {
  console.log(
    `[combineWithInterpolation] Combining ${filesToCombine.length} files`
  );

  // Determine common time points (use highest sampling rate)
  const maxRate = Math.max(...filesToCombine.map((f) => f.samplingRate));
  const minRate = Math.min(...filesToCombine.map((f) => f.samplingRate));

  console.log(
    `[combineWithInterpolation] Sampling rates: ${minRate}Hz - ${maxRate}Hz`
  );

  // Get time range from first file
  const startTime = filesToCombine[0].times[0];
  const endTime = filesToCombine[0].times[filesToCombine[0].times.length - 1];

  // Generate time points at highest resolution
  const commonInterval = 1 / maxRate;
  const commonTimes = [];
  for (let t = startTime; t <= endTime; t += commonInterval) {
    commonTimes.push(t);
  }

  console.log(
    `[combineWithInterpolation] Common time points: ${commonTimes.length}`
  );

  // Interpolate all files to common time points
  const alignedFiles = filesToCombine.map((file, idx) => {
    const interpolatedValues = interpolateArray(
      file.times,
      file.values,
      commonTimes
    );

    console.log(
      `[combineWithInterpolation] File ${idx}:`,
      `Original: ${file.times.length} samples,`,
      `Interpolated: ${interpolatedValues.length} samples`
    );

    return {
      ...file,
      times: commonTimes,
      values: interpolatedValues,
      originalTimes: file.times, // Keep for reference
      originalValues: file.values,
    };
  });

  return {
    times: commonTimes,
    files: alignedFiles,
    interval: commonInterval,
    samplingRate: maxRate,
  };
}

// ============================================================================
// PART 5: CHARTING COMBINED DATA WITH VERTICAL LINES
// ============================================================================

/**
 * Create uPlot chart configuration for combined files with interpolation
 */
function createCombinedChartConfig(combinedData, seriesColors) {
  return {
    title: "Combined COMTRADE Files (with Interpolation)",
    width: 1000,
    height: 400,
    scales: {
      x: {
        time: false,
        auto: true,
      },
      y: {
        auto: true,
      },
    },
    series: [
      {}, // X-axis (time)
      ...combinedData.files.map((file, idx) => ({
        label: file.label || `Series ${idx + 1}`,
        stroke: seriesColors[idx % seriesColors.length],
        width: 1.5,
        scale: "y",
        points: {
          size: 4,
          fill: "white",
          stroke: seriesColors[idx % seriesColors.length],
        },
      })),
    ],
    axes: [
      {
        scale: "x",
        label: "Time (seconds)",
        stroke: "#333",
      },
      {
        scale: "y",
        label: "Value",
        stroke: "#333",
      },
    ],
    cursor: {
      x: true,
      y: true,
      sync: {
        key: "multiChartSync",
        setSeries: true,
      },
    },
    plugins: [
      // Include vertical line plugin with interpolation
    ],
  };
}

// ============================================================================
// PART 6: REAL-WORLD EXAMPLE - THREE FILES, DIFFERENT RATES
// ============================================================================

/**
 * Example: Combining three files with different sampling rates
 *
 * File 1: 100 Hz (0.01s interval)  - Voltage measurement
 * File 2: 500 Hz (0.002s interval) - Current measurement
 * File 3: 50 Hz (0.02s interval)   - Frequency measurement
 *
 * All three placed on same chart with vertical lines for crosshair data
 */
function exampleMultiRateCombination() {
  // Sample data from different files
  const file1 = {
    label: "Voltage (100Hz)",
    samplingRate: 100,
    times: generateTimeArray(0, 1, 0.01), // 0 to 1 second, 0.01s intervals
    values: generateSineWave(100, 50, 100), // 100V ± 50V, 100 cycles
  };

  const file2 = {
    label: "Current (500Hz)",
    samplingRate: 500,
    times: generateTimeArray(0, 1, 0.002), // 0 to 1 second, 0.002s intervals
    values: generateSineWave(500, 10, 50), // 10A ± 50Hz shift
  };

  const file3 = {
    label: "Frequency (50Hz)",
    samplingRate: 50,
    times: generateTimeArray(0, 1, 0.02), // 0 to 1 second, 0.02s intervals
    values: generateSineWave(50, 49, 60), // 50Hz ± noise
  };

  // Combine with interpolation
  const combined = combineFilesWithInterpolation([file1, file2, file3]);

  console.log("Combined Result:", {
    timeSamples: combined.times.length,
    interval: combined.interval,
    samplingRate: combined.samplingRate,
    files: combined.files.length,
  });

  // Now create chart with combined data
  const chartData = [combined.times, ...combined.files.map((f) => f.values)];

  // Create uPlot instance
  const opts = createCombinedChartConfig(combined, [
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
  ]);
  const chart = new uPlot(opts, chartData, document.getElementById("chart"));

  // Setup vertical lines with interpolation
  const { verticalLinesX, plugin } = setupVerticalLinesWithInterpolation(
    [chart],
    {
      samplingRates: {
        0: file1.samplingRate,
        1: file2.samplingRate,
        2: file3.samplingRate,
      },
    }
  );

  // Add plugin to chart
  opts.plugins.push(plugin);

  // Subscribe to line movements
  verticalLinesX.subscribe((lines) => {
    if (lines.length > 0) {
      onVerticalLineMoved(lines[0], combined.files);
    }
  });

  return { chart, verticalLinesX, combined };
}

// ============================================================================
// PART 7: HELPER FUNCTIONS
// ============================================================================

function generateTimeArray(start, end, interval) {
  const times = [];
  for (let t = start; t <= end; t += interval) {
    times.push(t);
  }
  return times;
}

function generateSineWave(samples, amplitude, frequency) {
  const values = [];
  for (let i = 0; i < samples; i++) {
    const t = i / samples;
    const value = amplitude + amplitude * Math.sin(2 * Math.PI * frequency * t);
    values.push(value);
  }
  return values;
}

function updateValueDisplay(chartIdx, value, samplingRate) {
  const display = document.getElementById(`value-${chartIdx}`);
  if (display) {
    display.textContent = `${value.toFixed(3)} (${samplingRate}Hz)`;
  }
}

// ============================================================================
// PART 8: VERTICAL LINE DELTA CALCULATION WITH INTERPOLATION
// ============================================================================

/**
 * Calculate deltas between two vertical lines with interpolation
 * across different sampling rates
 */
function calculateInterpolatedDeltas(verticalLinesX, chartData) {
  const lines = verticalLinesX.asArray
    ? verticalLinesX.asArray()
    : verticalLinesX;

  if (lines.length < 2) {
    return null; // Need at least 2 lines
  }

  const line1Pos = lines[0];
  const line2Pos = lines[1];
  const timeWindow = Math.abs(line2Pos - line1Pos);

  console.log(
    `[deltaInterpolation] Calculating delta for window: ${timeWindow.toFixed(
      4
    )}s`
  );

  const deltas = chartData.map((data, idx) => {
    const { times, values, label } = data;

    // Get interpolated values at both vertical line positions
    const idx1 = findNearestIndex(times, line1Pos);
    const idx2 = findNearestIndex(times, line2Pos);

    const value1 = getInterpolatedValue(times, values, line1Pos, idx1);
    const value2 = getInterpolatedValue(times, values, line2Pos, idx2);

    const delta = value2 - value1;
    const rate = (delta / timeWindow).toFixed(3); // Rate of change

    return {
      label,
      value1: value1.toFixed(3),
      value2: value2.toFixed(3),
      delta: delta.toFixed(3),
      rateOfChange: rate,
    };
  });

  return {
    timeWindow: timeWindow.toFixed(4),
    deltas,
  };
}

// ============================================================================
// EXPORT CONFIGURATION
// ============================================================================

export {
  setupVerticalLinesWithInterpolation,
  onVerticalLineMoved,
  combineFilesWithInterpolation,
  createCombinedChartConfig,
  exampleMultiRateCombination,
  calculateInterpolatedDeltas,
};

export default {
  setupVerticalLinesWithInterpolation,
  combineFilesWithInterpolation,
  exampleMultiRateCombination,
  calculateInterpolatedDeltas,
};
