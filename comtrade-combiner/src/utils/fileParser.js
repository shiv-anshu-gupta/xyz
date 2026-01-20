/**
 * COMTRADE 2013 File Parser
 * Parses CFG files following the COMTRADE 2013 standard format
 *
 * CFG Format (Line by line):
 * 1. MID = station,device,rev (e.g., "MID=SUBSTATION,RELAY,2013")
 * 2. n_A, n_D = num_analog, num_digital
 * 3-n. Channel definitions (one per line)
 * ... Sample rate lines, timestamp, etc
 */

export class ComtradeFileParser {
  /**
   * Parse COMTRADE 2013 CFG file
   * Supports both ASCII (.cfg) and binary (.dat) COMTRADE files
   * @param {File} cfgFile - The .cfg file
   * @returns {Promise<Object>} Parsed CFG data with all metadata
   */
  static async parseCFG(cfgFile) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          // Use same parsing as main viewer - don't filter empty lines!
          const rows = text.split(/\r?\n/);
          const cells = rows.map((row) =>
            row.split(",").map((cell) => cell.trim())
          );

          console.log("[parseCFG] 📋 Raw CFG structure:", {
            fileName: cfgFile.name,
            totalRows: rows.length,
            totalCells: cells.length,
            row0: cells[0],
            row1: cells[1],
            row2: cells[2],
            row3: cells[3],
          });

          if (cells.length < 2) {
            throw new Error("Invalid CFG file: too few rows");
          }

          // Line 1: MID - station,device,rev
          const [stationName, deviceID, COMTRADE_rev] = cells[0];

          // Line 2: n_A, n_D (with A and D prefixes in COMTRADE 2013)
          // Format: totalChannels,nA,nD or totalChannels,nAA,nDD (with A/D prefixes)
          let numAnalog = 0;
          let numDigital = 0;

          if (cells[1].length >= 3) {
            // COMTRADE 2013 format with A/D prefixes
            numAnalog = Number(cells[1][1].replace("A", "")) || 0;
            numDigital = Number(cells[1][2].replace("D", "")) || 0;
          } else if (cells[1].length >= 2) {
            // Alternative format without prefixes
            numAnalog = Number(cells[1][0]) || 0;
            numDigital = Number(cells[1][1]) || 0;
          }

          console.log("[parseCFG] 📊 Channel counts (COMTRADE 2013 format):", {
            line1Raw: cells[1],
            numAnalog,
            numDigital,
            totalChannels: numAnalog + numDigital,
          });

          // Lines 2+ to (2 + numAnalog + numDigital): Channel definitions
          const channels = [];

          // Parse analog channels (cells[2] to cells[2 + numAnalog - 1])
          for (let i = 0; i < numAnalog; i++) {
            const row = cells[2 + i];
            if (row && row.length >= 5) {
              channels.push({
                id: parseInt(row[0]),
                name: row[1],
                phase: row[2],
                component: row[3],
                unit: row[4],
                type: "analog",
                scale: parseFloat(row[5]) || 1,
                offset: parseFloat(row[6]) || 0,
                skew: parseFloat(row[7]) || 0,
                min: parseInt(row[8]) || 0,
                max: parseInt(row[9]) || 0,
                primary: parseFloat(row[10]) || 1,
                secondary: parseFloat(row[11]) || 1,
                reference: row[12] || "",
              });
            }
          }

          // Parse digital channels (cells[2 + numAnalog] to cells[2 + numAnalog + numDigital - 1])
          for (let i = 0; i < numDigital; i++) {
            const row = cells[2 + numAnalog + i];
            if (row && row.length >= 5) {
              channels.push({
                id: parseInt(row[0]),
                name: row[1],
                phase: row[2],
                component: row[3],
                normalState: row[4] === "1",
                type: "digital",
              });
            }
          }

          console.log("[parseCFG] ✅ Parsed channels:", {
            totalChannels: channels.length,
            analogCount: channels.filter((ch) => ch.type === "analog").length,
            digitalCount: channels.filter((ch) => ch.type === "digital").length,
            channelNames: channels.map((ch) => `${ch.name}(${ch.type})`),
          });

          // Find sampling rates, start time, and other metadata
          // Based on main viewer pattern: these come after the channel definitions
          const channelDefsEndRow = 2 + numAnalog + numDigital;

          let sampleRate = 4800;
          let totalSamples = 0;
          let timestamp = new Date();
          let fileType = "ASCII";

