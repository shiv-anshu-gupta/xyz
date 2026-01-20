/**
 * chartManager.js
 *
 * Purpose:
 *   Provides the main chart reactivity and update logic for the COMTRADE charting app.
 *   Handles efficient chart updates in response to state changes (channels, data, overlays).
 *   Integrates with uPlot for fast, interactive chart rendering.
 *
 * Features:
 *   - Subscribes to channel state and data state changes using the custom createState system.
 *   - Updates chart series colors and labels live (without full re-creation) when possible.
 *   - Recreates charts when structural channel changes occur (axes, order, units, etc).
 *   - Recreates charts when data changes (e.g., new file loaded).
 *   - Updates overlays (vertical lines) when their state changes.
 *   - Warns in the console if state/data is missing or malformed.
 *
 * Parameters:
 *   @param {Object} channelState - Reactive state for channel metadata (liabels, colors, units, etc).
 *   @param {Object} dataState    - Reactive state for chart data (analog and digital arrays).
 *   @param {Array}  charts       - Array of uPlot chart instances [analogChart, digitalChart].
 *   @param {HTMLElement} chartsContainer - DOM element containing chart containers.
 *   @param {Object} verticalLinesX - Reactive state for vertical line overlays.
 *
 * Usage Example:
 *   import { subscribeChartUpdates } from './components/chartManager.js';
 *   // ...after initializing state and rendering charts...
 *   subscribeChartUpdates(channelState, dataState, charts, chartsContainer, verticalLinesX);
 *
 *   // Now, any changes to channelState or dataState will automatically update the charts.
 */

import { createChartOptions } from "./chartComponent.js";
// Use global uPlot if loaded via <script> in index.html
const uPlot = window.uPlot;
import { debugLite } from "./debugPanelLite.js";
import { renderComtradeCharts } from "./renderComtradeCharts.js";
/**
 * subscribeChartUpdates(channelState, dataState, charts, chartsContainer, verticalLinesX)
 *
 * Publishes how `chartManager` wires into application state so that JSDoc
 * produces a clear page describing the subscription flow.
 *
 * Responsibilities:
 * - Subscribes to `channelState` and `dataState` reactive stores.
 * - Listens specifically for property-level changes (via `subscribeProperty`) for
 *   fast in-place updates (color, name) and for 'start'/'duration' changes which
 * * are resolved to absolute time windows and applied to uPlot via `applyScale`.
 *
 * Contract (short):
 * - Inputs: `channelState` (see {@link module:message-flow~ChannelStateShape}),
 *   `dataState` (see {@link module:message-flow~DataStateShape}), `charts` array
 *   of uPlot instances, `chartsContainer` parent DOM node, `verticalLinesX` reactive.
 * - Outputs/side-effects: updates uPlot chart instances in-place when possible,
 *   or recreates charts when structural changes occur.
 *
 * Example (flow):
 * ```js
 * // child posts message -> parent main updates channelState -> chartManager resolves
 * // start/duration -> applyScale(chart, type, idx, min, max)
 * ```
 *
 * @param {Object} channelState - reactive channel metadata store
 * @param {Object} dataState - reactive data arrays (time + series)
 * @param {Array} charts - array of uPlot chart instances (analog, digital)
 * @param {HTMLElement} chartsContainer - DOM container for charts
 * @param {Object} verticalLinesX - reactive state for vertical line overlays
 */
