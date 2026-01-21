/**
 * @file verticalLinePlugin.js
 * @module Plugins/Chart
 *
 * @description
 * <h3>uPlot Plugin: Vertical Line & Crosshair Points</h3>
 * 
 * <p>Enables placing, dragging, and visualizing vertical measurement lines on uPlot charts.
 * Lines are synchronized across all charts and display crosshair points where they intersect
 * series data. Used for delta calculations and time-point analysis.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>Reactive State</td><td>Lines stored in verticalLinesXState, auto-syncs across charts</td></tr>
 *   <tr><td>Drag Support</td><td>Lines can be dragged to new positions with mouse</td></tr>
 *   <tr><td>Event Capture</td><td>Uses capture phase to prevent selection box during drag</td></tr>
 *   <tr><td>Debounced Updates</td><td>Delta calculations debounced to prevent UI freezing</td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>Add Lines</strong> — Alt+1 adds vertical line at cursor position</li>
 *   <li><strong>Drag Lines</strong> — Click and drag to reposition lines</li>
 *   <li><strong>Crosshair Points</strong> — Colored dots at series intersections</li>
 *   <li><strong>Line Colors</strong> — Configurable colors from crosshairColors palette</li>
 *   <li><strong>Chart Sync</strong> — All charts show same vertical lines</li>
 *   <li><strong>Delta Display</strong> — Triggers delta calculations on line change</li>
 * </ul>
 * 
 * <h4>Keyboard Shortcuts</h4>
 * <table>
 *   <tr><th>Shortcut</th><th>Action</th></tr>
 *   <tr><td>Alt+0</td><td>Clear all vertical lines</td></tr>
 *   <tr><td>Alt+1</td><td>Add vertical line at cursor</td></tr>
 *   <tr><td>Alt+2</td><td>Go to previous line</td></tr>
 *   <tr><td>Alt+3</td><td>Go to next line</td></tr>
 *   <tr><td>Alt+4</td><td>Delete current line</td></tr>
 * </table>
 * 
 * @see {@link module:components/handleVerticalLineShortcuts} - Keyboard handler
 * @see {@link module:utils/calculateDeltas} - Delta calculation utilities
 * 
 * @example
 * import verticalLinePlugin from './plugins/verticalLinePlugin.js';
 * 
 * const opts = {
 *   plugins: [
 *     verticalLinePlugin(verticalLinesXState, getCharts, {
 *       lineColors: ['red', 'blue', 'green'],
 *       lineWidth: 2,
 *       pointRadius: 5
 *     })
 *   ]
 * };
 * 
 * @mermaid
 * graph TD
 *     subgraph User_Actions
 *         A[Alt+1: Add Line] --> B[Get Cursor X Position]
 *         B --> C[Push to verticalLinesXState]
 *         
 *         D[Mouse Down on Line] --> E[Start Drag]
 *         E --> F[Track Mouse Move]
 *         F --> G[Update Line Position]
 *         G --> H[Mouse Up: End Drag]
 *     end
 *     
 *     subgraph Drawing_Hooks
 *         I[draw hook] --> J[Clear Previous Lines]
 *         J --> K[For Each Line in State]
 *         K --> L[Draw Vertical Line]
 *         L --> M[Find Series Intersections]
 *         M --> N[Draw Crosshair Points]
 *         N --> K
 *     end
 *     
 *     subgraph State_Sync
 *         O[verticalLinesXState Changes] --> P[Subscribe Callback]
 *         P --> Q[Trigger Chart Redraw]
 *         Q --> R[Update Delta Calculations]
 *     end
 *     
 *     style A fill:#4CAF50,color:white
 *     style L fill:#2196F3,color:white
 *     style R fill:#FF9800,color:white
 */

import { crosshairColors } from "../utils/constants.js";
import { getNearestIndex } from "../utils/helpers.js";
import { debounce } from "../utils/computedChannelOptimization.js";

function getEventXValue(u, e) {
  const overlay = u.over;
  if (!overlay) {
    return u.posToVal(e.offsetX, "x");
  }

  const rect = overlay.getBoundingClientRect();
  const x = e.clientX - rect.left;
  return u.posToVal(x, "x");
}