          resolve({
            stationName,
            deviceID,
            COMTRADE_rev,
            timestamp,
            channels,
            analogChannels: channels.filter((ch) => ch.type === "analog"),
            digitalChannels: channels.filter((ch) => ch.type === "digital"),
            numAnalog,
            numDigital,
            totalChannels: numAnalog + numDigital,
            sampleRate,
            totalSamples,
            fileName: cfgFile.name,
            fileSize: cfgFile.size,
            timespanSeconds: totalSamples / sampleRate,
            ft: fileType,
          });
        } catch (error) {
          reject(new Error(`Failed to parse CFG: ${error.message}`));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read CFG file"));
      reader.readAsText(cfgFile);
    });
  }

  /**
   * Parse COMTRADE DAT file for file size and sample info
   * @param {File} datFile - The .dat file
   * @returns {Promise<Object>} Sample data info
   */
  static async parseDAT(datFile, cfgData) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          let text;
          if (e.target.result instanceof ArrayBuffer) {
            // Binary data - try to decode as UTF-8 text
            text = new TextDecoder().decode(e.target.result);
          } else {
            // Already text
            text = e.target.result;
          }

          // Parse ASCII DAT format: sample_number,ch1,ch2,...,chN
          const lines = text.split("\n").filter((line) => line.trim());
          const data = [];
          const times = [];

          // Get info from CFG
          const numAnalog = cfgData?.analogChannels?.length || 0;
          const numDigital = cfgData?.digitalChannels?.length || 0;
          const sampleRate = cfgData?.sampleRate || 50; // Hz
          const timeDelta = 1 / sampleRate; // seconds between samples

          console.log(
            `[parseDAT] CFG info: ${numAnalog} analog + ${numDigital} digital channels, sample rate ${sampleRate}Hz`
          );
          console.log(
            `[parseDAT] Parsing ${lines.length} lines from DAT file...`
          );

          // Parse each data line
          lines.forEach((line, lineIdx) => {
            const values = line.split(",").map((v) => {
              const num = Number(v.trim());
              return isNaN(num) ? 0 : num;
            });

            if (values.length > 0) {
              const sampleNum = values[0]; // First value is sample number

              // Extract analog values (indices 1 to numAnalog)
              const analogValues = values.slice(1, numAnalog + 1);

              // Extract digital values (if present)
              const digitalValues = values.slice(
                numAnalog + 1,
                numAnalog + numDigital + 1
              );

              // Log first few samples to debug
              if (lineIdx < 3) {
                console.log(
                  `[parseDAT] Sample ${sampleNum}: ${
                    analogValues.length
                  } analog values (first 5: ${analogValues
                    .slice(0, 5)
                    .join(",")}), ${digitalValues.length} digital values`
                );
              }

              // Store combined data row
              data.push([...analogValues, ...digitalValues]);

              // Calculate time for this sample
              const time = (sampleNum - 1) * timeDelta;
              times.push(time);
            }
          });

          console.log(
            `[parseDAT] Parsed DAT file: ${lines.length} lines, ${data.length} samples`
          );

          resolve({
            data,
            times,
            analogData: data.map((row) => row.slice(0, numAnalog)),
            digitalData: data.map((row) => row.slice(numAnalog)),
            fileName: datFile.name,
            fileSize: datFile.size,
            sampleCount: data.length,
            contentLength: text.length,
          });
        } catch (error) {
          console.error("[parseDAT] Error parsing DAT:", error);
          reject(new Error(`Failed to parse DAT: ${error.message}`));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read DAT file"));
      reader.readAsText(datFile);
    });
  }

  /**
   * Match CFG and DAT files by base name
   * E.g., "test.cfg" matches with "test.dat"
   * @param {File[]} files - Array of selected files
   * @returns {Object[]} Array of { cfg, dat } pairs with parsed data
   */
  static matchFilePairs(files) {
    const pairs = [];
    const cfgFiles = files.filter((f) => f.name.toLowerCase().endsWith(".cfg"));
    const datFiles = files.filter((f) => f.name.toLowerCase().endsWith(".dat"));

    cfgFiles.forEach((cfg) => {
      const baseName = cfg.name.replace(/\.cfg$/i, "");
      const dat = datFiles.find(
        (d) => d.name.replace(/\.dat$/i, "") === baseName
      );
      if (dat) {
        pairs.push({ cfg, dat });
      }
    });

    return pairs;
  }
}

export default ComtradeFileParser;
