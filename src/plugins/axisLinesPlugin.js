/**
 * Plugin to draw Y-axis lines at chart edges
 * uPlot doesn't draw vertical axis lines by default
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
