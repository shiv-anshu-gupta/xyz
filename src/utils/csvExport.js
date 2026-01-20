/**
 * CSV Export Utility
 * Exports all channel data (analog, digital, computed, device data) to CSV format
 */

import { showProgress, updateProgress, hideProgress } from "../components/ProgressBar.js";

/**
 * Get channel metadata with fallback
 * @param {Object} channel - Channel object
 * @param {string} type - Channel type (analog, digital, computed)
 * @returns {Object} Metadata with equation/scale, unit, etc.
 */
function getChannelMetadata(channel, type = "analog") {
  // For computed channels - try to get from global metadata manager
  if (type === "computed" && window.computedChannelMetadata) {
    const meta = window.computedChannelMetadata.get(channel.name || channel.id);
    if (meta) {
      return {
        equation: meta.equation || "N/A",
        unit: meta.unit || "N/A",
        name: meta.name || channel.name || channel.id || "Unknown",
      };
    }
  }

  // For all channels - use available properties
  const name = channel.name || channel.id || `Channel_${Math.random()}`;
  let equation = "N/A";
  let unit = "N/A";

  if (type === "computed") {
    equation = channel.equation || channel.mathJsExpression || "N/A";
    unit = channel.unit || "N/A";
  } else if (type === "analog") {
    // For analog: show scale and offset as formula
    const scale = channel.scale || "1";
    const offset = channel.offset || "0";
    equation =
      offset !== "0" ? `(Raw * ${scale}) + ${offset}` : `Raw * ${scale}`;
    unit = channel.unit || "N/A";
  } else if (type === "digital") {
    equation = channel.equation || "State";
    unit = channel.unit || "Binary";
  }

  return { equation, unit, name };
}

/**
 * Export ALL channels (analog, digital, computed) to CSV with complete metadata
 * Format: Time, Channel_1_Equation, Channel_1_Data, Channel_1_Unit, Channel_2_Equation, ...
 * @param {Object} data - Data object with analog, digital, computedData arrays
 * @param {Object} cfg - COMTRADE config with analogChannels and digitalChannels metadata
 * @param {string} filename - Optional filename (default: "all-channels.csv")
 */
