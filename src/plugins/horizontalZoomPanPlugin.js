/**
 * @file horizontalZoomPanPlugin.js
 * @module Plugins/Chart
 *
 * @description
 * <h3>uPlot Plugin: Horizontal Zoom & Pan</h3>
 * 
 * <p>Enables keyboard and mouse-based horizontal zooming and panning across synchronized
 * charts. Uses modifier keys (Shift, Alt) to distinguish zoom from pan operations.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>Modular Design</td><td>Accepts getCharts function, no global state dependency</td></tr>
 *   <tr><td>Chart Synchronization</td><td>All charts zoom/pan together via syncKey</td></tr>
 *   <tr><td>Modifier Keys</td><td>Shift for zoom, Alt for pan—prevents accidental operations</td></tr>
 *   <tr><td>Clean Cleanup</td><td>Proper event handler removal on chart destroy</td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>Shift+Scroll</strong> — Zoom in/out horizontally</li>
 *   <li><strong>Alt+Scroll</strong> — Pan left/right horizontally</li>
 *   <li><strong>Shift+Arrow</strong> — Zoom with keyboard</li>
 *   <li><strong>Alt+Arrow</strong> — Pan with keyboard</li>
 *   <li><strong>Mouse-Anchored Zoom</strong> — Zoom centers on cursor position</li>
 *   <li><strong>Sync Group</strong> — Charts with same syncKey update together</li>
 * </ul>
 * 
 * <h4>Control Mapping</h4>
 * <table>
 *   <tr><th>Input</th><th>Action</th></tr>
 *   <tr><td>Shift + Scroll Up</td><td>Zoom In (0.8x range)</td></tr>
 *   <tr><td>Shift + Scroll Down</td><td>Zoom Out (1.25x range)</td></tr>
 *   <tr><td>Alt + Scroll Up</td><td>Pan Left (10% of range)</td></tr>
 *   <tr><td>Alt + Scroll Down</td><td>Pan Right (10% of range)</td></tr>
 *   <tr><td>Shift + Left/Right</td><td>Zoom via keyboard</td></tr>
 *   <tr><td>Alt + Left/Right</td><td>Pan via keyboard</td></tr>
 * </table>
 * 
 * @see {@link module:plugins/verticalLinePlugin} - Vertical measurement lines
 * 
 * @example
 * import horizontalZoomPanPlugin from './plugins/horizontalZoomPanPlugin.js';
 * 
 * const opts = {
 *   plugins: [
 *     horizontalZoomPanPlugin('globalSync', () => window.charts)
 *   ]
 * };
 * 
 * @mermaid
 * graph TD
 *     subgraph Input_Detection
 *         A[Wheel Event] --> B{Has Shift Key?}
 *         B -->|Yes| C[Zoom Mode]
 *         B -->|No| D{Has Alt Key?}
 *         D -->|Yes| E[Pan Mode]
 *         D -->|No| F[Ignore]
 *     end
 *     
 *     subgraph Zoom_Calculation
 *         C --> G[Get Mouse X Position]
 *         G --> H[Calculate Relative Position]
 *         H --> I{Zoom Direction}
 *         I -->|In| J[newRange = range * 0.8]
 *         I -->|Out| K[newRange = range * 1.25]
 *         J --> L[Center on Mouse Position]
 *         K --> L
 *     end
 *     
 *     subgraph Pan_Calculation
 *         E --> M[Get Current Range]
 *         M --> N[panAmount = range * 0.1]
 *         N --> O{Direction}
 *         O -->|Left| P[newMin = min - panAmount]
 *         O -->|Right| Q[newMin = min + panAmount]
 *     end
 *     
 *     subgraph Chart_Sync
 *         L --> R[applyZoomPanToCharts]
 *         P --> R
 *         Q --> R
 *         R --> S[getCharts function]
 *         S --> T[For Each Chart]
 *         T --> U[setScale x with newMin, newMax]
 *     end
 *     
 *     style A fill:#4CAF50,color:white
 *     style R fill:#2196F3,color:white
 *     style U fill:#FF9800,color:white
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