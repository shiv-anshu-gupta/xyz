/**
 * @module Utils/ComputedChannels
 * @description computedChannelStorage module
 */

/**
 * Computed Channel Storage Manager
 * Persists computed channels to localStorage for persistence across page reloads
 * 
 * ✅ NEW STRUCTURE (lightweight - separate metadata from values):
 * - COMTRADE_COMPUTED_CFG = [{ id, name, unit, equation, color, group, ... }] (METADATA ONLY - small)
 * - COMTRADE_COMPUTED_DATA = [[val1, val2, ...], [val1, val2, ...], ...] (VALUES ONLY - can be large)
 * 
 * This matches how analog/digital work:
 * - cfg.analogChannels = metadata only
 * - data.analogData = values only
 */

const STORAGE_CFG_KEY = "COMTRADE_COMPUTED_CFG";      // Metadata (small)
const STORAGE_DATA_KEY = "COMTRADE_COMPUTED_DATA";    // Values (large)
const STORAGE_METADATA_KEY = "COMTRADE_COMPUTED_METADATA";  // Storage info

// Legacy key (for migration)
const LEGACY_STORAGE_KEY = "COMTRADE_COMPUTED_CHANNELS";

/**
 * Save computed channels to localStorage - SEPARATE metadata and values
 * 
 * @param {Array} cfgComputedChannels - cfg.computedChannels metadata array
 * @param {Array} dataComputedData - data.computedData values array (2D array)
 * @param {Object} metadata - Optional metadata to save
 * @returns {boolean} Success status
 */
export function saveComputedChannelsToStorage(
  cfgComputedChannels,
  dataComputedData = [],
  metadata = {}
) {
  try {
    if (!Array.isArray(cfgComputedChannels)) {
      throw new Error("cfgComputedChannels must be an array");
    }

    console.log("[Storage] 💾 Saving computed channels (SEPARATE format):");
    console.log("[Storage]   cfg count:", cfgComputedChannels.length);
    console.log("[Storage]   data count:", dataComputedData.length);

    // ✅ STEP 1: Build metadata-only array (NO data values!)
    const cfgToStore = cfgComputedChannels.map((cfgEntry, index) => {
      const channelId = cfgEntry.id || cfgEntry.name;
      const madeFrom = cfgEntry.madeFrom || "analog";
      return {
        index,
        id: channelId,
        channelID: channelId,  // ✅ FIX: Include channelID for consistency with analog/digital
        name: cfgEntry.name || channelId,
        unit: cfgEntry.unit || "",
        type: cfgEntry.type || "Computed",
        // ✅ Use GA prefix for analog, GD for digital
        group: cfgEntry.group || (madeFrom === "digital" ? "GD0" : "GA0"),
        equation: cfgEntry.equation,
        mathJsExpression: cfgEntry.mathJsExpression,
        color: cfgEntry.color || "#4ECDC4",
        stats: cfgEntry.stats,
        sampleCount: dataComputedData[index]?.length || cfgEntry.sampleCount || 0,
        createdAt: cfgEntry.createdAt || Date.now(),
        madeFrom: madeFrom,  // ✅ FIX: Include madeFrom for chart type routing!
        // ❌ NO data/values array here!
      };
    });

    // ✅ STEP 2: Build values-only array (2D array like data.analogData)
    const dataToStore = dataComputedData.map((values, index) => {
      // Handle legacy format where values might be an object with .data
      if (Array.isArray(values)) {
        return values;
      } else if (values?.data && Array.isArray(values.data)) {
        return values.data;
      }
      return [];
    });

    // ✅ STEP 3: Save SEPARATELY
    localStorage.setItem(STORAGE_CFG_KEY, JSON.stringify(cfgToStore));
    localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(dataToStore));
    localStorage.setItem(STORAGE_METADATA_KEY, JSON.stringify({
      ...metadata,
      savedAt: new Date().toISOString(),
      channelCount: cfgToStore.length,
      structureVersion: "3.0", // New separate structure
    }));

    // Remove legacy key if exists
    localStorage.removeItem(LEGACY_STORAGE_KEY);

    const cfgSize = (JSON.stringify(cfgToStore).length / 1024).toFixed(1);
    const dataSize = (JSON.stringify(dataToStore).length / 1024).toFixed(1);
    console.log(`[Storage] ✅ Saved: cfg=${cfgSize}KB, data=${dataSize}KB`);
    
    return true;
  } catch (error) {
    console.error("[Storage] Error saving computed channels:", error);
    return false;
  }
}

/**
 * Append a single computed channel to localStorage
 * @param {Object} channelData - Single channel object { id, name, data, equation, ... }
 * @returns {boolean} Success status
 */
