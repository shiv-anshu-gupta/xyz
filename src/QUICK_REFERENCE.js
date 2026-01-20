/**
 * QUICK REFERENCE: Vertical Line Interpolation & Delta Display
 *
 * WHAT WAS BUILT:
 * ===============
 * 1. verticalLinePlugin - Draws draggable vertical lines with interpolation
 * 2. deltaBoxPlugin - Displays delta time and value differences
 * 3. calculateDeltas - Core delta calculation logic
 * 4. getInterpolatedValue - Linear interpolation for different sampling rates
 *
 *
 * HOW IT WORKS:
 * =============
 *
 * When you drag a vertical line:
 *   1. Vertical line draws at the exact X position
 *   2. For each series, Y value is interpolated (not just nearest point)
 *   3. Crosshair points show interpolated values
 *   4. calculateDeltas() automatically runs
 *   5. Delta results render in #fixed-results element
 *   6. Delta box overlay shows delta time and value changes
 *   7. All linked charts update simultaneously
 *
 *
 * KEY FILES:
 * ==========
 *
 * Core Implementation:
 * - src/plugins/verticalLinePlugin.js      (265 lines)
 * - src/plugins/deltaBoxPlugin.js           (95 lines)
 * - src/utils/calculateDeltas.js            (100 lines)
 *
 * Integration Points:
 * - src/components/renderAnalogCharts.js    (lines 158-159)
 * - src/components/renderComputedChannels.js (lines 254-255)
 * - src/components/renderDigitalCharts.js   (line 148)
 *
 * State:
 * - src/main.js (line 79): export const verticalLinesX = createState([])
 *
 * DOM:
 * - index.html (line 290): <section id="fixed-results">
 *
 *
 * USAGE EXAMPLES:
 * ===============
 *
 * Basic Usage:
 * -----------
 * import { verticalLinesX } from "./main.js";
 *
 * // Add a vertical line at X = 2.5
 * verticalLinesX.value = [2.5];
 *
 * // Add another line
 * verticalLinesX.value = [2.5, 4.0];
 *
 * // When plugin is initialized, deltas auto-calculate
 *
 *
 * Advanced Usage with Custom Options:
 * -----------------------------------
 * import verticalLinePlugin from "./plugins/verticalLinePlugin.js";
 *
 * const plugin = verticalLinePlugin(verticalLinesX, () => [chart1, chart2], {
 *   lineColors: ["#ff0000", "#00ff00"],
 *   lineWidth: 3,
 *   pointRadius: 7,
 *   labelFormatter: (color) => `T${color.split("#")[1]}`
 * });
 *
 *
 * INTERPOLATION DETAILS:
 * ======================
 *
 * Linear Formula:
 * ---------------
 * For vertical line at X position that falls between data points:
 *
 *   y = y1 + (y2 - y1) * (X - x1) / (x2 - x1)
 *
 * Where:
 *   (x1, y1) = point before vertical line
 *   (x2, y2) = point after vertical line
 *   X = vertical line X position
 *   y = interpolated value
 *
 * Works with Different Sampling Rates:
 * -----------------------------------
 * If signal 1 samples at 100 Hz and signal 2 at 50 Hz:
 *   - Signal 1: [0, 0.01, 0.02, 0.03, ...]
 *   - Signal 2: [0, 0.02, 0.04, 0.06, ...]
 *
 * Vertical line at X = 0.015 interpolates:
 *   - Signal 1: Exact point exists
 *   - Signal 2: Interpolates between 0.01 and 0.02 samples
 *
 *
 * DELTA CALCULATIONS:
 * ===================
 *
 * Between two vertical lines at X1 and X2:
 *
 *   Δt = X2 - X1 (time difference)
 *   ΔY = Y2(X2) - Y2(X1) (value difference for each signal)
 *   % change = (ΔY / |Y1|) * 100
 *
 * Example Output:
 * ---------------
 * Signal A
 * V1: 20.00 → V2: 40.00
 * ΔY: 20.00 (100.0%)
 *
 * Signal B
 * V1: 110.00 → V2: 130.00
 * ΔY: 20.00 (18.2%)
 *
 *
 * STATE SUBSCRIPTION:
 * ===================
 *
 * Subscribe to vertical line changes:
 * ----------------------------------
 * import { verticalLinesX } from "./main.js";
 *
 * verticalLinesX.subscribe((newLines) => {
 *   console.log("Vertical lines updated to:", newLines);
 *   // Automatically triggers plugin redraws
 * });
 *
 *
 * MULTI-CHART SYNC:
 * =================
 *
 * Dragging a line on one chart updates all linked charts:
 *
 * const getCharts = () => [analogChart, computedChart, digitalChart];
 *
 * verticalLinePlugin(verticalLinesX, getCharts)
 *
 * Now dragging works on any chart and updates all others!
 *
 *
 * EVENT HANDLING:
 * ===============
 *
 * Mouse Events Handled:
 * - mousedown: Start drag on vertical line
 * - mousemove: Update line position during drag
 * - mouseup: End drag, finalize position
 * - mouseover: Change cursor to ew-resize near line
 *
 * Chart Hooks:
 * - init: Create overlay delta box
 * - draw: Draw vertical lines and crosshairs
 * - setSelect: Update delta box on selection
 * - destroy: Cleanup event listeners
 *
 *
 * TESTING:
 * ========
 *
 * Test Files Created:
 * - src/plugins/verticalLinePlugin.test.js (12 tests)
 * - src/utils/calculateDeltas.test.js (13 tests)
 * - src/plugins/deltaBoxPlugin.test.js (14 tests)
 *
 * Coverage:
 * ✓ Interpolation accuracy
 * ✓ Delta calculations
 * ✓ Multi-chart sync
 * ✓ Error handling
 * ✓ UI updates
 * ✓ Different sampling rates
 * ✓ Missing data handling
 *
 *
 * PERFORMANCE:
 * =============
 *
 * Time Complexity:
 * - getNearestIndex: O(n) linear scan
 * - Interpolation: O(1) constant time
 * - Delta calculation: O(m*n) where m=lines, n=series
 * - Canvas drawing: O(m*n) with optimization
 *
 * Optimizations:
 * - Event listener cleanup on chart destroy
 * - Single DOM update per delta calculation
 * - Efficient canvas context operations
 * - State-based reactivity (no polling)
 *
 *
 * TROUBLESHOOTING:
 * ================
 *
 * Delta results not showing?
 * - Check #fixed-results element exists in DOM
 * - Verify verticalLinesX has at least 2 lines
 * - Check console for error messages
 *
 * Lines not dragging?
 * - Verify chart overlay is not blocked by other elements
 * - Check mouse position calculations in event handlers
 * - Ensure getNearestIndex works correctly
 *
 * Interpolation not working?
 * - Verify data arrays have at least 2 points
 * - Check X-axis data is sorted
 * - Ensure Y data contains only numbers
 *
 * Multi-chart sync not working?
 * - Verify getCharts callback returns correct array
 * - Check all charts have correct data structure
 * - Ensure plugins registered on all charts
 *
 *
 * NEXT STEPS / FUTURE ENHANCEMENTS:
 * ==================================
 *
 * Could add:
 * - Keyboard shortcuts to add/remove lines
 * - Snap-to-grid functionality for line positioning
 * - Custom interpolation methods (spline, etc.)
 * - Delta history/logging
 * - Export delta data to CSV
 * - Derivative calculations (slope between lines)
 * - Correlation analysis between signals
 * - Phase difference calculations
 *
 * =============================================================================
 */

export const QUICK_REFERENCE = true;
