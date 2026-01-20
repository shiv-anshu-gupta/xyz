/**
 * @file DeltaTableRenderer.js
 * @description DOM renderer for Delta Table
 * Uses createState subscriptions for automatic updates
 */

import { buildTableHTML } from "./DeltaTable.js";
import { crosshairColors } from "../utils/constants.js";

/**
 * Create Delta Table Renderer
 * @param {HTMLElement} containerElement - Container to render table into
 * @param {Object} verticalLinesXState - Reactive state from createState
 * @returns {Object} API with render() and destroy() methods
 */
export function createDeltaTableRenderer(
  containerElement,
  verticalLinesXState
) {
  let unsubscribe = null;
  let currentTableData = [];
  let currentVerticalLinesCount = 0;

  /**
   * Render table to DOM
   * @param {Object[]} tableData - Formatted table data
   * @param {number} verticalLinesCount - Number of vertical lines
   */
  function render(tableData, verticalLinesCount) {
    currentTableData = tableData;
    currentVerticalLinesCount = verticalLinesCount;

    // ✅ Debug: Log data being rendered
    console.log("[DeltaTableRenderer] render() called with:", {
      rowCount: tableData.length,
      linesCount: verticalLinesCount,
      containerExists: !!containerElement,
      containerHtml: containerElement?.innerHTML?.substring(0, 100),
      firstRow: tableData[0],
      lastRow: tableData[tableData.length - 1],
    });

    if (!containerElement) {
      console.error("[DeltaTableRenderer] Container element not found!");
      return;
    }

    // Extract time values from verticalLinesX state
    const verticalLineTimes = [];
    try {
      let linesArray = [];
      
      // ✅ FIX: Try multiple ways to get the lines array
      if (verticalLinesXState.asArray && typeof verticalLinesXState.asArray === "function") {
        linesArray = verticalLinesXState.asArray();
        console.log("[DeltaTableRenderer] Got lines from asArray():", linesArray.length);
      } else if (verticalLinesXState.value) {
        linesArray = Array.isArray(verticalLinesXState.value) ? verticalLinesXState.value : [];
        console.log("[DeltaTableRenderer] Got lines from .value:", linesArray.length);
      } else if (Array.isArray(verticalLinesXState)) {
        linesArray = verticalLinesXState;
        console.log("[DeltaTableRenderer] State itself is array:", linesArray.length);
      }
      
      // ✅ FALLBACK: If still no lines, generate placeholders based on verticalLinesCount
      if (!linesArray || linesArray.length === 0) {
        console.warn("[DeltaTableRenderer] ⚠️ Could not extract lines from state, generating placeholders based on verticalLinesCount:", verticalLinesCount);
        for (let i = 0; i < verticalLinesCount; i++) {
          verticalLineTimes.push(`T${i + 1}`);
        }
      } else {
        // Extract actual time values
        linesArray.forEach((timeValue) => {
          if (typeof timeValue === "number") {
            verticalLineTimes.push(`${timeValue.toFixed(2)} μs`);
          }
        });
        console.log("[DeltaTableRenderer] Extracted time values:", verticalLineTimes);
      }
    } catch (e) {
      console.warn(
        "[DeltaTableRenderer] Error extracting time values, using placeholders:",
        e.message
      );
      // Fallback to placeholders
      for (let i = 0; i < verticalLinesCount; i++) {
        verticalLineTimes.push(`T${i + 1}`);
      }
    }

    // Build HTML
    console.log("[DeltaTableRenderer] Building HTML with", tableData.length, "rows");
    const tableHTML = buildTableHTML(
      tableData,
      verticalLinesCount,
      verticalLineTimes,
      crosshairColors
    );

    // Render to DOM
    containerElement.innerHTML = tableHTML;

    console.log(
      `[DeltaTableRenderer] ✅ Rendered table with ${tableData.length} rows and ${verticalLinesCount} lines in container:`,
      containerElement.id || containerElement.className
    );
    console.log(
      "[DeltaTableRenderer] First 500 chars of rendered HTML:",
      containerElement.innerHTML.substring(0, 500)
    );
  }

  /**
   * Subscribe to verticalLinesX state changes
   * Auto-re-renders table when lines are added/removed/moved
   */
  function subscribeToStateChanges() {
    if (
      verticalLinesXState &&
      typeof verticalLinesXState.subscribe === "function"
    ) {
      unsubscribe = verticalLinesXState.subscribe((change) => {
        console.log(
          "[DeltaTableRenderer] Vertical lines changed, re-rendering table"
        );
        // Re-render with current data (table structure changes when line count changes)
        if (currentTableData.length > 0) {
          render(currentTableData, currentVerticalLinesCount);
        }
      });
      console.log("[DeltaTableRenderer] Subscribed to verticalLinesX state");
    }
  }

  /**
   * Clean up subscriptions
   */
  function destroy() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    containerElement.innerHTML = "";
    console.log("[DeltaTableRenderer] Destroyed");
  }

  // Auto-subscribe on creation
  subscribeToStateChanges();

  return {
    render,
    destroy,
    get currentData() {
      return currentTableData;
    },
    get currentLinesCount() {
      return currentVerticalLinesCount;
    },
  };
}
