/**
 * @module Utils/Chart
 * @description zoomControls module
 */

/**
 * Zoom Controls Utility for COMTRADE Viewer
 * 
 * Provides window-level zoom functionality for different sections:
 * - Main content (charts area)
 * - Sidebars (tables and phasor diagrams)
 * 
 * Each section maintains its own zoom level independently.
 */

// Zoom configuration
const ZOOM_CONFIG = {
  minZoom: 0.5,       // 50% minimum zoom
  maxZoom: 2.0,       // 200% maximum zoom
  zoomStep: 0.1,      // 10% per step
  defaultZoom: 1.0    // 100% default
};

// Store zoom levels for each section
const zoomLevels = {
  mainContent: ZOOM_CONFIG.defaultZoom,
  deltaSidebar: ZOOM_CONFIG.defaultZoom,
  analysisSidebar: ZOOM_CONFIG.defaultZoom
};

/**
 * SVG Icons for zoom controls
 */
export const ZOOM_ICONS = {
  zoomIn: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></svg>`,
  zoomOut: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/></svg>`
};

/**
 * Get the current zoom level for a section
 * @param {string} section - Section identifier
 * @returns {number} Current zoom level
 */
export function getZoomLevel(section) {
  return zoomLevels[section] || ZOOM_CONFIG.defaultZoom;
}

/**
 * Set zoom level for a specific section
 * @param {string} section - Section identifier ('mainContent', 'deltaSidebar', 'analysisSidebar')
 * @param {number} level - New zoom level
 */
export function setZoomLevel(section, level) {
  const clampedLevel = Math.max(ZOOM_CONFIG.minZoom, Math.min(ZOOM_CONFIG.maxZoom, level));
  zoomLevels[section] = clampedLevel;
  applyZoom(section, clampedLevel);
  updateZoomDisplay(section, clampedLevel);
  return clampedLevel;
}

/**
 * Zoom in for a section
 * @param {string} section - Section identifier
 */
export function zoomIn(section) {
  const currentLevel = getZoomLevel(section);
  return setZoomLevel(section, currentLevel + ZOOM_CONFIG.zoomStep);
}

/**
 * Zoom out for a section
 * @param {string} section - Section identifier
 */
export function zoomOut(section) {
  const currentLevel = getZoomLevel(section);
  return setZoomLevel(section, currentLevel - ZOOM_CONFIG.zoomStep);
}

/**
 * Reset zoom to default for a section
 * @param {string} section - Section identifier
 */
export function resetZoom(section) {
  return setZoomLevel(section, ZOOM_CONFIG.defaultZoom);
}

/**
 * Apply zoom transform to the target element
 * @param {string} section - Section identifier
 * @param {number} level - Zoom level to apply
 */
function applyZoom(section, level) {
  let targetElement = null;
  let useZoomProperty = false;
  
  switch (section) {
    case 'mainContent':
      // Apply to charts wrapper - use CSS zoom for better rendering
      targetElement = document.getElementById('charts');
      useZoomProperty = true;
      break;
    case 'deltaSidebar':
      // Apply to delta drawer content area
      targetElement = document.querySelector('#delta-drawer-panel');
      if (targetElement) {
        // Find the scrollable content area inside
        const contentArea = targetElement.querySelector('.flex-1.overflow-auto') || 
                           targetElement.querySelector('.tabulator') ||
                           targetElement;
        targetElement = contentArea;
      }
      break;
    case 'analysisSidebar':
      // Apply to phasor diagram container
      targetElement = document.getElementById('polarChartContainer');
      break;
    default:
      console.warn(`[zoomControls] Unknown section: ${section}`);
      return;
  }

  if (targetElement) {
    if (useZoomProperty) {
      // Use CSS zoom for main content (better for charts)
      targetElement.style.zoom = level;
      targetElement.style.transform = '';
      targetElement.style.transformOrigin = '';
    } else {
      // Use transform scale for sidebars
      targetElement.style.transform = `scale(${level})`;
      targetElement.style.transformOrigin = 'top left';
      // Adjust container to show full scaled content
      if (level !== 1) {
        targetElement.style.width = `${100 / level}%`;
        targetElement.style.height = `${100 / level}%`;
      } else {
        targetElement.style.width = '';
        targetElement.style.height = '';
      }
    }
    
    console.log(`[zoomControls] Applied zoom ${Math.round(level * 100)}% to ${section}`);
  }
}

/**
 * Update the zoom percentage display
 * @param {string} section - Section identifier
 * @param {number} level - Current zoom level
 */
function updateZoomDisplay(section, level) {
  const displayId = `zoom-display-${section}`;
  const displayElement = document.getElementById(displayId);
  if (displayElement) {
    displayElement.textContent = `${Math.round(level * 100)}%`;
  }
}

