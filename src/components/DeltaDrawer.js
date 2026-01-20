/**
 * @file DeltaDrawer.js
 * @module components/DeltaDrawer
 * 
 * @description
 * <h3>Delta Values Sidebar Drawer</h3>
 * 
 * <p>A slide-out sidebar component that displays detailed crosshair/vertical line values
 * in a searchable, formatted table. Shows measurement data at vertical marker positions
 * placed on charts using Alt+1 keyboard shortcut.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>Pre-built HTML</td><td>DOM structure defined in index.html, component handles behavior only</td></tr>
 *   <tr><td>CSS Variable Layout</td><td>Uses --main-content-width and --sidebar-width for responsive resizing</td></tr>
 *   <tr><td>Deduplication</td><td>Hash-based comparison prevents redundant table re-renders</td></tr>
 *   <tr><td>Lazy Loading</td><td>Table renderer created on-demand when drawer is opened</td></tr>
 *   <tr><td>Store Integration</td><td>Registered with sidebarStore for single-sidebar-at-a-time behavior</td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>Vertical Line Values</strong> — Displays channel values at each vertical marker position</li>
 *   <li><strong>Delta Calculations</strong> — Shows differences between consecutive vertical lines</li>
 *   <li><strong>Time Headers</strong> — Dynamic column headers showing actual timestamp values (μs)</li>
 *   <li><strong>Search Filtering</strong> — Real-time search to filter table rows by channel name</li>
 *   <li><strong>Resizable Width</strong> — Percentage-based width (15-70%) controlled via CSS variables</li>
 *   <li><strong>Empty State</strong> — Helpful message when no vertical lines are placed</li>
 * </ul>
 * 
 * <h4>Data Flow Pipeline</h4>
 * <ol>
 *   <li>User places vertical lines on chart (Alt+1)</li>
 *   <li>verticalLinesX state updates with new positions</li>
 *   <li>Parent calls deltaDrawer.update(deltaData, lineCount)</li>
 *   <li>Hash comparison checks if data changed</li>
 *   <li>formatTableData() transforms sections into row format</li>
 *   <li>DeltaTableRenderer creates/updates HTML table</li>
 *   <li>Search input filters visible rows in real-time</li>
 * </ol>
 * 
 * <h4>DOM Structure</h4>
 * <pre>
 * #delta-drawer (sidebar container)
 *   └─ #delta-drawer-panel (content panel)
 *       ├─ .delta-drawer-header (title + close button)
 *       │   ├─ #delta-table-search (search input)
 *       │   └─ #delta-table-search-btn (search button)
 *       └─ .delta-table-container (table wrapper)
 *           └─ [DeltaTableRenderer output]
 * </pre>
 * 
 * @see {@link module:components/DeltaTableRenderer} - Table rendering engine
 * @see {@link module:components/DeltaTableDataFormatter} - Data transformation utilities
 * @see {@link module:utils/sidebarStore} - Global sidebar coordination
 * @see {@link module:main} - verticalLinesX state management
 * 
 * @example
 * // Initialize and register with store
 * const deltaDrawer = createDeltaDrawer();
 * deltaDrawer.init();
 * deltaDrawer.registerWithStore();
 * 
 * // Show drawer with data
 * deltaDrawer.show();
 * deltaDrawer.update(deltaData, verticalLinesCount);
 * 
 * // Toggle visibility
 * deltaDrawer.toggle();
 * 
 * @example
 * // deltaData format (from crosshair calculations)
 * const deltaData = [
 *   {
 *     sectionTitle: "Analog Channels",
 *     rows: [
 *       { name: "IA", values: [100.5, 102.3], deltas: [1.8] },
 *       { name: "IB", values: [98.2, 99.1], deltas: [0.9] }
 *     ]
 *   }
 * ];
 * 
 * @mermaid
 * graph TD
 *     subgraph User_Triggers
 *         A[User Places Vertical Line<br/>Alt+1] --> B[verticalLinesX State Updates]
 *         C[User Opens Delta Drawer] --> D[show method called]
 *     end
 *     
 *     subgraph Drawer_Lifecycle
 *         D --> E[Remove hidden class]
 *         E --> F[Set CSS Variables<br/>--main-content-width<br/>--sidebar-width]
 *         F --> G[Add sidebar-resized class]
 *         G --> H[Setup Search Listeners]
 *     end
 *     
 *     subgraph Data_Update_Flow
 *         B --> I[update method called]
 *         I --> J{Data Hash Changed?}
 *         J -->|No| K[Skip Render]
 *         J -->|Yes| L[Extract Time Values<br/>from verticalLinesX]
 *         L --> M[formatTableData]
 *         M --> N{Has Data?}
 *         N -->|No| O[Show Empty State<br/>Add vertical lines using Alt+1]
 *         N -->|Yes| P[Create DeltaTableRenderer]
 *         P --> Q[Render Table]
 *         Q --> R[Store currentTableData<br/>for Search]
 *     end
 *     
 *     subgraph Search_Flow
 *         S[User Types in Search] --> T[filterTableRows]
 *         T --> U[Re-render Filtered Data]
 *     end
 *     
 *     subgraph Hide_Flow
 *         V[hide method called] --> W[Reset CSS Variables]
 *         W --> X[Remove sidebar-resized class]
 *         X --> Y[Add hidden class<br/>after 300ms]
 *     end
 *     
 *     style A fill:#4CAF50,color:white
 *     style Q fill:#2196F3,color:white
 *     style O fill:#FF9800,color:white
 */

