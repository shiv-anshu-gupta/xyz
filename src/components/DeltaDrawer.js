/**
 * Delta Display Drawer Component
 * Shows detailed crosshair values in a slide-out drawer (sidebar)
 * Uses plain HTML table with createState subscriptions for auto-updates
 *
 * HTML structure is pre-built in index.html
 * This file only handles styling and behavior
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
