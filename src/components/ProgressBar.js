/**
 * @file ProgressBar.js
 * @module Components/UI
 *
 * @description
 * <h3>Progress Indicator Component</h3>
 * 
 * <p>A lightweight, fixed-position progress bar that displays computation progress
 * for Web Worker operations such as COMTRADE file parsing, computed channel 
 * evaluation, and data processing tasks.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>Reactive State</td><td>Uses createState for automatic UI updates on property changes</td></tr>
 *   <tr><td>Non-Blocking</td><td>Fixed position at top of viewport, doesn't affect page layout</td></tr>
 *   <tr><td>Smooth Animation</td><td>CSS transitions for width changes (0.3s ease-out)</td></tr>
 *   <tr><td>Gradient Styling</td><td>Purple gradient with glow effect for visual prominence</td></tr>
 *   <tr><td>Zero Config</td><td>Self-contained styling via inline CSS</td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>Global State</strong> — Exported progressState accessible from any module</li>
 *   <li><strong>Auto-Hide</strong> — Fades out when visible=false or percent=0</li>
 *   <li><strong>Percentage Clamping</strong> — Values automatically clamped to 0-100 range</li>
 *   <li><strong>Message Support</strong> — Optional status message for detailed feedback</li>
 *   <li><strong>Glow Effect</strong> — Box shadow creates illuminated appearance</li>
 * </ul>
 * 
 * <h4>State Properties</h4>
 * <table>
 *   <tr><th>Property</th><th>Type</th><th>Default</th><th>Description</th></tr>
 *   <tr><td>visible</td><td>boolean</td><td>false</td><td>Controls opacity (1 or 0)</td></tr>
 *   <tr><td>percent</td><td>number</td><td>0</td><td>Progress value 0-100</td></tr>
 *   <tr><td>message</td><td>string</td><td>"Processing..."</td><td>Status text</td></tr>
 * </table>
 * 
 * <h4>Usage Pattern</h4>
 * <ol>
 *   <li>Import and call createProgressBar() to get DOM element</li>
 *   <li>Append element to document.body</li>
 *   <li>Call showProgress(percent, message) to display</li>
 *   <li>Call updateProgress(percent) during operation</li>
 *   <li>Call hideProgress() when complete</li>
 * </ol>
 * 
 * @see {@link module:components/createState} - Reactive state management
 * @see {@link module:workers/comtradeWorker} - File parsing worker
 * 
 * @example
 * // Setup progress bar
 * import { createProgressBar, showProgress, updateProgress, hideProgress } from './ProgressBar.js';
 * 
 * document.body.appendChild(createProgressBar());
 * 
 * // Show during file parsing
 * showProgress(0, "Loading COMTRADE file...");
 * 
 * // Update from worker progress events
 * worker.onmessage = (e) => {
 *   if (e.data.type === 'progress') {
 *     updateProgress(e.data.percent, e.data.message);
 *   }
 *   if (e.data.type === 'complete') {
 *     hideProgress();
 *   }
 * };
 * 
 * @example
 * // Direct state manipulation
 * import { progressState } from './ProgressBar.js';
 * 
 * progressState.visible = true;
 * progressState.percent = 50;
 * progressState.message = "Halfway there...";
 * 
 * @mermaid
 * graph TD
 *     subgraph Initialization
 *         A[createProgressBar] --> B[Create Container Div<br/>position: fixed, top: 0]
 *         B --> C[Create Progress Fill Div<br/>gradient background]
 *         C --> D[Subscribe to progressState]
 *         D --> E[Return Container Element]
 *     end
 *     
 *     subgraph State_Changes
 *         F[showProgress<br/>percent, message] --> G[Set visible = true]
 *         G --> H[Set percent value]
 *         H --> I[Set message text]
 *         
 *         J[updateProgress<br/>percent, message] --> K{Is Visible?}
 *         K -->|Yes| L[Update percent]
 *         L --> M[Update message if provided]
 *         K -->|No| N[Ignore]
 *         
 *         O[hideProgress] --> P[Set visible = false]
 *         P --> Q[Set percent = 0]
 *     end
 *     
 *     subgraph Reactive_Updates
 *         R[progressState.subscribe] --> S{Property Changed}
 *         S -->|visible| T{visible AND percent > 0?}
 *         T -->|Yes| U[opacity = 1]
 *         T -->|No| V[opacity = 0, width = 0%]
 *         S -->|percent| W[width = percent%]
 *         W --> X[opacity = percent > 0 ? 1 : 0]
 *     end
 *     
 *     style A fill:#4CAF50,color:white
 *     style U fill:#2196F3,color:white
 *     style V fill:#FF9800,color:white
 */

// src/components/ProgressBar.js

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
