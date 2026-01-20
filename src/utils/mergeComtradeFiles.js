/**
 * Merge COMTRADE Files
 * Main orchestrator for combining multiple CFG/DAT file pairs
 * Uses sequential strategy: concatenates time and renames channels with file prefixes
 */

import { mergeTimeArraysSequential } from "./timeMerger.js";
import { mergeAnalogChannels, mergeDigitalChannels } from "./channelMerger.js";

/**
 * Merge multiple COMTRADE file sets
 * @param {Array<{cfg: Object, dat: Object, filename: string}>} parsedFileSets - Array of {cfg, dat, filename}
 * @returns {Object} { mergedCfg, mergedData }
 */
export function mergeComtradeFilesSetsSequential(parsedFileSets) {
  if (!parsedFileSets || parsedFileSets.length === 0) {
    throw new Error("[mergeComtradeFiles] No file sets provided");
  }

  console.log(
    "[mergeComtradeFiles] Starting merge of",
    parsedFileSets.length,
    "file sets"
  );

  // Single file - return as-is
  if (parsedFileSets.length === 1) {
    console.log("[mergeComtradeFiles] Single file - returning without merge");
    return {
      mergedCfg: parsedFileSets[0].cfg,
      mergedData: parsedFileSets[0].dat,
      isMerged: false,
      fileCount: 1,
    };
  }

  // Extract arrays for processing
  const cfgArray = parsedFileSets.map((set) => ({
    ...set.cfg,
    filename: set.filename,
  }));
  const dataArray = parsedFileSets.map((set) => set.dat);

  // Use the time array from the first file for all merged data
  const baseTime = dataArray[0].time;
  const fileOffsets = parsedFileSets.map((set, idx) => ({
    fileIdx: idx,
    startTime: baseTime[0],
    endTime: baseTime[baseTime.length - 1],
    sampleCount: baseTime.length,
    timeOffset: 0,
    duration: baseTime[baseTime.length - 1] - baseTime[0],
  }));

  // Merge analog channels (stack channels, do not merge time)
  console.log("[mergeComtradeFiles] Step 2: Merging analog channels...");
  const { analogChannels: mergedAnalogChannels, analogData: mergedAnalogData } =
    mergeAnalogChannels(cfgArray, dataArray);

  // Merge digital channels (stack channels, do not merge time)
  console.log("[mergeComtradeFiles] Step 3: Merging digital channels...");
  const {
    digitalChannels: mergedDigitalChannels,
    digitalData: mergedDigitalData,
  } = mergeDigitalChannels(cfgArray, dataArray);

  // Build merged CFG
  const mergedCfg = buildMergedCfg(
    cfgArray,
    mergedAnalogChannels,
    mergedDigitalChannels,
    fileOffsets
  );

  // Build merged data
  const mergedData = {
    time: baseTime,
    analogData: mergedAnalogData,
    digitalData: mergedDigitalData,
    fileOffsets: fileOffsets,
    isMerged: true,
    sourceFileCount: parsedFileSets.length,
  };

  console.log("[mergeComtradeFiles] ✅ Merge complete");
  console.log(`[mergeComtradeFiles]    Total time samples: ${baseTime.length}`);
  console.log(
    `[mergeComtradeFiles]    Total analog channels: ${mergedAnalogChannels.length}`
  );
  console.log(
    `[mergeComtradeFiles]    Total digital channels: ${mergedDigitalChannels.length}`
  );
  console.log(
    `[mergeComtradeFiles]    Duration: ${
      baseTime[baseTime.length - 1] - baseTime[0]
    } (units match input)`
  );

  return {
    mergedCfg,
    mergedData,
    isMerged: true,
    fileCount: parsedFileSets.length,
  };
}

/**
 * Build merged CFG object
 * @private
 */
function buildMergedCfg(
  cfgArray,
  mergedAnalogChannels,
  mergedDigitalChannels,
  fileOffsets
) {
  const firstCfg = cfgArray[0];

  return {
    // Original single-file properties (from first file)
    stationName: firstCfg.stationName || "Multiple Files",
    recordingDeviceId: firstCfg.recordingDeviceId || "MERGED",

    // Merge metadata
    isMerged: true,
    sourceFiles: cfgArray.map((cfg, idx) => ({
      filename: cfg.filename,
      index: idx,
      fileOffset: fileOffsets[idx],
    })),

    // Merged channels
    analogChannels: mergedAnalogChannels,
    digitalChannels: mergedDigitalChannels,

    // Timing info
    sampleRate: firstCfg.sampleRate || firstCfg.samplingRate || 1000,
    timezoneOffset: firstCfg.timezoneOffset || 0,

    // Metadata
    recordingStartTime: firstCfg.recordingStartTime,
    recordingStartDate: firstCfg.recordingStartDate,
  };
}

/**
 * Get channel by display name (with file prefix)
 * @param {Object} mergedCfg - Merged CFG object
 * @param {string} displayName - Channel display name
 * @returns {Object} Channel object or null
 */
export function getChannelByDisplayName(mergedCfg, displayName) {
  let channel = mergedCfg.analogChannels.find(
    (ch) => ch.displayName === displayName
  );
  if (channel) return channel;

  channel = mergedCfg.digitalChannels.find(
    (ch) => ch.displayName === displayName
  );
  return channel || null;
}

/**
 * Get all channels for a specific source file
 * @param {Object} mergedCfg - Merged CFG object
 * @param {number} fileIndex - Source file index
 * @returns {Array} Channels from that file
 */
export function getChannelsForFile(mergedCfg, fileIndex) {
  const analog = mergedCfg.analogChannels.filter(
    (ch) => ch.sourceFileIndex === fileIndex
  );
  const digital = mergedCfg.digitalChannels.filter(
    (ch) => ch.sourceFileIndex === fileIndex
  );
  return [...analog, ...digital];
}

export default {
  mergeComtradeFilesSetsSequential,
  getChannelByDisplayName,
  getChannelsForFile,
};