export default function verticalLinePlugin(
  verticalLinesXState,
  getCharts = null,
  options = {}
) {
  let isDragging = false;
  let draggedLineIndex = null;
  let overlayRef = null;
  let unsubscribe = null;
  const lineColors = options.lineColors || crosshairColors;
  const lineWidth = options.lineWidth || 2;
  const pointRadius = options.pointRadius || 5;
  const labelFormatter =
    options.labelFormatter ||
    ((color) => color.charAt(0).toUpperCase() + color.slice(1));

  function isHoveringLine(u, xVal, hoverRadius) {
    const lines = verticalLinesXState.asArray();
    return lines.some((xData) => Math.abs(xVal - xData) < hoverRadius);
  }

  return {
    hooks: {
      init: [
        (u) => {
          const overlay = u.over;
          overlayRef = overlay;

          // ✅ Debounce the update function to prevent multiple rapid calls
          const debouncedDeltaUpdate = debounce(async () => {
            if (getCharts) {
              const charts = getCharts();
              const { collectChartDeltas } = await import(
                "../utils/calculateDeltas.js"
              );
              const allDeltaData = [];

              // ✅ Collect all chart deltas in ONE batch
              for (const chart of charts) {
                try {
                  const chartDeltas = collectChartDeltas(
                    verticalLinesXState.asArray(),
                    chart,
                    "microseconds"
                  );
                  if (chartDeltas.length > 0) {
                    allDeltaData.push(...chartDeltas);
                  }
                } catch (error) {
                  console.error(
                    "[verticalLinePlugin] Error collecting chart deltas:",
                    error
                  );
                }
              }

              if (allDeltaData.length > 0) {
                try {
                  const { deltaWindow } = await import("../main.js");
                  const linesLength =
                    verticalLinesXState?.asArray?.()?.length || 0;
                  if (deltaWindow) {
                    console.log(
                      "[verticalLinePlugin] 🔄 Calling deltaWindow.update() with debounce"
                    );
                    deltaWindow.update(allDeltaData, linesLength);
                  }
                } catch (e) {
                  console.error(
                    "[verticalLinePlugin] Error updating delta window:",
                    e
                  );
                }
              }
            }
          }, 100); // ✅ 100ms debounce to batch rapid state changes

          // Subscribe to state changes with debounced update
          if (
            verticalLinesXState &&
            typeof verticalLinesXState.subscribe === "function"
          ) {
            unsubscribe = verticalLinesXState.subscribe(async () => {
              console.log(
                "[verticalLinePlugin] Subscription triggered, calling debounced update"
              );
              debouncedDeltaUpdate();
            });
          }

          // ✅ CRITICAL: Attach handlers in CAPTURE phase (true) to run BEFORE uPlot's handlers
          const handleMouseDown = (e) => {
            if (!u || !u.scales || !u.data) return;

            const lines = verticalLinesXState.asArray();
            const xVal = getEventXValue(u, e);
            const hoverRadius = (u.scales.x.max - u.scales.x.min) * 0.01;

            for (let idx = 0; idx < lines.length; idx++) {
              const xData = lines[idx];
              if (Math.abs(xVal - xData) < hoverRadius) {
                isDragging = true;
                draggedLineIndex = idx;

                // ✅ STOP event from reaching uPlot's handlers
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();

                u.redraw();
                return;
              }
            }
          };

          const handleMouseMove = (e) => {
            if (!u || !u.scales) return;

            const xVal = getEventXValue(u, e);
            const hoverRadius = (u.scales.x.max - u.scales.x.min) * 0.005;
            const isHovering = isHoveringLine(u, xVal, hoverRadius);

            overlay.style.cursor = isHovering ? "ew-resize" : "default";

            if (isDragging) {
              // ✅ BLOCK event during drag to prevent selection box
              e.stopPropagation();
              e.stopImmediatePropagation();
              e.preventDefault();

              verticalLinesXState[draggedLineIndex] = xVal;

              // ✅ IMMEDIATELY redraw the current chart being dragged for smooth movement
              u.redraw();

              // Sync with other charts
              if (getCharts) {
                const charts = getCharts();
                (async () => {
                  for (let chart of charts) {
                    if (chart && chart !== u && chart.redraw) {
                      chart.redraw();
                    }
                  }

                  // Collect deltas
                  const { collectChartDeltas } = await import(
                    "../utils/calculateDeltas.js"
                  );
                  const allDeltaData = [];

                  for (const chart of charts) {
                    const chartDeltas = collectChartDeltas(
                      verticalLinesXState.asArray(),
                      chart,
                      "microseconds"
                    );
                    if (chartDeltas.length > 0) {
                      allDeltaData.push(...chartDeltas);
                    }
                  }

                  const linesArray =
                    verticalLinesXState?.value || verticalLinesXState || [];
                  const linesLength = Array.isArray(linesArray)
                    ? linesArray.length
                    : 0;

                  // Show drawer whenever vertical lines exist (even if just 1)
                  if (linesLength > 0) {
                    try {
                      const { deltaWindow } = await import("../main.js");
                      if (deltaWindow) {
                        deltaWindow.show(); // Show the drawer when dragging lines
                        deltaWindow.update(allDeltaData, linesLength);
                      }
                    } catch (e) {
                      // Silent fail
                    }
                  }
                })();
              }
            }
          };

          const handleMouseUp = (e) => {
            if (isDragging) {
              isDragging = false;
              draggedLineIndex = null;
              overlay.style.cursor = "default";

              // ✅ BLOCK event to prevent unwanted selection
              e.stopPropagation();
              e.stopImmediatePropagation();
              e.preventDefault();
            }
          };

          // ✅ Use CAPTURE phase (true) to intercept events BEFORE uPlot's bubble phase
          overlay.addEventListener("mousedown", handleMouseDown, true);
          overlay.addEventListener("mousemove", handleMouseMove, true);
          overlay.addEventListener("mouseup", handleMouseUp, true);

          overlay.addEventListener(
            "mouseleave",
            () => {
              if (isDragging) {
                isDragging = false;
                draggedLineIndex = null;
                overlay.style.cursor = "default";
              }
            },
            true
          );
        },
      ],
      draw: [
        (u) => {
          if (!verticalLinesXState) return;
          if (!u.data || !u.data[0] || u.data[0].length === 0) return;

          const ctx = u.ctx;
          const { top, height } = u.bbox;

          if (!top || !height || !ctx) return;

          const lines =
            typeof verticalLinesXState.asArray === "function"
              ? verticalLinesXState.asArray()
              : Array.isArray(verticalLinesXState)
              ? verticalLinesXState
              : verticalLinesXState.value || [];

          ctx.save();
          ctx.lineWidth = lineWidth;

          lines.forEach((xData, idx) => {
            try {
              const nearestIdx = getNearestIndex(u.data[0], xData);

              if (
                !Number.isFinite(nearestIdx) ||
                nearestIdx < 0 ||
                nearestIdx >= u.data[0].length
              ) {
                return;
              }

              const xPos = u.valToPos(u.data[0][nearestIdx], "x", true);
              const color = lineColors[idx % lineColors.length];

              // Draw vertical line
              ctx.strokeStyle = color;
              ctx.globalAlpha = 1;
              ctx.beginPath();
              ctx.moveTo(xPos, top);
              ctx.lineTo(xPos, top + height);
              ctx.stroke();

              // Draw crosshair points
              u.data.slice(1).forEach((series, seriesIdx) => {
                const actualIdx = seriesIdx + 1;
                if (!u.series[actualIdx]) return;

                const interpolatedValue = getInterpolatedValue(
                  u.data[0],
                  series,
                  xData,
                  nearestIdx
                );

                const yPos = u.valToPos(interpolatedValue, "y", true);
                ctx.beginPath();
                ctx.arc(xPos, yPos, pointRadius, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.globalAlpha = 1;
                ctx.fill();
              });

              // Draw label
              ctx.font = "bold 12px Arial";
              ctx.fillStyle = color;
              ctx.globalAlpha = 1;
              ctx.fillText(labelFormatter(color), xPos + 5, u.bbox.top + 15);
            } catch (err) {
              console.error(
                "[verticalLinePlugin] Error drawing line:",
                err.message
              );
            }
          });
          ctx.restore();
        },
      ],
      destroy: [
        (u) => {
          if (unsubscribe) unsubscribe();
          if (overlayRef) {
            overlayRef.replaceWith(overlayRef.cloneNode(true));
          }
        },
      ],
    },
  };
}

// Helper function for value interpolation
function getInterpolatedValue(xData, yData, targetX, nearestIdx) {
  if (xData[nearestIdx] === targetX) {
    return yData[nearestIdx];
  }

  let idx1 = nearestIdx;
  let idx2 = nearestIdx;

  if (targetX > xData[nearestIdx] && nearestIdx < xData.length - 1) {
    idx2 = nearestIdx + 1;
  } else if (targetX < xData[nearestIdx] && nearestIdx > 0) {
    idx1 = nearestIdx - 1;
    idx2 = nearestIdx;
  }

  const x1 = xData[idx1];
  const x2 = xData[idx2];
  const y1 = yData[idx1];
  const y2 = yData[idx2];

  if (x1 === x2 || typeof y1 !== "number" || typeof y2 !== "number") {
    return yData[nearestIdx];
  }

  const interpolated = y1 + ((y2 - y1) * (targetX - x1)) / (x2 - x1);
  return interpolated;
}
