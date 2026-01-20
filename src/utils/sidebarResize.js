/**
 * Simple sidebar resize utility
 * Adjusts whole application when sidebars open/close
 */

// Make adjustMainContent globally available for onclick handlers
window.__sidebarResize = window.__sidebarResize || {};

// Track current sidebar widths
let leftSidebarWidth = 0;
let rightSidebarWidth = 0;

/**
 * Adjust entire application layout when sidebar opens/closes
 * Only adjusts margins on main element, lets CSS handle the rest
 * Charts are resized to fit their actual container width
 * @param {string} position - 'left' or 'right'
 * @param {number} sidebarWidth - Width of sidebar in pixels (0 to close)
 */
export function adjustMainContent(position, sidebarWidth) {
  // Target the main element
  const main = document.querySelector("main");
  const buttons = document.getElementById("buttons");

  if (!main) {
    console.warn("[adjustMainContent] Main element not found");
    return;
  }

  // Update tracked widths
  if (position === "left") {
    leftSidebarWidth = sidebarWidth;
    main.style.marginLeft = `${sidebarWidth}px`;
  } else if (position === "right") {
    rightSidebarWidth = sidebarWidth;
    main.style.marginRight = `${sidebarWidth}px`;

    // Move fixed buttons if they exist
    if (buttons) {
      buttons.style.right = `${sidebarWidth}px`;
    }
  }

  console.log(
    `[adjustMainContent] Position: ${position}, Sidebar width: ${sidebarWidth}px`
  );

  // ✅ Use requestAnimationFrame for better sync with layout changes
  // This ensures charts resize after browser completes layout recalculation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      resizeChartsToContainers();
      
      // Update zoom controls position when sidebar changes
      if (window.__zoomControls?.updateMainZoomPosition) {
        window.__zoomControls.updateMainZoomPosition();
      }
    });
  });
}

// ✅ Export to window for onclick handlers
window.__sidebarResize.adjustMainContent = adjustMainContent;

/**
 * Resize all uPlot charts to fit their actual container width
 * Measures each chart's parent container and resizes accordingly
 */
function resizeChartsToContainers() {
  let resizedCount = 0;

  // Resize main analog/digital charts
  if (window.charts && Array.isArray(window.charts)) {
    window.charts.forEach((chart, idx) => {
      if (chart && typeof chart.setSize === "function") {
        const container = chart.root?.parentElement;
        if (container) {
          const containerWidth = container.clientWidth;
          const containerHeight = container.clientHeight || 300;

          chart.setSize({
            width: containerWidth,
            height: containerHeight,
          });
          console.log(
            `[resizeChartsToContainers] Chart ${idx}: ${containerWidth}px × ${containerHeight}px`
          );
          resizedCount++;
        }
      }
    });
  }

  // Resize computed channel charts
  if (window.__chartsComputed && Array.isArray(window.__chartsComputed)) {
    window.__chartsComputed.forEach((chart, idx) => {
      if (chart && typeof chart.setSize === "function") {
        const container = chart.root?.parentElement;
        if (container) {
          const containerWidth = container.clientWidth;
          const containerHeight = container.clientHeight || 300;

          chart.setSize({
            width: containerWidth,
            height: containerHeight,
          });
          console.log(
            `[resizeChartsToContainers] Computed chart ${idx}: ${containerWidth}px × ${containerHeight}px`
          );
          resizedCount++;
        }
      }
    });
  }

  console.log(`[resizeChartsToContainers] ✅ Resized ${resizedCount} charts`);
}

/**
 * Get actual width of an element
 * @param {string} elementId - Element ID
 * @returns {number} Width in pixels
 */
export function getElementWidth(elementId) {
  const el = document.getElementById(elementId);
  return el ? el.offsetWidth : 0;
}
