/**
 * Integration Example: Vertical Lines with Delta Display and Interpolation
 *
 * This example shows how the vertical line plugin, delta box plugin,
 * and calculateDeltas utility work together to:
 * 1. Display vertical lines at specified X positions
 * 2. Interpolate values for signals with different sampling rates
 * 3. Calculate and display delta values between vertical lines
 */

// Example 1: Basic Setup
// =====================

import uPlot from "https://cdn.jsdelivr.net/npm/uplot@1.6.32/dist/uplot.esm.js";
import verticalLinePlugin from "./src/plugins/verticalLinePlugin.js";
import { deltaBoxPlugin } from "./src/plugins/deltaBoxPlugin.js";
import { calculateDeltas } from "./src/utils/calculateDeltas.js";
import { createState } from "./src/components/createState.js";

// Create a state for vertical line positions
const verticalLinesX = createState([1.0, 2.5]); // Two lines at X positions

// Example data with multiple sampling rates
const data = [
  // X-axis (time in seconds) - uniform sampling at 100 Hz
  [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1],

  // Signal A - 100 Hz sampling rate
  [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30],

  // Signal B - Different sampling rate (50 Hz, every other sample)
  [100, null, 105, null, 110, null, 115, null, 120, null, 125],
];

// Chart configuration
const opts = {
  width: 1200,
  height: 500,
  series: [
    {
      label: "Time (s)",
    },
    {
      label: "Signal A (V)",
      stroke: "#ff0000",
      fill: "rgba(255, 0, 0, 0.1)",
      value: (u, v) => (v == null ? "-" : v.toFixed(2)),
    },
    {
      label: "Signal B (A)",
      stroke: "#00ff00",
      fill: "rgba(0, 255, 0, 0.1)",
      value: (u, v) => (v == null ? "-" : v.toFixed(2)),
    },
  ],
  axes: [
    {
      label: "Time (seconds)",
    },
    {
      label: "Value",
    },
  ],
  scales: {
    x: {
      auto: false,
      min: 0,
      max: 0.1,
    },
    y: {
      auto: true,
    },
  },
  plugins: [
    // Add vertical line plugin
    verticalLinePlugin(verticalLinesX, null, {
      lineColors: ["#ff6b6b", "#4ecdc4"],
      lineWidth: 2,
      pointRadius: 6,
      labelFormatter: (color) => {
        const colorNames = {
          "#ff6b6b": "T1",
          "#4ecdc4": "T2",
        };
        return colorNames[color] || color;
      },
    }),

    // Add delta box plugin
    deltaBoxPlugin(),
  ],
};

// Create chart
const container = document.getElementById("chart");
const chart = new uPlot(opts, data, container);

// Example 2: Interactive Vertical Line Control
// =============================================

// Function to add a new vertical line
function addVerticalLine(xPosition) {
  const currentLines = verticalLinesX.asArray();
  verticalLinesX.value = [...currentLines, xPosition];
  chart.redraw();
}

// Function to remove a vertical line by index
function removeVerticalLine(index) {
  const currentLines = verticalLinesX.asArray();
  verticalLinesX.value = currentLines.filter((_, i) => i !== index);
  chart.redraw();
}

// Function to move a vertical line
function moveVerticalLine(index, newXPosition) {
  const currentLines = verticalLinesX.asArray();
  currentLines[index] = newXPosition;
  verticalLinesX.value = [...currentLines]; // Trigger reactivity
  chart.redraw();
}

// Example 3: Calculate Delta on Demand
// ====================================

function updateDeltaDisplay() {
  // This is automatically called when vertical lines change
  // The calculateDeltas function will render to #fixed-results element
  calculateDeltas(
    verticalLinesX.asArray(),
    chart,
    "milliseconds" // Time unit for display
  );
}

// Subscribe to vertical lines changes
verticalLinesX.subscribe(() => {
  updateDeltaDisplay();
});

// Example 4: Understanding Interpolation
// ======================================

/**
 * When vertical lines don't fall exactly on data points,
 * the plugin interpolates values using linear interpolation.
 *
 * For example, if we have:
 *   X values: [0, 0.01, 0.02, 0.03, ...]
 *   Y values: [10, 12, 14, 16, ...]
 *
 * And we place a vertical line at X = 0.015 (between 0.01 and 0.02),
 * the interpolated Y value would be:
 *   Y = 12 + (14 - 12) * (0.015 - 0.01) / (0.02 - 0.01)
 *     = 12 + 2 * 0.5
 *     = 13
 */

// Example 5: Multi-Chart Synchronization
// ======================================

// If you have multiple charts (analog and digital), you can sync vertical lines:
const chart2 = null; // Assume another chart instance exists

function syncCharts() {
  const getCharts = () => {
    return [chart, chart2].filter((c) => c !== null);
  };

  // Re-create vertical line plugin with multi-chart sync
  const syncPlugin = verticalLinePlugin(verticalLinesX, getCharts, {
    lineColors: ["#ff6b6b", "#4ecdc4"],
    lineWidth: 2,
    pointRadius: 6,
  });

  // When you drag a vertical line on one chart,
  // it will update all linked charts automatically
}

// Export for use in other modules
export {
  verticalLinesX,
  addVerticalLine,
  removeVerticalLine,
  moveVerticalLine,
  updateDeltaDisplay,
  syncCharts,
};
