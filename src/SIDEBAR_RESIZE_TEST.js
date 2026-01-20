/**
 * SIDEBAR RESIZE - CODE ONLY
 * Test the implementation directly
 */

// Import the function
import { adjustMainContent } from "./src/utils/sidebarResize.js";

// Test in browser console (F12)

// Test 1: Open left sidebar
// adjustMainContent('left', 400);

// Test 2: Open right sidebar
// adjustMainContent('right', 500);

// Test 3: Close left
// adjustMainContent('left', 0);

// Test 4: Close right
// adjustMainContent('right', 0);

// Test 5: Open both
// adjustMainContent('left', 400);
// adjustMainContent('right', 500);

// Expected:
// - Charts shift visibly (margins change)
// - Smooth 0.3s animation
// - Console shows positions
// - Chart containers resize
