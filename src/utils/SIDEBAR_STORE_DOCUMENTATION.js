/**
 * SIDEBAR/DRAWER GLOBAL STORE SYSTEM
 *
 * This document explains how to use the global sidebar management system
 * to ensure only one sidebar/drawer is visible at a time.
 */

// ============================================================================
// OVERVIEW
// ============================================================================

/*
  The SidebarStore is a centralized state management system for all sidebars
  and drawers in the application. It ensures that:
  
  1. Only ONE sidebar/drawer is visible at any given time
  2. When showing a sidebar, all others are automatically hidden
  3. Sidebars can have default closed/open states
  4. Easy API for show/hide/toggle operations
*/

// ============================================================================
// REGISTERED SIDEBARS
// ============================================================================

/*
  Current registered sidebars:
  
  1. "analysis-sidebar" (Phasor Diagram Analysis)
     - Location: Left sidebar in main layout
     - Default state: CLOSED
     - Contains: Phasor diagram visualization
  
  2. "delta-drawer"
     - Location: Right-side slide-out drawer
     - Default state: CLOSED
     - Contains: crosshair data between vertical lines
*/

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

import { sidebarStore } from "./utils/sidebarStore.js";

// --- EXAMPLE 1: Show a specific sidebar ---
sidebarStore.show("analysis-sidebar");
// Result: Analysis sidebar opens, delta-drawer hides automatically

// --- EXAMPLE 2: Hide a sidebar ---
sidebarStore.hide("delta-drawer");
// Result: Delta drawer closes

// --- EXAMPLE 3: Toggle a sidebar ---
sidebarStore.toggle("analysis-sidebar");
// Result: If open, closes it. If closed, opens it and hides others.

// --- EXAMPLE 4: Get currently visible sidebar ---
const active = sidebarStore.getActiveSidebar();
console.log("Currently visible:", active); // Outputs: "analysis-sidebar", "delta-drawer", or null

// --- EXAMPLE 5: Check if specific sidebar is open ---
if (sidebarStore.isOpen("delta-drawer")) {
  console.log("Delta drawer is currently visible");
}

// --- EXAMPLE 6: Hide all sidebars ---
sidebarStore.hideAll();
// Result: All sidebars close

// --- EXAMPLE 7: Get list of all registered sidebars ---
const allSidebars = sidebarStore.getRegisteredSidebars();
console.log("Available sidebars:", allSidebars);
// Outputs: ["analysis-sidebar", "delta-drawer"]

// ============================================================================
// REGISTERING A NEW SIDEBAR
// ============================================================================

import { sidebarStore } from "./utils/sidebarStore.js";

const mySidebar = document.getElementById("my-sidebar");
const myToggleBtn = document.getElementById("my-toggle-btn");

// Define control functions
const showMySidebar = () => {
  mySidebar.style.display = "flex";
  myToggleBtn.style.display = "none";
};

const hideMySidebar = () => {
  mySidebar.style.display = "none";
  myToggleBtn.style.display = "flex";
};

const isMyDrawerOpen = () => {
  return mySidebar.style.display !== "none";
};

// Register the sidebar
sidebarStore.register("my-sidebar", {
  show: showMySidebar,
  hide: hideMySidebar,
  isOpen: isMyDrawerOpen,
  isClosedByDefault: true, // Start closed by default
});

// Now your sidebar is part of the system!
// Clicking other sidebar buttons will auto-hide your sidebar

// ============================================================================
// API REFERENCE
// ============================================================================

/*
  sidebarStore.register(id, config)
  ├─ Description: Register a new sidebar with the store
  ├─ Parameters:
  │  ├─ id (string): Unique identifier for the sidebar
  │  └─ config (object):
  │     ├─ show (function): Called to show the sidebar
  │     ├─ hide (function): Called to hide the sidebar
  │     ├─ isOpen (function): Returns true if sidebar is visible
  │     └─ isClosedByDefault (boolean): If true, starts closed
  └─ Returns: true if successful, false if invalid config

  sidebarStore.show(id)
  ├─ Description: Show sidebar and hide all others
  ├─ Parameters:
  │  └─ id (string): ID of sidebar to show
  └─ Returns: true if successful, false if not found

  sidebarStore.hide(id)
  ├─ Description: Hide a specific sidebar
  ├─ Parameters:
  │  └─ id (string): ID of sidebar to hide
  └─ Returns: true if successful, false if not found

  sidebarStore.hideAll()
  ├─ Description: Hide all registered sidebars
  └─ Returns: void

  sidebarStore.toggle(id)
  ├─ Description: Show if hidden, hide if shown
  ├─ Parameters:
  │  └─ id (string): ID of sidebar to toggle
  └─ Returns: true if successful, false if not found

  sidebarStore.getActiveSidebar()
  ├─ Description: Get ID of currently visible sidebar
  └─ Returns: string (sidebar ID) or null (none visible)

  sidebarStore.isOpen(id)
  ├─ Description: Check if specific sidebar is visible
  ├─ Parameters:
  │  └─ id (string): ID of sidebar to check
  └─ Returns: true if visible, false otherwise

  sidebarStore.getRegisteredSidebars()
  ├─ Description: Get all registered sidebar IDs
  └─ Returns: array of sidebar IDs

  sidebarStore.unregister(id)
  ├─ Description: Remove sidebar from store
  ├─ Parameters:
  │  └─ id (string): ID of sidebar to unregister
  └─ Returns: true if successful, false if not found

  sidebarStore.initializeDefaults()
  ├─ Description: Close all sidebars marked with isClosedByDefault
  ├─ Note: Called automatically on app startup
  └─ Returns: void
*/

