/**
 * SIMPLE SIDEBAR RESIZE IMPLEMENTATION EXAMPLE
 * ============================================
 *
 * This shows how to use the simple sidebar resize mechanism
 * in your existing code. Just 3 steps per sidebar!
 */

// ============================================
// STEP 1: IMPORT THE UTILITY
// ============================================
import { adjustMainContent, getElementWidth } from "../utils/sidebarResize.js";

// ============================================
// STEP 2: WHEN OPENING A SIDEBAR (Delta, Phasor, etc)
// ============================================

/**
 * Example: Opening Delta Window (Left Sidebar)
 */
function openDeltaWindow() {
  // Your existing code to create the window...
  const deltaWin = window.open(
    "",
    "Delta Window",
    "width=400,height=600,left=0,top=0"
  );

  // ... your existing initialization code ...

  // ✅ NEW: Adjust main content for 400px sidebar
  const sidebarWidth = 400; // Match the width from window.open()
  adjustMainContent("left", sidebarWidth);
  console.log(
    `✅ Delta window opened - main content adjusted by ${sidebarWidth}px`
  );

  // ✅ NEW: Reset when window closes
  deltaWin.addEventListener("beforeunload", () => {
    adjustMainContent("left", 0); // 0 = close, reset to full width
    console.log("✅ Delta window closed - main content reset to full width");
  });

  return deltaWin;
}

/**
 * Example: Opening Phasor Diagram (Right Sidebar)
 */
function openPhasorDiagram() {
  // Your existing code to create the window...
  const phasorWin = window.open(
    "",
    "Phasor Diagram",
    "width=500,height=600,right=0,top=0"
  );

  // ... your existing initialization code ...

  // ✅ NEW: Adjust main content for 500px sidebar (RIGHT side)
  const sidebarWidth = 500; // Match the width from window.open()
  adjustMainContent("right", sidebarWidth);
  console.log(
    `✅ Phasor window opened - main content adjusted by ${sidebarWidth}px (right)`
  );

  // ✅ NEW: Reset when window closes
  phasorWin.addEventListener("beforeunload", () => {
    adjustMainContent("right", 0); // 0 = close, reset to full width
    console.log("✅ Phasor window closed - main content reset to full width");
  });

  return phasorWin;
}

/**
 * Example: Opening Analysis Drawer (Left Sidebar)
 */
function openAnalysisDrawer() {
  const drawer = document.getElementById("analysis-drawer");

  // Show drawer
  drawer.style.display = "block";

  // ✅ NEW: Get actual drawer width and adjust main content
  const drawerWidth = drawer.offsetWidth; // e.g., 350px
  adjustMainContent("left", drawerWidth);
  console.log(
    `✅ Analysis drawer opened - main content adjusted by ${drawerWidth}px`
  );
}

/**
 * Example: Closing Analysis Drawer
 */
function closeAnalysisDrawer() {
  const drawer = document.getElementById("analysis-drawer");

  // Hide drawer
  drawer.style.display = "none";

  // ✅ NEW: Reset main content to full width
  adjustMainContent("left", 0);
  console.log("✅ Analysis drawer closed - main content reset to full width");
}

/**
 * Example: Opening BOTH sidebars simultaneously
 * Charts will fit in the space between them!
 */
function openBothSidebars() {
  // Open delta window on left (400px)
  const deltaWin = window.open(
    "",
    "Delta Window",
    "width=400,height=600,left=0,top=0"
  );
  adjustMainContent("left", 400);

  // Open phasor window on right (500px)
  const phasorWin = window.open(
    "",
    "Phasor Diagram",
    "width=500,height=600,right=0,top=0"
  );
  adjustMainContent("right", 500);

  // Charts now fit in the middle!
  // margin-left: 400px + margin-right: 500px = available space
  console.log("✅ Both sidebars open - charts fit in the middle");

  // When either window closes
  deltaWin.addEventListener("beforeunload", () => {
    adjustMainContent("left", 0);
  });

  phasorWin.addEventListener("beforeunload", () => {
    adjustMainContent("right", 0);
  });
}

// ============================================
// INTEGRATION INTO YOUR EXISTING CODE
// ============================================

/**
 * Add these imports to your src/main.js:
 */
// import { adjustMainContent } from './utils/sidebarResize.js';

/**
 * Find your existing button click handlers and add the adjustment:
 */

// Example: Your existing Delta button handler
/*
const deltaBtn = document.getElementById('delta-btn');
if (deltaBtn) {
  deltaBtn.addEventListener('click', () => {
    // Your existing delta window creation code...
    openDeltaWindow();
  });
}
*/

// Example: Your existing Phasor button handler
/*
const phasorBtn = document.getElementById('phasor-btn');
if (phasorBtn) {
  phasorBtn.addEventListener('click', () => {
    // Your existing phasor window creation code...
    openPhasorDiagram();
  });
}
*/

// Example: Your existing Analysis drawer toggle
/*
const analysisBtnToggle = document.getElementById('analysis-toggle');
if (analysisBtnToggle) {
  analysisBtnToggle.addEventListener('click', () => {
    const drawer = document.getElementById('analysis-drawer');
    if (drawer.style.display === 'none') {
      openAnalysisDrawer();
    } else {
      closeAnalysisDrawer();
    }
  });
}
*/

// ============================================
// HOW IT WORKS (Visual)
// ============================================

/*
BEFORE (Full Width):
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    MAIN CHARTS (100%)                   │
│                                                         │
└─────────────────────────────────────────────────────────┘

AFTER (Delta Window Opens - 400px left):
┌──────────────┬───────────────────────────────────────────┐
│              │                                           │
│  Delta (400) │      MAIN CHARTS (~calc(100% - 400px))   │
│              │                                           │
└──────────────┴───────────────────────────────────────────┘

AFTER (Phasor Window Opens - 500px right):
┌──────────────────────────────────────────────┬─────────────┐
│                                              │             │
│       MAIN CHARTS (~calc(100% - 500px))     │  Phasor     │
│                                              │  (500px)    │
└──────────────────────────────────────────────┴─────────────┘

BOTH OPEN:
┌──────────────┬──────────────────────────┬─────────────┐
│              │                          │             │
│  Delta (400) │  MAIN CHARTS (middle)   │  Phasor     │
│              │                          │  (500px)    │
└──────────────┴──────────────────────────┴─────────────┘
*/

// ============================================
// WHAT THE UTILITY DOES AUTOMATICALLY
// ============================================

/*
1. Sets margin-left or margin-right on #main-content or #charts
2. Smooth CSS transition (0.3s) for visual appeal
3. Waits for transition to complete (350ms)
4. Resizes ALL charts to fit new container size:
   - window.charts (main analog/digital charts)
   - window.__chartsComputed (computed channel charts)
   - Uses chart.setSize() to update uPlot dimensions
5. Logs progress for debugging
*/

// ============================================
// TESTING
// ============================================

/*
1. Open Developer Tools (F12)
2. Go to Console
3. Copy-paste one of these commands:

// Test: Open Delta window (left)
openDeltaWindow();

// Test: Open Phasor window (right)
openPhasorDiagram();

// Test: Open both
openBothSidebars();

// Test: Close all
adjustMainContent('left', 0);
adjustMainContent('right', 0);

// You should see:
✅ Delta window opened - main content adjusted by 400px
✅ Delta window closed - main content reset to full width
✅ Charts resized
*/

export {
  openDeltaWindow,
  openPhasorDiagram,
  openAnalysisDrawer,
  closeAnalysisDrawer,
  openBothSidebars,
};
