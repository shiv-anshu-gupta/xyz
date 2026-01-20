/**
 * Data Exporter - Merge and export combined COMTRADE files
 * Handles CFG and DAT file generation in COMTRADE 2013 format
 */

export class ComtradeDataExporter {
  /**
   * Merge and export a group of files
   * @param {Object} group - File group to export
   * @param {Array} mergedChannels - Final merged channels
   * @returns {Object} { cfgContent, datContent, filename }
   */
  static exportGroup(group, mergedChannels) {
    if (!group.files || group.files.length === 0) {
      throw new Error("No files in group to export");
    }

    // Use first file as template
    const baseFile = group.files[0];
    const filename = this.generateFilename(group);

    // Generate CFG content
    const cfgContent = this.generateCFG({
      baseFile,
      mergedChannels,
      group,
      filename,
    });

    // Generate DAT content
    const datContent = this.generateDAT({
      group,
      mergedChannels,
      baseFile,
    });

    return {
      cfgContent,
      datContent,
      filename,
      cfgFilename: `${filename}.cfg`,
      datFilename: `${filename}.dat`,
    };
  }

  /**
   * Generate CFG file content
   * Follows COMTRADE 2013 standard format
   * @param {Object} config - Configuration object
   * @returns {string} CFG file content
   */
  static generateCFG({ baseFile, mergedChannels, group, filename }) {
    const lines = [];

    // Line 1: MID (mandatory identifier)
    const station = baseFile.stationName || "MERGED";
    const device = baseFile.deviceName || "COMBINER";
    const version = "2013";
    lines.push(`${station},${device},${version}`);

    // Separate channels by type
    const analogChannels = mergedChannels.filter((ch) => ch.type === "analog");
    const digitalChannels = mergedChannels.filter(
      (ch) => ch.type === "digital"
    );

    // Line 2: n_A, n_D (number of analog and digital channels)
    lines.push(`${analogChannels.length},${digitalChannels.length}`);

    // Lines 3+: Analog channel definitions
    analogChannels.forEach((ch, idx) => {
      const chNum = idx + 1;
      const name = ch.name || `A${chNum}`;
      const unit = ch.unit || "N/A";
      const scale = ch.scale || 1;
      const offset = ch.offset || 0;
      const skew = ch.skew || 0;
      const min = ch.min || -32768;
      const max = ch.max || 32767;
      const primary = ch.primary || 1;
      const secondary = ch.secondary || 1;
      const ps = ch.ps || "P"; // Primary or Secondary

      lines.push(
        `${chNum},${name},,,,${unit},${scale},${offset},${skew},${min},${max},${primary},${secondary},${ps}`
      );
    });

    // Lines: Digital channel definitions
    digitalChannels.forEach((ch, idx) => {
      const chNum = analogChannels.length + idx + 1;
      const name = ch.name || `D${idx + 1}`;
      lines.push(`${chNum},${name},,,`);
    });

    // Sample rate information
    // Line: frequency in Hz
    const frequency = baseFile.frequency || 50;
    lines.push(`${frequency}`);

    // Line: nrates (number of different sample rates - we'll use 1 for combined files)
    lines.push(`1`); // Only one rate for combined file
    lines.push(`${frequency},${Math.ceil(this.calculateTotalSamples(group))}`);

    // Line: start timestamp (ISO format)
    const startTime = new Date(group.startTime || new Date()).toISOString();
    lines.push(startTime);

    // Line: trigger timestamp
    lines.push(startTime);

    // File type (ASCII or BINARY)
    const fileType = "ASCII"; // or "BINARY"
    lines.push(fileType);

    // Timezone offset
    const tzOffset = 0;
    lines.push(tzOffset.toString());

    // Checksum flag and spare
    lines.push("0"); // checksum flag
    lines.push(""); // spare

    return lines.join("\n");
  }

  /**
   * Generate DAT file content (ASCII format)
   * Contains the actual measurement data
   * @param {Object} config - Configuration object
   * @returns {string} DAT file content
   */
  static generateDAT({ group, mergedChannels, baseFile }) {
    const lines = [];

    // Get merged data
    const mergedData = this.mergeGroupData(group, mergedChannels);

    // Write sample number and values for each time point
    let sampleNum = 1;
    for (let i = 0; i < mergedData.length; i++) {
      const sample = mergedData[i];

      // First column is sample number
      let line = `${sampleNum}`;

      // Add values for each channel
      sample.values.forEach((value) => {
        line += `,${Math.round(value)}`; // Round to integer
      });

      lines.push(line);
      sampleNum++;
    }

    return lines.join("\n");
  }

