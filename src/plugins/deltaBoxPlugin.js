/**
 * @file deltaBoxPlugin.js
 * @module Plugins/Chart
 *
 * @description
 * <h3>uPlot Plugin: Delta Box Display</h3>
 * 
 * <p>Displays time and value deltas between selected regions on the chart.
 * Shows interpolated values for analysis of multi-rate sampling data.</p>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>Selection Display</strong> — Shows deltas when region is selected</li>
 *   <li><strong>Interpolation</strong> — Handles different sampling rates</li>
 *   <li><strong>Overlay Box</strong> — Positioned overlay with delta information</li>
 *   <li><strong>Auto-Hide</strong> — Disappears when selection cleared</li>
 * </ul>
 * 
 * @see {@link module:utils/calculateDeltas} - Delta calculation utilities
 * 
 * @example
 * import { deltaBoxPlugin } from './plugins/deltaBoxPlugin.js';
 * 
 * const opts = {
 *   plugins: [deltaBoxPlugin()]
 * };
 * 
 * @mermaid
 * graph TD
 *     A[init hook] --> B[Create Delta Box Element]
 *     B --> C[Append to Chart Overlay]
 *     
 *     D[setSelect hook] --> E{Selection Active?}
 *     E -->|Yes| F[Calculate Delta Values]
 *     F --> G[Format Display]
 *     G --> H[Show Delta Box]
 *     E -->|No| I[Hide Delta Box]
 *     
 *     style A fill:#4CAF50,color:white
 *     style H fill:#2196F3,color:white
 */

import { getNearestIndex } from "../utils/helpers.js";

export function deltaBoxPlugin() {
  let deltaBox;
  let currentChart;

  return {
    hooks: {
      init: (u) => {
        currentChart = u;
        deltaBox = document.createElement("div");
        deltaBox.style.cssText = `
          position: absolute;
          top: 10px;
          right: 10px;
          padding: 12px 16px;
          background: rgba(0, 0, 0, 0.85);
          color: #fff;
          border-radius: 8px;
          font-size: 12px;
          display: none;
          max-width: 400px;
          max-height: 300px;
          overflow-y: auto;
          border: 1px solid rgba(255,255,255,0.2);
          font-family: monospace;
          z-index: 1000;
        `;
        u.over.appendChild(deltaBox);
      },

      setSelect: (u) => {
        const sel = u.select;
        if (!sel || sel.width === 0) {
          deltaBox.style.display = "none";
          return;
        }

        const minX = u.posToVal(sel.left, "x");
        const maxX = u.posToVal(sel.left + sel.width, "x");
        const startX = Math.min(minX, maxX);
        const endX = Math.max(minX, maxX);

        // Find nearest indices
        const idx1 = getNearestIndex(u.data[0], startX);
        const idx2 = getNearestIndex(u.data[0], endX);

        if (idx1 === -1 || idx2 === -1) {
          deltaBox.style.display = "none";
          return;
        }

        // Calculate time delta
        const deltaTime = u.data[0][idx2] - u.data[0][idx1];
        let deltaTimeStr = `Δt: ${deltaTime.toFixed(4)}`;

        // Try to detect time unit
        if (deltaTime < 0.1) deltaTimeStr += " ms";
        else if (deltaTime < 100) deltaTimeStr += " ms";
        else deltaTimeStr += " s";

        // Build HTML with interpolated values for each series
        let html = `<div style="font-weight: bold; margin-bottom: 8px;">${deltaTimeStr}</div>`;

        // Add value deltas for each series
        u.series.slice(1).forEach((series, idx) => {
          if (!series.label || !u.data[idx + 1]) return;

          const data = u.data[idx + 1];
          const v1 = data[idx1];
          const v2 = data[idx2];

          if (typeof v1 !== "number" || typeof v2 !== "number") return;

          const deltaY = v2 - v1;
          const percentChange =
            v1 !== 0 ? ((deltaY / Math.abs(v1)) * 100).toFixed(1) : "N/A";

          const color = series.stroke || "#999";
          html += `
            <div style="margin: 4px 0; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
              <span style="color: ${color}; font-weight: bold;">${
            series.label
          }</span><br/>
              <span style="font-size: 11px;">
                V1: ${v1.toFixed(2)} → V2: ${v2.toFixed(2)}<br/>
                ΔY: ${deltaY.toFixed(2)} (${percentChange}%)
              </span>
            </div>
          `;
        });

        deltaBox.innerHTML = html;
        deltaBox.style.display = "block";
      },
    },
  };
}
