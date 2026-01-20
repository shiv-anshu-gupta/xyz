/**
 * uPlot Plugin: Horizontal Zoom & Pan (modular, professional)
 *
 * Features:
 * - Shift+scroll or Shift+<,> or Shift+arrow: zoom all synced charts
 * - Alt+scroll or Alt+<,> or Alt+arrow: pan all synced charts
 * - Modular: accepts getCharts function to retrieve all chart instances
 * - No global state dependency
 * - Clean event handler management
 *
 * @param {string} syncKey - Key for chart sync group
 * @param {function(): uPlot[]} getCharts - Function returning all chart instances to sync (REQUIRED)
 * @returns {Object} uPlot plugin object
 */
export default function horizontalZoomPanPlugin(syncKey = "globalSync", getCharts) {
  let wheelHandler = null;
  let keyHandler = null;

  // Helper: apply pan/zoom to all charts
  function applyZoomPanToCharts(newMin, newMax) {
    const charts = (typeof getCharts === 'function' ? getCharts() : []) || [];
    if (!charts.length) {
      console.warn(`[horizontalZoomPanPlugin] No charts found for sync key: ${syncKey}`);
      return;
    }
    charts.forEach(chart => {
      chart.setScale("x", { min: newMin, max: newMax });
    });
  }

  // Shared logic for calculating new min/max
  function calcNewRange(u, mode, direction, mouseVal = null) {
    const { min, max } = u.scales.x;
    const range = max - min;
    let newMin = min, newMax = max;
    if (mode === 'zoom') {
      const zoomFactor = direction === 'in' ? 0.8 : 1.25;
      const rel = mouseVal !== null ? (mouseVal - min) / range : 0.5;
      const newRange = range * zoomFactor;
      newMin = mouseVal !== null
        ? mouseVal - rel * newRange
        : min + (range - newRange) * rel;
      newMax = mouseVal !== null
        ? mouseVal + (1 - rel) * newRange
        : max - (range - newRange) * (1 - rel);
      if (direction === 'out' && mouseVal === null) {
        newMin = min - (newRange - range) * rel;
        newMax = max + (newRange - range) * (1 - rel);
      }
    } else if (mode === 'pan') {
      const panFrac = 0.2;
      const pan = range * panFrac * (direction === 'right' ? 1 : -1);
      newMin = min + pan;
      newMax = max + pan;
    }
    return { newMin, newMax };
  }

  function onWheel(u, e) {
    if (e.ctrlKey || e.metaKey) return;
    if (!(e.shiftKey || e.altKey)) return;
    e.preventDefault();
    const mouseX = u.cursor.left;
    const mouseVal = u.posToVal(mouseX, "x");
    let mode, direction;
    if (e.shiftKey) {
      mode = 'zoom';
      direction = e.deltaY < 0 ? 'in' : 'out';
    } else if (e.altKey) {
      mode = 'pan';
      direction = e.deltaY < 0 ? 'left' : 'right';
    }
    const { newMin, newMax } = calcNewRange(u, mode, direction, mouseVal);
    applyZoomPanToCharts(newMin, newMax);
  }

  function onKeyDown(u, e) {
    if (!(e.shiftKey || e.altKey)) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    let mode, direction;
    if (e.shiftKey && (e.key === '<' || e.key === ',' || e.key === 'ArrowLeft')) {
      mode = 'zoom'; direction = 'in';
    } else if (e.shiftKey && (e.key === '>' || e.key === '.' || e.key === 'ArrowRight')) {
      mode = 'zoom'; direction = 'out';
    } else if (e.altKey && (e.key === '<' || e.key === ',' || e.key === 'ArrowLeft')) {
      mode = 'pan'; direction = 'left';
    } else if (e.altKey && (e.key === '>' || e.key === '.' || e.key === 'ArrowRight')) {
      mode = 'pan'; direction = 'right';
    } else {
      return;
    }
    e.preventDefault();
    const { newMin, newMax } = calcNewRange(u, mode, direction);
    applyZoomPanToCharts(newMin, newMax);
  }

  return {
    id: 'horizontalZoomPanPlugin',
    hooks: {
      ready: [
        u => {
          wheelHandler = onWheel.bind(null, u);
          keyHandler = onKeyDown.bind(null, u);
          u.over.addEventListener("wheel", wheelHandler, { passive: false });
          // Attach keydown to the chart's container for modularity (not window)
          u.root.addEventListener("keydown", keyHandler);
        }
      ],
      destroy: [
        u => {
          if (wheelHandler) u.over.removeEventListener("wheel", wheelHandler);
          if (keyHandler) u.root.removeEventListener("keydown", keyHandler);
        }
      ]
    }
  };
}