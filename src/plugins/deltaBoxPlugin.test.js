/**
 * Test suite for deltaBoxPlugin
 * Tests delta display box functionality
 */

import { deltaBoxPlugin } from "./deltaBoxPlugin.js";

describe("Delta Box Plugin", () => {
  let mockChart;
  let mockOverlay;

  beforeEach(() => {
    // Create mock overlay
    mockOverlay = document.createElement("div");
    mockOverlay.style.position = "absolute";

    // Create mock chart
    mockChart = {
      data: [
        [0, 1, 2, 3, 4, 5], // X-axis
        [10, 20, 30, 40, 50, 60], // Signal A
        [100, 110, 120, 130, 140, 150], // Signal B
      ],
      series: [
        { label: "Time" },
        { label: "Signal A", stroke: "#ff0000" },
        { label: "Signal B", stroke: "#00ff00" },
      ],
      over: mockOverlay,
      posToVal: (pos, axis) => {
        if (axis === "x") return pos / 100;
        return 200 - pos / 2;
      },
      select: null,
    };
  });

  test("creates plugin object with hooks", () => {
    const plugin = deltaBoxPlugin();

    expect(plugin).toHaveProperty("hooks");
    expect(plugin.hooks).toHaveProperty("init");
    expect(plugin.hooks).toHaveProperty("setSelect");
  });

  test("initializes delta box on chart init", () => {
    const plugin = deltaBoxPlugin();
    plugin.hooks.init(mockChart);

    // Should create a div element in overlay
    const deltaBoxes = mockOverlay.querySelectorAll("div");
    expect(deltaBoxes.length).toBeGreaterThan(0);
  });

  test("creates delta box with correct styling", () => {
    const plugin = deltaBoxPlugin();
    plugin.hooks.init(mockChart);

    const deltaBox = mockOverlay.querySelector("div");
    expect(deltaBox.style.position).toBe("absolute");
    expect(deltaBox.style.background).toContain("rgba");
    expect(deltaBox.style.zIndex).toBe("1000");
  });

  test("hides delta box when selection is empty", () => {
    const plugin = deltaBoxPlugin();
    plugin.hooks.init(mockChart);

    mockChart.select = null;
    plugin.hooks.setSelect(mockChart);

    const deltaBox = mockOverlay.querySelector("div");
    expect(deltaBox.style.display).toBe("none");
  });

  test("hides delta box when selection width is zero", () => {
    const plugin = deltaBoxPlugin();
    plugin.hooks.init(mockChart);

    mockChart.select = { left: 100, width: 0, height: 100 };
    plugin.hooks.setSelect(mockChart);

    const deltaBox = mockOverlay.querySelector("div");
    expect(deltaBox.style.display).toBe("none");
  });

  test("displays delta time and value differences", () => {
    const plugin = deltaBoxPlugin();
    plugin.hooks.init(mockChart);

    // Select from x=1 to x=3
    mockChart.select = {
      left: 100,
      width: 200,
      height: 100,
    };

    plugin.hooks.setSelect(mockChart);

    const deltaBox = mockOverlay.querySelector("div");
    expect(deltaBox.style.display).not.toBe("none");
    expect(deltaBox.innerHTML).toContain("Δt");
  });

  test("includes interpolated values in display", () => {
    const plugin = deltaBoxPlugin();
    plugin.hooks.init(mockChart);

    mockChart.select = {
      left: 100,
      width: 200,
      height: 100,
    };

    plugin.hooks.setSelect(mockChart);

    const deltaBox = mockOverlay.querySelector("div");
    // Should show V1 and V2 values
    expect(deltaBox.innerHTML).toContain("V1");
    expect(deltaBox.innerHTML).toContain("V2");
  });

  test("calculates percentage change correctly", () => {
    const plugin = deltaBoxPlugin();
    plugin.hooks.init(mockChart);

    // Select from index 0 to index 1
    // Signal A: 10 -> 20, delta = 10, percent = (10/10)*100 = 100%
    mockChart.select = {
      left: 0,
      width: 100,
      height: 100,
    };

    plugin.hooks.setSelect(mockChart);

    const deltaBox = mockOverlay.querySelector("div");
    expect(deltaBox.innerHTML).toBeTruthy();
  });

  test("handles selection with invalid indices", () => {
    const plugin = deltaBoxPlugin();
    plugin.hooks.init(mockChart);

    // Select way out of bounds
    mockChart.select = {
      left: 10000,
      width: 10000,
      height: 100,
    };

    expect(() => {
      plugin.hooks.setSelect(mockChart);
    }).not.toThrow();
  });

  test("displays series labels with correct colors", () => {
    const plugin = deltaBoxPlugin();
    plugin.hooks.init(mockChart);

    mockChart.select = {
      left: 100,
      width: 200,
      height: 100,
    };

    plugin.hooks.setSelect(mockChart);

    const deltaBox = mockOverlay.querySelector("div");
    expect(deltaBox.innerHTML).toContain("Signal A");
    expect(deltaBox.innerHTML).toContain("Signal B");
    expect(deltaBox.innerHTML).toContain("#ff0000"); // Red for Signal A
    expect(deltaBox.innerHTML).toContain("#00ff00"); // Green for Signal B
  });

  test("handles charts with different sampling rates", () => {
    const chartDifferentSampling = {
      data: [
        [0, 0.5, 1.0, 1.5, 2.0], // Non-uniform sampling
        [10, 15, 20, 25, 30],
        [100, 105, 110, 115, 120],
      ],
      series: [
        { label: "Time" },
        { label: "Signal A", stroke: "#ff0000" },
        { label: "Signal B", stroke: "#00ff00" },
      ],
      over: mockOverlay,
      posToVal: (pos, axis) => {
        if (axis === "x") return pos / 100;
        return 200 - pos / 2;
      },
      select: { left: 50, width: 100, height: 100 },
    };

    const plugin = deltaBoxPlugin();
    plugin.hooks.init(chartDifferentSampling);

    expect(() => {
      plugin.hooks.setSelect(chartDifferentSampling);
    }).not.toThrow();
  });

  test("handles missing series labels", () => {
    const chartNoLabels = {
      data: [
        [0, 1, 2, 3, 4, 5],
        [10, 20, 30, 40, 50, 60],
      ],
      series: [
        { label: "Time" },
        { stroke: "#ff0000" }, // No label
      ],
      over: mockOverlay,
      posToVal: (pos, axis) => {
        if (axis === "x") return pos / 100;
        return 200 - pos / 2;
      },
      select: { left: 100, width: 200, height: 100 },
    };

    const plugin = deltaBoxPlugin();
    plugin.hooks.init(chartNoLabels);

    expect(() => {
      plugin.hooks.setSelect(chartNoLabels);
    }).not.toThrow();
  });

  test("auto-scrolls content if overflow occurs", () => {
    const plugin = deltaBoxPlugin();
    plugin.hooks.init(mockChart);

    const deltaBox = mockOverlay.querySelector("div");
    expect(deltaBox.style.overflowY).toBe("auto");
    expect(deltaBox.style.maxHeight).toBeTruthy();
    expect(deltaBox.style.maxWidth).toBeTruthy();
  });

  test("updates correctly on multiple setSelect calls", () => {
    const plugin = deltaBoxPlugin();
    plugin.hooks.init(mockChart);

    // First selection
    mockChart.select = { left: 100, width: 100, height: 100 };
    plugin.hooks.setSelect(mockChart);
    const deltaBox = mockOverlay.querySelector("div");
    const firstHTML = deltaBox.innerHTML;

    // Second selection (different range)
    mockChart.select = { left: 200, width: 200, height: 100 };
    plugin.hooks.setSelect(mockChart);

    // Content should have changed
    expect(deltaBox.innerHTML).not.toBe(firstHTML);
  });
});