export function appendComputedChannelToStorage(channelData) {
  try {
    // Load existing channels (returns combined format)
    const existingChannels = loadComputedChannelsFromStorage();

    // Check for duplicates
    const existingIndex = existingChannels.findIndex(
      (ch) =>
        ch.name === (channelData.name || channelData.id) ||
        ch.id === channelData.id
    );

    let updatedChannels;
    if (existingIndex >= 0) {
      console.log(`[Storage] 🔄 Channel already exists: ${channelData.name}, updating`);
      updatedChannels = existingChannels.map((ch, i) =>
        i === existingIndex ? { ...ch, ...channelData } : ch
      );
    } else {
      console.log(`[Storage] ➕ Appending new channel: ${channelData.name}`);
      updatedChannels = [...existingChannels, channelData];
    }

    // ✅ Split into separate cfg and data arrays for saveComputedChannelsToStorage
    const cfgArray = updatedChannels.map(ch => {
      const { data, ...metadata } = ch;  // Remove data from metadata
      const channelId = metadata.id || metadata.name;
      return {
        ...metadata,
        id: channelId,
        channelID: metadata.channelID || channelId,  // ✅ FIX: Ensure channelID exists
      };
    });
    const dataArray = updatedChannels.map(ch => ch.data || []);

    return saveComputedChannelsToStorage(cfgArray, dataArray);
  } catch (error) {
    console.error("[Storage] Error appending channel:", error);
    return false;
  }
}

/**
 * Load computed channels from localStorage
 * ✅ Returns COMBINED objects for backward compatibility with existing code
 * (merges cfg metadata + data values into single objects)
 * 
 * @returns {Array} Array of computed channel objects { id, name, data, ... }
 */
export function loadComputedChannelsFromStorage() {
  try {
    // ✅ Try new separate format first
    const storedCfg = localStorage.getItem(STORAGE_CFG_KEY);
    const storedData = localStorage.getItem(STORAGE_DATA_KEY);
    
    if (storedCfg) {
      const cfgArray = JSON.parse(storedCfg);
      const dataArray = storedData ? JSON.parse(storedData) : [];
      const metadata = JSON.parse(localStorage.getItem(STORAGE_METADATA_KEY) || "{}");
      
      // ✅ Combine cfg + data for backward compatibility
      // ✅ FIX: Ensure channelID is always present (for backward compatibility with old data)
      const combined = cfgArray.map((cfg, index) => {
        const channelId = cfg.id || cfg.name;
        return {
          ...cfg,
          id: channelId,
          channelID: cfg.channelID || channelId,  // ✅ FIX: Ensure channelID exists
          data: dataArray[index] || [],
        };
      });
      
      console.log(`[Storage] ✅ Loaded ${combined.length} channels (v3 separate format, saved at ${metadata.savedAt})`);
      return combined;
    }
    
    // ✅ Fallback to legacy combined format
    const legacyStored = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyStored) {
      const legacyData = JSON.parse(legacyStored);
      console.log(`[Storage] ⚠️ Loaded ${legacyData.length} channels (legacy format - will migrate on next save)`);
      return Array.isArray(legacyData) ? legacyData : [];
    }
    
    console.log("[Storage] No computed channels found in localStorage");
    return [];
  } catch (error) {
    console.error("[Storage] Error loading computed channels:", error);
    return [];
  }
}

/**
 * Clear all computed channels from localStorage
 * @returns {boolean} Success status
 */
export function clearComputedChannelsFromStorage() {
  try {
    // Clear new separate keys
    localStorage.removeItem(STORAGE_CFG_KEY);
    localStorage.removeItem(STORAGE_DATA_KEY);
    localStorage.removeItem(STORAGE_METADATA_KEY);
    // Clear legacy key too
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    console.log("✅ Cleared computed channels from localStorage");
    return true;
  } catch (error) {
    console.error("[Storage] Error clearing computed channels:", error);
    return false;
  }
}

/**
 * Get storage metadata
 * @returns {Object} Metadata object or empty object if none
 */
export function getComputedChannelStorageMetadata() {
  try {
    const metadata = localStorage.getItem(STORAGE_METADATA_KEY);
    return metadata ? JSON.parse(metadata) : {};
  } catch (error) {
    console.error("[Storage] Error reading metadata:", error);
    return {};
  }
}

/**
 * Check if stored computed channels exist
 * @returns {boolean} True if computed channels are stored
 */
