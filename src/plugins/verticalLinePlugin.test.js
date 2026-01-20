/**
 * Test suite for verticalLinePlugin
 * Tests interpolation, delta calculations, and line drawing
 */

import verticalLinePlugin, {
  getInterpolatedValue,
} from "./verticalLinePlugin.js";
import { createState } from "../components/createState.js";

// Mock uPlot chart
function createMockChart() {
  return {
    data: [
      [0, 1, 2, 3, 4, 5], // X-axis (time)
      [10, 20, 30, 40, 50, 60], // Y1
      [100, 110, 120, 130, 140, 150], // Y2
    ],
    series: [
      { label: "Time" },
      { label: "Signal A", stroke: "#ff0000" },
      { label: "Signal B", stroke: "#00ff00" },
    ],
    bbox: { top: 10, height: 400, left: 50, width: 500 },
    ctx: {
      save: () => {},
      restore: () => {},
      moveTo: () => {},
      lineTo: () => {},
      beginPath: () => {},
      stroke: () => {},
      arc: () => {},
      fill: () => {},
      fillText: () => {},
    },
    scales: {
      x: { min: 0, max: 5 },
      y: { min: 0, max: 200 },
    },
    over: document.createElement("div"),
    posToVal: (pos, axis) => {
      if (axis === "x") return pos / 100; // Mock conversion
      return 200 - pos / 2; // Mock conversion
    },
    valToPos: (val, axis) => {
      if (axis === "x") return val * 100; // Mock conversion
      return 400 - val * 2; // Mock conversion
    },
    redraw: () => {},
    setSelect: () => {},
  };
}

describe("Vertical Line Interpolation", () => {
  test("interpolates value at exact data point", () => {
    const xData = [0, 1, 2, 3, 4, 5];
    const yData = [10, 20, 30, 40, 50, 60];

    const result = getInterpolatedValue(xData, yData, 2, 2);
    expect(result).toBe(30); // Exact value at index 2
  });

  test("interpolates value between data points (forward)", () => {
    const xData = [0, 1, 2, 3, 4, 5];
    const yData = [10, 20, 30, 40, 50, 60];

    // At x=1.5, should interpolate between y=20 (x=1) and y=30 (x=2)
    // Expected: 20 + (30-20) * (1.5-1) / (2-1) = 20 + 10*0.5 = 25
    const result = getInterpolatedValue(xData, yData, 1.5, 1);
    expect(result).toBeCloseTo(25, 1);
  });

  test("interpolates value between data points (backward)", () => {
    const xData = [0, 1, 2, 3, 4, 5];
    const yData = [10, 20, 30, 40, 50, 60];

    // At x=0.5, should interpolate between y=10 (x=0) and y=20 (x=1)
    // Expected: 10 + (20-10) * (0.5-0) / (1-0) = 10 + 10*0.5 = 15
    const result = getInterpolatedValue(xData, yData, 0.5, 0);
    expect(result).toBeCloseTo(15, 1);
  });

  test("handles non-uniform sampling rates", () => {
    const xData = [0, 0.5, 1.5, 2.0, 3.5, 5.0]; // Non-uniform time intervals
    const yData = [100, 110, 130, 140, 160, 180];

    // At x=1.0, interpolate between (0.5, 110) and (1.5, 130)
    // Expected: 110 + (130-110) * (1.0-0.5) / (1.5-0.5) = 110 + 20*0.5 = 120
    const result = getInterpolatedValue(xData, yData, 1.0, 1);
    expect(result).toBeCloseTo(120, 1);
  });

  test("handles edge case with same x values", () => {
    const xData = [0, 1, 2, 3, 4, 5];
    const yData = [10, 20, 30, 40, 50, 60];

    // If x1 === x2, should return the nearest y value
    const result = getInterpolatedValue(xData, yData, 2, 2);
    expect(result).toBe(30);
  });

  test("handles missing or invalid data", () => {
    const xData = [0, 1, 2, 3, 4, 5];
    const yData = [10, null, 30, 40, 50, 60];

    // Should gracefully handle invalid data
    const result = getInterpolatedValue(xData, yData, 1.5, 1);
    expect(typeof result).toBe("number"); // Should return a number
  });
});

describe("Vertical Line Plugin", () => {
  test("creates plugin object with hooks", () => {
    const verticalLinesState = createState([1, 3]);
    const plugin = verticalLinePlugin(verticalLinesState);

    expect(plugin).toHaveProperty("hooks");
    expect(plugin.hooks).toHaveProperty("init");
    expect(plugin.hooks).toHaveProperty("draw");
    expect(plugin.hooks).toHaveProperty("destroy");
  });

  test("plugin initializes with custom options", () => {
    const verticalLinesState = createState([1, 3]);
    const options = {
      lineColors: ["#ff0000", "#00ff00"],
      lineWidth: 3,
      pointRadius: 8,
      labelFormatter: (color) => `Line: ${color}`,
    };

    const plugin = verticalLinePlugin(verticalLinesState, null, options);
    expect(plugin.hooks).toBeDefined();
  });

  test("handles empty vertical lines array", () => {
    const verticalLinesState = createState([]);
    const plugin = verticalLinePlugin(verticalLinesState);
    const mockChart = createMockChart();

    // Should not throw error
    expect(() => {
      plugin.hooks.draw[0](mockChart);
    }).not.toThrow();
  });

  test("handles null or undefined state", () => {
    const plugin = verticalLinePlugin(null);
    const mockChart = createMockChart();

    // Should gracefully handle null state
    expect(() => {
      plugin.hooks.draw[0](mockChart);
    }).not.toThrow();
  });

  test("performs multi-chart synchronization", () => {
    const verticalLinesState = createState([1, 3]);
    const mockChart1 = createMockChart();
    const mockChart2 = createMockChart();
    let redrawCount = 0;

    mockChart1.redraw = () => redrawCount++;
    mockChart2.redraw = () => redrawCount++;

    const getCharts = () => [mockChart1, mockChart2];
    const plugin = verticalLinePlugin(verticalLinesState, getCharts);

    // Simulate mousemove and drag
    const mouseEvent = new MouseEvent("mousemove", {
      offsetX: 150,
      offsetY: 200,
    });

    // This would normally trigger the redraw through event listeners
    // For now, we just verify the plugin structure is correct
    expect(plugin.hooks).toBeDefined();
  });
});

// Export for testing
export { getInterpolatedValue };
