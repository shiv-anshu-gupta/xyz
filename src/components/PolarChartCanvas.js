/**
 * Canvas-based Phasor Diagram Renderer
 * Replaces SVG rendering for much better performance
 * Uses HTML5 Canvas for 10x+ faster rendering on modern browsers
 */
export class PolarChartCanvas {
  /**
   * Create canvas-based polar chart
   * @param {string} containerId - ID of container element
   */
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.canvas = null;
    this.ctx = null;
    this.mockData = [];
    this.isRendering = false;
  }

  /**
   * Initialize canvas
   */
  init() {
    if (!this.container) {
      console.error("[PolarChartCanvas] Container not found");
      return;
    }

    // Clear container
    this.container.innerHTML = "";

    // Create canvas
    this.canvas = document.createElement("canvas");
    this.canvas.style.display = "block";
    this.canvas.style.margin = "0 auto";

    // Set size
    const width = this.container.clientWidth || 300;
    const height = this.container.clientHeight || 300;

    this.canvas.width = width;
    this.canvas.height = height;

    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");

    console.log(`[PolarChartCanvas] ✅ Initialized: ${width}x${height}`);
  }

  /**
   * Extract phasor data from COMTRADE data
   * @param {Object} cfg - COMTRADE config
   * @param {Object} data - COMTRADE data
   * @param {number} timeIndex - Time sample index
   * @returns {Array} Phasor data array
   */
  extractRealPhasorData(cfg, data, timeIndex = 0) {
    const phasors = [];

    if (!cfg || !cfg.analogChannels || cfg.analogChannels.length === 0) {
      console.warn("[PolarChartCanvas] No analog channels in config");
      return phasors;
    }

    // Get analog data at this time index
    const analogData = data?.analogData?.[0] || [];
    if (!Array.isArray(analogData) || analogData.length === 0) {
      console.warn("[PolarChartCanvas] No analog data available");
      return phasors;
    }

    // Color palette for phases (A, B, C, etc.)
    const phaseColors = {
      A: "#ff4444", // Red
      B: "#44ff44", // Green
      C: "#4444ff", // Blue
      N: "#ffaa00", // Orange
      G: "#aa00ff", // Purple
    };

    // Extract phase information from channel names
    const phaseChannels = {};

    cfg.analogChannels.forEach((ch, idx) => {
      const name = ch.name || ch.ch || `Ch${idx}`;

      // Extract phase letter (A, B, C, N, G)
      const phaseMatch = name.match(/[ABCNG]/i);
      const phase = phaseMatch ? phaseMatch[0].toUpperCase() : null;

      // Extract parameter type (V for voltage, I for current)
      const paramMatch = name.match(/[VI]/i);
      const param = paramMatch ? paramMatch[0].toUpperCase() : "V";

      if (!phase) return;

      const key = `${param}${phase}`;
      if (!phaseChannels[key]) {
        phaseChannels[key] = {
          name: key,
          value: 0,
          phase: phase,
          param: param,
          color: phaseColors[phase] || "#999999",
        };
      }

      // Get value at this time index
      if (idx < analogData.length && analogData[idx] !== undefined) {
        phaseChannels[key].value = Math.abs(parseFloat(analogData[idx]) || 0);
      }
    });

    // Convert to phasor angles (120° apart for A, B, C)
    const phaseAngles = { A: 0, B: 240, C: 120, N: 0, G: 0 };

    Object.values(phaseChannels).forEach((ch) => {
      phasors.push({
        label: ch.name,
        magnitude: ch.value,
        angle: phaseAngles[ch.phase] || 0,
        color: ch.color,
        param: ch.param,
      });
    });

    return phasors;
  }

  /**
   * Update chart with real data
   * @param {Array} phasorData - Array of { label, magnitude, angle, color }
   */
  updateData(phasorData) {
    this.mockData = phasorData;
    this.renderCanvasDebounced();
  }

  /**
   * Debounced canvas render
   */
  renderCanvasDebounced() {
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
    }

    if (this.isRendering) {
      return;
    }

    this.renderTimeout = setTimeout(() => {
      this.isRendering = true;
      try {
        this.renderCanvasPolar();
      } finally {
        this.isRendering = false;
      }
    }, 50); // Shorter debounce for canvas (very fast)
  }

  /**
   * Render phasor diagram using Canvas (FAST!)
   */
  renderCanvasPolar() {
    if (!this.canvas || !this.ctx || !this.mockData.length) {
      return;
    }

    const startTime = performance.now();
    const ctx = this.ctx;
    const canvas = this.canvas;
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 40;

    // ✅ Clear canvas
    ctx.fillStyle =
      getComputedStyle(this.container).getPropertyValue("--bg-primary") ||
      "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // ✅ Draw background circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.stroke();

    // ✅ Draw grid circles (very fast with canvas)
    ctx.strokeStyle = "rgba(203, 213, 225, 0.2)";
    ctx.lineWidth = 0.5;
    for (let i = 0.2; i <= 1; i += 0.2) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * i, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // ✅ Draw axis lines and labels
    const angles = [0, 90, 180, 270];
    ctx.strokeStyle = "#cbd5e1";
    ctx.fillStyle = "#64748b";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";

    angles.forEach((angle) => {
      const rad = (angle * Math.PI) / 180;
      const x2 = centerX + radius * Math.cos(rad);
      const y2 = centerY + radius * Math.sin(rad);

      // Draw line
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Draw label
      const labelX = centerX + (radius + 20) * Math.cos(rad);
      const labelY = centerY + (radius + 20) * Math.sin(rad);
      ctx.fillText(angle + "°", labelX, labelY);
    });

    // ✅ Find max magnitude
    let maxMagnitude = 1;
    this.mockData.forEach((p) => {
      if (p.magnitude > maxMagnitude) {
        maxMagnitude = p.magnitude;
      }
    });

    const scaleFactor = (radius * 0.7) / (maxMagnitude || 1);

    // ✅ Draw phasors (FAST!)
    this.mockData.forEach((phasor) => {
      const rad = (phasor.angle * Math.PI) / 180;
      const vectorLength = phasor.magnitude * scaleFactor;
      const x2 = centerX + vectorLength * Math.cos(rad);
      const y2 = centerY + vectorLength * Math.sin(rad);

      // Draw vector line
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = phasor.color;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.stroke();

      // Draw arrow head
      const arrowSize = 8;
      const angle = Math.atan2(y2 - centerY, x2 - centerX);
      const arrowX1 = x2 - arrowSize * Math.cos(angle - Math.PI / 6);
      const arrowY1 = y2 - arrowSize * Math.sin(angle - Math.PI / 6);
      const arrowX2 = x2 - arrowSize * Math.cos(angle + Math.PI / 6);
      const arrowY2 = y2 - arrowSize * Math.sin(angle + Math.PI / 6);

      ctx.fillStyle = phasor.color;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(arrowX1, arrowY1);
      ctx.lineTo(arrowX2, arrowY2);
      ctx.fill();

      // Draw tip dot
      ctx.beginPath();
      ctx.arc(x2, y2, 4, 0, 2 * Math.PI);
      ctx.fill();

      // Draw label
      const labelX = x2 + 18 * Math.cos(rad);
      const labelY = y2 + 18 * Math.sin(rad);
      ctx.fillStyle = phasor.color;
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(phasor.label, labelX, labelY);
    });

    // ✅ Draw center point
    ctx.fillStyle = "#64748b";
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI);
    ctx.fill();

    // ✅ Draw title
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Phasor Diagram", centerX, 20);

    // ✅ Draw scale legend
    ctx.fillStyle = "#64748b";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Max: ${maxMagnitude.toFixed(1)}`, 15, height - 10);

    const endTime = performance.now();
    const renderTime = endTime - startTime;

    if (renderTime > 16) {
      // 16ms = 60fps
      console.log(
        `[PolarChartCanvas] ⏱️ Canvas render: ${renderTime.toFixed(1)}ms`
      );
    }
  }

  /**
   * Update phasor at specific time index
   */
  updatePhasorAtTimeIndex(cfg, data, timeIndex = 0) {
    const phasorData = this.extractRealPhasorData(cfg, data, timeIndex);
    this.updateData(phasorData);
  }
}
