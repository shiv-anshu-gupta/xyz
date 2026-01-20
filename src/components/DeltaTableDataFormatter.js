/**
 * @file DeltaTableDataFormatter.js
 * @description Pure function to format delta data for table rendering
 * ✅ FIXED: Now correctly handles 1+ vertical lines
 * - 1 line: Shows single value column (no deltas)
 * - 2+ lines: Shows values and delta columns
 */

/**
 * Transform deltaData into table format
 * Consolidates data from multiple charts into a single table
 * @param {Array} deltaData - Array of delta sections (one per chart per pair)
 * @param {number} verticalLinesCount - Number of vertical lines
 * @param {Array} verticalLineTimes - Array of time values for each vertical line
 * @returns {Array} Formatted table data
 */
export function formatTableData(
  deltaData,
  verticalLinesCount,
  verticalLineTimes = []
) {
  if (!Array.isArray(deltaData) || deltaData.length === 0) {
    console.warn("[formatTableData] No delta data to format", {
      isArray: Array.isArray(deltaData),
      length: deltaData?.length || 0,
    });
    return [];
  }

  console.log(
    `[formatTableData] 🔄 Formatting data for ${verticalLinesCount} lines from ${deltaData.length} sections`,
    {
      firstSection: deltaData[0],
      lastSection: deltaData[deltaData.length - 1],
    }
  );

  // Build a map: { channelName: { color, v0, v1, v2, ..., delta0, delta1, ..., percentage0, percentage1, ... } }
  const channelMap = new Map();

  // ✅ SINGLE LINE HANDLING: If only 1 vertical line, we don't have pairs
  if (verticalLinesCount === 1) {
    console.log("[formatTableData] 📊 Single vertical line mode - no deltas");

    // Process sections as single values (no pairing)
    deltaData.forEach((section, sectionIdx) => {
      if (!section.series || !Array.isArray(section.series)) {
        return;
      }

      section.series.forEach((seriesData) => {
        const channelName = seriesData.name || `Unknown`;

        if (!channelMap.has(channelName)) {
          channelMap.set(channelName, {
            channel: channelName,
            color: seriesData.color || "#6b7280",
          });
          console.log(`[formatTableData] ✨ New channel: ${channelName}`);
        }

        const channelData = channelMap.get(channelName);

        // For single line, use v1Formatted as the value (this is the value at the vertical line)
        channelData.v0 = seriesData.v1Formatted || "N/A";
        console.log(
          `[formatTableData] Channel ${channelName}: v0 = ${channelData.v0}`
        );
      });
    });

    // No delta/percentage columns for single line
  } else {
    // ✅ MULTIPLE LINES: Original logic for 2+ lines
    // ✅ FIX STEP 1: Detect unique delta times (each represents a different pair)
    const uniqueDeltaTimes = new Set();
    deltaData.forEach((section) => {
      if (section.deltaTime) {
        uniqueDeltaTimes.add(section.deltaTime);
      }
    });

    const deltaTimesArray = Array.from(uniqueDeltaTimes);
    const numPairs = deltaTimesArray.length;

    console.log(
      `[formatTableData] 📊 Detected ${numPairs} unique delta pairs: `,
      deltaTimesArray
    );

    // ✅ FIX STEP 2: Group sections by their delta time (pair index)
    const pairGroups = {};

    deltaData.forEach((section, sectionIdx) => {
      if (!section.series || !Array.isArray(section.series)) {
        console.warn(
          `[formatTableData] Section ${sectionIdx} has no series data`
        );
        return;
      }

      // ✅ KEY FIX: Find pair index by matching deltaTime
      const pairIdx = deltaTimesArray.indexOf(section.deltaTime);

      if (pairIdx === -1) {
        console.warn(
          `[formatTableData] ⚠️ Could not find pair for deltaTime: ${section.deltaTime}`
        );
        return;
      }

      if (!pairGroups[pairIdx]) {
        pairGroups[pairIdx] = {
          deltaTime: section.deltaTime,
          allSeries: [],
        };
      }

      // Collect ALL series from this section (different chart, same pair)
      section.series.forEach((seriesData) => {
        pairGroups[pairIdx].allSeries.push(seriesData);
      });

      console.log(
        `[formatTableData] Section ${sectionIdx} → Pair ${pairIdx} (${section.deltaTime}): ${section.series.length} channels`
      );
    });

    console.log(
      `[formatTableData] Total pair groups: ${Object.keys(pairGroups).length}`
    );

    // ✅ FIX STEP 3: Process each pair group and build channel map
    Object.entries(pairGroups).forEach(([pairIdx, pairGroup]) => {
      pairIdx = parseInt(pairIdx);

      pairGroup.allSeries.forEach((seriesData) => {
        const channelName = seriesData.name || `Unknown`;

        // Initialize channel if not exists
        if (!channelMap.has(channelName)) {
          channelMap.set(channelName, {
            channel: channelName,
            color: seriesData.color || "#6b7280",
          });
          console.log(`[formatTableData] ✨ New channel: ${channelName}`);
        }

        const channelData = channelMap.get(channelName);

        // ✅ FIX: Add v0 value (first vertical line value)
        // Only set from FIRST pair's v1 (starting value)
        if (pairIdx === 0 && !channelData.hasOwnProperty("v0")) {
          channelData.v0 = seriesData.v1Formatted || "N/A";
          console.log(
            `[formatTableData] Channel ${channelName}: v0 = ${channelData.v0}`
          );
        }

        // ✅ FIX: Add v(pairIdx+1) value
        // Pair 0: adds v1 (second line) from v2Formatted
        // Pair 1: adds v2 (third line) from v2Formatted
        // Pair 2: adds v3 (fourth line) from v2Formatted, etc.
        const vKey = `v${pairIdx + 1}`;
        channelData[vKey] = seriesData.v2Formatted || "N/A";
        console.log(
          `[formatTableData] Channel ${channelName}: ${vKey} = ${channelData[vKey]}`
        );

        // ✅ Add delta and percentage for this pair
        channelData[`delta${pairIdx}`] = seriesData.deltaFormatted || "N/A";
        channelData[`percentage${pairIdx}`] =
          seriesData.percentage != null ? parseFloat(seriesData.percentage) : 0;

        console.log(
          `[formatTableData] Channel ${channelName}: delta${pairIdx} = ${
            channelData[`delta${pairIdx}`]
          }, percentage${pairIdx} = ${channelData[`percentage${pairIdx}`]}%`
        );
      });
    });

    // ✅ Fill in missing values with "N/A" for channels that don't exist in all charts
    channelMap.forEach((channelData, channelName) => {
      // Ensure all v columns exist (v0, v1, v2, ..., v[verticalLinesCount-1])
      for (let i = 0; i < verticalLinesCount; i++) {
        const vKey = `v${i}`;
        if (!channelData.hasOwnProperty(vKey)) {
          channelData[vKey] = "N/A";
          console.log(
            `[formatTableData] ⚠️ Channel ${channelName}: ${vKey} missing, set to N/A`
          );
        }
      }

      // Ensure all delta columns exist (delta0, delta1, ... delta[numPairs-1])
      for (let i = 0; i < numPairs; i++) {
        if (!channelData.hasOwnProperty(`delta${i}`)) {
          channelData[`delta${i}`] = "N/A";
          channelData[`percentage${i}`] = 0;
          console.log(
            `[formatTableData] ⚠️ Channel ${channelName}: delta${i} missing, set to N/A`
          );
        }
      }
    });
  }

  const tableData = Array.from(channelMap.values());

  console.log(`[formatTableData] ✅ Consolidated ${tableData.length} channels`);

  // ✅ Add time row as first row
  const timeRow = {
    channel: "__TIME_ROW__",
    color: "#3b82f6",
  };

  // Add time values (T1, T2, T3, ...)
  verticalLineTimes.forEach((timeVal, idx) => {
    timeRow[`v${idx}`] = timeVal;
  });

  // Add delta times for each pair (skip if single line)
  if (verticalLinesCount > 1) {
    const uniqueDeltaTimes = new Set();
    deltaData.forEach((section) => {
      if (section.deltaTime) {
        uniqueDeltaTimes.add(section.deltaTime);
      }
    });

    const deltaTimesArray = Array.from(uniqueDeltaTimes);
    deltaTimesArray.forEach((deltaTime, pairIdx) => {
      timeRow[`delta${pairIdx}`] = deltaTime;
      timeRow[`percentage${pairIdx}`] = 0; // No percentage for time row
    });
  }

  // Insert time row at the beginning
  tableData.unshift(timeRow);

  console.log("[formatTableData] ✅ Formatted complete table with", tableData.length, "rows (including time row)", {
    totalChannels: channelMap.size,
    verticalLinesCount,
    firstDataRow: tableData[1],
    lastDataRow: tableData[tableData.length - 1],
  });

  return tableData;
}
