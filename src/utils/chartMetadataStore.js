/**
 * @file chartMetadataStore.js
 * @module Utils/Chart
 *
 * @description
 * <h3>Chart Metadata State Store</h3>
 * 
 * <p>Centralized reactive store for managing chart metadata including channel assignments,
 * group IDs, and chart instance references. Built on createState for automatic UI updates
 * when chart configurations change.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>Reactive State</td><td>Uses createState proxy for automatic subscription notifications</td></tr>
 *   <tr><td>Unique ID Generation</td><td>Auto-increments IDs for groups, analog, digital, computed channels</td></tr>
 *   <tr><td>Group Management</td><td>Tracks user-assigned group IDs (G0, G1, G2...) with gap-filling</td></tr>
 *   <tr><td>Chart Registry</td><td>Maintains array of all active chart instances with metadata</td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>addChart</strong> — Register new chart with auto-generated IDs</li>
 *   <li><strong>removeChart</strong> — Unregister chart by ID</li>
 *   <li><strong>getChartMetadataState</strong> — Access raw state for subscriptions</li>
 *   <li><strong>clearAllCharts</strong> — Reset all chart metadata</li>
 *   <li><strong>findNextAvailableGroupIndex</strong> — Smart group ID allocation with gap-filling</li>
 * </ul>
 * 
 * <h4>State Structure</h4>
 * <pre>
 * {
 *   charts: [
 *     { userGroupId: "G0", chartType: "analog", channels: [...], uPlotInstance: ... },
 *     { userGroupId: "G1", chartType: "digital", channels: [...], uPlotInstance: ... }
 *   ],
 *   nextUserGroupId: 2,
 *   nextAnalogId: 5,
 *   nextDigitalId: 3,
 *   nextComputedId: 1
 * }
 * </pre>
 * 
 * @see {@link module:components/createState} - Reactive state factory
 * @see {@link module:components/chartManager} - Subscribes to metadata changes
 * 
 * @example
 * import { addChart, getChartMetadataState, clearAllCharts } from './chartMetadataStore.js';
 * 
 * // Add a new chart
 * addChart({
 *   chartType: 'analog',
 *   channels: [{ channelID: 'A1', name: 'VA' }],
 *   uPlotInstance: chart
 * });
 * 
 * // Get state for subscriptions
 * const state = getChartMetadataState();
 * state.subscribe((change) => console.log('Chart changed:', change));
 * 
 * // Clear all on file reload
 * clearAllCharts();
 * 
 * @mermaid
 * graph TD
 *     A[addChart called] --> B[Extract Group Index]
 *     B --> C{Group ID Provided?}
 *     C -->|Yes| D[Use Provided Group]
 *     C -->|No| E[findNextAvailableGroupIndex]
 *     E --> F[Generate G{n} ID]
 *     D --> G[Create Chart Entry]
 *     F --> G
 *     G --> H[Push to charts array]
 *     H --> I[Subscribers Notified]
 *     
 *     J[removeChart called] --> K[Filter charts array]
 *     K --> L[Subscribers Notified]
 *     
 *     M[clearAllCharts] --> N[Reset charts to empty]
 *     N --> O[Reset all ID counters]
 *     O --> P[Subscribers Notified]
 *     
 *     style A fill:#4CAF50,color:white
 *     style I fill:#2196F3,color:white
 *     style P fill:#FF9800,color:white
 */

import { createState } from "../components/createState.js";

const chartMetadataState = createState({
  charts: [],
  nextUserGroupId: 0,
  nextAnalogId: 0,
  nextDigitalId: 0,
  nextComputedId: 0,
});

const GROUP_PREFIX = "G";

