/**
 * @file maxYAxesStore.js - Global Y-Axes Count State Management
 * @module maxYAxesStore
 * @category Architecture / Functional Approach
 * @since 2.0.0
 *
 * @description
 * Centralized reactive state store for managing the number of Y-axes across all chart types.
 * Implements a "single source of truth" pattern similar to React Context API.
 *
 * **Role in Multi-Y-Axes Architecture:**
 * ```
 * Group Change Event
 *     ↓
 * analyzeGroupsAndPublish() calculates maxYAxes
 *     ↓
 * setMaxYAxes() publishes to this store
 *     ↓
 * renderAnalogCharts, renderDigitalCharts, renderComputedChannels
 * all read from getMaxYAxes() and update axes count
 * ```
 *
 * **Why Not Subscriptions?**
 * Uses createState (reactive object) instead of .subscribe() callbacks to avoid:
 * - Memory leaks from forgotten unsubscribes
 * - Callback chains that are hard to debug
 * - Global event listeners that accumulate
 *
 * Instead, each component simply calls getMaxYAxes() when building charts.
 *
 * @example
 * // In a chart rendering function
 * import { getMaxYAxes } from '../utils/maxYAxesStore.js';
 *
 * const maxYAxes = getMaxYAxes(); // Get current value (1, 2, 3, etc.)
 * const opts = createChartOptions({
 *   maxYAxes: maxYAxes,
 *   // ... other options
 * });
 *
 * @example
 * // In a group change handler
 * import { setMaxYAxes } from '../utils/maxYAxesStore.js';
 *
 * // After analyzing groups and calculating required axes
 * setMaxYAxes(2); // Publish new value
 * // Charts automatically use this when they next render/update
 */

import { createState } from "../components/createState.js";

// Private: Global state object
const maxYAxesState = createState({
  maxYAxes: 1, // Default: all charts show 1 y-axis by default
});

/**
 * Get current maxYAxes value from global store
 *
 * @function getMaxYAxes
 * @category State Accessors
 * @returns {number} Current maxYAxes count (1, 2, 3, etc.)
 *
 * @example
 * const axes = getMaxYAxes();
 * console.log(axes); // 1, 2, or higher
 */
export function getMaxYAxes() {
  return maxYAxesState.maxYAxes;
}

/**
 * Set maxYAxes value in global store (publish new state)
 *
 * @function setMaxYAxes
 * @category State Mutators
 * @param {number} value - New maxYAxes count (must be >= 1)
 * @returns {void}
 * @throws {void} Does not throw, but logs warning if value is invalid
 *
 * @example
 * setMaxYAxes(2); // All charts will now use 2 Y-axes
 * console.log(getMaxYAxes()); // Outputs: 2
 */
export function setMaxYAxes(value) {
  if (typeof value === "number" && value >= 1) {
    maxYAxesState.maxYAxes = value;
    console.log(`[maxYAxesStore] 📊 Published maxYAxes: ${value}`);
  } else {
    console.warn(`[maxYAxesStore] ⚠️ Invalid maxYAxes value:`, value);
  }
}

/**
 * Get the internal reactive state object for advanced subscriptions
 *
 * @function getMaxYAxesState
 * @category Advanced / Internal
 * @returns {Object} The createState object with reactive properties
 *
 * @description
 * WARNING: Only use this if you need reactive subscriptions.
 * Remember to unsubscribe to avoid memory leaks!
 *
 * The returned object's properties update reactively whenever setMaxYAxes() is called.
 * You can subscribe to changes like:
 * ```javascript
 * const unsub = getMaxYAxesState().subscribe(() => {
 *   console.log('maxYAxes changed to:', getMaxYAxes());
 * });
 * // When done, call unsub() to clean up
 * ```
 *
 * @example
 * const state = getMaxYAxesState();
 * // Now state.maxYAxes === getMaxYAxes()
 */
export function getMaxYAxesState() {
  return maxYAxesState;
}

/**
 * Reset maxYAxes to default value (1)
 *
 * @function resetMaxYAxes
 * @category State Mutators
 * @returns {void}
 *
 * @example
 * resetMaxYAxes(); // Back to 1 Y-axis for all charts
 */
export function resetMaxYAxes() {
  maxYAxesState.maxYAxes = 1;
  console.log(`[maxYAxesStore] 🔄 Reset maxYAxes to default: 1`);
}
