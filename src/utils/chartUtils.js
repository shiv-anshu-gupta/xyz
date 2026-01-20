// Utility to destroy all uPlot chart instances in an array
// ✅ Properly cleans up ResizeObservers, event listeners, and uPlot instances
export function destroyCharts(charts) {
  if (!Array.isArray(charts)) return;

  charts.forEach((chart, idx) => {
    if (!chart) return;

    try {
      // ✅ CRITICAL: Disconnect ResizeObserver to prevent memory leak
      if (
        chart._resizeObserver &&
        typeof chart._resizeObserver.disconnect === "function"
      ) {
        chart._resizeObserver.disconnect();
        chart._resizeObserver = null;
      }

      // ✅ Remove stored event listeners if any
      if (Array.isArray(chart._eventListeners)) {
        chart._eventListeners.forEach(({ element, event, handler }) => {
          if (element && typeof element.removeEventListener === "function") {
            element.removeEventListener(event, handler);
          }
        });
        chart._eventListeners = null;
      }

      // ✅ Destroy uPlot instance
      if (typeof chart.destroy === "function") {
        chart.destroy();
      }
    } catch (err) {
      console.error(`[destroyCharts] Failed to destroy chart ${idx}:`, err);
    }
  });

  charts.length = 0;
}
