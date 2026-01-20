/**
 * Analysis/Phasor Sidebar Component
 * Displays phasor diagram and analysis tools in a slide-out sidebar
 * HTML structure is defined in index.html alongside the delta drawer markup
 * Uses percentage-based resizing controlled by resizeDivider in main.js
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
