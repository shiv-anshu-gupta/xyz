/**
 * @file stateUpdate.js
 * @module services/computedChannels/stateUpdate
 * 
 * @description
 * <h3>Global State Mutation for Computed Channels</h3>
 * 
 * <p>Updates all application state stores when a computed channel is created.
 * Follows the separation pattern used by analog/digital channels.</p>
 * 
 * <h4>Data Separation Pattern</h4>
 * <table>
 *   <tr><th>Data Type</th><th>Storage</th><th>Analog Equivalent</th></tr>
 *   <tr><td>Metadata</td><td><code>cfg.computedChannels</code></td><td><code>cfg.analogChannels</code></td></tr>
 *   <tr><td>Values</td><td><code>data.computedData</code></td><td><code>data.analogData</code></td></tr>
 * </table>
 * 
 * <h4>State Locations Updated</h4>
 * <table>
 *   <tr><th>Location</th><th>Purpose</th></tr>
 *   <tr><td><code>window.globalData.computedData</code></td><td>Values array</td></tr>
 *   <tr><td><code>window.globalCfg.computedChannels</code></td><td>Metadata array</td></tr>
 *   <tr><td><code>computedChannelsState</code></td><td>Reactive state store</td></tr>
 *   <tr><td><code>window.channelState.computed</code></td><td>Tabulator reactive state</td></tr>
 *   <tr><td><code>localStorage</code></td><td>Persistence</td></tr>
 * </table>
 * 
 * <h4>Group Resolution</h4>
 * <p>When saving, group is resolved through:</p>
 * <ol>
 *   <li>Explicit group in channelData</li>
 *   <li>Existing group from <code>cfg.computedChannels</code></li>
 *   <li>Next available <code>G{n}</code> number</li>
 * </ol>
 * 
 * @see {@link module:services/computedChannels} - Main orchestrator
 * @see {@link module:components/renderComputedChart} - Reads this state
 * 
 * @example
 * import { saveToGlobalData, saveToCfg, updateStateStore } from "./stateUpdate.js";
 * 
 * saveToGlobalData(channelResult);  // Updates data.computedData
 * saveToCfg(channelResult, cfg);    // Updates cfg.computedChannels
 * updateStateStore(channelResult);  // Updates reactive stores
 */

import { getComputedChannelsState } from "../../utils/computedChannelsState.js";
import { appendComputedChannelToStorage, saveComputedChannelsToStorage } from "../../utils/computedChannelStorage.js";

/**
 * Resolve group assignment for a computed channel.
 * Finds the next available group number if not explicitly set.
 * 
 * @function resolveComputedGroup
 * @private
 * @param {Object} channelData - Channel metadata object
 * @param {Object} cfgData - Global config object
 * @returns {string} Resolved group ID (e.g., "G0", "G1")
 */
function resolveComputedGroup(channelData, cfgData) {
  const candidateGroup = (channelData?.group || "").trim();
  if (candidateGroup) {
    return candidateGroup;
  }

  const globalRef =
    typeof window !== "undefined"
      ? window
      : typeof globalThis !== "undefined"
      ? globalThis
      : null;

  let maxIndex = -1;
  const collectIndex = (value) => {
    if (typeof value !== "string") return;
    if (!value.startsWith("G")) return;
    const parsed = parseInt(value.slice(1), 10);
    if (!Number.isNaN(parsed) && parsed > maxIndex) {
      maxIndex = parsed;
    }
  };

  const collectArray = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach(collectIndex);
  };

  collectArray(
    (cfgData?.computedChannels || []).map((item) => item?.group || "")
  );

  try {
    const metadataState = globalRef?.__chartMetadataState;
    if (metadataState?.charts) {
      metadataState.charts.forEach((chart) => collectIndex(chart.userGroupId));
    }
    if (typeof metadataState?.nextUserGroupId === "number") {
      maxIndex = Math.max(maxIndex, metadataState.nextUserGroupId - 1);
    }
  } catch (err) {}

  collectArray(globalRef?.channelState?.analog?.groups);
  collectArray(globalRef?.channelState?.digital?.groups);
  collectArray(globalRef?.channelState?.computed?.groups);

  return `G${Math.max(0, maxIndex + 1)}`;
}

