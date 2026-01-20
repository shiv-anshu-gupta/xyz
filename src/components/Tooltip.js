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
