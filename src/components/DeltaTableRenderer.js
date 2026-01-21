/**
 * @file DeltaTableRenderer.js
 * @module Components/Analysis
 *
 * @description
 * <h3>Delta Table DOM Renderer</h3>
 * <p>Reactive rendering component that manages the DOM lifecycle for delta measurement tables.
 * Integrates with the application's reactive state system (createState) to automatically
 * re-render tables when vertical line positions change, ensuring the displayed data
 * always reflects the current cursor positions.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>Reactive Updates</td><td>Subscribes to state changes for automatic re-rendering</td></tr>
 *   <tr><td>Factory Pattern</td><td>createDeltaTableRenderer returns API object with methods</td></tr>
 *   <tr><td>Clean Lifecycle</td><td>Provides destroy() for proper cleanup of subscriptions</td></tr>
 *   <tr><td>State Encapsulation</td><td>Internal state tracks current data and line count</td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>Automatic Re-rendering</strong> — Subscribes to verticalLinesX state changes</li>
 *   <li><strong>Time Extraction</strong> — Converts numeric positions to formatted time strings</li>
 *   <li><strong>Flexible State Access</strong> — Handles multiple state API patterns (asArray, value, direct)</li>
 *   <li><strong>Fallback Placeholders</strong> — Generates T1, T2... labels when times unavailable</li>
 *   <li><strong>Debug Logging</strong> — Comprehensive console output for troubleshooting</li>
 *   <li><strong>Resource Cleanup</strong> — destroy() method unsubscribes and clears DOM</li>
 * </ul>
 * 
 * <h4>Component Lifecycle</h4>
 * <pre>
 * Create: createDeltaTableRenderer(container, state)
 *    ↓
 * Auto-subscribe to verticalLinesX state
 *    ↓
 * render(tableData, lineCount) → DOM update
 *    ↓
 * State changes → auto re-render
 *    ↓
 * destroy() → unsubscribe + clear DOM
 * </pre>
 * 
 * @see {@link module:components/DeltaTable} - Generates HTML consumed by this renderer
 * @see {@link module:components/DeltaTableDataFormatter} - Formats data before rendering
 * @see {@link module:components/createState} - Reactive state system for subscriptions
 * @see {@link module:utils/constants} - crosshairColors array for table styling
 * 
 * @example
 * // Create and use a delta table renderer
 * import { createDeltaTableRenderer } from './DeltaTableRenderer.js';
 * import { createState } from './createState.js';
 * 
 * const container = document.getElementById('delta-table-container');
 * const verticalLinesXState = createState([]);
 * 
 * const renderer = createDeltaTableRenderer(container, verticalLinesXState);
 * 
 * // Render table data
 * const tableData = formatTableData(deltaData, 2, times);
 * renderer.render(tableData, 2);
 * 
 * // Access current state
 * console.log(renderer.currentData);       // Current table data
 * console.log(renderer.currentLinesCount); // Number of lines
 * 
 * // Cleanup when done
 * renderer.destroy();
 * 
 * @mermaid
 * graph TD
 *     subgraph "createDeltaTableRenderer() - Renderer Lifecycle"
 *         A["createDeltaTableRenderer()<br/>Factory Function"] --> B["Initialize internal state<br/>currentTableData, currentVerticalLinesCount"]
 *         B --> C["subscribeToStateChanges()"]
 *         
 *         C --> D{"verticalLinesXState<br/>has subscribe?"}
 *         D -->|Yes| E["Subscribe to changes"]
 *         D -->|No| F["Skip subscription"]
 *         
 *         E --> G["Store unsubscribe function"]
 *         
 *         G --> H["Return API Object"]
 *         F --> H
 *     end
 *     
 *     subgraph "render() - DOM Update Flow"
 *         I["render(tableData, lineCount)"] --> J["Store current data"]
 *         J --> K["Extract time values<br/>from verticalLinesXState"]
 *         
 *         K --> L{"Lines available?"}
 *         L -->|Yes| M["Format as 'X.XX μs'"]
 *         L -->|No| N["Generate T1, T2... placeholders"]
 *         
 *         M --> O["buildTableHTML()"]
 *         N --> O
 *         
 *         O --> P["container.innerHTML = html"]
 *         P --> Q["Log render complete"]
 *     end
 *     
 *     subgraph "State Change Handler"
 *         R["verticalLinesX changes"] --> S["Subscription callback"]
 *         S --> T{"Has current data?"}
 *         T -->|Yes| U["Re-render with<br/>current data"]
 *         T -->|No| V["Skip render"]
 *     end
 *     
 *     subgraph "destroy() - Cleanup"
 *         W["destroy()"] --> X["Call unsubscribe()"]
 *         X --> Y["Clear container innerHTML"]
 *         Y --> Z["Log destroyed"]
 *     end
 *     
 *     H --> I
 *     E -.-> R
 *     
 *     style A fill:#e0f2fe,stroke:#0284c7
 *     style H fill:#dcfce7,stroke:#16a34a
 *     style W fill:#fee2e2,stroke:#dc2626
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