export function hasStoredComputedChannels() {
  try {
    // Check new format first, then legacy
    return localStorage.getItem(STORAGE_CFG_KEY) !== null || 
           localStorage.getItem(LEGACY_STORAGE_KEY) !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Update a computed channel's group in storage (lightweight update)
 * @param {string} channelId - The computed channel ID
 * @param {string} newGroup - The new group ID
 * @returns {boolean} Success status
 */
export function updateComputedChannelGroupInStorage(channelId, newGroup) {
  try {
    // Load existing (returns combined format)
    const stored = loadComputedChannelsFromStorage();
    const idx = stored.findIndex((ch) => ch.id === channelId);
    
    if (idx < 0) {
      console.warn(`[Storage] ⚠️ Computed channel "${channelId}" not found`);
      return false;
    }

    const oldGroup = stored[idx].group;
    stored[idx].group = newGroup;
    
    // ✅ Split and save using new format
    const cfgArray = stored.map(ch => {
      const { data, ...metadata } = ch;
      return metadata;
    });
    const dataArray = stored.map(ch => ch.data || []);
    
    saveComputedChannelsToStorage(cfgArray, dataArray);
    
    console.log(`[Storage] ✅ Updated group for "${channelId}": "${oldGroup}" → "${newGroup}"`);
    return true;
  } catch (error) {
    console.error(`[Storage] ❌ Error updating group:`, error.message);
    return false;
  }
}

/**
 * Update any field(s) of a computed channel in storage
 * @param {string} channelId - The computed channel ID
 * @param {Object} updates - Object with fields to update (e.g., { unit: "A", color: "#FF0000" })
 * @returns {boolean} Success status
 */
export function updateComputedChannelInStorage(channelId, updates) {
  try {
    if (!updates || typeof updates !== 'object') {
      console.warn(`[Storage] ⚠️ Invalid updates object`);
      return false;
    }
    
    // Load existing (returns combined format)
    const stored = loadComputedChannelsFromStorage();
    const idx = stored.findIndex((ch) => ch.id === channelId);
    
    if (idx < 0) {
      console.warn(`[Storage] ⚠️ Computed channel "${channelId}" not found`);
      return false;
    }

    // Apply updates
    const updatedFields = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'data' && key !== 'id') { // Protect certain fields
        const oldValue = stored[idx][key];
        stored[idx][key] = value;
        updatedFields.push(`${key}: "${oldValue}" → "${value}"`);
      }
    }
    
    if (updatedFields.length === 0) {
      console.warn(`[Storage] ⚠️ No valid fields to update`);
      return false;
    }
    
    // Split and save using new format
    const cfgArray = stored.map(ch => {
      const { data, ...metadata } = ch;
      return metadata;
    });
    const dataArray = stored.map(ch => ch.data || []);
    
    saveComputedChannelsToStorage(cfgArray, dataArray);
    
    console.log(`[Storage] ✅ Updated "${channelId}": ${updatedFields.join(', ')}`);
    return true;
  } catch (error) {
    console.error(`[Storage] ❌ Error updating channel:`, error.message);
    return false;
  }
}

/**
 * Get a computed channel by ID
 * @param {string} channelId - The channel ID to find
 * @returns {Object|null} The computed channel object or null
 */
export function getComputedChannelById(channelId) {
  try {
    const stored = loadComputedChannelsFromStorage();
    return stored.find((ch) => ch.id === channelId) || null;
  } catch (error) {
    console.error(
      `[Storage] ❌ Error fetching computed channel "${channelId}":`,
      error.message
    );
    return null;
  }
}

/**
 * Delete a computed channel from storage by ID
 * @param {string} channelId - The computed channel ID to delete
 * @returns {boolean} Success status
 */
export function deleteComputedChannelFromStorage(channelId) {
  try {
    if (!channelId) {
      console.warn(`[Storage] ⚠️ No channel ID provided for deletion`);
      return false;
    }
    
    // Load existing (returns combined format)
    const stored = loadComputedChannelsFromStorage();
    const idx = stored.findIndex((ch) => ch.id === channelId);
    
    if (idx < 0) {
      console.warn(`[Storage] ⚠️ Computed channel "${channelId}" not found for deletion`);
      return false;
    }

    // Remove from array
    stored.splice(idx, 1);
    
    // Split and save using new format
    const cfgArray = stored.map(ch => {
      const { data, ...metadata } = ch;
      return metadata;
    });
    const dataArray = stored.map(ch => ch.data || []);
    
    saveComputedChannelsToStorage(cfgArray, dataArray);
    
    console.log(`[Storage] ✅ Deleted computed channel "${channelId}" from localStorage`);
    return true;
  } catch (error) {
    console.error(`[Storage] ❌ Error deleting computed channel:`, error.message);
    return false;
  }
}