function extractGroupIndex(groupId) {
  if (typeof groupId !== "string") return null;
  const match = new RegExp(`^${GROUP_PREFIX}(\\d+)$`).exec(groupId.trim());
  if (!match) return null;
  const parsed = parseInt(match[1], 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function collectUsedGroupIndices(state) {
  const used = new Set();
  state.charts.forEach((chart) => {
    const idx = extractGroupIndex(chart.userGroupId);
    if (idx !== null) used.add(idx);
  });
  return used;
}

function findNextAvailableGroupIndex(state) {
  const used = collectUsedGroupIndices(state);
  let candidate = 0;
  while (used.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}

function assignUserGroupId(state, requestedId) {
  if (typeof requestedId === "string" && requestedId.trim() !== "") {
    const trimmed = requestedId.trim();
    const parsed = extractGroupIndex(trimmed);
    if (parsed !== null) {
      state.nextUserGroupId = Math.max(
        state.nextUserGroupId,
        parsed + 1,
        findNextAvailableGroupIndex(state)
      );
    }
    return { id: trimmed, autoAssigned: false };
  }

  const nextIndex = findNextAvailableGroupIndex(state);
  state.nextUserGroupId = Math.max(state.nextUserGroupId, nextIndex + 1);
  return {
    id: `${GROUP_PREFIX}${nextIndex}`,
    autoAssigned: true,
  };
}

function generateUPlotInstance(chartType, state) {
  switch (chartType) {
    case "analog": {
      const value = `A${state.nextAnalogId}`;
      state.nextAnalogId += 1;
      return value;
    }
    case "digital": {
      const value = `D${state.nextDigitalId}`;
      state.nextDigitalId += 1;
      return value;
    }
    case "computed": {
      const value = `C${state.nextComputedId}`;
      state.nextComputedId += 1;
      return value;
    }
    default: {
      const value = `X${state.nextComputedId}`;
      state.nextComputedId += 1;
      return value;
    }
  }
}

function computeNextComputedIdFromCharts(charts) {
  return charts.reduce((nextId, chart) => {
    const match = /C(\d+)/.exec(chart.uPlotInstance || "");
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (!Number.isNaN(parsed)) {
        return Math.max(nextId, parsed + 1);
      }
    }
    return nextId;
  }, 0);
}

export function getChartMetadataState() {
  return chartMetadataState;
}

export function addChart(metadata = {}) {
  const state = chartMetadataState;
  const chartType = metadata.chartType || "unknown";
  const requestedGroupId =
    typeof metadata.userGroupId === "string"
      ? metadata.userGroupId
      : typeof metadata.sourceGroupId === "string"
      ? metadata.sourceGroupId
      : null;
  const { id: assignedUserGroupId, autoAssigned } = assignUserGroupId(
    state,
    requestedGroupId
  );

  const assignedUPlotInstance = generateUPlotInstance(chartType, state);

  const fullMetadata = {
    ...metadata,
    userGroupId: assignedUserGroupId,
    uPlotInstance: assignedUPlotInstance,
    chartType,
    autoAssignedUserGroupId: autoAssigned,
  };

  state.charts.push(fullMetadata);
  state.nextUserGroupId = findNextAvailableGroupIndex(state);

  console.log("[chartMetadataStore] Added chart", fullMetadata);
  return fullMetadata;
}

export function removeChart(userGroupId) {
  const state = chartMetadataState;
  const index = state.charts.findIndex(
    (chart) => chart.userGroupId === userGroupId
  );
  if (index === -1) {
    console.warn(
      "[chartMetadataStore] Attempted to remove missing chart",
      userGroupId
    );
    return null;
  }

  const [removed] = state.charts.splice(index, 1);
  state.nextUserGroupId = findNextAvailableGroupIndex(state);

  console.log("[chartMetadataStore] Removed chart", {
    removed,
    remaining: state.charts.map((chart) => chart.userGroupId),
  });
  return removed;
}

export function getChartByUserGroupId(userGroupId) {
  const chart = chartMetadataState.charts.find(
    (item) => item.userGroupId === userGroupId
  );
  console.log("[chartMetadataStore] Lookup by userGroupId", userGroupId, chart);
  return chart || null;
}

export function getChartByUPlotInstance(uPlotInstance) {
  const chart = chartMetadataState.charts.find(
    (item) => item.uPlotInstance === uPlotInstance
  );
  console.log(
    "[chartMetadataStore] Lookup by uPlotInstance",
    uPlotInstance,
    chart
  );
  return chart || null;
}

export function getChartsByType(chartType) {
  const charts = chartMetadataState.charts.filter(
    (item) => item.chartType === chartType
  );
  console.log("[chartMetadataStore] Lookup by type", chartType, charts.length);
  return charts;
}

export function clearAllCharts() {
  const state = chartMetadataState;
  state.charts = [];
  state.nextUserGroupId = 0;
  state.nextAnalogId = 0;
  state.nextDigitalId = 0;
  state.nextComputedId = 0;
  console.log("[chartMetadataStore] Cleared all charts");
}

export function resetForFileReload() {
  const state = chartMetadataState;
  const computedCharts = state.charts.filter(
    (chart) => chart.chartType === "computed"
  );

  state.charts = computedCharts.map((chart) => ({ ...chart }));

  state.nextUserGroupId = findNextAvailableGroupIndex(state);
  state.nextAnalogId = 0;
  state.nextDigitalId = 0;
  state.nextComputedId = computeNextComputedIdFromCharts(state.charts);

  console.log("[chartMetadataStore] Reset for file reload", {
    preservedComputed: state.charts.length,
    nextComputedId: state.nextComputedId,
  });
  return state.charts;
}

export default chartMetadataState;
