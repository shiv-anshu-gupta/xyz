/**
 * @module handleVerticalLineShortcuts
 * @description
 * Manages keyboard shortcuts for adding, removing, and navigating vertical line
 * markers on COMTRADE charts. Vertical lines are used to mark specific time points
 * for measurement and delta calculations.
 *
 * Keyboard Shortcuts:
 * - Alt + 0: Clear all vertical lines
 * - Alt + 1: Add vertical line at current cursor position
 * - Alt + 2: Go to previous vertical line
 * - Alt + 3: Go to next vertical line
 * - Alt + 4: Delete current vertical line
 *
 * Features:
 * - Synchronized vertical lines across all charts
 * - Automatic delta calculation (time and value differences)
 * - Display results in fixed overlay
 * - Cursor navigation to markers
 *
 * @example
 * import { handleVerticalLineShortcuts } from './components/handleVerticalLineShortcuts.js';
 *
 * document.addEventListener('keydown', (e) => {
 *   handleVerticalLineShortcuts(e, charts, verticalLinesX, resultsEl, 'seconds', calculateDeltas);
 * });
 */

import { collectChartDeltas } from "../utils/calculateDeltas.js";

// src/components/handleVerticalLineShortcuts.js
/**
 * Handle keyboard shortcuts for vertical line management on charts.
 *
 * Processes Alt key combinations to add, remove, navigate, and clear vertical
 * line markers on charts. Updates chart overlays and calculates deltas for
 * measurements between markers.
 *
 * @function handleVerticalLineShortcuts
 * @param {KeyboardEvent} e - The keyboard event
 * @param {Array<uPlot>} charts - Array of uPlot chart instances to update
 * @param {Array<number>} verticalLinesX - Array of vertical line X positions (values)
 * @param {HTMLElement} fixedResultsEl - Element to display measurement results
 * @param {string} TIME_UNIT - Time unit label for display ('seconds', 'milliseconds', etc)
 * @param {Function} calculateDeltas - Function to calculate deltas at vertical lines
 * @returns {void}
 *
 * @example
 * // Add shortcut on key down
 * document.addEventListener('keydown', (e) => {
 *   if (e.altKey) {
 *     handleVerticalLineShortcuts(e, charts, verticalLinesX, resultsEl, TIME_UNIT, calculateDeltas);
 *   }
 * });
 */
export async function handleVerticalLineShortcuts(
  e,
  charts,
  verticalLinesX,
  fixedResultsEl,
  TIME_UNIT,
  calculateDeltas
) {
  if (e.altKey && e.key === "0") {
    verticalLinesX.length = 0;
    charts.forEach((c) => c.redraw());
    fixedResultsEl.innerHTML = "";
    // Hide delta window when cleared
    try {
      const { deltaWindow } = await import("../main.js");
      if (deltaWindow) deltaWindow.clear();
    } catch (err) {
      console.warn("[handleVerticalLineShortcuts] Could not clear deltaWindow");
    }
  }
  if (e.altKey && e.key === "1") {
    if (charts.length === 0) return;
    const firstChart = charts.find((c) => c && c.cursor);
    if (!firstChart) return;
    const cursorX = firstChart.cursor.left;
    const xVal = firstChart.posToVal(cursorX, "x");
    verticalLinesX.push(xVal);
    charts.forEach((c) => c.redraw());

    // Collect delta data from all charts (no async needed)
    const allDeltaData = [];

    for (const chart of charts) {
      const chartDeltas = collectChartDeltas(verticalLinesX, chart, TIME_UNIT);
      if (chartDeltas.length > 0) {
        allDeltaData.push(...chartDeltas);
      }
    }

    // Update delta window with all data
    // Show drawer whenever there are vertical lines (even if just 1)
    if (verticalLinesX.length > 0) {
      try {
        const { deltaWindow } = await import("../main.js");
        if (deltaWindow) {
          deltaWindow.show(); // OPEN THE DRAWER
          deltaWindow.update(allDeltaData, verticalLinesX.length);
        }
      } catch (e) {
        // Failed to update delta window, continue
      }
    }
  }
  if (e.altKey && e.key === "2") {
    if (verticalLinesX.length > 0) {
      charts.forEach((c) => c.redraw());

      // Collect delta data from all charts
      const allDeltaData = [];

      for (const chart of charts) {
        const chartDeltas = collectChartDeltas(
          verticalLinesX,
          chart,
          TIME_UNIT
        );
        if (chartDeltas.length > 0) {
          allDeltaData.push(...chartDeltas);
        }
      }

      // Update delta window with all data
      // Show drawer whenever there are vertical lines (even if just 1)
      if (verticalLinesX.length > 0) {
        try {
          const { deltaWindow } = await import("../main.js");
          if (deltaWindow) {
            deltaWindow.show(); // OPEN THE DRAWER
            deltaWindow.update(allDeltaData, verticalLinesX.length);
          }
        } catch (e) {
          // Failed to update delta window, continue
        }
      }
    }
  }
}
