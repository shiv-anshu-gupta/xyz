/**
 * @file AnalysisSidebar.js
 * @module Components/Sidebars
 *
 * @description
 * <h3>Analysis & Phasor Sidebar Panel</h3>
 * 
 * <p>A slide-out sidebar component that hosts the polar/phasor diagram and analysis tools.
 * Provides a dedicated space for power system visualization alongside the main waveform charts.
 * Shares layout mechanics with DeltaDrawer using CSS variable-based responsive resizing.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>HTML-Defined Structure</td><td>DOM markup in index.html, JS handles behavior and state</td></tr>
 *   <tr><td>CSS Variable Layout</td><td>Uses --main-content-width and --sidebar-width-right for flex sizing</td></tr>
 *   <tr><td>Width Persistence</td><td>User's preferred width saved to localStorage</td></tr>
 *   <tr><td>Smooth Transitions</td><td>Transform-based animations for open/close (translate-x-0/full)</td></tr>
 *   <tr><td>Single Sidebar Policy</td><td>Registers with sidebarStore to ensure one sidebar at a time</td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>Resizable Width</strong> — 15-70% range with localStorage persistence</li>
 *   <li><strong>Keyboard Dismiss</strong> — Escape key closes the sidebar</li>
 *   <li><strong>Phasor Chart Host</strong> — Contains PolarChart component container</li>
 *   <li><strong>Coordinated Layout</strong> — Adjusts main content width via CSS variables</li>
 *   <li><strong>Store Integration</strong> — Works with sidebarStore for mutual exclusion</li>
 *   <li><strong>Smooth Animation</strong> — 320ms slide transition with pointer-events control</li>
 * </ul>
 * 
 * <h4>Layout Configuration</h4>
 * <table>
 *   <tr><th>Property</th><th>Value</th><th>Description</th></tr>
 *   <tr><td>Default Width</td><td>20%</td><td>Initial sidebar width</td></tr>
 *   <tr><td>Min Width</td><td>15%</td><td>Minimum resize limit</td></tr>
 *   <tr><td>Max Width</td><td>70%</td><td>Maximum resize limit</td></tr>
 *   <tr><td>Storage Key</td><td>analysis-sidebar-panel-width</td><td>localStorage key</td></tr>
 * </table>
 * 
 * <h4>DOM Element IDs</h4>
 * <pre>
 * #analysis-sidebar       — Outer sidebar container
 * #analysis-sidebar-panel — Inner content panel (slides in/out)
 * #analysis-sidebar-close — Close button
 * #resizeDivider          — Shared resize handle (from index.html)
 * #mainContent            — Main chart area (width adjusts)
 * </pre>
 * 
 * <h4>Lifecycle Methods</h4>
 * <ol>
 *   <li><code>init()</code> — Attach event listeners, apply saved width</li>
 *   <li><code>show()</code> — Open sidebar with animation</li>
 *   <li><code>hide()</code> — Close sidebar with animation</li>
 *   <li><code>toggle()</code> — Switch between open/closed states</li>
 *   <li><code>registerWithStore()</code> — Enable single-sidebar coordination</li>
 *   <li><code>unregisterFromStore()</code> — Cleanup on destroy</li>
 * </ol>
 * 
 * @see {@link module:components/PolarChart} - Phasor diagram component
 * @see {@link module:components/DeltaDrawer} - Companion sidebar (delta values)
 * @see {@link module:utils/sidebarStore} - Sidebar coordination store
 * 
 * @example
 * // Initialize and show sidebar
 * const analysisSidebar = createAnalysisSidebar();
 * analysisSidebar.init();
 * analysisSidebar.registerWithStore();
 * 
 * // Open sidebar
 * analysisSidebar.show();
 * 
 * // Check state
 * if (analysisSidebar.isOpen()) {
 *   console.log('Sidebar is visible');
 * }
 * 
 * // Toggle visibility
 * analysisSidebar.toggle();
 * 
 * // Cleanup
 * analysisSidebar.unregisterFromStore();
 * 
 * @mermaid
 * graph TD
 *     subgraph Initialization
 *         A[createAnalysisSidebar] --> B[Create API Object]
 *         B --> C[init called]
 *         C --> D[Read Saved Width<br/>from localStorage]
 *         D --> E[Attach Event Listeners<br/>close btn, escape, resize]
 *         E --> F[Set Initial Width to 0%]
 *     end
 *     
 *     subgraph Show_Flow
 *         G[show called] --> H[Get DOM Elements]
 *         H --> I[Read Saved Width]
 *         I --> J[Set CSS Variables<br/>--main-content-width<br/>--sidebar-width-right]
 *         J --> K[Remove hidden class]
 *         K --> L[Add sidebar-resized class]
 *         L --> M[requestAnimationFrame]
 *         M --> N[Remove translate-x-full<br/>Add translate-x-0]
 *         N --> O[Show resizeDivider]
 *         O --> P[isOpen = true]
 *     end
 *     
 *     subgraph Hide_Flow
 *         Q[hide called] --> R[isOpen = false]
 *         R --> S[Add translate-x-full<br/>Remove translate-x-0]
 *         S --> T[Reset CSS Variables<br/>to 100% / 0%]
 *         T --> U[Remove sidebar-resized class]
 *         U --> V[Hide resizeDivider]
 *         V --> W[setTimeout 320ms]
 *         W --> X[Add hidden class]
 *         X --> Y[Set width = 0%<br/>pointer-events = none]
 *     end
 *     
 *     subgraph Resize_Flow
 *         Z[User Drags Divider] --> AA[mouseup Event]
 *         AA --> AB[handleResizeCommit]
 *         AB --> AC[Calculate % Width<br/>from Pixel Width]
 *         AC --> AD[syncSidebarWidth]
 *         AD --> AE[Clamp to 15-70%]
 *         AE --> AF[Update CSS Variables]
 *         AF --> AG[storeWidth to localStorage]
 *     end
 *     
 *     subgraph Store_Integration
 *         AH[registerWithStore] --> AI[sidebarStore.register<br/>analysis-sidebar]
 *         AI --> AJ[Provide show/hide/isOpen]
 *         AK[Other Sidebar Opens] --> AL[sidebarStore Closes This]
 *     end
 *     
 *     style A fill:#4CAF50,color:white
 *     style P fill:#2196F3,color:white
 *     style Y fill:#FF9800,color:white
 */

