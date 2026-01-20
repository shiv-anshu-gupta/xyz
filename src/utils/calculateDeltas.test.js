/**
 * Test suite for calculateDeltas utility
 * Tests delta calculations between vertical lines
 */

import { calculateDeltas } from "./calculateDeltas.js";

describe("Calculate Deltas", () => {
  let mockChart;
  let resultElement;

  beforeEach(() => {
    // Create mock fixed-results element
    resultElement = document.createElement("div");
    resultElement.id = "fixed-results";
    document.body.appendChild(resultElement);

    // Create mock chart
    mockChart = {
      data: [
        [0, 1, 2, 3, 4, 5], // X-axis (time in microseconds)
        [10, 20, 30, 40, 50, 60], // Signal A
        [100, 110, 120, 130, 140, 150], // Signal B
      ],
      series: [
        { label: "Time" },
        { label: "Signal A", stroke: "#ff0000" },
        { label: "Signal B", stroke: "#00ff00" },
      ],
      _seriesColors: ["#ff0000", "#00ff00"],
    };
  });

  afterEach(() => {
    document.body.removeChild(resultElement);
  });

  test("calculates delta between two vertical lines", async () => {
    const verticalLines = [1, 3]; // At x=1 and x=3

    await calculateDeltas(verticalLines, mockChart, "microseconds");

    const output = document.getElementById("fixed-results");
    expect(output.innerHTML).toContain("Δtime: 2.00 μs");
    expect(output.innerHTML).toContain("Signal A");
    expect(output.innerHTML).toContain("Signal B");
  });

  test("correctly calculates value differences", async () => {
    const verticalLines = [1, 3]; // At indices 1 and 3
    // Signal A: values 20 and 40, delta = 40 - 20 = 20
    // Signal B: values 110 and 130, delta = 130 - 110 = 20

    await calculateDeltas(verticalLines, mockChart, "microseconds");

    const output = document.getElementById("fixed-results");
    expect(output.innerHTML).toContain("ΔY: 20.00");
  });

  test("handles multiple vertical lines (creates multiple delta sections)", async () => {
    const verticalLines = [1, 2, 4]; // Three vertical lines

    await calculateDeltas(verticalLines, mockChart, "microseconds");

    const output = document.getElementById("fixed-results");
    // Should calculate deltas for (1->2) and (2->4)
    expect(output.innerHTML).toBeTruthy();
    expect(output.children.length).toBeGreaterThan(0);
  });

  test("handles time unit conversion (milliseconds)", async () => {
    const verticalLines = [1, 3];

    await calculateDeltas(verticalLines, mockChart, "milliseconds");

    const output = document.getElementById("fixed-results");
    expect(output.innerHTML).toContain(" ms");
  });

  test("handles time unit conversion (seconds)", async () => {
    const verticalLines = [1, 3];

    await calculateDeltas(verticalLines, mockChart, "seconds");

    const output = document.getElementById("fixed-results");
    expect(output.innerHTML).toContain(" s");
  });

  test("returns gracefully if output element missing", async () => {
    document.body.removeChild(resultElement);

    await calculateDeltas([1, 3], mockChart, "microseconds");
  });

  test("returns gracefully if less than 2 vertical lines", async () => {
    const output = document.getElementById("fixed-results");
    output.innerHTML = "initial";

    await calculateDeltas([1], mockChart, "microseconds");

    // Should not modify output
    expect(output.innerHTML).toBe("");
  });

  test("returns gracefully if chart data is missing", async () => {
    const invalidChart = {};

    await calculateDeltas([1, 3], invalidChart, "microseconds");
  });

  test("skips invalid indices", async () => {
    const verticalLines = [10, 20]; // Way out of bounds (data only goes 0-5)

    await calculateDeltas(verticalLines, mockChart, "microseconds");
  });

  test("correctly formats series labels with colors", async () => {
    const verticalLines = [1, 3];

    await calculateDeltas(verticalLines, mockChart, "microseconds");

    const output = document.getElementById("fixed-results");
    expect(output.innerHTML).toContain("Signal A");
    expect(output.innerHTML).toContain("Signal B");
    expect(output.innerHTML).toContain("#ff0000"); // Red for Signal A
    expect(output.innerHTML).toContain("#00ff00"); // Green for Signal B
  });

  test("handles non-numeric values gracefully", async () => {
    const chartWithNulls = {
      data: [
        [0, 1, 2, 3, 4, 5],
        [10, null, 30, 40, 50, 60], // Null value
        [100, 110, 120, 130, 140, 150],
      ],
      series: [
        { label: "Time" },
        { label: "Signal A", stroke: "#ff0000" },
        { label: "Signal B", stroke: "#00ff00" },
      ],
      _seriesColors: ["#ff0000", "#00ff00"],
    };

    await calculateDeltas([1, 3], chartWithNulls, "microseconds");
  });

  test("calculates correct delta with different sampling rates", async () => {
    // Simulate different sampling rates
    const chartDifferentSampling = {
      data: [
        [0, 0.5, 1.0, 1.5, 2.0, 2.5], // Non-uniform X-axis
        [10, 15, 20, 25, 30, 35], // Sampled every 0.5 units
        [100, 105, 110, 115, 120, 125], // Same uniform rate
      ],
      series: [
        { label: "Time" },
        { label: "Signal A", stroke: "#ff0000" },
        { label: "Signal B", stroke: "#00ff00" },
      ],
      _seriesColors: ["#ff0000", "#00ff00"],
    };

    await calculateDeltas([0.5, 2.0], chartDifferentSampling, "microseconds");

    const output = document.getElementById("fixed-results");
    expect(output.innerHTML).toBeTruthy();
  });
});
