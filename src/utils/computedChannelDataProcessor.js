/**
 * OWNERSHIP RULE: Filter computed channels
 * Rule: A computed channel is "owned" by analog chart if its group ID matches an analog group
 * 
 * Renders in: analog chart (if group assigned)
 * Renders in: standalone computed chart (if no group or group is unknown)
 * 
 * @param {Array} allComputedChannels - All computed channels from data
 * @param {Array|Set} analogGroupIds - Array or Set of analog group IDs (indexed by channel position)
 * @returns {Array} Filtered computed channels NOT owned by analog groups (to render as standalone)
 */
export function filterUnassignedComputedChannels(
  allComputedChannels,
  analogGroupIds
) {
  // Convert array to Set if needed
  const groupSet =
    analogGroupIds instanceof Set
      ? analogGroupIds
      : new Set(analogGroupIds || []);

  console.log(
    `[OWNERSHIP] Filtering computed channels. Analog groups: [${Array.from(groupSet).join(", ")}]`
  );

  return allComputedChannels.filter((ch) => {
    // Check ownership rule: Does this channel belong to an analog group?
    if (ch && ch.group && groupSet.has(ch.group)) {
      // OWNED by analog chart - exclude from standalone
      console.log(
        `[OWNERSHIP] Channel "${ch.id}": OWNED by analog group "${ch.group}" → Exclude from standalone`
      );
      return false; // Don't include in standalone computed chart
    }

    // NOT owned by analog - include in standalone
    if (ch && ch.group) {
      console.log(
        `[OWNERSHIP] Channel "${ch.id}": Group "${ch.group}" is NOT an analog group → Include in standalone`
      );
    } else if (ch) {
      console.log(
        `[OWNERSHIP] Channel "${ch.id}": No group assigned → Include in standalone`
      );
    }

    return true; // Include in standalone computed chart
  });
}

/**
 * Group computed channels by unit
 * @param {Array} computedChannels - Filtered computed channels
 * @returns {Map} Map with unitKey → channels[]
 */
export function groupChannelsByUnit(computedChannels) {
  const unitGroups = new Map();

  for (const ch of computedChannels) {
    const unitKey = (ch?.unit || "unknown").trim();
    if (!unitGroups.has(unitKey)) {
      unitGroups.set(unitKey, []);
    }
    unitGroups.get(unitKey).push(ch);
  }

  console.log(
    `[computedChannelDataProcessor] 📊 Grouped ${computedChannels.length} channels into ${unitGroups.size} unit(s)`
  );

  return unitGroups;
}

/**
 * Clean up old computed charts before re-rendering
 * @param {Array} charts - Chart instances array
 * @param {HTMLElement} chartsContainer - DOM container
 */
export function cleanupOldComputedCharts(charts, chartsContainer) {
  // Remove from charts array
  const oldComputedCharts = charts.filter(
    (c) => c && (c._type === "computed" || c._computed === true)
  );
  oldComputedCharts.forEach((oldChart) => {
    try {
      oldChart.destroy?.();
    } catch (e) {
      console.warn("[computedChannelDataProcessor] Failed to destroy old chart");
    }
    const idx = charts.indexOf(oldChart);
    if (idx >= 0) charts.splice(idx, 1);
  });

  // Remove from DOM
  const oldContainers = chartsContainer.querySelectorAll(
    '[data-chartType="computed"]'
  );
  oldContainers.forEach((container) => {
    try {
      container.remove();
    } catch (e) {
      console.warn("[computedChannelDataProcessor] Failed to remove old container");
    }
  });

  console.log(
    `[computedChannelDataProcessor] 🗑️ Cleaned up ${oldComputedCharts.length} old computed chart(s)`
  );
}

/**
 * Resolve time array from various sources
 * @param {Object} data - Data object with potential time arrays
 * @param {Array} computedChannels - Computed channels (for fallback)
 * @returns {Array} Resolved time array
 */
export function resolveTimeArray(data, computedChannels) {
  // Try direct time array first
  if (Array.isArray(data.time) && data.time.length > 0) {
    console.log(
      `[computedChannelDataProcessor] ✅ Using data.time (${data.time.length} samples)`
    );
    return data.time;
  }

  // Try nested data.time.data
  if (
    data.time?.data &&
    Array.isArray(data.time.data) &&
    data.time.data.length > 0
  ) {
    console.log(
      `[computedChannelDataProcessor] ✅ Using data.time.data (${data.time.data.length} samples)`
    );
    return data.time.data;
  }

  // Try data.timeArray
  if (
    data.timeArray &&
    Array.isArray(data.timeArray) &&
    data.timeArray.length > 0
  ) {
    console.log(
      `[computedChannelDataProcessor] ✅ Using data.timeArray (${data.timeArray.length} samples)`
    );
    return data.timeArray;
  }

  // Generate synthetic from first channel
  const firstChannelData = computedChannels?.[0]?.data || [];
  const sampleCount = firstChannelData.length || 62464;
  console.log(
    `[computedChannelDataProcessor] ⚡ Generated synthetic time array (${sampleCount} samples)`
  );
  return Array.from({ length: sampleCount }, (_, i) => i * 0.01);
}

/**
 * Build chart data array for a unit group
 * @param {Array} timeArray - Time array
 * @param {Array} unitChannels - Channels for this unit
 * @returns {Array} [timeArray, ...series arrays]
 */
export function buildUnitChartData(timeArray, unitChannels) {
  const channelDataArrays = unitChannels.map((ch) => ch.data || []);
  return [timeArray, ...channelDataArrays];
}
