/**
 * @module domUpdateQueueInit
 * @description
 * Initializes the global DOM update queue and makes it available to createState.
 * Call this once at app startup to enable selectiveUpdate feature in bindToDOM.
 *
 * @example
 * import { initGlobalDOMUpdateQueue } from './utils/domUpdateQueueInit.js';
 *
 * // Call this early in your app initialization
 * initGlobalDOMUpdateQueue();
 *
 * // Now you can use selectiveUpdate in bindToDOM
 * state.bindToDOM('prop', el, { selectiveUpdate: true });
 */

import {
  getGlobalDOMUpdateQueue,
  destroyGlobalDOMUpdateQueue,
} from "./domUpdateQueue.js";

/**
 * Initialize the global DOM update queue
 * Attach it to window so createState.js can access it
 */
export function initGlobalDOMUpdateQueue() {
  const queue = getGlobalDOMUpdateQueue();
  window._domUpdateQueue = queue;
  console.debug("[domUpdateQueueInit] Global DOM update queue initialized");
  return queue;
}

/**
 * Cleanup and destroy the global queue
 * Call this on app shutdown to prevent memory leaks
 */
export function cleanupGlobalDOMUpdateQueue() {
  if (window._domUpdateQueue) {
    window._domUpdateQueue.destroy();
    window._domUpdateQueue = null;
    console.debug("[domUpdateQueueInit] Global DOM update queue destroyed");
  }
  destroyGlobalDOMUpdateQueue();
}

/**
 * Get the currently initialized global queue
 * Returns null if not yet initialized
 */
export function getInitializedQueue() {
  return window._domUpdateQueue || null;
}

// Automatic cleanup on page unload to prevent memory leaks
if (typeof window !== "undefined") {
  // Listen for page unload/navigation
  window.addEventListener("beforeunload", () => {
    cleanupGlobalDOMUpdateQueue();
  });

  // Also cleanup on visibility change to hidden
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && window._domUpdateQueue) {
      // Flush any pending updates before hiding
      const queue = window._domUpdateQueue;
      if (queue.flush) {
        queue.flush();
      }
    }
  });
}
