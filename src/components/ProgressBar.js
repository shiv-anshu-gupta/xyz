// src/components/ProgressBar.js
/**
 * Progress Bar Component
 * Displays computation progress for worker operations
 */

import { createState } from "./createState.js";
import { createCustomElement } from "../utils/helpers.js";

// Global progress state
export const progressState = createState({
  visible: false,
  percent: 0,
  message: "Processing...",
});

/**
 * Create and return a progress bar element
 * @returns {HTMLElement} Progress bar container
 */
export function createProgressBar() {
  const container = createCustomElement("div", "progress-bar-container");
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: transparent;
    z-index: 1000;
    padding: 0;
    margin: 0;
  `;

  const progressBar = createCustomElement("div", "progress-fill");
  progressBar.style.cssText = `
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, #4f46e5, #7c3aed);
    transition: width 0.3s ease-out;
    box-shadow: 0 0 8px rgba(99, 102, 241, 0.6);
    opacity: 0;
  `;

  container.appendChild(progressBar);

  // Subscribe to progress state changes - check by property name
  progressState.subscribe((change) => {
    const propName = Array.isArray(change.path) ? change.path[0] : change.prop;

    // Handle visible property change
    if (propName === "visible" || change.newValue !== undefined) {
      if (progressState.visible && progressState.percent > 0) {
        progressBar.style.opacity = "1";
      } else if (!progressState.visible) {
        progressBar.style.opacity = "0";
        progressBar.style.width = "0%";
      }
    }

    // Handle percent property change
    if (propName === "percent") {
      const percent = Math.min(100, Math.max(0, progressState.percent));
      progressBar.style.width = `${percent}%`;
      progressBar.style.opacity = percent > 0 ? "1" : "0";
    }
  });

  return container;
}

/**
 * Show progress bar with initial percentage
 * @param {number} percent - Progress percentage (0-100)
 * @param {string} message - Optional message to display
 */
export function showProgress(percent = 0, message = "Processing...") {
  progressState.visible = true;
  progressState.percent = percent;
  progressState.message = message;
}

/**
 * Update progress percentage
 * @param {number} percent - Progress percentage (0-100)
 * @param {string} message - Optional message to display
 */
export function updateProgress(percent = 0, message = null) {
  if (progressState.visible) {
    progressState.percent = Math.min(100, percent);
    if (message) {
      progressState.message = message;
    }
  }
}

/**
 * Hide progress bar
 */
export function hideProgress() {
  progressState.visible = false;
  progressState.percent = 0;
}
