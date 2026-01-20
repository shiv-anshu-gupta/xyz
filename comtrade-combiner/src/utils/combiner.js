/**
 * Combiner - Core logic for combining COMTRADE files
 * Handles:
 * - Time window based grouping
 * - Duplicate channel removal
 * - Similar channel detection
 */

export class ComtradeCombiner {
  /**
   * Group files based on time window
   * @param {Object[]} fileData - Array of parsed file data
   * @param {number} timeWindowSeconds - Time window in seconds
   * @returns {Object[]} Groups of files to combine
   */
  static groupByTimeWindow(fileData, timeWindowSeconds) {
    if (fileData.length === 0) return [];

    // Sort by timestamp
    const sorted = [...fileData].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    const groups = [];
    let currentGroup = [sorted[0]];
    let groupStartTime = new Date(sorted[0].timestamp).getTime();

    for (let i = 1; i < sorted.length; i++) {
      const fileTime = new Date(sorted[i].timestamp).getTime();
      const timeDiffSeconds = (fileTime - groupStartTime) / 1000;

      if (timeDiffSeconds <= timeWindowSeconds) {
        // Add to current group
        currentGroup.push(sorted[i]);
      } else {
        // Start new group
        groups.push({
          files: currentGroup,
          startTime: new Date(groupStartTime),
          timeSpan: timeDiffSeconds,
          fileCount: currentGroup.length,
        });
        currentGroup = [sorted[i]];
        groupStartTime = fileTime;
      }
    }

    // Add last group
    if (currentGroup.length > 0) {
      const lastTime = new Date(currentGroup[0].timestamp).getTime();
      groups.push({
        files: currentGroup,
        startTime: new Date(lastTime),
        timeSpan: 0,
        fileCount: currentGroup.length,
      });
    }

    return groups;
  }

  /**
   * Find and remove duplicate channels
   * @param {Object[]} fileData - Array of file data
   * @returns {Object} Duplicate info
   */
  static findDuplicateChannels(fileData) {
    const duplicates = {};
    const channelNames = {};

    fileData.forEach((file, fileIdx) => {
      file.channels.forEach((channel, chIdx) => {
        const key = `${channel.name}_${channel.type}`;

        if (!channelNames[key]) {
          channelNames[key] = [];
        }

        channelNames[key].push({
          fileIndex: fileIdx,
          channelIndex: chIdx,
          fileName: file.fileName,
          channel,
        });
      });
    });

    // Find duplicates (same name in same/different files)
    for (const [key, occurrences] of Object.entries(channelNames)) {
      if (occurrences.length > 1) {
        duplicates[key] = occurrences;
      }
    }

    return duplicates;
  }

  /**
   * Calculate similarity between two channels (0 to 1)
   * Compares channel properties: name, unit, type
   * @param {Object} ch1 - Channel 1
   * @param {Object} ch2 - Channel 2
   * @returns {number} Similarity score (0-1)
   */
  static calculateChannelSimilarity(ch1, ch2) {
    let score = 0;
    let maxScore = 0;

    // Type comparison (weight: 0.3)
    maxScore += 0.3;
    if (ch1.type === ch2.type) score += 0.3;

    // Unit comparison (weight: 0.2)
    maxScore += 0.2;
    if (ch1.unit === ch2.unit) score += 0.2;

    // Name similarity (weight: 0.5) - Levenshtein distance
    maxScore += 0.5;
    const nameSim = this.calculateStringSimilarity(ch1.name, ch2.name);
    score += nameSim * 0.5;

    return maxScore > 0 ? score / maxScore : 0;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   * @param {string} str1
   * @param {string} str2
   * @returns {number} Similarity (0-1)
   */
  static calculateStringSimilarity(str1, str2) {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    if (s1 === s2) return 1;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1;

    const editDistance = this.getLevenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} s1
   * @param {string} s2
   * @returns {number} Edit distance
   */
  static getLevenshteinDistance(s1, s2) {
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  }

  /**
   * Find similar channels across files
   * @param {Object[]} fileData - Array of file data
   * @param {number} threshold - Similarity threshold (0-1)
   * @returns {Object[]} Similar channel pairs
   */
  static findSimilarChannels(fileData, threshold = 0.95) {
    const similar = [];

    // Compare all channels
    for (let i = 0; i < fileData.length; i++) {
      for (let j = i + 1; j < fileData.length; j++) {
        const file1 = fileData[i];
        const file2 = fileData[j];

        for (let chIdx1 = 0; chIdx1 < file1.channels.length; chIdx1++) {
          for (let chIdx2 = 0; chIdx2 < file2.channels.length; chIdx2++) {
            const similarity = this.calculateChannelSimilarity(
              file1.channels[chIdx1],
              file2.channels[chIdx2]
            );

            if (similarity >= threshold) {
              similar.push({
                similarity: Math.round(similarity * 100),
                channel1: {
                  file: file1.fileName,
                  name: file1.channels[chIdx1].name,
                  type: file1.channels[chIdx1].type,
                },
                channel2: {
                  file: file2.fileName,
                  name: file2.channels[chIdx2].name,
                  type: file2.channels[chIdx2].type,
                },
              });
            }
          }
        }
      }
    }

    return similar;
  }

  /**
   * Prepare combined file metadata
   * @param {Object} group - File group
   * @param {Object} options - Options (removeDuplicates, removeSimilar, etc)
   * @returns {Object} Combined file metadata
   */
  static prepareCombinedFile(group, options = {}) {
    const {
      removeDuplicates = true,
      removeSimilar = true,
      similarityThreshold = 0.95,
    } = options;

    const combined = {
      originalFiles: group.files.map((f) => f.fileName),
      timeSpan: group.timeSpan,
      startTime: group.startTime,
      fileCount: group.fileCount,
      totalChannels: 0,
      duplicatesRemoved: 0,
      similarRemoved: 0,
      mergedChannels: [],
    };

    // Collect all channels
    let allChannels = [];
    group.files.forEach((file, fileIdx) => {
      file.channels.forEach((ch, chIdx) => {
        allChannels.push({
          ...ch,
          source: { file: fileIdx, channel: chIdx },
        });
      });
    });

    combined.totalChannels = allChannels.length;

    // Remove duplicates
    if (removeDuplicates) {
      const seen = {};
      const filtered = [];

      allChannels.forEach((ch) => {
        const key = `${ch.name}_${ch.type}`;
        if (!seen[key]) {
          seen[key] = true;
          filtered.push(ch);
        } else {
          combined.duplicatesRemoved++;
        }
      });

      allChannels = filtered;
    }

    // Remove similar channels
    if (removeSimilar) {
      const toRemove = new Set();

      for (let i = 0; i < allChannels.length; i++) {
        if (toRemove.has(i)) continue;

        for (let j = i + 1; j < allChannels.length; j++) {
          if (toRemove.has(j)) continue;

          const sim = this.calculateChannelSimilarity(
            allChannels[i],
            allChannels[j]
          );

          if (sim >= similarityThreshold) {
            toRemove.add(j);
            combined.similarRemoved++;
          }
        }
      }

      allChannels = allChannels.filter((_, idx) => !toRemove.has(idx));
    }

    combined.mergedChannels = allChannels;
    combined.finalChannelCount = allChannels.length;

    return combined;
  }
}

export default ComtradeCombiner;