// ============================================================================
// IMPLEMENTATION DETAILS
// ============================================================================

/*
  HOW IT WORKS:
  
  1. Application startup:
     - initSidebarSystem() is called in main.js
     - Registers both "analysis-sidebar" and "delta-drawer"
     - Both have isClosedByDefault: true
     - initializeDefaults() closes all marked sidebars
     - Result: User sees clean interface, all sidebars hidden
  
  2. User clicks to show a sidebar:
     - sidebarStore.show('analysis-sidebar') is called
     - Store loops through ALL sidebars
     - Any open sidebar gets hidden automatically
     - Target sidebar is shown
     - activeSidebar is updated to 'analysis-sidebar'
  
  3. User clicks to show another sidebar:
     - sidebarStore.show('delta-drawer') is called
     - 'analysis-sidebar' is detected as open and gets hidden
     - 'delta-drawer' is shown
     - activeSidebar is updated to 'delta-drawer'
  
  4. User closes a sidebar:
     - sidebarStore.hide('delta-drawer') is called
     - 'delta-drawer' is hidden
     - activeSidebar is set to null
     - No other sidebars are affected
*/

// ============================================================================
// FILE LOCATIONS
// ============================================================================

/*
  Core Files:
  
  1. /src/utils/sidebarStore.js
     - The SidebarStore class definition
     - All state management logic
     - Exported as sidebarStore singleton
  
  2. /src/main.js
     - initSidebarSystem() function
     - Registers "analysis-sidebar"
     - Calls deltaWindow.registerWithStore()
     - Calls initializeDefaults()
  
  3. /src/components/DeltaDrawer.js
     - deltaWindow.registerWithStore() method
     - Registers "delta-drawer" with the store
     - Located in the return object
  
  4. Documentation: See THIS FILE for API reference
*/

// ============================================================================
// CONSOLE LOGGING
// ============================================================================

/*
  The system logs all actions to browser console for debugging:
  
  [SidebarStore] Registered sidebar: analysis-sidebar
  [SidebarStore] Registered sidebar: delta-drawer
  [SidebarStore] Hiding sidebar: analysis-sidebar
  [SidebarStore] Showing sidebar: delta-drawer
  [SidebarRegistry] Sidebar registry initialized. Active sidebars: ["analysis-sidebar", "delta-drawer"]
  
  Use browser DevTools (F12) -> Console tab to see these messages
*/

// ============================================================================
// BEST PRACTICES
// ============================================================================

/*
  ✅ DO:
  
  1. Always register sidebars early in application lifecycle
  2. Use isClosedByDefault: true for non-essential sidebars
  3. Call sidebarStore.show() instead of manually toggling divs
  4. Let the store handle show/hide logic - don't manage visibility separately
  5. Use consistent sidebar IDs (kebab-case recommended)
  
  ❌ DON'T:
  
  1. Don't manually toggle sidebar display without using the store
  2. Don't call show() on multiple sidebars expecting both to stay open
  3. Don't hardcode sidebar visibility states outside the store
  4. Don't forget to provide all three functions in registration (show/hide/isOpen)
  5. Don't unregister sidebars unless you plan to remove them permanently
*/

// ============================================================================
// TROUBLESHOOTING
// ============================================================================

/*
  Problem: Sidebar doesn't appear when I call show()
  Solution: Check that show() function is actually changing display/visibility
  
  Problem: Both sidebars are visible at the same time
  Solution: Make sure you're using sidebarStore.show() not direct DOM manipulation
  
  Problem: Sidebar disappears when I call show() on another one
  Solution: This is expected behavior! Only one can be visible. Use sidebarStore.toggle()
  
  Problem: Functions not found in sidebarStore
  Solution: Make sure you imported: import { sidebarStore } from './utils/sidebarStore.js'
  
  Problem: Sidebar opens by default when I want it closed
  Solution: Set isClosedByDefault: true and make sure initializeDefaults() is called
*/

// ============================================================================
// FUTURE ENHANCEMENTS
// ============================================================================

/*
  Possible improvements:
  
  1. Add animations/transitions between sidebar switches
  2. Add localStorage persistence for user's sidebar preferences
  3. Add event emitters for sidebar state changes
  4. Add sidebar width/size management
  5. Add keyboard shortcuts to switch between sidebars
  6. Add sidebar order/stacking management
  7. Add responsive behavior for mobile
  8. Add sidebar panel grouping (can have 2 sidebars if not conflicting)
*/

export {}; // This is a documentation file
