/**
 * @file Tooltip.js
 * @module components/Tooltip
 * 
 * @description
 * <h3>Global Tooltip Component</h3>
 * 
 * <p>A singleton tooltip element that provides hover information across all charts.
 * Creates a single fixed-position tooltip that follows cursor movements and displays
 * formatted content for chart data points, channel information, and other UI elements.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>Singleton Pattern</td><td>Single tooltip element reused across entire app</td></tr>
 *   <tr><td>Fixed Positioning</td><td>Uses fixed position for viewport-relative placement</td></tr>
 *   <tr><td>Viewport Aware</td><td>Adjusts position to stay within visible area</td></tr>
 *   <tr><td>Zero Interference</td><td>pointer-events: none prevents blocking interactions</td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>HTML Content</strong> — Supports rich HTML formatting via innerHTML</li>
 *   <li><strong>Smooth Transitions</strong> — 0.1s opacity fade for polish</li>
 *   <li><strong>Auto-Position</strong> — Flips placement when near viewport edges</li>
 *   <li><strong>High Z-Index</strong> — 99999 ensures visibility above all content</li>
 *   <li><strong>Dark Theme</strong> — Semi-transparent dark background with shadow</li>
 * </ul>
 * 
 * @example
 * import { createTooltip, updateTooltip, hideTooltip } from './Tooltip.js';
 * 
 * // Initialize tooltip (call once)
 * createTooltip();
 * 
 * // Show tooltip on hover
 * element.addEventListener('mousemove', (e) => {
 *   updateTooltip(e.pageX, e.pageY, '<b>Value:</b> 100.5');
 * });
 * 
 * // Hide on mouse leave
 * element.addEventListener('mouseleave', () => {
 *   hideTooltip();
 * });
 * 
 * @mermaid
 * graph TD
 *     A[createTooltip] --> B{tooltipEl Exists?}
 *     B -->|Yes| C[Return Existing]
 *     B -->|No| D[Create DIV Element]
 *     D --> E[Apply Styles<br/>fixed, dark bg, rounded]
 *     E --> F[Append to document.body]
 *     F --> G[Return tooltipEl]
 *     
 *     H[updateTooltip] --> I[Set innerHTML]
 *     I --> J[Show Element]
 *     J --> K[Calculate Position]
 *     K --> L{Near Edge?}
 *     L -->|Yes| M[Flip Position]
 *     L -->|No| N[Use Offset Position]
 *     M --> O[Apply Position]
 *     N --> O
 *     
 *     P[hideTooltip] --> Q[Set opacity = 0]
 *     Q --> R[Set display = none]
 *     
 *     style A fill:#4CAF50,color:white
 *     style O fill:#2196F3,color:white
 *     style R fill:#FF9800,color:white
 */

// components/Tooltip.js

let tooltipEl = null;

/**
 * Create a single tooltip element globally (on body).
 * @returns {HTMLElement} tooltip element
 */
export function createTooltip() {
  if (tooltipEl) return tooltipEl;

  tooltipEl = document.createElement("div");
  tooltipEl.classList.add("chart-tooltip");
  tooltipEl.style.position = "fixed";
  tooltipEl.style.background = "rgba(0, 0, 0, 0.85)";
  tooltipEl.style.color = "#fff";
  tooltipEl.style.padding = "6px 10px";
  tooltipEl.style.borderRadius = "6px";
  tooltipEl.style.pointerEvents = "none";
  tooltipEl.style.fontSize = "13px";
  tooltipEl.style.fontFamily = "Arial, sans-serif";
  tooltipEl.style.boxShadow = "0 2px 6px rgba(0,0,0,0.25)";
  tooltipEl.style.transition = "opacity 0.1s ease";
  tooltipEl.style.opacity = "0";
  tooltipEl.style.zIndex = "99999";
  tooltipEl.style.display = "none";

  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

/**
 * Update tooltip position and content.
 * @param {number} pageX - Mouse X (page coordinates)
 * @param {number} pageY - Mouse Y (page coordinates)
 * @param {string} text - HTML content to show
 */
export function updateTooltip(pageX, pageY, text) {
  if (!tooltipEl) return;
  tooltipEl.innerHTML = text;
  tooltipEl.style.display = "block";
  tooltipEl.style.opacity = "1";

  const offset = 10;
  let left = pageX + offset;
  let top = pageY + offset;

  // Keep within viewport
  const tooltipRect = tooltipEl.getBoundingClientRect();
  const winW = window.innerWidth;
  const winH = window.innerHeight;

  if (left + tooltipRect.width > winW)
    left = pageX - tooltipRect.width - offset;
  if (top + tooltipRect.height > winH)
    top = pageY - tooltipRect.height - offset;

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

/**
 * Hide tooltip.
 */
export function hideTooltip() {
  if (!tooltipEl) return;
  tooltipEl.style.opacity = "0";
  tooltipEl.style.display = "none";
}
