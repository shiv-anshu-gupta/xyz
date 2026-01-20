/**
 * Channel Merger
 * Handles combining analog and digital channels from multiple COMTRADE files
 * Renames channels with file prefixes to maintain uniqueness
 */

/**
 * Rename channel with file prefix
 * @param {string} channelName - Original channel name
 * @param {number} fileIndex - File index (0-based)
 * @param {string} filename - Original filename (optional)
 * @returns {string} Renamed channel
 */
function renameChannelWithPrefix(channelName, fileIndex, filename = null) {
  if (fileIndex === 0 && !filename) {
    // First file keeps original name
    return channelName;
  }

  // Format: "File1_ChannelName" or "filename_ChannelName"
  const prefix = filename
    ? filename.replace(".dat", "").replace(".cfg", "")
    : `File${fileIndex + 1}`;
  return `${prefix}_${channelName}`;
}

/**
 * Merge analog channels from multiple files
 * @param {Array<Object>} cfgArray - Array of parsed CFG objects
 * @param {Array<Object>} dataArray - Array of parsed data objects
 * @returns {Object} { analogChannels: merged channels, analogData: merged samples }
 */
export function mergeAnalogChannels(cfgArray, dataArray) {
  if (!cfgArray || !dataArray || cfgArray.length === 0) {
    throw new Error("[channelMerger] Invalid input arrays");
  }

  const mergedChannels = [];
  const mergedAnalogData = [];
  let globalChannelIndex = 0;

  console.log(
    "[channelMerger] Merging analog channels from",
    cfgArray.length,
    "files"
  );

  for (let fileIdx = 0; fileIdx < cfgArray.length; fileIdx++) {
    const cfg = cfgArray[fileIdx];
    const data = dataArray[fileIdx];
    const filename = cfg.filename || null;

    if (!cfg.analogChannels || cfg.analogChannels.length === 0) {
      continue;
    }

    for (let chIdx = 0; chIdx < cfg.analogChannels.length; chIdx++) {
      const originalChannel = cfg.analogChannels[chIdx];
      const renamedName = renameChannelWithPrefix(
        originalChannel.name,
        fileIdx,
        filename
      );

      // Create new channel object with source metadata
      const mergedChannel = {
        ...originalChannel,
        originalName: originalChannel.name,
        displayName: renamedName,
        sourceFileIndex: fileIdx,
        sourceChannelIndex: chIdx,
        globalChannelIndex: globalChannelIndex,
      };

      mergedChannels.push(mergedChannel);

      // Get analog data for this channel
      if (data.analogData && data.analogData[chIdx]) {
        mergedAnalogData.push(data.analogData[chIdx]);
      } else {
        console.warn(`[channelMerger]   ✗ ${renamedName}: No data found`);
        mergedAnalogData.push([]);
      }

      globalChannelIndex++;
    }
  }

  console.log(
    "[channelMerger] ✅ Merged",
    mergedChannels.length,
    "analog channels"
  );
  return {
    analogChannels: mergedChannels,
    analogData: mergedAnalogData,
  };
}

/**
 * Merge digital channels from multiple files
 * @param {Array<Object>} cfgArray - Array of parsed CFG objects
 * @param {Array<Object>} dataArray - Array of parsed data objects
 * @returns {Object} { digitalChannels: merged channels, digitalData: merged samples }
 */
export function mergeDigitalChannels(cfgArray, dataArray) {
  if (!cfgArray || !dataArray || cfgArray.length === 0) {
    throw new Error("[channelMerger] Invalid input arrays");
  }

  const mergedChannels = [];
  const mergedDigitalData = [];
  let globalChannelIndex = 0;

  console.log(
    "[channelMerger] Merging digital channels from",
    cfgArray.length,
    "files"
  );

  for (let fileIdx = 0; fileIdx < cfgArray.length; fileIdx++) {
    const cfg = cfgArray[fileIdx];
    const data = dataArray[fileIdx];
    const filename = cfg.filename || null;

    if (!cfg.digitalChannels || cfg.digitalChannels.length === 0) {
      continue;
    }

    for (let chIdx = 0; chIdx < cfg.digitalChannels.length; chIdx++) {
      const originalChannel = cfg.digitalChannels[chIdx];
      const renamedName = renameChannelWithPrefix(
        originalChannel.name,
        fileIdx,
        filename
      );

      // Create new channel object with source metadata
      const mergedChannel = {
        ...originalChannel,
        originalName: originalChannel.name,
        displayName: renamedName,
        sourceFileIndex: fileIdx,
        sourceChannelIndex: chIdx,
        globalChannelIndex: globalChannelIndex,
      };

      mergedChannels.push(mergedChannel);

      // Get digital data for this channel
      if (data.digitalData && data.digitalData[chIdx]) {
        mergedDigitalData.push(data.digitalData[chIdx]);
      } else {
        console.warn(`[channelMerger]   ✗ ${renamedName}: No data found`);
        mergedDigitalData.push([]);
      }

      globalChannelIndex++;
    }
  }

  console.log(
    "[channelMerger] ✅ Merged",
    mergedChannels.length,
    "digital channels"
  );
  return {
    digitalChannels: mergedChannels,
    digitalData: mergedDigitalData,
  };
}

/**
 * Get original channel name from merged channel
 * @param {string} displayName - Display name with prefix
 * @returns {string} Original channel name
 */
export function getOriginalChannelName(displayName) {
  // Remove "File#_" or "filename_" prefix
  const match = displayName.match(/^(?:File\d+_|[^_]+_)(.+)$/);
  return match ? match[1] : displayName;
}

export default {
  renameChannelWithPrefix,
  mergeAnalogChannels,
  mergeDigitalChannels,
  getOriginalChannelName,
};