  /**
   * Merge data from all files in a group
   * Concatenates time and aligns values
   * @param {Object} group - File group
   * @param {Array} mergedChannels - Merged channel definitions
   * @returns {Array} Array of samples with values
   */
  static mergeGroupData(group, mergedChannels) {
    const mergedData = [];

    console.log(
      `[mergeGroupData] Starting merge for ${group.files.length} file(s)`,
      {
        fileCount: group.files.length,
        mergedChannelCount: mergedChannels.length,
        firstFileSampleCount: group.files[0]?.data?.length || 0,
      }
    );

    // Simple case: single file - just copy data as-is
    if (group.files.length === 1) {
      const file = group.files[0];
      console.log("[mergeGroupData] Single file merge - copying data directly");

      if (file.data && file.data.length > 0) {
        for (let i = 0; i < file.data.length; i++) {
          mergedData.push({
            time: file.times ? file.times[i] : i,
            values: Array.isArray(file.data[i]) ? file.data[i] : [file.data[i]],
          });
        }
      }

      console.log(`[mergeGroupData] Merged ${mergedData.length} samples`);
      return mergedData;
    }

    // Multiple files: need to map channels
    let totalSamples = 0;
    group.files.forEach((file) => {
      if (file.data) {
        totalSamples += file.data.length;
      }
    });

    // For each file in the group, map its data to merged channels
    let fileOffset = 0;

    group.files.forEach((file, fileIdx) => {
      if (!file.data || file.data.length === 0) {
        console.warn(`[mergeGroupData] File ${fileIdx} has no data`);
        return;
      }

      console.log(
        `[mergeGroupData] Processing file ${fileIdx}: ${file.data.length} samples`
      );

      const fileDataLength = file.data.length;

      // Create mapping from file channels to merged channels
      const channelMapping = this.createChannelMapping(file, mergedChannels);

      // Process each sample from this file
      for (let sampleIdx = 0; sampleIdx < file.data.length; sampleIdx++) {
        // Reuse existing merged data row if available, otherwise create new
        if (mergedData.length <= fileOffset + sampleIdx) {
          mergedData.push({
            time: file.times ? file.times[sampleIdx] : fileOffset + sampleIdx,
            values: new Array(mergedChannels.length).fill(0),
          });
        }

        // Map file values to merged channels
        if (file.data[sampleIdx]) {
          file.data[sampleIdx].forEach((value, chIdx) => {
            const mergedIdx = channelMapping[chIdx];
            if (mergedIdx !== undefined && mergedIdx >= 0) {
              mergedData[fileOffset + sampleIdx].values[mergedIdx] = value;
            }
          });
        }
      }

      fileOffset += fileDataLength;
    });

    console.log(
      `[mergeGroupData] Final merged data: ${mergedData.length} samples`
    );
    return mergedData;
  }

  /**
   * Create mapping from file channels to merged channels
   * @param {Object} file - File data
   * @param {Array} mergedChannels - Merged channels
   * @returns {Array} Mapping array [mergedIdx, ...]
   */
  static createChannelMapping(file, mergedChannels) {
    const mapping = [];

    // Get channels from file - could be file.channels or file.analogChannels/digitalChannels
    const fileChannels = file.channels || [
      ...(file.analogChannels || []),
      ...(file.digitalChannels || []),
    ];

    if (!fileChannels || fileChannels.length === 0) {
      // If no channels found, create a 1-to-1 mapping
      for (let i = 0; i < mergedChannels.length; i++) {
        mapping.push(i);
      }
      return mapping;
    }

    fileChannels.forEach((fileChannel) => {
      // Find this channel in merged channels by name
      const mergedIdx = mergedChannels.findIndex(
        (ch) => ch.name === fileChannel.name || ch.name === fileChannel // Sometimes fileChannel might be just a name string
      );

      mapping.push(mergedIdx !== -1 ? mergedIdx : 0);
    });

    return mapping;
  }

  /**
   * Calculate total samples for group
   * @param {Object} group - File group
   * @returns {number} Total samples
   */
  static calculateTotalSamples(group) {
    let total = 0;
    group.files.forEach((file) => {
      if (file.data) {
        total += file.data.length;
      }
    });
    return total;
  }

  /**
   * Generate filename for combined file
   * Format: COMBINED_YYYYMMDD_HHMMSS_groupN
   * @param {Object} group - File group
   * @returns {string} Filename without extension
   */
  static generateFilename(group) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, "");

    const groupNum = group.groupNumber || 1;
    return `COMBINED_${dateStr}_${timeStr}_Group${groupNum}`;
  }

  /**
   * Download CFG and DAT files
   * @param {string} cfgContent - CFG file content
   * @param {string} datContent - DAT file content
   * @param {string} filename - Base filename
   */
  static downloadFiles(cfgContent, datContent, filename) {
    // Download CFG
    this.downloadFile(cfgContent, `${filename}.cfg`, "text/plain");

    // Download DAT
    this.downloadFile(datContent, `${filename}.dat`, "text/plain");
  }

  /**
   * Trigger file download
   * @param {string} content - File content
   * @param {string} filename - Filename
   * @param {string} mimeType - MIME type
   */
  static downloadFile(content, filename, mimeType = "text/plain") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Export all groups as JSON for inspection
   * @param {Array} groups - Array of group objects
   * @param {string} filename - Output filename
   */
  static exportGroupsAsJSON(groups, filename = "combined_export") {
    const json = JSON.stringify(groups, null, 2);
    this.downloadFile(json, `${filename}.json`, "application/json");
  }

  /**
   * Create summary metadata file
   * @param {Object} report - Report from ReportGenerator
   * @returns {string} JSON metadata
   */
  static generateMetadata(report) {
    const metadata = {
      exportedAt: new Date().toISOString(),
      summary: report.summary,
      statistics: report.statistics,
      groups: report.groups.map((g) => ({
        groupNumber: g.groupNumber,
        fileCount: g.fileCount,
        channelsRemoved: g.channelsRemoved,
        duplicatesRemoved: g.duplicatesRemoved,
        similarRemoved: g.similarRemoved,
        finalChannelCount: g.channelAnalysis.final,
      })),
    };

    return JSON.stringify(metadata, null, 2);
  }
}

export default ComtradeDataExporter;