/**
 * Save channel VALUES to global data.
 * Updates `window.globalData.computedData` array with computed values.
 * 
 * **Data Structure:**
 * ```
 * data.computedData[channelIndex] = [value1, value2, ...]
 * ```
 * This matches the analog pattern:
 * ```
 * data.analogData[channelIndex] = [value1, value2, ...]
 * ```
 * 
 * @function saveToGlobalData
 * @memberof module:services/computedChannels/stateUpdate
 * @param {Object} channelResult - Result from buildChannelData
 * @param {Object} channelResult.metadata - Channel metadata
 * @param {number[]} channelResult.values - Computed values array
 * @returns {void}
 * 
 * @example
 * saveToGlobalData({
 *   metadata: { id: "i_rms", name: "I_RMS" },
 *   values: [1.2, 3.4, 5.6, ...]
 * });
 * // window.globalData.computedData[n] = [1.2, 3.4, 5.6, ...]
 */
export const saveToGlobalData = (channelResult) => {
  console.log("[saveToGlobalData] 🚀 CALLED with:", {
    hasMetadata: !!channelResult?.metadata,
    hasValues: !!channelResult?.values,
    hasCombined: !!channelResult?.combined,
    hasData: !!channelResult?.data,
    channelResultKeys: Object.keys(channelResult || {}),
  });

  // Check if globalData exists
  if (!window.globalData) {
    console.error("[saveToGlobalData] ❌ window.globalData is undefined!");
    return;
  }

  // Initialize as array if needed (like data.analogData is an array)
  if (!window.globalData.computedData) {
    window.globalData.computedData = [];
    console.log("[saveToGlobalData] 📦 Initialized data.computedData as empty array");
  }

  // ✅ Handle both new { metadata, values } format and legacy combined format
  const values = channelResult.values || channelResult.data || channelResult.results || [];
  const metadata = channelResult.metadata || channelResult;
  
  console.log("[saveToGlobalData] 📊 Extracted:", {
    valuesLength: values?.length || 0,
    metadataId: metadata?.id,
    metadataName: metadata?.name,
    valuesFirst5: values?.slice?.(0, 5),
  });

  if (!values || values.length === 0) {
    console.warn("[saveToGlobalData] ⚠️ No values to save!");
  }

  // Check if this channel already exists (by index or id)
  const existingIndex = window.globalData.computedData.findIndex((entry, idx) => {
    // For new structure: compare against cfg.computedChannels for matching
    const cfgChannel = window.globalCfg?.computedChannels?.[idx];
    return cfgChannel?.id === metadata.id || cfgChannel?.name === metadata.name;
  });

  if (existingIndex >= 0) {
    // Update existing values
    window.globalData.computedData[existingIndex] = values;
    console.log(`[saveToGlobalData] 🔄 Updated values at index ${existingIndex} for channel ${metadata.id}`);
  } else {
    // Add new values array
    window.globalData.computedData.push(values);
    console.log(`[saveToGlobalData] ➕ Added values at index ${window.globalData.computedData.length - 1} for channel ${metadata.id}`);
  }
  
  console.log("[saveToGlobalData] ✅ data.computedData now has", window.globalData.computedData.length, "channel value arrays");
  console.log("[saveToGlobalData] 📊 First channel length:", window.globalData.computedData[0]?.length || 0);
};

/**
 * Save channel METADATA to cfg.
 * Updates `cfg.computedChannels` array with channel definition.
 * 
 * **Data Structure:**
 * ```
 * cfg.computedChannels[index] = { id, name, unit, equation, color, group, ... }
 * ```
 * This matches the analog pattern:
 * ```
 * cfg.analogChannels[index] = { id, phase, unit, multiplier, ... }
 * ```
 * 
 * **Note:** No data/values arrays stored in cfg - only metadata.
 * 
 * @function saveToCfg
 * @memberof module:services/computedChannels/stateUpdate
 * @param {Object} channelResult - Result from buildChannelData
 * @param {Object} channelResult.metadata - Channel metadata to save
 * @param {Object} cfgData - The cfg object (window.globalCfg)
 * @returns {void}
 * 
 * @example
 * saveToCfg(channelResult, window.globalCfg);
 * // cfg.computedChannels[n] = { id: "i_rms", name: "I_RMS", unit: "A", ... }
 */
