/**
 * Main Application Logic
 * COMTRADE File Combiner UI and orchestration
 */

import ComtradeFileParser from "./utils/fileParser.js";
import ComtradeCombiner from "./utils/combiner.js";
import ReportGenerator from "./utils/reportGenerator.js";
import ComtradeDataExporter from "./utils/dataExporter.js";
import { parseCFG, parseDAT } from "../../src/components/comtradeUtils.js";
import { initChildThemeManager } from "./utils/childThemeManager.js";

const TIME_UNIT = "microseconds";

class ComtradeComberApp {
  constructor() {
    this.selectedFiles = [];
    this.parsedData = [];
    this.groups = [];
    this.report = null;
    this.initializeEventListeners();
    this.initializeTabs();

    // Initialize theme synchronization with parent window
    initChildThemeManager();

    // Notify main app that merger app is ready (if opened from main app)
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(
          {
            source: "MergerApp",
            type: "merger_ready",
            payload: {
              message: "COMTRADE File Merger is ready",
            },
          },
          "*"
        );
        console.log(
          "[ComtradeComberApp] Notified main app that merger is ready"
        );
      } catch (err) {
        console.warn("[ComtradeComberApp] Could not notify main app:", err);
      }
    }
  }

  /**
   * Read file as text - same approach as main viewer
   * @param {File} file - File to read
   * @returns {Promise<string>} File content as text
   */
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsText(file);
    });
  }

  initializeEventListeners() {
    // File input
    document.getElementById("fileInput").addEventListener("change", (e) => {
      this.handleFileSelect(e);
    });

    // Analyze button
    document.getElementById("analyzeBtn").addEventListener("click", () => {
      this.analyzeFiles();
    });

    // Combine button
    document.getElementById("combineBtn").addEventListener("click", () => {
      this.combineFiles();
    });

    // Reset button
    document.getElementById("resetBtn").addEventListener("click", () => {
      this.reset();
    });

    // Modal close
    document.querySelector(".close").addEventListener("click", () => {
      this.closeModal();
    });

    // Download report button
    const downloadBtn = document.getElementById("downloadReportBtn");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => {
        this.downloadReport();
      });
    }
  }

  initializeTabs() {
    const tabButtons = document.querySelectorAll(".tab-button");
    const tabContents = document.querySelectorAll(".tab-content");

    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const tabName = button.getAttribute("data-tab");

        // Remove active from all buttons and contents
        tabButtons.forEach((btn) => btn.classList.remove("active"));
        tabContents.forEach((content) => content.classList.remove("active"));

        // Add active to clicked button and corresponding content
        button.classList.add("active");
        const targetTab = document.getElementById(`${tabName}-tab`);
        if (targetTab) {
          targetTab.classList.add("active");
        }
      });
    });
  }

  handleFileSelect(event) {
    this.selectedFiles = Array.from(event.target.files);
    this.updateFileList();
    this.updateStatus(`Selected ${this.selectedFiles.length} files`);
  }

  updateFileList() {
    const fileList = document.getElementById("fileList");

    if (this.selectedFiles.length === 0) {
      fileList.innerHTML = '<p class="placeholder">No files selected yet</p>';
      return;
    }

    const pairs = ComtradeFileParser.matchFilePairs(this.selectedFiles);

    if (pairs.length === 0) {
      fileList.innerHTML =
        '<p class="placeholder">No matching .cfg and .dat pairs found</p>';
      return;
    }

    fileList.innerHTML = pairs
      .map(
        (pair, idx) => `
      <div class="file-item">
        <div class="file-info">
          <div class="file-name">Pair ${idx + 1}</div>
          <div class="file-time">${pair.cfg.name} + ${pair.dat.name}</div>
        </div>
        <div class="file-status status-ok">Ready</div>
      </div>
    `
      )
      .join("");
  }

  async analyzeFiles() {
    console.log("[analyzeFiles] 🚀 Starting analysis...");

    // Use the same pair matching logic
    const pairs = ComtradeFileParser.matchFilePairs(this.selectedFiles);

    console.log("[analyzeFiles] Found file pairs:", pairs.length);

    if (pairs.length === 0) {
      this.updateStatus("❌ No matching file pairs found");
      return;
    }

    this.updateStatus("Analyzing files...");
    this.parsedData = [];

    try {
      for (const pair of pairs) {
        try {
          console.log(
            `[analyzeFiles] Reading files:`,
            pair.cfg.name,
            pair.dat.name
          );

          // Read CFG file as TEXT
          const cfgText = await this.readFileAsText(pair.cfg);
          console.log(`[analyzeFiles] CFG text length:`, cfgText.length);

          const cfg = parseCFG(cfgText, TIME_UNIT);
          console.log(
            `[analyzeFiles] ✅ CFG parsed:`,
            cfg.stationName,
            cfg.analogChannels?.length,
            cfg.digitalChannels?.length
          );

          // Read DAT file as TEXT
          const datText = await this.readFileAsText(pair.dat);
          console.log(`[analyzeFiles] DAT text length:`, datText.length);

          const datData = parseDAT(datText, cfg, cfg.ft || "ASCII", TIME_UNIT);
          console.log(
            `[analyzeFiles] ✅ DAT parsed:`,
            datData.time?.length,
            "samples"
          );

          console.log(`[analyzeFiles] ✅ Parsed file pair:`, {
            cfgName: pair.cfg.name,
            analogChannels: cfg.analogChannels?.length || 0,
            digitalChannels: cfg.digitalChannels?.length || 0,
            samples: datData.time?.length || 0,
          });

          // ✅ Store EXACTLY as parent app does
          // Include timestamp for grouping by time window
          const timestamp = datData.startDateInfo
            ? new Date(
                `${datData.startDateInfo.date} ${datData.startDateInfo.time}`
              )
            : new Date();

          // ✅ Combine analog and digital channels for compatibility with combiner logic
          const channels = [
            ...(cfg.analogChannels || []),
            ...(cfg.digitalChannels || []),
          ];

          this.parsedData.push({
            fileName: pair.cfg.name.replace(".cfg", ""),
            cfg: cfg,
            data: datData,
            timestamp: timestamp, // ✅ Required for groupByTimeWindow
            channels: channels, // ✅ Required for duplicate detection
          });
        } catch (pairError) {
          console.error(
            `[analyzeFiles] ❌ Error parsing pair ${pair.cfg.name}:`,
            pairError
          );
          this.updateStatus(
            `❌ Error parsing ${pair.cfg.name}: ${pairError.message}`
          );
          throw pairError;
        }
      }

      // Get settings
      const timeWindow = parseFloat(
        document.getElementById("timeWindow").value
      );
      const removeDuplicates =
        document.getElementById("removeDuplicates").checked;
      const removeSimilar = document.getElementById("removeSimilar").checked;
      const threshold = parseFloat(
        document.getElementById("similarityThreshold").value
      );

      console.log("[analyzeFiles] Settings loaded:", {
        timeWindow,
        removeDuplicates,
        removeSimilar,
        threshold,
      });

      // Group by time window
      this.groups = ComtradeCombiner.groupByTimeWindow(
        this.parsedData,
        timeWindow
      );

      console.log("[analyzeFiles] Groups created:", this.groups.length);

      // ✅ SKIP REPORT GENERATION - Go directly to combine
      // this.report = ReportGenerator.generateReport(...)
      // this.displayAnalysisResults(...)

      // Enable combine button
      if (this.groups.length > 0) {
        document.getElementById("combineBtn").disabled = false;
      }

      this.updateStatus(
        `✅ Analysis complete: ${this.groups.length} group(s) ready to combine. Click "Combine & Export" button.`
      );
    } catch (error) {
      console.error("[analyzeFiles] ❌ Analysis error:", error);
      this.updateStatus(`❌ Error: ${error.message}`);
      console.error(error);
    }
  }

  displayAnalysisResults(removeDuplicates, removeSimilar, threshold) {
    const results = document.getElementById("analysisResults");

    let html = "";

    // Duplicates
    if (removeDuplicates) {
      const duplicates = ComtradeCombiner.findDuplicateChannels(
        this.parsedData
      );
      const duplicateCount = Object.keys(duplicates).length;

      html += `
        <div class="analysis-item">
          <div class="analysis-label">🔍 Duplicate Channels Found</div>
          <div class="analysis-value">${duplicateCount} duplicate(s) detected</div>
        </div>
      `;
    }

    // Similar channels
    if (removeSimilar) {
      const similar = ComtradeCombiner.findSimilarChannels(
        this.parsedData,
        threshold
      );

      html += `
        <div class="analysis-item">
          <div class="analysis-label">📊 Similar Channels Found</div>
          <div class="analysis-value">${
            similar.length
          } similar pair(s) at ${Math.round(threshold * 100)}% threshold</div>
        </div>
      `;
    }

    // Total statistics
    const totalChannels = this.parsedData.reduce(
      (sum, f) => sum + (f.channels ? f.channels.length : 0),
      0
    );
    html += `
      <div class="analysis-item">
        <div class="analysis-label">📈 Total Channels</div>
        <div class="analysis-value">${totalChannels} channels across ${this.parsedData.length} files</div>
      </div>
    `;

    results.innerHTML = html || '<p class="placeholder">No analysis data</p>';

    // Display combine groups
    this.displayCombineGroups(removeDuplicates, removeSimilar, threshold);

    // Display detailed report
    this.displayDetailedReport();
  }

  displayCombineGroups(removeDuplicates, removeSimilar, threshold) {
    const groupsDiv = document.getElementById("combineGroups");

    if (this.groups.length === 0) {
      groupsDiv.innerHTML = '<p class="placeholder">No groups to display</p>';
      return;
    }

    let html = this.groups
      .map((group, idx) => {
        const combined = ComtradeCombiner.prepareCombinedFile(group, {
          removeDuplicates,
          removeSimilar,
          similarityThreshold: threshold,
        });

        return `
        <div class="group-item">
          <div class="group-title">
            <span>Group ${idx + 1}</span>
            <span class="group-count">${combined.fileCount} file(s)</span>
          </div>
          <div class="group-files">
            ${combined.originalFiles
              .map((f) => `<span class="file-badge">${f}</span>`)
              .join("")}
          </div>
          <div style="margin-top: 8px; font-size: 0.85rem; color: var(--text-secondary);">
            ⏱️ Time span: ${combined.timeSpan.toFixed(2)}s<br>
            📊 Channels: ${combined.totalChannels} → ${
          combined.finalChannelCount
        } (removed: ${combined.duplicatesRemoved + combined.similarRemoved})
          </div>
        </div>
      `;
      })
      .join("");

    groupsDiv.innerHTML = html;
  }

  displayDetailedReport() {
    const reportDiv = document.getElementById("detailedReport");
    const downloadBtn = document.getElementById("downloadReportBtn");

    if (!this.report) {
      reportDiv.innerHTML = '<p class="placeholder">No report generated</p>';
      return;
    }

    const reportHTML = ReportGenerator.generateHTML(this.report);
    reportDiv.innerHTML = reportHTML;

    // Show download button
    if (downloadBtn) {
      downloadBtn.style.display = "block";
    }
  }

  downloadReport() {
    if (!this.report) return;

    const metadata = ComtradeDataExporter.generateMetadata(this.report);
    const jsonData = JSON.stringify(this.report, null, 2);

    // Create a combined export with both metadata and full report
    const timestamp = new Date().toISOString().slice(0, 10);
    ComtradeDataExporter.downloadFile(
      jsonData,
      `comtrade_combination_report_${timestamp}.json`,
      "application/json"
    );
  }

  async combineFiles() {
    const removeDuplicates =
      document.getElementById("removeDuplicates").checked;
    const removeSimilar = document.getElementById("removeSimilar").checked;
    const threshold = parseFloat(
      document.getElementById("similarityThreshold").value
    );

    this.updateStatus("Preparing combined files...");

    try {
      const combinedData = this.groups.map((group, idx) => {
        const combined = ComtradeCombiner.prepareCombinedFile(group, {
          removeDuplicates,
          removeSimilar,
          similarityThreshold: threshold,
        });

        // Add group number for later reference
        combined.groupNumber = idx + 1;
        return combined;
      });

      // Export files and prepare data to send back to main app
      const filesToSendBack = [];

      combinedData.forEach((data) => {
        try {
          // Use the original group object with full parsed data (not the report summary)
          const fullGroup = this.groups[data.groupNumber - 1];

          console.log(
            `[combineFiles] Processing group ${data.groupNumber}:`,
            `Files: ${fullGroup.files.length}`,
            `Merged channels: ${data.mergedChannels.length}`
          );

          console.log(
            `[combineFiles] Group ${data.groupNumber} file details:`,
            fullGroup.files.map((f, i) => ({
              index: i,
              name: f.fileName,
              hasChannels: !!f.channels,
              channelCount: f.channels?.length || 0,
              channelNames:
                f.channels?.map((ch) => `${ch.name}(${ch.type})`) || [],
              hasData: !!f.data,
              dataLength: f.data?.length || 0,
              hasTimes: !!f.times,
              timesLength: f.times?.length || 0,
            }))
          );

          console.log(
            `[combineFiles] Merged channels details:`,
            data.mergedChannels.map((ch) => ({
              name: ch.name,
              type: ch.type,
              unit: ch.unit || "N/A",
              source: ch.source,
            }))
          );

          const exported = ComtradeDataExporter.exportGroup(
            fullGroup,
            data.mergedChannels
          );

          // Log export info with more details
          console.log(`[combineFiles] Exported group ${data.groupNumber}:`, {
            filename: exported.filename,
            cfgLength: exported.cfgContent?.length || 0,
            datLength: exported.datContent?.length || 0,
          });

          // Store CFG and DAT content for sending back to main app
          filesToSendBack.push({
            cfgFilename: exported.cfgFilename,
            cfgContent: exported.cfgContent,
            datFilename: exported.datFilename,
            datContent: exported.datContent,
            groupNumber: data.groupNumber,
          });
        } catch (err) {
          console.warn(
            `[combineFiles] Could not export CFG/DAT for group ${data.groupNumber}:`,
            err.message
          );
        }
      });

      // Show success message
      this.updateStatus(
        `✅ Combination complete! ${combinedData.length} group(s) processed.`
      );

      // If this window was opened by the main app, send merged files back
      if (window.opener && !window.opener.closed) {
        try {
          console.log(
            "[combineFiles] 📤 Sending merged files back to main app..."
          );

          // Send the first merged group back to the main app
          if (this.groups.length > 0) {
            const firstGroup = this.groups[0];
            const firstFile = firstGroup.files[0];

            console.log("[combineFiles] Sending group data:", {
              fileCount: firstGroup.files.length,
              hasCfg: !!firstFile.cfg,
              hasData: !!firstFile.data,
            });

            // ✅ SEND THE ALREADY-PARSED DATA from parent's parseCFG/parseDAT
            // Don't re-parse - use what we already parsed correctly!
            const payload = {
              cfg: firstFile.cfg, // ✅ Already parsed by parseCFG()
              data: firstFile.data, // ✅ Already parsed by parseDAT()
              filenames: this.parsedData.map((f) => f.fileName),
              fileCount: this.parsedData.length,
              mergedGroups: this.groups.length,
              isMergedFromCombiner: true,
            };

            console.log("[combineFiles] Payload prepared:", {
              hasCfg: !!payload.cfg,
              hasData: !!payload.data,
              dataHasTime: !!payload.data?.time,
              dataHasAnalogData: !!payload.data?.analogData,
              filenames: payload.filenames.length,
            });

            // ✅ Send with "ChildWindow" source
            window.opener.postMessage(
              {
                source: "ChildWindow",
                type: "merged_files_ready",
                payload: payload,
              },
              "*"
            );

            console.log(
              "[combineFiles] ✅ Merged files sent to main app successfully"
            );
          } else {
            console.warn("[combineFiles] No groups to send back!");
          }
        } catch (sendError) {
          console.error(
            "[combineFiles] Error sending merged files:",
            sendError
          );
        }
      }

      // Switch to report tab
      const reportTab = document.querySelector('[data-tab="report"]');
      if (reportTab) {
        reportTab.click();
      }
    } catch (error) {
      this.updateStatus(`❌ Error: ${error.message}`);
      console.error(error);

      // Send error back to main app
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage(
            {
              source: "MergerApp",
              type: "merger_error",
              payload: {
                message: `Merge error: ${error.message}`,
              },
            },
            "*"
          );
        } catch (sendError) {
          console.error(
            "[combineFiles] Error sending error message:",
            sendError
          );
        }
      }
    }
  }

  /**
   * Parse CFG content string into a structured object
   * Extracts station, device, channels, and sampling information
   */
  parseCFGContent(cfgLines) {
    const cfg = {
      stationName: "",
      deviceName: "",
      version: "2013",
      analogChannels: [],
      digitalChannels: [],
      frequency: 50,
      sampleRate: 50,
    };

    try {
      // Line 1: MID (station, device, version)
      if (cfgLines[0]) {
        const [station, device, version] = cfgLines[0].split(",");
        cfg.stationName = station?.trim() || "";
        cfg.deviceName = device?.trim() || "";
        cfg.version = version?.trim() || "2013";
      }

      // Line 2: n_A, n_D (number of analog and digital channels)
      if (cfgLines[1]) {
        const [nA, nD] = cfgLines[1].split(",");
        cfg.numAnalog = parseInt(nA?.trim()) || 0;
        cfg.numDigital = parseInt(nD?.trim()) || 0;
      }

      // Parse analog channels (lines 3 to 2+numAnalog)
      let lineIdx = 2;
      for (let i = 0; i < cfg.numAnalog && lineIdx < cfgLines.length; i++) {
        const parts = cfgLines[lineIdx].split(",");
        if (parts.length >= 2) {
          cfg.analogChannels.push({
            index: i + 1,
            name: parts[1]?.trim() || `Analog${i + 1}`,
            unit: parts[5]?.trim() || "N/A",
            scale: parseFloat(parts[6]) || 1,
            offset: parseFloat(parts[7]) || 0,
          });
        }
        lineIdx++;
      }

      // Parse digital channels
      for (let i = 0; i < cfg.numDigital && lineIdx < cfgLines.length; i++) {
        const parts = cfgLines[lineIdx].split(",");
        if (parts.length >= 2) {
          cfg.digitalChannels.push({
            index: cfg.numAnalog + i + 1,
            name: parts[1]?.trim() || `Digital${i + 1}`,
          });
        }
        lineIdx++;
      }

      // Parse frequency (sample rate)
      if (lineIdx < cfgLines.length) {
        cfg.frequency = parseInt(cfgLines[lineIdx]?.trim()) || 50;
        cfg.sampleRate = cfg.frequency;
      }

      // Find and parse file type (ASCII or BINARY) - usually near the end
      // Look through remaining lines for file type
      const fileTypeValue = cfgLines.find(
        (line) =>
          line?.trim()?.toUpperCase() === "ASCII" ||
          line?.trim()?.toUpperCase() === "BINARY"
      );
      cfg.ft = fileTypeValue?.trim()?.toUpperCase() || "ASCII";

      console.log("[parseCFGContent] Parsed CFG:", cfg);
    } catch (parseError) {
      console.warn("[parseCFGContent] Error parsing CFG content:", parseError);
    }

    return cfg;
  }

  updateStatus(text) {
    document.getElementById("statusText").textContent = text;
  }

  closeModal() {
    document.getElementById("detailsModal").classList.remove("show");
  }

  reset() {
    document.getElementById("fileInput").value = "";
    this.selectedFiles = [];
    this.parsedData = [];
    this.groups = [];
    this.report = null;
    document.getElementById("fileList").innerHTML =
      '<p class="placeholder">No files selected yet</p>';
    document.getElementById("analysisResults").innerHTML =
      '<p class="placeholder">Click "Analyze Files" to see results</p>';
    document.getElementById("combineGroups").innerHTML =
      '<p class="placeholder">Results will appear here</p>';
    document.getElementById("detailedReport").innerHTML =
      '<p class="placeholder">Generate report after combination</p>';
    document.getElementById("previewChart").innerHTML =
      '<p class="placeholder">Preview will appear after combining</p>';
    document.getElementById("combineBtn").disabled = true;
    const downloadBtn = document.getElementById("downloadReportBtn");
    if (downloadBtn) {
      downloadBtn.style.display = "none";
    }
    this.updateStatus("Ready");

    // Switch to files tab
    const filesTab = document.querySelector('[data-tab="files"]');
    if (filesTab) {
      filesTab.click();
    }
  }
}

const app = new ComtradeComberApp();