/**
 * Create zoom control buttons HTML
 * @param {string} section - Section identifier
 * @returns {string} HTML string for zoom controls
 */
export function createZoomControlsHTML(section) {
  const currentZoom = getZoomLevel(section);
  return `
    <div class="zoom-controls" data-section="${section}">
      <button 
        class="zoom-btn zoom-out-btn" 
        title="Zoom Out" 
        data-action="zoom-out"
        data-section="${section}"
      >
        ${ZOOM_ICONS.zoomOut}
      </button>
      <span class="zoom-display" id="zoom-display-${section}">${Math.round(currentZoom * 100)}%</span>
      <button 
        class="zoom-btn zoom-in-btn" 
        title="Zoom In" 
        data-action="zoom-in"
        data-section="${section}"
      >
        ${ZOOM_ICONS.zoomIn}
      </button>
    </div>
  `;
}

/**
 * Create and inject zoom controls into a container
 * @param {string} section - Section identifier
 * @param {HTMLElement} container - Container element to inject into
 */
export function injectZoomControls(section, container) {
  if (!container) {
    console.warn(`[zoomControls] Container not found for section: ${section}`);
    return;
  }

  // Create zoom controls element
  const zoomControlsElement = document.createElement('div');
  zoomControlsElement.className = 'zoom-controls-container';
  zoomControlsElement.innerHTML = createZoomControlsHTML(section);
  
  // Append to container
  container.appendChild(zoomControlsElement);
  
  // Add event listeners
  const zoomInBtn = zoomControlsElement.querySelector('[data-action="zoom-in"]');
  const zoomOutBtn = zoomControlsElement.querySelector('[data-action="zoom-out"]');
  
  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      zoomIn(section);
    });
  }
  
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      zoomOut(section);
    });
  }
  
  // Add double-click to reset zoom
  const zoomDisplay = zoomControlsElement.querySelector('.zoom-display');
  if (zoomDisplay) {
    zoomDisplay.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      resetZoom(section);
    });
    zoomDisplay.title = 'Double-click to reset zoom';
  }
  
  console.log(`[zoomControls] Injected zoom controls for ${section}`);
}

/**
 * Initialize zoom controls for all sections
 */
export function initializeZoomControls() {
  // Main content zoom controls
  const mainContent = document.getElementById('mainContent');
  if (mainContent) {
    injectZoomControls('mainContent', mainContent);
  }
  
  // Delta sidebar zoom controls
  const deltaSidebar = document.getElementById('delta-drawer-panel');
  if (deltaSidebar) {
    injectZoomControls('deltaSidebar', deltaSidebar);
  }
  
  // Analysis sidebar zoom controls  
  const analysisSidebar = document.getElementById('analysis-sidebar-panel');
  if (analysisSidebar) {
    injectZoomControls('analysisSidebar', analysisSidebar);
  }
  
  console.log('[zoomControls] Initialized all zoom controls');
}

/**
 * Update the position of main zoom controls to stay within mainContent bounds
 * Called when sidebars open/close
 */
export function updateMainZoomPosition() {
  const mainContent = document.getElementById('mainContent');
  const zoomControls = document.getElementById('main-zoom-controls');
  
  if (!mainContent || !zoomControls) return;
  
  const mainRect = mainContent.getBoundingClientRect();
  const rightPosition = window.innerWidth - mainRect.right + 20;
  
  zoomControls.style.right = `${rightPosition}px`;
  console.log(`[zoomControls] Updated main zoom position: right=${rightPosition}px`);
}

// Listen for sidebar changes to update zoom position
if (typeof window !== 'undefined') {
  // Update position on resize
  window.addEventListener('resize', updateMainZoomPosition);
  
  // Update position after DOM loads
  document.addEventListener('DOMContentLoaded', () => {
    updateMainZoomPosition();
    
    // Observe mainContent for size changes
    const mainContent = document.getElementById('mainContent');
    if (mainContent && typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        updateMainZoomPosition();
      });
      resizeObserver.observe(mainContent);
    }
  });
}

// Export functions to window for global access
window.__zoomControls = {
  zoomIn,
  zoomOut,
  resetZoom,
  getZoomLevel,
  setZoomLevel,
  initializeZoomControls,
  updateMainZoomPosition
};

export default {
  zoomIn,
  zoomOut,
  resetZoom,
  getZoomLevel,
  setZoomLevel,
  initializeZoomControls,
  injectZoomControls,
  createZoomControlsHTML,
  updateMainZoomPosition,
  ZOOM_ICONS,
  ZOOM_CONFIG
};