export const saveToCfg = (channelResult, cfgData) => {
  console.log("[saveToCfg] 🚀 CALLED with:", {
    hasMetadata: !!channelResult?.metadata,
    hasValues: !!channelResult?.values,
    hasCombined: !!channelResult?.combined,
    channelResultKeys: Object.keys(channelResult || {}),
    cfgDataExists: !!cfgData,
    cfgDataKeys: Object.keys(cfgData || {}),
  });

  if (!cfgData) {
    console.error("[saveToCfg] ❌ cfgData is undefined!");
    return;
  }

  if (!cfgData.computedChannels) {
    cfgData.computedChannels = [];
    console.log("[saveToCfg] 📦 Initialized cfg.computedChannels as empty array");
  }

  // ✅ Handle both new { metadata, values } format and legacy combined format
  const channelData = channelResult.metadata || channelResult;
  
  console.log("[saveToCfg] 📊 Extracted channelData:", {
    id: channelData?.id,
    name: channelData?.name,
    equation: channelData?.equation,
    unit: channelData?.unit,
    group: channelData?.group,
    color: channelData?.color,
  });

  const rawId =
    channelData?.id ?? channelData?.name ?? `computed_${Date.now()}`;
  const normalizedId = rawId;
  const comparisonId = rawId != null ? String(rawId) : null;

  const rawName = channelData?.name ?? channelData?.id ?? normalizedId;
  const normalizedName = String(rawName);

  // Ensure the channelData object carries the normalized identifiers
  channelData.id = normalizedId;
  channelData.name = normalizedName;

  const resolvedGroup = resolveComputedGroup(channelData, cfgData);
  channelData.group = resolvedGroup;

  const findMatchingChannel = (item) => {
    if (!item) return false;
    if (comparisonId !== null && String(item.id) === comparisonId) {
      return true;
    }
    if (String(item.name) === normalizedName) {
      return true;
    }
    if (channelData.equation && item.equation === channelData.equation) {
      return true;
    }
    return false;
  };

  const existingIndex = cfgData.computedChannels.findIndex(findMatchingChannel);

  const computeIndex = () => {
    if (typeof channelData.index === "number") {
      return channelData.index;
    }

    const computedLength =
      typeof window !== "undefined" &&
      Array.isArray(window.globalData?.computedData)
        ? window.globalData.computedData.length
        : 0;

    if (computedLength > 0) {
      return computedLength - 1;
    }

    return cfgData.computedChannels.length;
  };

  // ✅ METADATA ONLY - No data/results arrays!
  const buildChannelPayload = (existingChannel = {}) => {
    return {
      index: typeof existingChannel.index === "number"
        ? existingChannel.index
        : computeIndex(),
      id: normalizedId,
      channelID: normalizedId,
      name: normalizedName,
      equation: channelData.equation ?? existingChannel.equation,
      mathJsExpression:
        channelData.mathJsExpression ?? existingChannel.mathJsExpression,
      unit: channelData.unit ?? existingChannel.unit ?? "",
      type: channelData.type ?? existingChannel.type ?? "Computed",
      group: resolvedGroup,
      color: channelData.color ?? existingChannel.color,
      stats: channelData.stats ?? existingChannel.stats,
      sampleCount: channelData.sampleCount ?? existingChannel.sampleCount,
      createdAt: channelData.createdAt ?? existingChannel.createdAt ?? Date.now(),
      // ✅ FIX: Include madeFrom field for correct chart type routing
      madeFrom: channelData.madeFrom ?? existingChannel.madeFrom ?? "analog",
      // ❌ NO data/results arrays - matches cfg.analogChannels pattern!
    };
  };

  if (existingIndex >= 0) {
    const mergedChannel = buildChannelPayload(
      cfgData.computedChannels[existingIndex]
    );
    cfgData.computedChannels[existingIndex] = mergedChannel;

    console.log("[stateUpdate] 💾 Updating existing computed channel:", {
      id: mergedChannel.id,
      name: mergedChannel.name,
      group: mergedChannel.group,
    });

    // ✅ Persist with full data: save cfg.computedChannels + globalData.computedData
    try {
      const cfgList = cfgData.computedChannels || [];
      const dataList = (typeof window !== "undefined" && Array.isArray(window.globalData?.computedData))
        ? window.globalData.computedData
        : [];
      saveComputedChannelsToStorage(cfgList, dataList);
    } catch (e) {
      console.warn("[stateUpdate] ⚠️ Storage save failed (update):", e.message);
      appendComputedChannelToStorage(mergedChannel);
    }
  } else {
    const newChannel = buildChannelPayload();

    cfgData.computedChannels.push(newChannel);

    console.log("[stateUpdate] 💾 Added new computed channel:", {
      id: newChannel.id,
      name: newChannel.name,
      group: newChannel.group,
    });

    // ✅ Persist with full data: save cfg.computedChannels + globalData.computedData
    try {
      const cfgList = cfgData.computedChannels || [];
      const dataList = (typeof window !== "undefined" && Array.isArray(window.globalData?.computedData))
        ? window.globalData.computedData
        : [];
      saveComputedChannelsToStorage(cfgList, dataList);
    } catch (e) {
      console.warn("[stateUpdate] ⚠️ Storage save failed (add):", e.message);
      appendComputedChannelToStorage(newChannel);
    }
  }
};

