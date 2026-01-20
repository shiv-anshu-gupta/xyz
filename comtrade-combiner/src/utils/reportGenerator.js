/**
 * Report Generator for COMTRADE File Combination
 * Creates comprehensive reports about file merging operations
 */

export class ReportGenerator {
  /**
   * Generate detailed combination report
   * @param {Array} groups - Array of file groups to be combined
   * @param {Array} parsedData - All parsed file data
   * @param {Object} options - Combination options (removeDuplicates, removeSimilar, etc)
   * @returns {Object} Comprehensive report object
   */
  static generateReport(groups, parsedData, options = {}) {
    const {
      removeDuplicates = true,
      removeSimilar = true,
      similarityThreshold = 0.95,
      timeWindow = 2,
    } = options;

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalFiles: parsedData.length,
        totalGroups: groups.length,
        totalChannels: 0,
        channelsRemoved: 0,
        duplicatesRemoved: 0,
        similarRemoved: 0,
      },
      groups: [],
      statistics: {
        averageChannelsPerFile: 0,
        averageChannelsPerGroup: 0,
        timeWindowUsed: timeWindow,
        duplicateRemovalEnabled: removeDuplicates,
        similarRemovalEnabled: removeSimilar,
        similarityThreshold: similarityThreshold,
      },
    };

    // Process each group
    groups.forEach((group, groupIdx) => {
      const groupReport = this.analyzeGroup(group, groupIdx, options);
      report.groups.push(groupReport);

      // Accumulate statistics
      report.summary.channelsRemoved += groupReport.channelsRemoved;
      report.summary.duplicatesRemoved += groupReport.duplicatesRemoved;
      report.summary.similarRemoved += groupReport.similarRemoved;
    });

    // Calculate total channels
    report.summary.totalChannels = parsedData.reduce(
      (sum, f) => sum + (f.channels ? f.channels.length : 0),
      0
    );

    // Calculate averages
    if (parsedData.length > 0) {
      report.statistics.averageChannelsPerFile = Math.round(
        report.summary.totalChannels / parsedData.length
      );
    }

    if (groups.length > 0) {
      report.statistics.averageChannelsPerGroup = Math.round(
        (report.summary.totalChannels - report.summary.channelsRemoved) /
          groups.length
      );
    }

    // Find similar channels across entire dataset
    if (removeSimilar) {
      report.similarChannels = this.findAndReportSimilarChannels(
        parsedData,
        similarityThreshold
      );
    }

    // Find duplicate channels
    if (removeDuplicates) {
      report.duplicateChannels = this.findAndReportDuplicates(parsedData);
    }

    return report;
  }

  /**
   * Analyze a single group
   * @param {Object} group - Group object
   * @param {number} groupIdx - Group index
   * @param {Object} options - Combination options
   * @returns {Object} Group analysis
   */
  static analyzeGroup(group, groupIdx, options = {}) {
    const {
      removeDuplicates = true,
      removeSimilar = true,
      similarityThreshold = 0.95,
    } = options;

    console.log(`[analyzeGroup] Group ${groupIdx}:`, {
      fileCount: group.files.length,
      startTime: group.startTime,
      startTimeType: typeof group.startTime,
      startTimeIsDate: group.startTime instanceof Date,
      timeSpan: group.timeSpan,
    });

    const groupReport = {
      groupNumber: groupIdx + 1,
      fileCount: group.files.length,
      files: group.files.map((f, idx) => ({
        index: idx + 1,
        name: f.fileName || `File ${idx + 1}`,
        timestamp: f.timestamp,
        channels: f.channels ? f.channels.length : 0,
      })),
      timeSpan: {
        startTime: (group.startTime instanceof Date
          ? group.startTime
          : new Date(group.startTime)
        ).toISOString(),
        duration: `${group.timeSpan.toFixed(3)}s`,
        seconds: group.timeSpan,
      },
      channelAnalysis: {
        original: 0,
        afterDuplicateRemoval: 0,
        afterSimilarRemoval: 0,
        final: 0,
      },
      channelsRemoved: 0,
      duplicatesRemoved: 0,
      similarRemoved: 0,
      movedChannels: [],
      removedChannels: [],
    };

    // Collect all channels
    let allChannels = [];
    group.files.forEach((file, fileIdx) => {
      if (file.channels) {
        file.channels.forEach((ch, chIdx) => {
          allChannels.push({
            ...ch,
            source: { fileIndex: fileIdx, fileName: file.fileName },
          });
        });
      }
    });

    groupReport.channelAnalysis.original = allChannels.length;

    // Remove duplicates
    if (removeDuplicates) {
      const { filtered, removed } = this.removeDuplicateChannels(allChannels);
      allChannels = filtered;
      groupReport.duplicatesRemoved = removed.length;
      groupReport.removedChannels.push(
        ...removed.map((ch) => ({
          reason: "Duplicate",
          channel: ch.name,
          type: ch.type,
          file: ch.source.fileName,
        }))
      );
    }

    groupReport.channelAnalysis.afterDuplicateRemoval = allChannels.length;

    // Remove similar channels
    if (removeSimilar) {
      const { filtered, removed } = this.removeSimilarChannels(
        allChannels,
        similarityThreshold
      );
      allChannels = filtered;
      groupReport.similarRemoved = removed.length;
      groupReport.removedChannels.push(
        ...removed.map((ch) => ({
          reason: "Similar",
          channel: ch.name,
          type: ch.type,
          file: ch.source.fileName,
          similarity: ch.similarity || 0,
        }))
      );
    }

    groupReport.channelAnalysis.afterSimilarRemoval = allChannels.length;
    groupReport.channelAnalysis.final = allChannels.length;
    groupReport.channelsRemoved =
      groupReport.channelAnalysis.original - groupReport.channelAnalysis.final;

    // Map remaining channels
    groupReport.movedChannels = allChannels.map((ch) => ({
      name: ch.name,
      type: ch.type,
      unit: ch.unit || "N/A",
      source: ch.source.fileName,
    }));

    return groupReport;
  }

  /**
   * Remove duplicate channels (same name)
   * @param {Array} channels - All channels
   * @returns {Object} { filtered, removed }
   */
  static removeDuplicateChannels(channels) {
    const seen = {};
    const filtered = [];
    const removed = [];

    channels.forEach((ch) => {
      const key = `${ch.name}_${ch.type}`;
      if (!seen[key]) {
        seen[key] = true;
        filtered.push(ch);
      } else {
        removed.push(ch);
      }
    });

    return { filtered, removed };
  }

  /**
   * Remove similar channels
   * @param {Array} channels - All channels
   * @param {number} threshold - Similarity threshold
   * @returns {Object} { filtered, removed }
   */
  static removeSimilarChannels(channels, threshold = 0.95) {
    const toRemove = new Set();
    const removed = [];

    for (let i = 0; i < channels.length; i++) {
      if (toRemove.has(i)) continue;

      for (let j = i + 1; j < channels.length; j++) {
        if (toRemove.has(j)) continue;

        const sim = this.calculateChannelSimilarity(channels[i], channels[j]);

        if (sim >= threshold) {
          toRemove.add(j);
          removed.push({
            ...channels[j],
            similarity: Math.round(sim * 100),
          });
        }
      }
    }

    const filtered = channels.filter((_, idx) => !toRemove.has(idx));
    return { filtered, removed };
  }

  /**
   * Calculate similarity between two channels
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

    // Name similarity (weight: 0.5)
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
   * Calculate Levenshtein distance
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
   * Find and report similar channels
   * @param {Array} fileData - All parsed files
   * @param {number} threshold - Similarity threshold
   * @returns {Array} Similar channel pairs
   */
  static findAndReportSimilarChannels(fileData, threshold = 0.95) {
    const similar = [];

    for (let i = 0; i < fileData.length; i++) {
      for (let j = i + 1; j < fileData.length; j++) {
        const file1 = fileData[i];
        const file2 = fileData[j];

        if (!file1.channels || !file2.channels) continue;

        for (let ch1Idx = 0; ch1Idx < file1.channels.length; ch1Idx++) {
          for (let ch2Idx = 0; ch2Idx < file2.channels.length; ch2Idx++) {
            const sim = this.calculateChannelSimilarity(
              file1.channels[ch1Idx],
              file2.channels[ch2Idx]
            );

            if (sim >= threshold) {
              similar.push({
                similarity: `${Math.round(sim * 100)}%`,
                channel1: {
                  file: file1.fileName,
                  name: file1.channels[ch1Idx].name,
                  type: file1.channels[ch1Idx].type,
                },
                channel2: {
                  file: file2.fileName,
                  name: file2.channels[ch2Idx].name,
                  type: file2.channels[ch2Idx].type,
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
   * Find and report duplicate channels
   * @param {Array} fileData - All parsed files
   * @returns {Object} Duplicate information by key
   */
  static findAndReportDuplicates(fileData) {
    const duplicates = {};
    const channelNames = {};

    fileData.forEach((file, fileIdx) => {
      if (!file.channels) return;

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

    // Find duplicates
    for (const [key, occurrences] of Object.entries(channelNames)) {
      if (occurrences.length > 1) {
        duplicates[key] = occurrences;
      }
    }

    return duplicates;
  }

  /**
   * Generate human-readable HTML report
   * @param {Object} report - Report object from generateReport
   * @returns {string} HTML string
   */
  static generateHTML(report) {
    let html = `
      <div class="report-container">
        <div class="report-header">
          <h2>📊 COMTRADE File Combination Report</h2>
          <p class="report-time">Generated: ${new Date(
            report.timestamp
          ).toLocaleString()}</p>
        </div>

        <div class="report-summary">
          <div class="summary-card">
            <div class="summary-label">Files Combined</div>
            <div class="summary-value">${report.summary.totalFiles}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Groups Created</div>
            <div class="summary-value">${report.summary.totalGroups}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Total Channels</div>
            <div class="summary-value">${report.summary.totalChannels}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Channels Removed</div>
            <div class="summary-value" style="color: var(--warning-color);">${
              report.summary.channelsRemoved
            }</div>
          </div>
        </div>

        <div class="report-statistics">
          <h3>⚙️ Settings Used</h3>
          <ul>
            <li>Time Window: <strong>${
              report.statistics.timeWindowUsed
            }s</strong></li>
            <li>Remove Duplicates: <strong>${
              report.statistics.duplicateRemovalEnabled ? "✅ Yes" : "❌ No"
            }</strong></li>
            <li>Remove Similar: <strong>${
              report.statistics.similarRemovalEnabled ? "✅ Yes" : "❌ No"
            }</strong></li>
            ${
              report.statistics.similarRemovalEnabled
                ? `<li>Similarity Threshold: <strong>${(
                    report.statistics.similarityThreshold * 100
                  ).toFixed(0)}%</strong></li>`
                : ""
            }
          </ul>
        </div>

        ${report.groups.map((group) => this.generateGroupHTML(group)).join("")}

        ${
          report.duplicateChannels &&
          Object.keys(report.duplicateChannels).length > 0
            ? `<div class="report-section">
                 <h3>🔍 Duplicate Channels Found</h3>
                 <div class="duplicate-list">
                   ${Object.entries(report.duplicateChannels)
                     .map(
                       ([key, occurrences]) => `
                     <div class="duplicate-item">
                       <strong>${key}</strong> found in ${
                         occurrences.length
                       } file(s):
                       <ul style="margin: 5px 0 0 20px;">
                         ${occurrences
                           .map((occ) => `<li>${occ.fileName}</li>`)
                           .join("")}
                       </ul>
                     </div>
                   `
                     )
                     .join("")}
                 </div>
               </div>`
            : ""
        }

        ${
          report.similarChannels && report.similarChannels.length > 0
            ? `<div class="report-section">
                 <h3>📊 Similar Channels Detected</h3>
                 <div class="similar-list">
                   ${report.similarChannels
                     .map(
                       (sim) => `
                     <div class="similar-item">
                       <strong>${sim.similarity} similar:</strong><br>
                       ${sim.channel1.file}: <em>${sim.channel1.name}</em> (${sim.channel1.type})<br>
                       ↔️<br>
                       ${sim.channel2.file}: <em>${sim.channel2.name}</em> (${sim.channel2.type})
                     </div>
                   `
                     )
                     .join("")}
                 </div>
               </div>`
            : ""
        }
      </div>
    `;

    return html;
  }

  /**
   * Generate HTML for a single group
   * @param {Object} group - Group data
   * @returns {string} HTML string
   */
  static generateGroupHTML(group) {
    return `
      <div class="report-section">
        <h3>📦 Combined File Group ${group.groupNumber}</h3>
        
        <div class="group-info">
          <div class="info-card">
            <strong>Files Combined:</strong> ${group.fileCount}
          </div>
          <div class="info-card">
            <strong>Time Span:</strong> ${group.timeSpan.duration}
          </div>
          <div class="info-card">
            <strong>Start Time:</strong> ${group.timeSpan.startTime}
          </div>
        </div>

        <div class="group-files">
          <strong>Files Included:</strong>
          <ul>
            ${group.files
              .map(
                (f) => `
              <li>
                <strong>${f.name}</strong> 
                <span style="color: var(--text-secondary);">(${f.channels} channels)</span>
                <br>
                <small>Timestamp: ${f.timestamp}</small>
              </li>
            `
              )
              .join("")}
          </ul>
        </div>

        <div class="channel-analysis">
          <strong>Channel Analysis:</strong>
          <div class="analysis-flow">
            <div class="analysis-step">
              <div class="step-value">${group.channelAnalysis.original}</div>
              <div class="step-label">Original</div>
            </div>
            ${
              group.duplicatesRemoved > 0
                ? `
              <div class="analysis-arrow">→</div>
              <div class="analysis-step">
                <div class="step-value">${group.channelAnalysis.afterDuplicateRemoval}</div>
                <div class="step-label">After<br>Duplicates<br>Removed</div>
                <div style="font-size: 0.8em; color: var(--warning-color);">-${group.duplicatesRemoved}</div>
              </div>
            `
                : ""
            }
            ${
              group.similarRemoved > 0
                ? `
              <div class="analysis-arrow">→</div>
              <div class="analysis-step">
                <div class="step-value">${group.channelAnalysis.final}</div>
                <div class="step-label">After<br>Similar<br>Removed</div>
                <div style="font-size: 0.8em; color: var(--warning-color);">-${group.similarRemoved}</div>
              </div>
            `
                : ""
            }
          </div>
        </div>

        ${
          group.movedChannels.length > 0
            ? `
          <div class="channels-list">
            <strong>Merged Channels (${group.movedChannels.length}):</strong>
            <ul>
              ${group.movedChannels
                .slice(0, 10)
                .map(
                  (ch) => `
                <li>
                  <strong>${ch.name}</strong> 
                  <span style="color: var(--text-secondary);">(${ch.type}, ${ch.unit})</span>
                  <br>
                  <small>From: ${ch.source}</small>
                </li>
              `
                )
                .join("")}
              ${
                group.movedChannels.length > 10
                  ? `<li>... and ${group.movedChannels.length - 10} more</li>`
                  : ""
              }
            </ul>
          </div>
        `
            : ""
        }

        ${
          group.removedChannels.length > 0
            ? `
          <div class="removed-channels">
            <strong style="color: var(--warning-color);">Removed Channels (${
              group.removedChannels.length
            }):</strong>
            <ul style="color: var(--text-secondary);">
              ${group.removedChannels
                .map(
                  (ch) => `
                <li>
                  <strong>${ch.channel}</strong> 
                  <span>(${ch.type}) - Reason: ${ch.reason}</span>
                  <br>
                  <small>From: ${ch.file}</small>
                </li>
              `
                )
                .join("")}
            </ul>
          </div>
        `
            : ""
        }
      </div>
    `;
  }
}

export default ReportGenerator;
