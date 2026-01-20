/**
 * @file eventListenerManager.js - Utilities for managing event listeners with cleanup
 * @module eventListenerManager
 * @description
 * Helper utilities to attach and track event listeners for proper cleanup
 * when charts are destroyed. Prevents memory leaks from accumulated listeners.
 */

/**
 * Attach an event listener and store reference for cleanup
 * @param {HTMLElement} element - Element to attach listener to
 * @param {string} event - Event name (e.g., "click", "mousemove")
 * @param {Function} handler - Event handler function
 * @param {uPlot} chart - Chart instance to store listener reference on
 */
export function attachListenerWithCleanup(element, event, handler, chart) {
  if (!element || !chart) return;

  element.addEventListener(event, handler);

  // Initialize storage if needed
  if (!Array.isArray(chart._eventListeners)) {
    chart._eventListeners = [];
  }

  // Store reference for later cleanup
  chart._eventListeners.push({ element, event, handler });
}

/**
 * Remove all stored event listeners from a chart
 * @param {uPlot} chart - Chart instance
 */
export function removeAllListeners(chart) {
  if (!Array.isArray(chart._eventListeners)) return;

  chart._eventListeners.forEach(({ element, event, handler }) => {
    if (element && typeof element.removeEventListener === "function") {
      element.removeEventListener(event, handler);
    }
  });

  chart._eventListeners = [];
}