export async function exportAllChannelsAsCSV(data, cfg, filename = "all-channels.csv") {
  try {
    if (!data.time || data.time.length === 0) {
      alert("❌ No time data available");
      return;
    }

    // Show progress bar at start
    showProgress(0, "🔄 Preparing CSV export...");
    // Yield to allow progress bar to render
    await new Promise(resolve => setTimeout(resolve, 100));

    // Build CSV with inline metadata format
    const rows = [];
    const headers = ["Time"];
    const channelInfo = []; // Store: {data, meta, type}

    // Add analog channels (use cfg for metadata, data for values)
    if (data.analogData && Array.isArray(data.analogData) && cfg?.analogChannels) {
      for (let i = 0; i < data.analogData.length; i++) {
        const dataArray = data.analogData[i]; // Actual data array
        const cfgChannel = cfg.analogChannels[i]; // Metadata from cfg
        
        if (!Array.isArray(dataArray)) {
          console.warn(`[CSV Export] Skipping analog channel ${i}: data is not an array`);
          continue;
        }

        const meta = getChannelMetadata(cfgChannel, "analog");

        headers.push(`${meta.name}_Equation`);
        headers.push(`${meta.name}_Data`);
        headers.push(`${meta.name}_Unit`);

        channelInfo.push({
          data: dataArray, // The data array itself
          meta: meta,
          type: "analog",
          index: i,
        });
      }
    }

    // Add digital channels (use cfg for metadata, data for values)
    if (data.digitalData && Array.isArray(data.digitalData) && cfg?.digitalChannels) {
      for (let i = 0; i < data.digitalData.length; i++) {
        const dataArray = data.digitalData[i]; // Actual data array
        const cfgChannel = cfg.digitalChannels[i]; // Metadata from cfg
        
        if (!Array.isArray(dataArray)) {
          console.warn(`[CSV Export] Skipping digital channel ${i}: data is not an array`);
          continue;
        }

        const meta = getChannelMetadata(cfgChannel, "digital");

        headers.push(`${meta.name}_Equation`);
        headers.push(`${meta.name}_Data`);
        headers.push(`${meta.name}_Unit`);

        channelInfo.push({
          data: dataArray, // The data array itself
          meta: meta,
          type: "digital",
          index: i,
        });
      }
    }

    // Add computed channels
    if (data.computedData && Array.isArray(data.computedData)) {
      for (const channel of data.computedData) {
        const meta = getChannelMetadata(channel, "computed");

        headers.push(`${meta.name}_Equation`);
        headers.push(`${meta.name}_Data`);
        headers.push(`${meta.name}_Unit`);

        channelInfo.push({
          data: channel,
          meta: meta,
          type: "computed",
        });
      }
    }

    // Validate headers before joining
    console.log(`[CSV Export] Building CSV with ${channelInfo.length} channels and ${data.time.length} time samples`);
    const headerStr = headers.join(",");
    console.log(`[CSV Export] Header string length: ${headerStr.length} characters`);
    
    // Update progress
    updateProgress(5, "📝 Processing data rows...");
    // Yield to allow progress bar to render
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Use chunked approach to avoid memory overflow
    // Build CSV in chunks and create blob from chunks instead of one huge string
    const blobParts = [headerStr + "\n"];
    let processedRows = 0;

    // Add data rows in chunks
    const YIELD_INTERVAL = 5000; // Yield to browser every 5000 rows
    const totalRows = data.time.length;
    
    for (let i = 0; i < data.time.length; i++) {
      // Yield to browser periodically to allow UI updates
      if (processedRows > 0 && processedRows % YIELD_INTERVAL === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      try {
        const timeValue = data.time[i];
        // Validate time value - must be finite number
        if (typeof timeValue !== "number" || !isFinite(timeValue)) {
          console.warn(`[CSV Export] Skipping row ${i}: Invalid time value`, timeValue);
          continue;
        }

        const row = [timeValue.toString()];

        for (const info of channelInfo) {
          const { data: channelData, meta, type } = info;

          // Add equation - safely handle special characters
          const equationStr = (meta.equation || "N/A").toString().replace(/"/g, '""');
          row.push(`"${equationStr}"`);

          // Add data value - handle different data structures
          let value = "";
          try {
            if (type === "computed") {
              // Computed channels store data in .data property
              if (channelData.data && channelData.data[i] !== undefined) {
                const val = channelData.data[i];
                // Safely convert to string - only accept numbers
                if (typeof val === "number") {
                  value = isFinite(val) ? val.toString() : "";
                } else {
                  value = "";
                }
              }
            } else if (type === "analog" || type === "digital") {
              // For analog/digital, channelData is the array directly
              if (channelData[i] !== undefined) {
                const val = channelData[i];
                // Validate it's a number before converting
                if (typeof val === "number") {
                  value = isFinite(val) ? val.toString() : "";
                } else if (typeof val === "string") {
                  // If it's already a string, use it (but limit length)
                  value = val.length > 100 ? val.substring(0, 100) : val;
                } else {
                  // For any other type (objects, arrays, etc.), don't include
                  value = "";
                }
              }
            }
          } catch (valError) {
            console.warn(`[CSV Export] Error processing value at row ${i}:`, valError);
            value = "";
          }
          
          row.push(value);

          // Add unit - safely handle special characters
          const unitStr = (meta.unit || "N/A").toString().replace(/"/g, '""');
          row.push(`"${unitStr}"`);
        }

        // Validate row before joining - check for suspicious values
        const hasValidRow = row.every((cell, idx) => {
          if (typeof cell !== "string") {
            console.warn(`[CSV Export] Row ${i}, cell ${idx} is not a string:`, typeof cell);
            return false;
          }
          // Check for extremely long strings that might cause issues
          if (cell.length > 10000) {
            console.warn(`[CSV Export] Row ${i}, cell ${idx} is too long (${cell.length} chars)`);
            return false;
          }
          return true;
        });

        if (!hasValidRow) {
          console.warn(`[CSV Export] Skipping row ${i} due to invalid cells`);
          continue;
        }

        try {
          const rowStr = row.join(",") + "\n";
          blobParts.push(rowStr);
          processedRows++;
          
          // Update progress every 5000 rows
          if (processedRows % YIELD_INTERVAL === 0) {
            const progressPercent = Math.round((processedRows / totalRows) * 90) + 5; // 5-95% progress
            updateProgress(progressPercent, `📊 Processing row ${processedRows.toLocaleString()} / ${totalRows.toLocaleString()}...`);
            console.log(`[CSV Export] Processed ${processedRows} rows...`);
          }
        } catch (joinError) {
          console.error(`[CSV Export] Error joining row ${i}:`, joinError);
          console.error(`[CSV Export] Row cell count: ${row.length}`);
          throw joinError;
        }
      } catch (rowError) {
        console.warn(`[CSV Export] Error processing row ${i}:`, rowError);
        continue;
      }
    }

    console.log(`[CSV Export] Completed processing ${processedRows} data rows`);
    console.log(`[CSV Export] Creating blob from ${blobParts.length} chunks...`);
    
    // Yield to allow progress bar update before heavy blob operations
    await new Promise(resolve => setTimeout(resolve, 50));
    updateProgress(95, "💾 Creating file...");
    
    // Yield again to let progress bar render
    await new Promise(resolve => setTimeout(resolve, 50));

    // Create blob directly from chunks instead of joining into one huge string
    let blob;
    try {
      blob = new Blob(blobParts, { type: "text/csv;charset=utf-8;" });
    } catch (blobError) {
      console.error("[CSV Export] Blob creation error:", blobError);
      throw new Error(`Failed to create CSV blob: ${blobError.message}`);
    }

    if (!blob || blob.size === 0) {
      throw new Error("Generated blob is empty or invalid");
    }

    updateProgress(98, "⬇️ Starting download...");

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    
    try {
      link.click();
    } finally {
      document.body.removeChild(link);
      // Clean up object URL to free memory
      setTimeout(() => URL.revokeObjectURL(link.href), 100);
    }

    const totalChannels =
      (data.analogData?.length || 0) +
      (data.digitalData?.length || 0) +
      (data.computedData?.length || 0);
    
    // Show final success message
    updateProgress(100, `✅ CSV exported successfully!`);
    console.log(
      `✅ CSV exported: ${filename} (${totalChannels} channels, ${processedRows} data rows written, ${(blob.size / 1024 / 1024).toFixed(2)} MB)`
    );
    
    // Hide progress bar after a short delay
    setTimeout(() => hideProgress(), 2000);
  } catch (error) {
    console.error("[CSV Export] Error:", error);
    console.error("[CSV Export] Error stack:", error?.stack);
    console.error("[CSV Export] Data state:", {
      hasTime: !!data?.time,
      timeLength: data?.time?.length || 0,
      hasAnalog: !!data?.analogData,
      analogLength: data?.analogData?.length || 0,
      hasDigital: !!data?.digitalData,
      digitalLength: data?.digitalData?.length || 0,
      hasComputed: !!data?.computedData,
      computedLength: data?.computedData?.length || 0,
      hasCfg: !!cfg,
    });
    
    // Hide progress and show error
    hideProgress();
    alert(`❌ CSV export failed: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Export computed channels ONLY to CSV with complete metadata inline
 * Format: Time, Channel_1_Equation, Channel_1_Data, Channel_1_Unit, Channel_2_Equation, Channel_2_Data, Channel_2_Unit, ...
 * @param {Object} data - Data object with computedData array
 * @param {string} filename - Optional filename (default: "computed-channels.csv")
 */
export function exportComputedChannelsAsCSV(
  data,
  filename = "computed-channels.csv"
) {
  try {
    if (!data || !data.computedData || data.computedData.length === 0) {
      alert("❌ No computed channels to export");
      return;
    }

    if (!data.time || data.time.length === 0) {
      alert("❌ No time data available");
      return;
    }

    // Build CSV with inline metadata format
    const rows = [];

    // Build CSV header: Time, Channel_1_Equation, Channel_1_Data, Channel_1_Unit, Channel_2_Equation, ...
    const headers = ["Time"];
    const channelMetas = [];

    for (const channel of data.computedData) {
      const meta = getChannelMetadata(channel, "computed");
      channelMetas.push(meta);

      const channelName = meta.name;
      headers.push(`${channelName}_Equation`);
      headers.push(`${channelName}_Data`);
      headers.push(`${channelName}_Unit`);
    }
    rows.push(headers.join(","));

    // Add data rows
    for (let i = 0; i < data.time.length; i++) {
      const row = [data.time[i]];
      for (let j = 0; j < data.computedData.length; j++) {
        const channel = data.computedData[j];
        const meta = channelMetas[j];

        // Add equation (same for all rows of this channel)
        const equation = meta.equation;
        row.push(`"${equation}"`); // Quote to handle commas in equations

        // Add data value
        const value =
          channel.data && channel.data[i] !== undefined ? channel.data[i] : "";
        row.push(value);

        // Add unit (same for all rows of this channel)
        const unit = meta.unit;
        row.push(`"${unit}"`); // Quote to handle special characters
      }
      rows.push(row.join(","));
    }

    const csvContent = rows.join("\n");

    // Create blob and trigger download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(
      `✅ CSV exported: ${filename} (${data.computedData.length} channels, ${data.time.length} samples)`
    );
  } catch (error) {
    console.error("[CSV Export] Error:", error);
    alert(`❌ CSV export failed: ${error.message}`);
  }
}
