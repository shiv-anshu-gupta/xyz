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