export function subscribeChartUpdates(
  channelState,
  dataState,
  charts,
  chartsContainer,
  verticalLinesX,
  cfg, // ✅ add
  data, // ✅ add
  createState, // ✅ add
  calculateDeltas, // ✅ add
  TIME_UNIT // ✅ add
) {
  const chartTypes = ["analog", "digital"];

  function recreateChart(type, idx) {
    if (!channelState[type] || typeof channelState[type] !== "object") {
      console.warn(`channelState[${type}] is undefined or not an object`);
      return;
    }
    if (!Array.isArray(dataState[type])) {
      console.warn(`dataState[${type}] is not an array or is undefined`);
      return;
    }
    if (charts[idx]) {
      charts[idx].destroy();
    }
    const options = createChartOptions(channelState[type], verticalLinesX);
    const data = dataState[type];
    const chart = new uPlot(options, data, chartsContainer.children[idx]);
    charts[idx] = chart;
  }

  // Small helper to force a uPlot chart redraw when setSeries doesn't visually update everything
  function forceRedraw(chart) {
    try {
      // Prefer batch + noop setSize to trigger redraw
      if (!chart) return;
      if (typeof chart.batch === "function") {
        chart.batch(() => {
          try {
            chart.setSize({ width: chart.width, height: chart.height });
          } catch (e) {
            // ignore
          }
        });
      } else {
        try {
          chart.setSize({ width: chart.width, height: chart.height });
        } catch (e) {}
      }
    } catch (e) {
      console.warn("forceRedraw failed", e);
    }
  }

  // --- Boss-style subscription wiring (if channelState exposes subscribeProperty) ---
  // This wires friendly property names (color, name, scale, invert, channelIDs)
  // to uPlot updates or chart recreation so child callbacks update charts directly.
  try {
    if (channelState && typeof channelState.subscribeProperty === "function") {
      // Fast color updates (attempt in-place, fallback to recreate)
      channelState.subscribeProperty("color", (change) => {
        const type = change.path && change.path[0];
        const globalIdx = change.path && change.path[2];
        if (!type) return;
        // Find the chart that contains this global channel index (grouped charts)
        let applied = false;
        for (let ci = 0; ci < charts.length; ci++) {
          const chart = charts[ci];
          if (!chart || chart._type !== type) continue;
          const mapping = chart._channelIndices;
          if (Array.isArray(mapping) && Number.isFinite(globalIdx)) {
            const pos = mapping.indexOf(globalIdx);
            if (pos >= 0) {
              try {
                if (typeof chart.setSeries === "function") {
                  chart.setSeries(pos + 1, {
                    stroke: change.newValue,
                    points: { stroke: change.newValue },
                  });
                  try {
                    debugLite.log("chart.color", {
                      type,
                      globalIdx,
                      chartIndex: ci,
                      pos,
                      newValue: change.newValue,
                    });
                  } catch (e) {}
                  // Force redraw to ensure any UI that reads chart internals updates
                  try {
                    forceRedraw(chart);
                  } catch (e) {}
                  applied = true;
                }
              } catch (err) {
                console.warn(
                  "chartManager: in-place color update failed on chart",
                  ci,
                  err
                );
              }
            }
          }
        }
        if (applied) return;
        // Fallback: if nothing matched, attempt recreate for all charts of this type
        for (let ci = 0; ci < charts.length; ci++) {
          if (charts[ci] && charts[ci]._type === type) recreateChart(type, ci);
        }
      });

      // Name/label updates (in-place)
      // Request descendant notifications so we receive per-series changes
      channelState.subscribeProperty(
        "name",
        (change) => {
          const type = change.path && change.path[0];
          if (!type) return;
          const globalIdx = change.path && change.path[2];
          try {
            // Whole-array replacement: update labels for each chart based on its mapping
            if (
              change.path &&
              change.path.length === 2 &&
              Array.isArray(change.newValue)
            ) {
              for (let ci = 0; ci < charts.length; ci++) {
                const chart = charts[ci];
                if (!chart || chart._type !== type) continue;
                const mapping = chart._channelIndices || [];
                mapping.forEach((global, pos) => {
                  try {
                    const lbl = change.newValue[global];
                    if (typeof chart.setSeries === "function")
                      chart.setSeries(pos + 1, { label: lbl });
                  } catch (e) {}
                });
                try {
                  debugLite.log("chart.label.array", {
                    type,
                    chartIndex: ci,
                    count: mapping.length,
                  });
                } catch (e) {}
                try {
                  forceRedraw(chart);
                } catch (e) {}
              }
              return;
            }

            // Single-series update: find the chart containing this global index
            if (Number.isFinite(globalIdx)) {
              for (let ci = 0; ci < charts.length; ci++) {
                const chart = charts[ci];
                if (!chart || chart._type !== type) continue;
                const mapping = chart._channelIndices || [];
                const pos = mapping.indexOf(globalIdx);
                if (pos >= 0) {
                  try {
                    if (typeof chart.setSeries === "function")
                      chart.setSeries(pos + 1, { label: change.newValue });
                    try {
                      debugLite.log("chart.label", {
                        type,
                        globalIdx,
                        chartIndex: ci,
                        pos,
                        newValue: change.newValue,
                      });
                    } catch (e) {}
                    try {
                      forceRedraw(chart);
                    } catch (e) {}
                    return;
                  } catch (e) {
                    console.warn(
                      "chartManager: in-place label update failed on chart",
                      ci,
                      e
                    );
                    // continue to next chart
                  }
                }
              }
            }
          } catch (err) {
            console.warn(
              "chartManager: in-place label update failed, recreating charts",
              err
            );
            // Recreate all charts of this type as fallback
            for (let ci = 0; ci < charts.length; ci++) {
              if (charts[ci] && charts[ci]._type === type)
                recreateChart(type, ci);
            }
          }
        },
        { descendants: true }
      );

      // Structural updates: scale/invert should recreate the chart
      channelState.subscribeProperty(
        "scale",
        (change) => {
          const type = change.path && change.path[0];
          const typeIdx = chartTypes.indexOf(type);
          if (typeIdx === -1) return;
          recreateChart(type, typeIdx);
        },
        { descendants: true }
      );
      channelState.subscribeProperty(
        "group",
        (change) => {
          try {
            debugLite.log("chart.group.change", change);
          } catch (e) {}
          // Re-render charts with updated grouping
          renderComtradeCharts(
            cfg,
            data,
            chartsContainer,
            charts,
            verticalLinesX,
            createState,
            calculateDeltas,
            TIME_UNIT,
            channelState
          );
        },
        { descendants: true }
      );
      channelState.subscribeProperty(
        "invert",
        (change) => {
          const type = change.path && change.path[0];
          const typeIdx = chartTypes.indexOf(type);
          if (typeIdx === -1) return;
          recreateChart(type, typeIdx);
        },
        { descendants: true }
      );

      // Add/Delete: channelIDs or yLabels descendant changes -> recreate
      channelState.subscribeProperty(
        "channelIDs",
        (change) => {
          const type = change.path && change.path[0];
          const typeIdx = chartTypes.indexOf(type);
          if (typeIdx === -1) return;
          recreateChart(type, typeIdx);
        },
        { descendants: true }
      );

      // Start / Duration: prefer setting x scale (time window) when possible
      // Robustness: starts/durations may be provided as sample indices or as timestamps.
      // Use dataState[type][0] (time array) to map indices -> time when necessary.
      function resolveTimeRange(type, seriesIdx) {
        const timeArr =
          Array.isArray(dataState[type]) && Array.isArray(dataState[type][0])
            ? dataState[type][0]
            : null;
        console.log(`[resolveTimeRange] timeArr for ${type}:`, timeArr);
        // Debug check
        if (!timeArr) {
          console.warn(
            `[resolveTimeRange] Missing or invalid time array for ${type}`
          );
        }

        const starts = channelState[type]?.starts || [];
        const durations = channelState[type]?.durations || [];

        const sRaw = starts[seriesIdx];
        const dRaw = durations[seriesIdx];

        let sNum = sRaw == null ? NaN : Number(sRaw);
        let dNum = dRaw == null ? NaN : Number(dRaw);

        try {
          debugLite.log("resolveTimeRange.request", {
            type,
            seriesIdx,
            sRaw,
            dRaw,
            timeArrLength: timeArr ? timeArr.length : 0,
          });
        } catch (e) {}

        if (Array.isArray(timeArr) && timeArr.length) {
          const first = timeArr[0];
          const last = timeArr[timeArr.length - 1];
          const totalSamples = timeArr.length;

          // If start is sample index, map to time
          if (Number.isInteger(sNum) && sNum >= 0 && sNum < totalSamples) {
            sNum = timeArr[sNum];
          }

          // If duration is sample count, map to time duration
          if (Number.isInteger(dNum) && dNum > 0 && dNum < totalSamples) {
            const dt = (last - first) / Math.max(1, totalSamples - 1);
            dNum = dNum * dt;
          }

          // Clamp start/duration
          if (Number.isFinite(sNum)) {
            if (sNum < first) sNum = first;
            if (sNum > last) sNum = last;
          }

          if (Number.isFinite(dNum) && Number.isFinite(sNum)) {
            if (sNum + dNum > last) dNum = Math.max(0, last - sNum);
          }
        }

        console.log(
          `[resolveTimeRange] type=${type}, seriesIdx=${seriesIdx}, sNum=${sNum}, dNum=${dNum}, hasTime=${!!(
            timeArr && timeArr.length
          )}`
        );

        return {
          sNum,
          dNum,
          hasTime: Array.isArray(timeArr) && timeArr.length > 0,
        };
      }

      // Helper: apply x-scale robustly with a cheap redraw and single retry
      function applyScale(chart, type, typeIdx, min, max) {
        try {
          // Attempt immediate apply (batched when possible)
          if (typeof chart.batch === "function") {
            try {
              chart.batch(() => chart.setScale("x", { min, max }));
            } catch (e) {
              chart.setScale("x", { min, max });
            }
          } else {
            chart.setScale("x", { min, max });
          }

          try {
            debugLite.log("subscriber.apply.attempt", { type, min, max });
          } catch (e) {}

          // 🩵 Force re-render after short delay to avoid race with uPlot DOM initialization
          setTimeout(() => {
            try {
              if (chart.setScale) chart.setScale("x", { min, max });
              if (chart.redraw) chart.redraw();
              forceRedraw(chart);
              debugLite.log("subscriber.apply.redraw.ok", { type, min, max });
            } catch (err) {
              debugLite.log("subscriber.apply.redraw.error", { type, err });
            }
          }, 50);

          // schedule a single short retry if needed to work around timing races
          if (!chart._scaleRetryScheduled) {
            chart._scaleRetryScheduled = true;
            setTimeout(() => {
              chart._scaleRetryScheduled = false;
              try {
                if (typeof chart.batch === "function") {
                  chart.batch(() => chart.setScale("x", { min, max }));
                } else {
                  chart.setScale("x", { min, max });
                }
                try {
                  forceRedraw(chart);
                } catch (e) {}
                try {
                  debugLite.log("subscriber.apply.retry", { type, min, max });
                } catch (e) {}
              } catch (err) {
                try {
                  debugLite.log("subscriber.apply.retry.error", { type, err });
                } catch (e) {}
                // fallback to recreate if still failing
                try {
                  debugLite.log("subscriber.apply.retry.fallback", { type });
                } catch (e) {}
                recreateChart(type, typeIdx);
              }
            }, 50);
          }
        } catch (err) {
          try {
            debugLite.log("subscriber.apply.error", { type, err });
          } catch (e) {}
          recreateChart(type, typeIdx);
        }
      }

      // Note: we intentionally do not schedule retries here to avoid extra timers.
      // Initial start/duration application is handled once after initial render
      // by the parent (`main.js`) using a small helper.

      channelState.subscribeProperty(
        "start",
        (change) => {
          const type = change.path && change.path[0];
          const seriesIdx = change.path && change.path[2];
          const typeIdx = chartTypes.indexOf(type);
          if (typeIdx === -1) return;
          const chart = charts[typeIdx];
          if (!chart || typeof chart.setScale !== "function") return;
          try {
            try {
              debugLite.log("subscriber.start.received", { change });
            } catch (e) {}
            const { sNum, dNum, hasTime } = resolveTimeRange(type, seriesIdx);
            try {
              debugLite.log("subscriber.start.resolved", {
                type,
                seriesIdx,
                sNum,
                dNum,
                hasTime,
              });
            } catch (e) {}
            if (!hasTime) return;
            if (Number.isFinite(sNum) && Number.isFinite(dNum)) {
              const min = sNum;
              const max = sNum + dNum;
              applyScale(chart, type, typeIdx, min, max);
            } else if (Number.isFinite(sNum)) {
              const min = sNum;
              applyScale(chart, type, typeIdx, min, null);
            }
          } catch (err) {
            // fallback to full recreate if setScale fails
            try {
              debugLite.log("subscriber.start.fallback.recreate", {
                type,
                err,
              });
            } catch (e) {}
            recreateChart(type, typeIdx);
          }
        },
        { descendants: true }
      );

      channelState.subscribeProperty(
        "duration",
        (change) => {
          const type = change.path && change.path[0];
          const seriesIdx = change.path && change.path[2];
          const typeIdx = chartTypes.indexOf(type);
          if (typeIdx === -1) return;
          const chart = charts[typeIdx];
          if (!chart || typeof chart.setScale !== "function") return;
          try {
            try {
              debugLite.log("subscriber.duration.received", { change });
            } catch (e) {}
            const { sNum, dNum, hasTime } = resolveTimeRange(type, seriesIdx);
            try {
              debugLite.log("subscriber.duration.resolved", {
                type,
                seriesIdx,
                sNum,
                dNum,
                hasTime,
              });
            } catch (e) {}
            if (!hasTime) return;
            if (Number.isFinite(sNum) && Number.isFinite(dNum)) {
              const min = sNum;
              const max = sNum + dNum;
              applyScale(chart, type, typeIdx, min, max);
            } else if (
              Number.isFinite(dNum) &&
              Number.isFinite(sNum) === false
            ) {
              // if duration present but no start, treat as max only (no min)
              const max = dNum;
              applyScale(chart, type, typeIdx, null, max);
            }
          } catch (err) {
            try {
              debugLite.log("subscriber.duration.fallback.recreate", {
                type,
                err,
              });
            } catch (e) {}
            recreateChart(type, typeIdx);
          }
        },
        { descendants: true }
      );
    }
  } catch (e) {
    console.warn("chartManager: subscribeProperty wiring skipped or failed", e);
  }

  // Subscribe to channelState changes
  channelState.subscribe(
    (change) => {
      chartTypes.forEach((type, idx) => {
        // Skip color/label here - those are handled by subscribeProperty to
        // avoid duplicate handling and duplicate debug logs.
        if (
          change.path[0] === type &&
          (change.path[1] === "lineColors" || change.path[1] === "yLabels")
        ) {
          return;
        }

        // Structural changes: axes, order, units, etc.
        if (
          change.path[0] === type &&
          (change.path[1] === "axesScales" ||
            change.path[1] === "order" ||
            change.path[1] === "yUnits" ||
            change.path[1] === "xLabel" ||
            change.path[1] === "xUnit")
        ) {
          recreateChart(type, idx);
          return;
        }
      });
    },
    { descendants: true }
  );

  // Subscribe to data changes (full re-create)
  dataState.subscribe((change) => {
    const type = change.path[0];
    const idx = chartTypes.indexOf(type);
    if (idx !== -1) {
      recreateChart(type, idx);
    }
  });

  // Subscribe to verticalLinesX changes (re-apply overlays)
  verticalLinesX.subscribe(() => {
    chartTypes.forEach((type, idx) => {
      if (charts[idx]) {
        // Assuming you have a function to update vertical lines overlay
        updateVerticalLinesOverlay(charts[idx], verticalLinesX);
      }
    });
  });
}

// Helper: update vertical lines overlay (implement as needed)
function updateVerticalLinesOverlay(chart, verticalLines) {
  // Your logic to update vertical lines on the chart
  // For example, re-draw or update plugin state
}
