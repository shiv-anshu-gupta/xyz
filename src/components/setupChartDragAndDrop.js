/**
 * @module setupChartDragAndDrop
 * @description
 * Enables native HTML5 drag-and-drop functionality for reordering chart containers.
 * Charts can be dragged by their drag bar to visually reorder them on the page.
 * This is useful for organizing analog and digital channels in preferred viewing order.
 *
 * Key Features:
 * - Drag bar initiation (dragstart event)
 * - Visual feedback during drag (dragging class)
 * - Drop target detection (dragover/drop events)
 * - In-place DOM reordering (target.before(dragged))
 * - Prevents default browser drag behavior
 * - Works with custom dragBar elements
 *
 * Event Flow:
 * 1. User clicks and holds on dragBar element
 * 2. dragstart fires: Stores reference, adds visual feedback
 * 3. dragover fires: Allows drop (prevents default)
 * 4. drop fires: Inserts dragged element before target
 * 5. dragend fires: Cleans up visual feedback
 *
 * Dependencies:
 * - createDragBar.js: Creates the dragBar element with proper classes
 * - CSS classes: "dragBar", "chart-parent-container", "dragging"
 *
 * @example
 * import { setupChartDragAndDrop } from './components/setupChartDragAndDrop.js';
 *
 * const chartGrid = document.getElementById('charts-container');
 * setupChartDragAndDrop(chartGrid);
 *
 * // Now users can drag chart drag bars to reorder them
 * // HTML structure:
 * // <div id="charts-container">
 * //   <div class="chart-parent-container">
 * //     <div class="dragBar" draggable="true">...</div>
 * //     <div class="chart-container"></div>
 * //   </div>
 * //   <div class="chart-parent-container">
 * //     <div class="dragBar" draggable="true">...</div>
 * //     <div class="chart-container"></div>
 * //   </div>
 * // </div>
 */

// src/components/setupChartDragAndDrop.js
/**
 * Setup drag-and-drop reordering for chart containers.
 *
 * Attaches native HTML5 drag event listeners to a chart grid container for
 * interactive reordering of chart elements. Users can grab the dragBar element
 * on any chart and drag it to a new position within the container.
 *
 * Event Handlers Attached:
 * - dragstart: Initiates drag, stores reference, applies visual feedback
 * - dragend: Cleans up state and visual feedback after drop
 * - dragover: Enables drop zone (default prevention)
 * - drop: Executes DOM reordering with target.before(dragged)
 *
 * @function setupChartDragAndDrop
 * @param {HTMLElement} chartGrid - Container element holding chart-parent-container children
 * @returns {void}
 *
 * Preconditions:
 * - chartGrid must contain chart-parent-container elements
 * - Each chart-parent-container must contain a draggable dragBar child element
 * - CSS must define .dragBar with draggable="true" styling
 * - CSS must define .dragging class for visual feedback
 *
 * Side Effects:
 * - Mutates DOM structure by reordering chart-parent-container elements
 * - Adds/removes "dragging" class for visual feedback
 * - All DOM changes are reflected immediately in browser
 *
 * @example
 * // Basic setup
 * const container = document.getElementById('charts-container');
 * setupChartDragAndDrop(container);
 *
 * @example
 * // HTML structure for drag-and-drop
 * <div id="charts-container">
 *   <!-- Analog Chart -->
 *   <div class="chart-parent-container">
 *     <div class="dragBar" draggable="true">
 *       <span style="color: #FF5733;">■</span>
 *       <span style="color: #33FF57;">■</span>
 *       <span style="color: #3357FF;">■</span>
 *     </div>
 *     <div class="chart-container"></div>
 *   </div>
 *   <!-- Digital Chart -->
 *   <div class="chart-parent-container">
 *     <div class="dragBar" draggable="true">
 *       <span style="color: #FFAA00;">■</span>
 *     </div>
 *     <div class="chart-container"></div>
 *   </div>
 * </div>
 *
 * @example
 * // Associated CSS classes
 * // .dragBar {
 * //   cursor: grab;
 * //   user-select: none;
 * //   padding: 4px 8px;
 * // }
 * // .dragging {
 * //   opacity: 0.5;
 * //   background-color: rgba(100, 100, 100, 0.2);
 * // }
 */
export function setupChartDragAndDrop(chartGrid) {
  let dragged = null;
  chartGrid.addEventListener("dragstart", (e) => {
    if (e.target.classList.contains("dragBar")) {
      dragged = e.target.closest(".chart-parent-container");
      dragged.classList.add("dragging");
      e.dataTransfer.setDragImage(dragged, 20, 20);
    } else {
      dragged = null;
      e.preventDefault();
    }
  });
  chartGrid.addEventListener("dragend", () => {
    if (dragged) dragged.classList.remove("dragging");
    dragged = null;
  });
  chartGrid.addEventListener("dragover", (e) => e.preventDefault());
  chartGrid.addEventListener("drop", (e) => {
    e.preventDefault();
    const target = e.target.closest(".chart-parent-container");
    if (target && target !== dragged) {
      target.before(dragged);
    }
  });
}
