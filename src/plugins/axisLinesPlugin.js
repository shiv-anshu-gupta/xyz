/**
 * @file axisLinesPlugin.js
 * @module Plugins/Chart
 *
 * @description
 * <h3>uPlot Plugin: Y-Axis Vertical Lines</h3>
 * 
 * <p>Draws vertical lines at the left edge of Y-axes since uPlot doesn't render
 * axis spine lines by default. Supports multiple Y-axes with theme-aware colors.</p>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>SVG Lines</strong> — Creates SVG line elements for crisp rendering</li>
 *   <li><strong>Theme Support</strong> — Reads --chart-axis CSS variable for color</li>
 *   <li><strong>Multi-Axis</strong> — Draws line for each Y-axis</li>
 *   <li><strong>Auto-Position</strong> — Updates on resize via ready hook</li>
 * </ul>
 * 
 * @example
 * import { axisLinesPlugin } from './plugins/axisLinesPlugin.js';
 * 
 * const opts = {
 *   plugins: [axisLinesPlugin()]
 * };
 * 
 * @mermaid
 * graph LR
 *     A[init hook] --> B[Count Y-Axes]
 *     B --> C[Create SVG Lines]
 *     C --> D[Append to Chart]
 *     
 *     E[ready hook] --> F[Get Axis Positions]
 *     F --> G[Update Line Coordinates]
 *     
 *     style A fill:#4CAF50,color:white
 *     style G fill:#2196F3,color:white
 */

export function axisLinesPlugin() {
  let axisLines = [];

  return {
    hooks: {
      init(u) {
        // Get theme color
        const getAxisColor = () => {
          const color = getComputedStyle(document.documentElement)
            .getPropertyValue("--chart-axis")
            .trim();
          return color || "#64748b";
        };

        // Create axis lines
        const yAxesCount = u.axes.length - 1; // Exclude X-axis

        for (let i = 1; i <= yAxesCount; i++) {
          const line = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "line"
          );
          line.setAttribute("class", `y-axis-line y-axis-line-${i}`);
          line.setAttribute("stroke", getAxisColor());
          line.setAttribute("stroke-width", "1.5");
          line.style.pointerEvents = "none";

          u.root.querySelector(".u-over").appendChild(line);
          axisLines.push(line);
        }
      },

      setSize(u) {
        // Update axis line positions on resize
        const plotLeft = u.bbox.left;
        const plotTop = u.bbox.top;
        const plotBottom = u.bbox.top + u.bbox.height;

        axisLines.forEach((line, idx) => {
          // Position at left edge of plot area
          line.setAttribute("x1", plotLeft);
          line.setAttribute("y1", plotTop);
          line.setAttribute("x2", plotLeft);
          line.setAttribute("y2", plotBottom);
        });
      },
    },
  };
}
