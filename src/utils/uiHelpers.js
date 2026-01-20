/**
 * ============================================
 * UI Helper Functions for Modern Layout
 * ============================================
 */

/**
 * Show file information section after files are loaded
 * @function showFileInfo
 */
export function showFileInfo() {
  const uploadSection = document.getElementById("uploadSection");
  const fileInfo = document.getElementById("fileInfo");
  const statsGrid = document.getElementById("statsGrid");
  const showChannelBtn = document.getElementById("showChannelListBtn");
  const fileStatus = document.getElementById("fileStatus");

  // Keep both visible side-by-side
  if (uploadSection) uploadSection.style.display = "block";
  if (fileInfo) fileInfo.style.display = "flex";
  if (statsGrid) statsGrid.style.display = "grid";
  if (showChannelBtn) showChannelBtn.style.display = "inline-flex";

  // Update status to show "Loaded"
  if (fileStatus) {
    fileStatus.style.color = "var(--accent-green)";
    fileStatus.innerHTML =
      '<span class="status-dot" style="background: var(--accent-green);"></span><span>Loaded</span>';
  }
}

/**
 * Update stats cards with real data
 * @function updateStatsCards
 * @param {Object} config - Configuration object
 * @param {number} config.sampleRate - Sample rate in Hz
 * @param {number} config.duration - Duration in ms
 * @param {Array} config.analogChannels - Analog channels array
 * @param {Array} config.digitalChannels - Digital channels array
 */
export function updateStatsCards(config) {
  if (!config) return;

  // Sample Rate
  const sampleRateEl = document.querySelector(
    ".stats-grid .stat-card:nth-child(1) .stat-value"
  );
  if (sampleRateEl && config.sampleRate) {
    sampleRateEl.innerHTML = `${config.sampleRate}<span class="stat-unit">Hz</span>`;
  }

  // Duration
  const durationEl = document.querySelector(
    ".stats-grid .stat-card:nth-child(2) .stat-value"
  );
  if (durationEl && config.duration) {
    durationEl.innerHTML = `${config.duration}<span class="stat-unit">ms</span>`;
  }

  // Channels count
  const channelsEl = document.querySelector(
    ".stats-grid .stat-card:nth-child(3) .stat-value"
  );
  if (channelsEl) {
    const totalChannels =
      (config.analogChannels?.length || 0) +
      (config.digitalChannels?.length || 0);
    channelsEl.innerHTML = `${totalChannels}<span class="stat-unit">total</span>`;
  }
}

/**
 * Wrap chart in section with header
 * @function wrapChartInSection
 * @param {HTMLElement} chartParent - Chart container element
 * @param {string} title - Chart title
 * @param {string} unit - Unit of measurement (default: 'kA')
 * @returns {HTMLElement} Wrapped section element
 */
export function wrapChartInSection(chartParent, title, unit = "kA") {
  const section = document.createElement("div");
  section.className = "chart-section";

  const header = document.createElement("div");
  header.className = "chart-header";
  header.innerHTML = `
    <div class="chart-title">
      ${title}
      <span class="chart-unit">${unit}</span>
    </div>
    <div class="chart-actions">
      <button class="chart-action-btn" title="Zoom In">🔍</button>
      <button class="chart-action-btn" title="Zoom Out">🔍</button>
      <button class="chart-action-btn" title="Fullscreen">⛶</button>
    </div>
  `;

  const body = document.createElement("div");
  body.className = "chart-body";
  body.appendChild(chartParent);

  section.appendChild(header);
  section.appendChild(body);

  return section;
}

/**
 * Initialize sidebar channel checkboxes
 * @function initializeSidebarChannels
 * @param {Object} channelState - Channel state object
 */
export function initializeSidebarChannels(channelState) {
  if (!channelState) return;

  // This would sync sidebar checkboxes with actual channel visibility
  // Implementation depends on your channel management system
  console.log("Sidebar channels initialized");
}

/**
 * Setup mobile sidebar toggle
 * @function setupMobileSidebar
 */
export function setupMobileSidebar() {
  const sidebar = document.getElementById("sidebar");
  const menuBtn = document.querySelector(".mobile-menu-btn");

  if (menuBtn && sidebar) {
    menuBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }
}

/**
 * Update file info card with loaded file details
 * @function updateFileInfo
 * @param {string} cfgFileName - CFG file name
 * @param {string} datFileName - DAT file name
 */
export function updateFileInfo(cfgFileName, datFileName) {
  const cfgEl = document.getElementById("cfgFileName");
  const datEl = document.getElementById("datFileName");

  if (cfgEl) cfgEl.textContent = cfgFileName || "Not Selected";
  if (datEl) datEl.textContent = datFileName || "Not Selected";
}

/**
 * Show/hide charts container
 * @function toggleChartsVisibility
 * @param {boolean} show - Whether to show or hide
 */
export function toggleChartsVisibility(show = true) {
  const chartsContainer = document.getElementById("charts");
  if (chartsContainer) {
    chartsContainer.style.display = show ? "block" : "none";
  }
}

/**
 * Clear charts container
 * @function clearChartsContainer
 */
export function clearChartsContainer() {
  const chartsContainer = document.getElementById("charts");
  if (chartsContainer) {
    chartsContainer.innerHTML = "";
  }
}