/**
 * Update computed channels state store and channelState.
 * Syncs computed channel data to reactive stores for UI updates.
 * 
 * **Stores Updated:**
 * 1. `computedChannelsState` - Central reactive store
 * 2. `window.channelState.computed` - Tabulator reactive arrays
 * 
 * @function updateStateStore
 * @memberof module:services/computedChannels/stateUpdate
 * @param {Object} channelResult - Result from buildChannelData
 * @returns {void}
 * 
 * @example
 * updateStateStore(channelResult);
 * // channelState.computed.channelIDs now includes new ID
 * // channelState.computed.yLabels now includes new name
 */
export const updateStateStore = (channelResult) => {
  // ✅ Handle both new and legacy format
  const channelData = channelResult.metadata || channelResult;
  
  const computedChannelsState = getComputedChannelsState();
  if (computedChannelsState?.addChannel) {
    computedChannelsState.addChannel(channelData.id, channelData, "parent");
  }

  // Update reactive channelState for tabulator
  // ✅ Add computed channels to COMPUTED state (not analog)
  if (typeof window !== "undefined" && window.channelState?.computed) {
    const { channelState } = window;
    const computed = channelState.computed;

    // ✅ FIX: Look up group from cfg.computedChannels if not in channelData
    let channelGroup = channelData.group;
    if (
      !channelGroup &&
      typeof window !== "undefined" &&
      window.globalCfg?.computedChannels
    ) {
      const foundChannel = window.globalCfg.computedChannels.find(
        (ch) => ch.id === channelData.id
      );
      if (foundChannel) {
        channelGroup = foundChannel.group;
      }
    }
    // Final fallback to G0
    if (!channelGroup) {
      channelGroup = "G0";
    }

    // Add channel to computed reactive state
    computed.channelIDs.push(channelData.id);
    computed.yLabels.push(channelData.name || channelData.id);

    // ✅ Get color palette from window globals (set by main.js)
    const computedPalette = (typeof window !== "undefined" &&
      window.COMPUTED_CHANNEL_COLORS) || [
      "#dc2626", // red-600
      "#2563eb", // blue-600
      "#16a34a", // green-600
      "#9333ea", // purple-700
      "#ea580c", // orange-600
      "#0d9488", // teal-600
      "#b45309", // amber-700
      "#be185d", // pink-600
    ];

    // ✅ Calculate color based on current index
    const colorIndex = computed.channelIDs.length - 1;
    const assignedColor =
      channelData.color || computedPalette[colorIndex % computedPalette.length];

    computed.lineColors.push(assignedColor);
    computed.yUnits.push(channelData.unit || "");
    computed.groups.push(channelGroup); // ✅ Use detected group with fallback
    computed.scales.push(1);
    computed.starts.push(0);
    computed.durations.push("");
    computed.inverts.push(false);
    computed.equations.push(channelData.equation || "");

    console.log("[stateUpdate] ✅ Added computed channel with group:", {
      channelId: channelData.id,
      group: channelGroup,
      fromChannelData: !!channelData.group,
      fromCfg: !channelData.group && !!window.globalCfg?.computedChannels,
      computedChannelsCount: computed.channelIDs.length,
    });
  }
};