import { sidebarStore } from "../utils/sidebarStore.js";
import { adjustMainContent } from "../utils/sidebarResize.js";
import { crosshairColors } from "../utils/constants.js";
import { createDeltaTableRenderer } from "./DeltaTableRenderer.js";
import { formatTableData } from "./DeltaTableDataFormatter.js";
import { createSidebarResizer } from "./SidebarResizer.js";
import { filterTableRows } from "./DeltaTable.js";

export function createDeltaDrawer() {
  let isOpen = false;
  let sidebarWidth = 20; // Percentage width
  const minWidth = 15;
  const maxWidth = 70;
  let tableRenderer = null;
  let lastUpdateHash = null;
  let currentTableData = [];
  let currentVerticalLinesCount = 0;

  function setupEventListeners() {
    const drawer = document.getElementById("delta-drawer");
    if (!drawer) {
      console.warn("[DeltaDrawer] Delta drawer element not found in DOM");
      return;
    }

    // Setup search functionality
    setupSearchFunctionality();
  }

  /**
   * Setup search box event listeners
   */
  function setupSearchFunctionality() {
    const searchInput = document.getElementById("delta-table-search");
    const searchBtn = document.getElementById("delta-table-search-btn");

    if (!searchInput || !searchBtn) {
      console.warn("[DeltaDrawer] Search elements not found in DOM");
      return;
    }

    // Handle search button click
    const handleSearch = () => {
      const searchQuery = searchInput.value;
      console.log("[DeltaDrawer] Searching for:", searchQuery);

      // Filter table data based on search query
      const filteredData = filterTableRows(currentTableData, searchQuery);

      // Re-render table with filtered data
      if (tableRenderer) {
        try {
          tableRenderer.render(filteredData, currentVerticalLinesCount);
          console.log("[DeltaDrawer] Table filtered to", filteredData.length, "rows");
        } catch (err) {
          console.error("[DeltaDrawer] Error filtering table:", err);
        }
      }
    };

    // Add event listeners
    searchBtn.addEventListener("click", handleSearch);
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        handleSearch();
      }
    });

    // Allow search input to update on key release for real-time filtering
    searchInput.addEventListener("keyup", () => {
      const searchQuery = searchInput.value;
      if (searchQuery === "") {
        // If search is cleared, show all rows
        if (tableRenderer) {
          tableRenderer.render(currentTableData, currentVerticalLinesCount);
        }
      }
    });

    console.log("[DeltaDrawer] Search functionality initialized");
  }

  const api = {
    show: () => {
      console.log("[DeltaDrawer] show() called");

      const drawer = document.getElementById("delta-drawer");
      const mainContent = document.getElementById("mainContent");
      const divider = document.getElementById("resizeDivider");

      if (!drawer) {
        console.error("[DeltaDrawer] ❌ Delta drawer element not found in DOM");
        return;
      }

      isOpen = true;

      // ✅ Use CSS variables to override Tailwind hashing
      document.documentElement.style.setProperty(
        "--main-content-width",
        `${100 - sidebarWidth}%`
      );
      document.documentElement.style.setProperty(
        "--sidebar-width",
        `${sidebarWidth}%`
      );

      // Add resized class to apply CSS variable widths
      drawer.classList.remove("hidden");
      drawer.classList.add("sidebar-resized");
      mainContent.classList.add("sidebar-resized");
      divider.classList.remove("hidden");

      setupEventListeners();
      console.log(
        "[DeltaDrawer] ✅ Drawer shown with width:",
        sidebarWidth + "%"
      );
    },

    hide: () => {
      console.log("[DeltaDrawer] hide() called");
      const drawer = document.getElementById("delta-drawer");
      const mainContent = document.getElementById("mainContent");
      const divider = document.getElementById("resizeDivider");

      if (!drawer) {
        console.warn("[DeltaDrawer] Drawer not found in DOM");
        isOpen = false;
        return;
      }

      isOpen = false;

      // Clear search input when drawer is hidden
      const searchInput = document.getElementById("delta-table-search");
      if (searchInput) {
        searchInput.value = "";
      }

      // ✅ Reset CSS variables and remove resized class
      document.documentElement.style.setProperty(
        "--main-content-width",
        "100%"
      );
      document.documentElement.style.setProperty("--sidebar-width", "0px");

      // Remove resized class to clear CSS variable widths
      drawer.classList.remove("sidebar-resized");
      mainContent.classList.remove("sidebar-resized");
      divider.classList.add("hidden");

      // Add delay before adding hidden class to allow animation
      setTimeout(() => {
        drawer.classList.add("hidden");
      }, 300);

      console.log("[DeltaDrawer] ✅ Drawer hidden");
    },

    update: async (deltaData = [], verticalLinesCount = 0) => {
      // ✅ Log incoming data for debugging
      console.log(
        "[DeltaDrawer] update() called with",
        deltaData.length,
        "sections,",
        verticalLinesCount,
        "vertical lines, drawer open:",
        isOpen
      );

      // ✅ Generate hash of current data to prevent duplicate renders
      const currentHash = JSON.stringify({ deltaData, verticalLinesCount });

      // ✅ Skip if data hasn't changed
      if (currentHash === lastUpdateHash) {
        console.log(
          "[DeltaDrawer] ⏭️ Skipping duplicate update (data unchanged)"
        );
        return;
      }

      lastUpdateHash = currentHash;

      const drawerPanel = document.getElementById("delta-drawer-panel");
      if (!drawerPanel) {
        console.warn(
          "[DeltaDrawer] Drawer panel element not found - drawer may not be rendered yet"
        );
        return;
      }
      
      // Find or create header for title and search
      let headerDiv = drawerPanel.querySelector(".delta-drawer-header");
      if (!headerDiv) {
        console.warn("[DeltaDrawer] Header not found in panel");
        return;
      }
      
      // Target the content area after header
      const content = drawerPanel;

      // Destroy old renderer
      if (tableRenderer) {
        tableRenderer.destroy();
        tableRenderer = null;
      }

      // Show empty state if insufficient data
      if (!deltaData || deltaData.length === 0 || verticalLinesCount < 1) {
        const message =
          verticalLinesCount < 1
            ? "Add vertical lines using <strong>Alt + 1</strong> on the chart to see values"
            : "";

        let tableContainer = drawerPanel.querySelector(".delta-table-container");
        if (!tableContainer) {
          tableContainer = document.createElement("div");
          tableContainer.className = "delta-table-container";
          drawerPanel.appendChild(tableContainer);
        }
        
        tableContainer.innerHTML = `
          <div class="delta-empty-state">
            <div style="font-size: 14px; line-height: 1.5; margin-bottom: 12px;">
              ${message}
            </div>
            <div style="font-size: 12px; color: #9ca3af; margin-top: 16px;">
              💡 Place markers on the chart to measure values
            </div>
          </div>
        `;
        console.log("[DeltaDrawer] Showing empty state:", {
          deltaDataLength: deltaData?.length || 0,
          verticalLinesCount,
        });
        return;
      }

      // Remove old table container if exists
      let tableContainer = drawerPanel.querySelector(".delta-table-container");
      if (tableContainer) {
        tableContainer.remove();
      }
      console.log(
        "[DeltaDrawer] ✨ Content cleared, creating single table container"
      );

      // Create table container
      tableContainer = document.createElement("div");
      tableContainer.className = "delta-table-container";
      tableContainer.id = "delta-table-main";
      drawerPanel.appendChild(tableContainer);
      console.log(
        "[DeltaDrawer] ✅ Table container appended to drawer panel (ONCE)"
      );

      // ✅ EXTRACT: Time values BEFORE creating renderer
      let verticalLineTimes = [];

      try {
        const mainModule = await import("../main.js");
        const verticalLinesXState = mainModule.verticalLinesX;

        if (verticalLinesXState && typeof verticalLinesXState === "object") {
          let linesArray = verticalLinesXState.value || [];

          if (
            (!Array.isArray(linesArray) || linesArray.length === 0) &&
            typeof verticalLinesXState.asArray === "function"
          ) {
            linesArray = verticalLinesXState.asArray();
          }

          if (!Array.isArray(linesArray)) {
            linesArray = Array.isArray(verticalLinesXState)
              ? verticalLinesXState
              : [];
          }

          if (Array.isArray(linesArray) && linesArray.length > 0) {
            linesArray.forEach((timeValue) => {
              if (typeof timeValue === "number") {
                verticalLineTimes.push(`${timeValue.toFixed(2)} μs`);
              }
            });
            console.log("[DeltaDrawer] ✅ Got time values:", verticalLineTimes);
          }
        }
      } catch (error) {
        console.warn(
          "[DeltaDrawer] Could not extract time values:",
          error.message
        );
      }

      // Fallback to placeholders if no time values
      if (verticalLineTimes.length === 0) {
        console.warn("[DeltaDrawer] ⚠️ Using placeholder time values");
        for (let i = 0; i < verticalLinesCount; i++) {
          verticalLineTimes.push(`T${i + 1}`);
        }
      }

      // Format data with time values
      const tableData = formatTableData(
        deltaData,
        verticalLinesCount,
        verticalLineTimes
      );

      console.log(
        "[DeltaDrawer] formatTableData returned",
        tableData.length,
        "rows"
      );

      if (tableData.length === 0) {
        console.warn(
          "[DeltaDrawer] No valid table data after formatting. Input deltaData:",
          deltaData
        );
        tableContainer.innerHTML =
          '<p style="padding: 16px; color: #9ca3af; text-align: center;">No data available</p>';
        return;
      }

      // Get verticalLinesX state for subscription
      try {
        const mainModule = await import("../main.js");
        const verticalLinesXState = mainModule.verticalLinesX;

        // Store current table data for search functionality
        currentTableData = tableData;
        currentVerticalLinesCount = verticalLinesCount;

        // Create renderer and subscribe to state changes
        tableRenderer = createDeltaTableRenderer(
          tableContainer,
          verticalLinesXState
        );
        tableRenderer.render(tableData, verticalLinesCount);

        console.log(
          `[DeltaDrawer] ✅ Table rendered with ${tableData.length} rows (including time row) and ${verticalLinesCount} columns`
        );
      } catch (error) {
        console.error(
          "[DeltaDrawer] ❌ Failed to create table:",
          error.message,
          error.stack
        );
        tableContainer.innerHTML =
          '<p style="padding: 16px; color: #dc2626;">Error creating table: ' +
          error.message +
          "</p>";
      }
    },

    isOpen: () => {
      const drawer = document.getElementById("delta-drawer");
      return drawer ? !drawer.classList.contains("hidden") : isOpen;
    },

    toggle: () => {
      if (api.isOpen()) {
        api.hide();
      } else {
        api.show();
      }
    },

    /**
     * Initialize drawer - setup event listeners and resizer
     * Call this when DOM is ready
     */
    init: () => {
      setupEventListeners();
      // ✅ REMOVED: createSidebarResizer - using explicit resizeDivider from HTML instead
      // createSidebarResizer("delta-drawer-panel", "left");
      console.log("[DeltaDrawer] ✅ Initialized with event listeners (resizer from HTML)");
    },
  };

  /**
   * Register this drawer with the global sidebar store
   * Ensures only one sidebar is visible at a time
   */
  api.registerWithStore = () => {
    sidebarStore.register("delta-drawer", {
      show: api.show,
      hide: api.hide,
      isOpen: api.isOpen,
      isClosedByDefault: true,
    });
    console.log("[DeltaDrawer] Registered with sidebar store");
  };

  /**
   * Unregister this drawer from the global sidebar store
   */
  api.unregisterFromStore = () => {
    sidebarStore.unregister("delta-drawer");
    console.log("[DeltaDrawer] Unregistered from sidebar store");
  };

  return api;
}