import { sidebarStore } from "../utils/sidebarStore.js";

const SIDEBAR_ID = "analysis-sidebar";
const PANEL_ID = "analysis-sidebar-panel";
const CLOSE_BTN_ID = "analysis-sidebar-close";
const STORAGE_KEY = `${PANEL_ID}-width`;
const DEFAULT_WIDTH = 20; // Percentage width (same as delta drawer)
const MIN_WIDTH = 15;
const MAX_WIDTH = 70;

function clampWidth(width) {
  const numeric = Number(width);
  if (!Number.isFinite(numeric)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, numeric));
}

export function createAnalysisSidebar() {
  let isOpen = false;
  let listenersAttached = false;
  let panelResizeObserver = null;

  function getElements() {
    if (typeof document === "undefined") {
      return { sidebar: null, panel: null, closeBtn: null };
    }

    const sidebar = document.getElementById(SIDEBAR_ID);
    const panel = document.getElementById(PANEL_ID);
    const closeBtn = document.getElementById(CLOSE_BTN_ID);
    const divider = document.getElementById("resizeDivider");
    const mainContent = document.getElementById("mainContent");

    return { sidebar, panel, closeBtn, divider, mainContent };
  }

  function readSavedWidth() {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      return clampWidth(parseInt(stored, 10));
    } catch (error) {
      console.warn("[AnalysisSidebar] Unable to read stored width:", error);
      return null;
    }
  }

  function storeWidth(width) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(clampWidth(width)));
    } catch (error) {
      console.warn("[AnalysisSidebar] Unable to persist width:", error);
    }
  }

  function syncSidebarWidth(widthPercent) {
    const { sidebar } = getElements();
    if (!sidebar) return DEFAULT_WIDTH;

    const candidateWidth =
      Number.isFinite(widthPercent) && widthPercent > 0
        ? widthPercent
        : DEFAULT_WIDTH;
    const applied = clampWidth(candidateWidth);

    // ✅ Update BOTH CSS variables (just like delta drawer and resizeDivider)
    document.documentElement.style.setProperty(
      "--main-content-width",
      `${100 - applied}%`
    );
    document.documentElement.style.setProperty(
      "--sidebar-width-right",
      `${applied}%`
    );
    // Don't set inline style - let CSS variable handle it
    // sidebar.style.width = `${applied}%`;
    return applied;
  }

  function handleResizeCommit() {
    if (!isOpen) return;
    const { panel } = getElements();
    if (!panel) return;
    
    // Calculate percentage width from pixel width
    const panelContainer = panel.parentElement;
    if (!panelContainer) return;
    
    const panelWidthPx = panel.offsetWidth;
    const containerWidthPx = panelContainer.parentElement?.offsetWidth || window.innerWidth;
    const widthPercent = (panelWidthPx / containerWidthPx) * 100;
    
    const applied = syncSidebarWidth(widthPercent);
    storeWidth(applied);
  }

  function attachEventListeners() {
    if (listenersAttached) return;

    const { closeBtn } = getElements();

    if (closeBtn) {
      closeBtn.addEventListener("click", () => api.hide());
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen) {
        api.hide();
      }
    });

    document.addEventListener("mouseup", () => {
      handleResizeCommit();
    });

    window.addEventListener("resize", () => {
      if (isOpen) {
        handleResizeCommit();
      }
    });

    listenersAttached = true;
  }

  const api = {
    show: () => {
      console.log("[AnalysisSidebar] show() called");
      const { sidebar, panel, divider, mainContent } = getElements();

      if (!sidebar || !panel) {
        console.warn("[AnalysisSidebar] Sidebar element not found in DOM");
        return;
      }

      attachEventListeners();

      const savedWidth = readSavedWidth();
      const appliedWidth = syncSidebarWidth(savedWidth || DEFAULT_WIDTH);
      storeWidth(appliedWidth);

      // ✅ Update CSS variables to adjust flex layout (SAME AS DELTA DRAWER)
      document.documentElement.style.setProperty(
        "--main-content-width",
        `${100 - appliedWidth}%`
      );
      document.documentElement.style.setProperty(
        "--sidebar-width-right",
        `${appliedWidth}%`
      );

      // Add sidebar-resized class to apply CSS variable widths
      sidebar.classList.remove("hidden");
      sidebar.classList.add("sidebar-resized");
      mainContent.classList.add("sidebar-resized");
      sidebar.style.pointerEvents = "auto";

      // Trigger transform transition
      requestAnimationFrame(() => {
        panel.classList.remove("translate-x-full");
        panel.classList.add("translate-x-0");
      });

      if (divider) {
        divider.classList.remove("hidden");
      }

      isOpen = true;
      console.log(
        "[AnalysisSidebar] ✅ Sidebar shown with width:",
        `${appliedWidth}%`
      );
    },

    hide: () => {
      console.log("[AnalysisSidebar] hide() called");
      const { sidebar, panel, divider, mainContent } = getElements();
      if (!sidebar || !panel) return;

      isOpen = false;
      panel.classList.remove("translate-x-0");
      panel.classList.add("translate-x-full");

      // ✅ Reset CSS variables (SAME AS DELTA DRAWER)
      document.documentElement.style.setProperty(
        "--main-content-width",
        "100%"
      );
      document.documentElement.style.setProperty("--sidebar-width-right", "0%");

      // Remove resized class to clear CSS variable widths
      sidebar.classList.remove("sidebar-resized");
      mainContent.classList.remove("sidebar-resized");

      if (divider) {
        divider.classList.add("hidden");
      }

      setTimeout(() => {
        if (isOpen) return;
        sidebar.classList.add("hidden");
        sidebar.style.pointerEvents = "none";
        sidebar.style.width = "0%";
      }, 320);

      console.log("[AnalysisSidebar] ✅ Sidebar hidden with smooth transition");
    },

    isOpen: () => {
      const { sidebar } = getElements();
      return sidebar ? !sidebar.classList.contains("hidden") : isOpen;
    },

    toggle: () => {
      if (api.isOpen()) {
        api.hide();
      } else {
        api.show();
      }
    },

    init: () => {
      const { sidebar, panel } = getElements();

      if (!sidebar || !panel) {
        console.warn("[AnalysisSidebar] init() skipped - markup missing");
        return;
      }

      attachEventListeners();

      // Apply stored width for immediate visual consistency
      const savedWidth = readSavedWidth();
      const initialWidth = clampWidth(savedWidth || DEFAULT_WIDTH);
      syncSidebarWidth(initialWidth);
      sidebar.style.width = "0%";
      sidebar.style.pointerEvents = "none";

      console.log(
        "[AnalysisSidebar] ✅ Initialized with percentage-based resizing"
      );
    },

    registerWithStore: () => {
      sidebarStore.register(SIDEBAR_ID, {
        show: api.show,
        hide: api.hide,
        isOpen: api.isOpen,
        isClosedByDefault: true,
      });
      console.log("[AnalysisSidebar] Registered with sidebar store");
    },

    unregisterFromStore: () => {
      if (panelResizeObserver) {
        panelResizeObserver.disconnect();
        panelResizeObserver = null;
      }
      sidebarStore.unregister(SIDEBAR_ID);
      console.log("[AnalysisSidebar] Unregistered from sidebar store");
    },
  };

  return api;
}

export default createAnalysisSidebar;
