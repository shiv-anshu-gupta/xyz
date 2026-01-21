/**
 * @file sidebarStore.js
 * @module Utils/DOM
 *
 * @description
 * <h3>Global Sidebar State Manager</h3>
 * 
 * <p>Manages visibility state of all sidebars/drawers to ensure only one is visible
 * at a time. Provides a centralized API for registering, showing, and hiding sidebar
 * components with mutual exclusion enforcement.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>Single Active</td><td>Only one sidebar can be visible at any time</td></tr>
 *   <tr><td>Registry Pattern</td><td>Sidebars register themselves with show/hide/isOpen methods</td></tr>
 *   <tr><td>Auto-Close</td><td>Opening one sidebar automatically closes any other open sidebar</td></tr>
 *   <tr><td>Escape Handling</td><td>Global escape key listener closes active sidebar</td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>Registration</strong> — Sidebars register with show/hide/isOpen callbacks</li>
 *   <li><strong>Mutual Exclusion</strong> — Automatically hides other sidebars when one opens</li>
 *   <li><strong>Query API</strong> — Check if any sidebar is open, get active sidebar ID</li>
 *   <li><strong>Escape Key</strong> — Global keyboard handler for closing sidebars</li>
 *   <li><strong>Debug Support</strong> — getRegisteredSidebars() for troubleshooting</li>
 * </ul>
 * 
 * @see {@link module:components/DeltaDrawer} - Delta values sidebar
 * @see {@link module:components/AnalysisSidebar} - Phasor analysis sidebar
 * 
 * @example
 * import { sidebarStore } from './sidebarStore.js';
 * 
 * // Register a sidebar
 * sidebarStore.register('delta-drawer', {
 *   show: () => drawer.show(),
 *   hide: () => drawer.hide(),
 *   isOpen: () => drawer.isOpen()
 * });
 * 
 * // Show a sidebar (auto-hides others)
 * sidebarStore.show('delta-drawer');
 * 
 * // Check active sidebar
 * if (sidebarStore.getActiveSidebar() === 'delta-drawer') {
 *   console.log('Delta drawer is active');
 * }
 * 
 * @mermaid
 * graph TD
 *     A[register sidebar] --> B[Store in Map]
 *     
 *     C[sidebarStore.show id] --> D{Is Another Open?}
 *     D -->|Yes| E[Hide Active Sidebar]
 *     E --> F[Show Requested Sidebar]
 *     D -->|No| F
 *     F --> G[Set activeSidebar = id]
 *     
 *     H[Escape Key Pressed] --> I{Any Sidebar Open?}
 *     I -->|Yes| J[Hide Active Sidebar]
 *     I -->|No| K[Do Nothing]
 *     
 *     style A fill:#4CAF50,color:white
 *     style F fill:#2196F3,color:white
 *     style J fill:#FF9800,color:white
 */

class SidebarStore {
  constructor() {
    // Map of sidebar ID to its state and control functions
    this.sidebars = new Map();
    // Currently visible sidebar ID
    this.activeSidebar = null;
  }

  /**
   * Register a sidebar/drawer with the store
   * @param {string} id - Unique identifier for the sidebar
   * @param {Object} config - Configuration object
   * @param {Function} config.show - Function to show this sidebar
   * @param {Function} config.hide - Function to hide this sidebar
   * @param {Function} config.isOpen - Function to check if sidebar is open
   * @param {boolean} config.isClosedByDefault - Whether this sidebar should be closed by default (true)
   */
  register(id, config) {
    if (!id || !config.show || !config.hide || !config.isOpen) {
      console.error("[SidebarStore] Invalid configuration for sidebar:", id);
      return false;
    }

    this.sidebars.set(id, {
      id,
      show: config.show,
      hide: config.hide,
      isOpen: config.isOpen,
      isClosedByDefault:
        config.isClosedByDefault !== undefined
          ? config.isClosedByDefault
          : true,
    });

    console.log(`[SidebarStore] Registered sidebar: ${id}`);
    return true;
  }

  /**
   * Show a specific sidebar and hide all others
   * @param {string} id - ID of the sidebar to show
   */
  show(id) {
    if (!this.sidebars.has(id)) {
      console.warn(`[SidebarStore] Sidebar not found: ${id}`);
      return false;
    }

    // Hide all sidebars except the one we want to show
    this.sidebars.forEach((sidebar) => {
      if (sidebar.id !== id && sidebar.isOpen()) {
        sidebar.hide();
        console.log(`[SidebarStore] Hiding sidebar: ${sidebar.id}`);
      }
    });

    // Show the target sidebar
    const targetSidebar = this.sidebars.get(id);
    targetSidebar.show();
    this.activeSidebar = id;

    console.log(`[SidebarStore] Showing sidebar: ${id}`);
    return true;
  }

  /**
   * Hide a specific sidebar
   * @param {string} id - ID of the sidebar to hide
   */
  hide(id) {
    if (!this.sidebars.has(id)) {
      console.warn(`[SidebarStore] Sidebar not found: ${id}`);
      return false;
    }

    const sidebar = this.sidebars.get(id);
    sidebar.hide();

    if (this.activeSidebar === id) {
      this.activeSidebar = null;
    }

    console.log(`[SidebarStore] Hidden sidebar: ${id}`);
    return true;
  }

  /**
   * Hide all sidebars
   */
  hideAll() {
    this.sidebars.forEach((sidebar) => {
      if (sidebar.isOpen()) {
        sidebar.hide();
      }
    });
    this.activeSidebar = null;
    console.log("[SidebarStore] Hidden all sidebars");
  }

  /**
   * Toggle a sidebar (show if hidden, hide if shown)
   * Automatically hides other sidebars when showing this one
   * @param {string} id - ID of the sidebar to toggle
   */
  toggle(id) {
    if (!this.sidebars.has(id)) {
      console.warn(`[SidebarStore] Sidebar not found: ${id}`);
      return false;
    }

    const sidebar = this.sidebars.get(id);
    if (sidebar.isOpen()) {
      this.hide(id);
    } else {
      this.show(id);
    }
    return true;
  }

  /**
   * Get the currently active (visible) sidebar ID
   * @returns {string|null} Active sidebar ID or null if none is visible
   */
  getActiveSidebar() {
    return this.activeSidebar;
  }

  /**
   * Check if a specific sidebar is currently open
   * @param {string} id - Sidebar ID to check
   * @returns {boolean} True if sidebar is open
   */
  isOpen(id) {
    if (!this.sidebars.has(id)) {
      return false;
    }
    return this.sidebars.get(id).isOpen();
  }

  /**
   * Initialize all registered sidebars to their default closed state
   * This should be called after all sidebars are registered
   */
  initializeDefaults() {
    this.sidebars.forEach((sidebar) => {
      if (sidebar.isClosedByDefault && sidebar.isOpen()) {
        sidebar.hide();
        console.log(`[SidebarStore] Initialized ${sidebar.id} to closed state`);
      }
    });
  }

  /**
   * Get all registered sidebar IDs
   * @returns {Array<string>} Array of sidebar IDs
   */
  getRegisteredSidebars() {
    return Array.from(this.sidebars.keys());
  }

  /**
   * Unregister a sidebar from the store
   * @param {string} id - Sidebar ID to unregister
   */
  unregister(id) {
    if (this.sidebars.has(id)) {
      this.sidebars.delete(id);
      if (this.activeSidebar === id) {
        this.activeSidebar = null;
      }
      console.log(`[SidebarStore] Unregistered sidebar: ${id}`);
      return true;
    }
    return false;
  }
}

// Global singleton instance
export const sidebarStore = new SidebarStore();

export default sidebarStore;
