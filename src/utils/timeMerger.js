/**
 * Time Array Merger
 * Handles combining time arrays from multiple COMTRADE files
 * Uses sequential approach: each file's time is offset by previous file's duration
 */

/**
 * Merge multiple time arrays sequentially
 * @param {Array<{time: number[]}>} fileDataArray - Array of data objects with time arrays
 * @returns {Object} { time: combined_time_array, fileOffsets: [{fileIdx, startTime, endTime, sampleCount}] }
 */
export function mergeTimeArraysSequential(fileDataArray) {
  if (!fileDataArray || fileDataArray.length === 0) {
    throw new Error("[timeMerger] No files provided");
  }

  if (fileDataArray.length === 1) {
    console.log("[timeMerger] Single file - no merging needed");
    return {
      time: fileDataArray[0].time,
      fileOffsets: [
        {
          fileIdx: 0,
          startTime: fileDataArray[0].time[0],
          endTime: fileDataArray[0].time[fileDataArray[0].time.length - 1],
          sampleCount: fileDataArray[0].time.length,
          timeOffset: 0,
        },
      ],
    };
  }

  const mergedTime = [];
  const fileOffsets = [];
  let currentTimeOffset = 0;

  console.log(
    "[timeMerger] Merging",
    fileDataArray.length,
    "files sequentially"
  );

  for (let i = 0; i < fileDataArray.length; i++) {
    const fileTime = fileDataArray[i].time;
    if (!fileTime || fileTime.length === 0) {
      console.warn(`[timeMerger] File ${i} has no time data`);
      continue;
    }

    const fileStartTime = fileTime[0];
    const fileEndTime = fileTime[fileTime.length - 1];
    const fileDuration = fileEndTime - fileStartTime;

    // Store offset information
    fileOffsets.push({
      fileIdx: i,
      startTime: fileStartTime,
      endTime: fileEndTime,
      sampleCount: fileTime.length,
      timeOffset: currentTimeOffset,
      duration: fileDuration,
    });

    // Add time samples with offset
    for (let j = 0; j < fileTime.length; j++) {
      // Skip first sample of subsequent files if it matches the last sample of previous file
      if (i > 0 && j === 0 && mergedTime.length > 0) {
        const lastMergedTime = mergedTime[mergedTime.length - 1];
        const currentSample = fileTime[j] - fileStartTime + currentTimeOffset;
        if (Math.abs(lastMergedTime - currentSample) < 1e-9) {
          // Skip duplicate - don't log per-sample
          continue;
        }
      }

      const adjustedTime = fileTime[j] - fileStartTime + currentTimeOffset;
      mergedTime.push(adjustedTime);
    }

    // Update offset for next file
    currentTimeOffset += fileDuration;

    console.log(
      `[timeMerger] File ${i}: ${
        fileTime.length
      } samples, duration=${fileDuration.toFixed(4)}s, offset=${fileOffsets[
        i
      ].timeOffset.toFixed(4)}s`
    );
  }

  console.log(
    "[timeMerger] ✅ Merged time array:",
    mergedTime.length,
    "total samples"
  );
  return { time: mergedTime, fileOffsets };
}

/**
 * Get file index for a given time value
 * @param {number[]} time - Merged time array
 * @param {Array} fileOffsets - File offset metadata
 * @param {number} timeValue - Time value to look up
 * @returns {number} File index
 */
export function getFileIndexForTime(time, fileOffsets, timeValue) {
  for (const offset of fileOffsets) {
    if (
      timeValue >= offset.timeOffset &&
      timeValue < offset.timeOffset + offset.duration
    ) {
      return offset.fileIdx;
    }
  }
  return 0; // Default to first file
}

/**
 * Get sample index within a specific file
 * @param {number} mergedIndex - Index in merged time array
 * @param {number[]} mergedTime - Merged time array
 * @param {Array} fileOffsets - File offset metadata
 * @returns {Object} { fileIdx, sampleIndexInFile }
 */
export function getSampleIndexInFile(mergedIndex, mergedTime, fileOffsets) {
  if (mergedIndex >= mergedTime.length) {
    console.warn("[timeMerger] Index out of bounds");
    return { fileIdx: 0, sampleIndexInFile: 0 };
  }

  const timeValue = mergedTime[mergedIndex];

  for (const offset of fileOffsets) {
    if (
      timeValue >= offset.timeOffset &&
      timeValue < offset.timeOffset + offset.duration
    ) {
      // Calculate sample index within this file
      const relativeTime = timeValue - offset.timeOffset;
      // Find closest sample in original file time
      // This is approximate - assumes uniform sampling
      const originalStartTime = offset.startTime;
      const sampleIndexInFile = Math.round(
        (relativeTime / offset.duration) * (offset.sampleCount - 1)
      );

      return {
        fileIdx: offset.fileIdx,
        sampleIndexInFile: Math.max(
          0,
          Math.min(sampleIndexInFile, offset.sampleCount - 1)
        ),
      };
    }
  }

  return { fileIdx: 0, sampleIndexInFile: 0 };
}

export default {
  mergeTimeArraysSequential,
  getFileIndexForTime,
  getSampleIndexInFile,
};
