/**
 * PolarChart Component
 * Displays phasor diagram using uPlot circular/polar chart
 * Shows three-phase currents and voltages as vectors in polar coordinates
 */

export class PolarChart {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.chart = null;
    this.mockData = this.generateMockPhasorData();

    // ✅ NEW: Debounce rapid updates to prevent UI freezing
    this.renderTimeout = null;
    this.isRendering = false;
  }

  /**
   * Generate mock phasor data based on typical three-phase system
   * Format: { label, magnitude, angle (degrees), color }
   */
  generateMockPhasorData() {
    return [
      // Currents (3-phase, 120° apart)
      { label: "IA", magnitude: 100, angle: 0, color: "#00d9ff" }, // Cyan
      { label: "IB", magnitude: 95, angle: 240, color: "#2196f3" }, // Blue
      { label: "IC", magnitude: 98, angle: 120, color: "#10b981" }, // Green

      // Voltages (3-phase, 120° apart, offset)
      { label: "VA", magnitude: 240, angle: 30, color: "#ff6b35" }, // Orange
      { label: "VB", magnitude: 238, angle: 270, color: "#fbbf24" }, // Yellow
      { label: "VC", magnitude: 242, angle: 150, color: "#ef4444" }, // Red
    ];
  }

  /**
   * Extract real phasor data from CFG and DAT files at a specific time index
   * @param {Object} cfg - Parsed CFG data
   * @param {Object} data - Parsed DAT data
   * @param {number} timeIndex - Index in the time array (0-based)
   */
  extractRealPhasorData(cfg, data, timeIndex = 0) {
    if (!cfg || !data) {
      console.warn("[PolarChart] CFG or DAT data missing");
      return this.generateMockPhasorData();
    }

    // Reduced logging for performance (disabled debug logs)
    const DEBUG = false; // Set to true for verbose output

    if (DEBUG) {
      console.log(
        "[PolarChart] DEBUG: cfg.computedChannels:",
        cfg.computedChannels
      );
      console.log("[PolarChart] DEBUG: data.computedData:", data.computedData);
      console.log(
        "[PolarChart] DEBUG: cfg.analogChannels:",
        cfg.analogChannels
      );
      console.log("[PolarChart] DEBUG: data.analogData:", data.analogData);
    }

    // Determine which channels to use: computed first, then analog
    let channelsToUse = [];
    let dataToUse = null;
    let isComputedData = false;

    // Prefer computed channels if they exist
    if (
      cfg.computedChannels &&
      cfg.computedChannels.length > 0 &&
      data.computedData &&
      data.computedData.length > 0
    ) {
      if (DEBUG) {
        console.log("[PolarChart] Using computed channels for phasor plot");
        console.log(
          "[PolarChart] Computed channels count:",
          cfg.computedChannels.length
        );
        console.log(
          "[PolarChart] Computed data count:",
          data.computedData.length
        );
      }
      channelsToUse = cfg.computedChannels;
      dataToUse = data.computedData;
      isComputedData = true;
    } else if (cfg.analogChannels && cfg.analogChannels.length > 0) {
      if (DEBUG)
        console.log("[PolarChart] Using analog channels for phasor plot");
      channelsToUse = cfg.analogChannels;
      dataToUse = data.analogData;
      isComputedData = false;
    } else {
      console.warn("[PolarChart] No channels available");
      return this.generateMockPhasorData();
    }

    // Determine which channels to plot (hardcoded defaults, but dynamically search)
    const defaultPhasorChannels = ["IA", "IB", "IC", "VA", "VB", "VC"];

    // Extract string channel names, filtering out any objects
    const channelNameMap = new Map(); // Map to track index -> name
    const extractedNames = channelsToUse.map((ch, idx) => {
      const name =
        typeof ch === "string"
          ? ch
          : ch.name || ch.displayName || `Channel_${idx}`;
      channelNameMap.set(idx, name);
      return name;
    });

    console.log("[PolarChart] Extracted channel names:", extractedNames);

    // Find channels matching defaults, then fill with any available
    const phasorChannels = extractedNames
      .filter((name) => defaultPhasorChannels.includes(name))
      .slice(0, 6);

    // If no default channels found, use first 6 available
    if (phasorChannels.length === 0) {
      console.log(
        "[PolarChart] No default phasor channels found, using first available channels"
      );
      phasorChannels.push(...extractedNames.slice(0, 6));
    }

    console.log("[PolarChart] Phasor channels to plot:", phasorChannels);

    let phasorData = [];

    // Color mapping for channels
    const colorMap = {
      IA: "#00d9ff", // Cyan
      IB: "#2196f3", // Blue
      IC: "#10b981", // Green
      VA: "#ff6b35", // Orange
      VB: "#fbbf24", // Yellow
      VC: "#ef4444", // Red
    };

    console.log("[PolarChart] Extracting phasor data at timeIndex:", timeIndex);
    console.log("[PolarChart] Available channels:", extractedNames);
    console.log(
      "[PolarChart] Using",
      phasorChannels.length,
      "phasor channels:",
      phasorChannels
    );

    // Find each phasor channel in the channel list
    for (const channelName of phasorChannels) {
      // Find the index of this channel name
      let channelDataIndex = extractedNames.indexOf(channelName);
      if (channelDataIndex < 0) {
        console.warn(
          `[PolarChart] Channel ${channelName} not found in extracted names`
        );
        continue;
      }

      const channelObj = channelsToUse[channelDataIndex];

      console.log(`[PolarChart] ${channelName}: index=${channelDataIndex}`);

      if (
        channelDataIndex !== null &&
        dataToUse &&
        dataToUse[channelDataIndex]
      ) {
        const channelData = dataToUse[channelDataIndex];

        // Get value at current time index (or use first value if index out of range)
        const sampleIndex = Math.min(timeIndex, channelData.length - 1);
        const magnitude = Math.abs(channelData[sampleIndex] || 0);

        // Use standard three-phase angles based on channel name
        // For balanced three-phase systems: A=0°, B=240°, C=120°
        let phaseAngle = 0;
        if (channelName.includes("A")) {
          phaseAngle = 0; // Phase A reference
        } else if (channelName.includes("B")) {
          phaseAngle = 240; // Phase B lags by 120°
        } else if (channelName.includes("C")) {
          phaseAngle = 120; // Phase C leads by 120°
        }

        // Normalize angle to 0-360 range
        phaseAngle = ((phaseAngle % 360) + 360) % 360;

        console.log(
          `[PolarChart] ${channelName}: magnitude=${magnitude.toFixed(
            2
          )}, angle=${phaseAngle.toFixed(2)}°`
        );

        phasorData.push({
          label: String(channelName), // Ensure label is always a string
          magnitude: magnitude,
          angle: phaseAngle,
          color: colorMap[channelName] || "#999999",
        });
      } else {
        console.warn(
          `[PolarChart] No data found for ${channelName} at index ${channelDataIndex}`
        );
      }
    }

    // If we couldn't get any real data, return mock data
    if (phasorData.length === 0) {
      console.warn(
        "[PolarChart] Could not extract phasor data, using mock data"
      );
      return this.generateMockPhasorData();
    }

    console.log(
      "[PolarChart] Successfully extracted",
      phasorData.length,
      "phasors"
    );

    // ✅ OPTIMIZATION: Limit to first 12 phasors to prevent freeze
    const MAX_PHASORS = 12;
    if (phasorData.length > MAX_PHASORS) {
      console.warn(
        `[PolarChart] Too many phasors (${phasorData.length}), limiting to ${MAX_PHASORS}`
      );
      phasorData = phasorData.slice(0, MAX_PHASORS);
    }

    return phasorData;
  }

  /**
   * Initialize the polar chart container (don't render yet)
   */
  init() {
    console.log("[PolarChart] init() called");
    if (!this.container) {
      console.error("[PolarChart] Container not found in init()");
      return;
    }
    console.log("[PolarChart] Container found:", this.container.id);
    // Just clear and show waiting message, don't render mock data
    this.container.innerHTML =
      '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">Waiting for data...</div>';
    console.log("[PolarChart] init() complete - ready for real data");
  }

  /**
   * Update phasor data at a specific time index
   * @param {Object} cfg - Parsed CFG data
   * @param {Object} data - Parsed DAT data
   * @param {number} timeIndex - Index in the time array (0-based)
   */
  updatePhasorAtTimeIndex(cfg, data, timeIndex = 0) {
    console.log(
      "[PolarChart] updatePhasorAtTimeIndex() called with timeIndex:",
      timeIndex
    );
    const phasorData = this.extractRealPhasorData(cfg, data, timeIndex);
    this.updateData(phasorData);
  }

  /**
   * Render polar chart using SVG (since uPlot doesn't have native polar support)
   * This creates a circular phasor diagram with vectors
   * OPTIMIZED: Batches DOM operations using DocumentFragment
   */
  renderSVGPolarChart() {
    if (!this.container) {
      console.error("[PolarChart] Container not found");
      return;
    }

    const startTime = performance.now();

    // Clear container
    this.container.innerHTML = "";

    // SVG dimensions
    const width = this.container.clientWidth || 280;
    const height = this.container.clientHeight || 280;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 30;

    // Create SVG
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.style.backgroundColor = "var(--bg-tertiary)";

    // ✅ OPTIMIZATION: Build all elements in memory before appending
    // Use DocumentFragment for batched DOM operations
    const fragment = document.createDocumentFragment();

    // Draw background circle (grid)
    const bgCircle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    bgCircle.setAttribute("cx", centerX);
    bgCircle.setAttribute("cy", centerY);
    bgCircle.setAttribute("r", radius);
    bgCircle.setAttribute("fill", "none");
    bgCircle.setAttribute("stroke", "#cbd5e1");
    bgCircle.setAttribute("stroke-width", "1");
    bgCircle.setAttribute("opacity", "0.3");
    fragment.appendChild(bgCircle);

    // Draw grid circles (batch them)
    for (let i = 0.2; i <= 1; i += 0.2) {
      const gridCircle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      gridCircle.setAttribute("cx", centerX);
      gridCircle.setAttribute("cy", centerY);
      gridCircle.setAttribute("r", radius * i);
      gridCircle.setAttribute("fill", "none");
      gridCircle.setAttribute("stroke", "#cbd5e1");
      gridCircle.setAttribute("stroke-width", "0.5");
      gridCircle.setAttribute("opacity", "0.2");
      fragment.appendChild(gridCircle);
    }

    // Draw axis lines and labels (batch them)
    const angles = [0, 90, 180, 270];
    angles.forEach((angle) => {
      const rad = (angle * Math.PI) / 180;
      const x2 = centerX + radius * Math.cos(rad);
      const y2 = centerY + radius * Math.sin(rad);

      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
      );
      line.setAttribute("x1", centerX);
      line.setAttribute("y1", centerY);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", "#cbd5e1");
      line.setAttribute("stroke-width", "0.5");
      line.setAttribute("opacity", "0.3");
      fragment.appendChild(line);

      // Add degree labels
      const labelRad = (angle * Math.PI) / 180;
      const labelX = centerX + (radius + 15) * Math.cos(labelRad);
      const labelY = centerY + (radius + 15) * Math.sin(labelRad);

      const text = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      text.setAttribute("x", labelX);
      text.setAttribute("y", labelY);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-size", "10");
      text.setAttribute("fill", "#64748b");
      text.textContent = angle + "°";
      fragment.appendChild(text);
    });

    // First pass: Find max magnitude for automatic scaling
    let maxMagnitude = 1; // Default minimum to avoid division by zero
    this.mockData.forEach((phasor) => {
      if (phasor.magnitude > maxMagnitude) {
        maxMagnitude = phasor.magnitude;
      }
    });

    // Scale factor: Use 70% of radius as max to leave margin
    const scaleFactor = (radius * 0.7) / (maxMagnitude || 1);
    console.log(
      `[PolarChart] Max magnitude: ${maxMagnitude.toFixed(
        2
      )}, Scale factor: ${scaleFactor.toFixed(4)}`
    );

    // Draw phasor vectors
    this.mockData.forEach((phasor) => {
      const rad = (phasor.angle * Math.PI) / 180;
      // Scale magnitude automatically to fit within 70% of radius
      const vectorLength = phasor.magnitude * scaleFactor;

      const x2 = centerX + vectorLength * Math.cos(rad);
      const y2 = centerY + vectorLength * Math.sin(rad);

      // Draw vector line
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
      );
      line.setAttribute("x1", centerX);
      line.setAttribute("y1", centerY);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", phasor.color);
      line.setAttribute("stroke-width", "2");
      line.setAttribute("stroke-linecap", "round");
      fragment.appendChild(line);

      // Draw arrow head
      const arrowSize = 8;
      const angle = Math.atan2(y2 - centerY, x2 - centerX);
      const arrowX1 = x2 - arrowSize * Math.cos(angle - Math.PI / 6);
      const arrowY1 = y2 - arrowSize * Math.sin(angle - Math.PI / 6);
      const arrowX2 = x2 - arrowSize * Math.cos(angle + Math.PI / 6);
      const arrowY2 = y2 - arrowSize * Math.sin(angle + Math.PI / 6);

      const arrow = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "polygon"
      );
      arrow.setAttribute(
        "points",
        `${x2},${y2} ${arrowX1},${arrowY1} ${arrowX2},${arrowY2}`
      );
      arrow.setAttribute("fill", phasor.color);
      fragment.appendChild(arrow);

      // Draw label dot at tip
      const dot = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      dot.setAttribute("cx", x2);
      dot.setAttribute("cy", y2);
      dot.setAttribute("r", "4");
      dot.setAttribute("fill", phasor.color);
      dot.setAttribute("stroke", "white");
      dot.setAttribute("stroke-width", "1");
      fragment.appendChild(dot);

      // Add label
      const labelX = x2 + 15 * Math.cos(rad);
      const labelY = y2 + 15 * Math.sin(rad);

      const text = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      text.setAttribute("x", labelX);
      text.setAttribute("y", labelY);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-size", "11");
      text.setAttribute("font-weight", "bold");
      text.setAttribute("fill", phasor.color);
      text.textContent = String(phasor.label); // Ensure label is converted to string
      fragment.appendChild(text);
    });

    // Draw center point
    const centerDot = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    centerDot.setAttribute("cx", centerX);
    centerDot.setAttribute("cy", centerY);
    centerDot.setAttribute("r", "3");
    centerDot.setAttribute("fill", "#64748b");
    fragment.appendChild(centerDot);

    // Add title
    const title = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    title.setAttribute("x", centerX);
    title.setAttribute("y", 15);
    title.setAttribute("text-anchor", "middle");
    title.setAttribute("font-size", "12");
    title.setAttribute("font-weight", "bold");
    title.setAttribute("fill", "#1e293b");
    title.textContent = "Phasor Diagram";
    fragment.appendChild(title);

    // Add magnitude scale legend at bottom
    const scaleX = 15;
    const scaleY = height - 10;
    const maxScaleLabel = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    maxScaleLabel.setAttribute("x", scaleX);
    maxScaleLabel.setAttribute("y", scaleY);
    maxScaleLabel.setAttribute("font-size", "9");
    maxScaleLabel.setAttribute("fill", "#64748b");
    maxScaleLabel.textContent = `Max: ${maxMagnitude.toFixed(1)}`;
    fragment.appendChild(maxScaleLabel);

    // ✅ Append all elements to SVG in one batch operation
    svg.appendChild(fragment);

    // Append SVG to container (single DOM operation for best performance)
    this.container.appendChild(svg);

    // ⏱️ Performance tracking
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    if (renderTime > 50) {
      console.log(
        `[PolarChart] ⏱️ SVG render took ${renderTime.toFixed(
          1
        )}ms (slow - consider optimization)`
      );
    } else {
      console.log(`[PolarChart] ✅ SVG render: ${renderTime.toFixed(1)}ms`);
    }
  }

  /**
   * Update chart with real data from CFG file
   * @param {Array} phasorData - Array of { label, magnitude, angle, color }
   */
  updateData(phasorData) {
    console.log(
      "[PolarChart] updateData() called with",
      phasorData.length,
      "phasors"
    );
    this.mockData = phasorData;
    this.renderSVGPolarChartDebounced(); // ✅ Use debounced version
  }

  /**
   * ✅ NEW: Debounced render method to prevent UI freezing from rapid updates
   */
  renderSVGPolarChartDebounced() {
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
    }

    if (this.isRendering) {
      console.log("[PolarChart] Skipping render (already rendering)");
      return;
    }

    this.renderTimeout = setTimeout(() => {
      this.isRendering = true;
      try {
        this.renderSVGPolarChart();
      } finally {
        this.isRendering = false;
      }
    }, 100); // 100ms debounce
  }

  /**
   * Get current phasor data
   */
  getData() {
    return this.mockData;
  }
}

export default PolarChart;
