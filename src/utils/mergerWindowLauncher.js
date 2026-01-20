/**
 * @module mergerWindowLauncher
 * @description
 * Manages the separate COMTRADE File Merger application window and inter-app communication.
 * Opens the merger app as a separate window, listens for merged file data, and passes it
 * to the main application for processing.
 *
 * Features:
 * - Opens merger app in new window (popup/child window)
 * - Establishes postMessage communication bridge
 * - Receives combined/merged COMTRADE files from merger app
 * - Passes merged data to main app for standard processing
 * - Handles window close and messaging errors gracefully
 * - ✅ Synchronizes theme with merger window
 *
 * @example
 * import { openMergerWindow, closeMergerWindow } from './mergerWindowLauncher.js';
 *
 * // Open merger app
 * const mergerWindow = openMergerWindow();
 *
 * // Merger app will send merged files back via postMessage
 * // Main app receives and processes them automatically
 */

import themeBroadcast from "./themeBroadcast.js";

let mergerWindow = null;
let mergerWindowInterval = null;

/**
 * Get reference to the merger window (for theme broadcasting)
 * @function getMergerWindow
 * @returns {Window|null} Reference to merger window or null
 */
export function getMergerWindow() {
  return mergerWindow;
}

/**
 * Open the COMTRADE File Merger application in a separate window
 * Sets up communication bridge for receiving merged file data
 *
 * @function openMergerWindow
 * @returns {Window|null} Reference to the opened window, or null if blocked
 */
export function openMergerWindow() {
  // Close existing window if open
  if (mergerWindow && !mergerWindow.closed) {
    mergerWindow.focus();
    return mergerWindow;
  }

  // Open merger app in new window
  // Adjust path based on your server structure
  const mergerUrl = new URL("./comtrade-combiner/index.html", window.location)
    .href;

  mergerWindow = window.open(
    mergerUrl,
    "COMTRADE_Merger",
    "width=1200,height=800,resizable=yes,scrollbars=yes"
  );

  if (!mergerWindow) {
    console.error(
      "[mergerWindowLauncher] Failed to open merger window - popup may be blocked"
    );
    alert(
      "Failed to open File Merger. Please check if popups are blocked by your browser."
    );
    return null;
  }

  console.log("[mergerWindowLauncher] ✅ Merger window opened successfully");

  // ✅ REGISTER window immediately (before other setup)
  themeBroadcast.registerWindow("COMTRADE_Merger", mergerWindow);

  // ✅ Load theme CSS
  themeBroadcast.loadThemeCSS(mergerWindow);

  // ✅ Unregister when window closes
  const closeCheckInterval = setInterval(() => {
    if (mergerWindow && mergerWindow.closed) {
      themeBroadcast.unregisterWindow("COMTRADE_Merger");
      clearInterval(closeCheckInterval);
    }
  }, 1000);

  // ✅ Setup theme synchronization (wait for window to load)
  setTimeout(() => {
    if (mergerWindow && !mergerWindow.closed) {
      // Send initial theme
      const currentTheme = localStorage.getItem("comtrade-theme") || "dark";
      mergerWindow.postMessage({ theme: currentTheme }, "*");
      console.log(
        "[mergerWindowLauncher] ✅ Initial theme sent to merger:",
        currentTheme
      );

      // Set up listener for theme changes in main window
      // When theme changes in main window, send it to merger window
      window.addEventListener("message", (ev) => {
        if (ev.data && ev.data.theme && mergerWindow && !mergerWindow.closed) {
          mergerWindow.postMessage({ theme: ev.data.theme }, "*");
          console.log(
            "[mergerWindowLauncher] Theme updated in merger:",
            ev.data.theme
          );
        }
      });
    }
  }, 500);

  // Monitor window status
  monitorMergerWindow();

  // Setup message listener for receiving merged files from merger app
  window.addEventListener("message", handleMergerMessage);

  return mergerWindow;
}

/**
 * Close the merger window
 * @function closeMergerWindow
 */
export function closeMergerWindow() {
  if (mergerWindow && !mergerWindow.closed) {
    mergerWindow.close();
    console.log("[mergerWindowLauncher] Merger window closed");
  }
  mergerWindow = null;
  if (mergerWindowInterval) {
    clearInterval(mergerWindowInterval);
    mergerWindowInterval = null;
  }
}

/**
 * Check if merger window is still open
 * @function isMergerWindowOpen
 * @returns {boolean}
 */
export function isMergerWindowOpen() {
  return mergerWindow && !mergerWindow.closed;
}

/**
 * Monitor merger window status
 * Cleans up if window is closed
 * @function monitorMergerWindow
 * @private
 */
function monitorMergerWindow() {
  if (mergerWindowInterval) clearInterval(mergerWindowInterval);

  mergerWindowInterval = setInterval(() => {
    if (!mergerWindow || mergerWindow.closed) {
      console.log(
        "[mergerWindowLauncher] Merger window closed by user or auto-closed"
      );
      mergerWindow = null;
      clearInterval(mergerWindowInterval);
      mergerWindowInterval = null;
    }
  }, 1000); // Check every second
}

/**
 * Handle messages from the merger app
 * Receives merged file data and passes to main app
 * @function handleMergerMessage
 * @private
 * @param {MessageEvent} event
 */
function handleMergerMessage(event) {
  // Validate origin for security (adjust as needed)
  // if (event.origin !== window.location.origin) return;

  const msg = event.data;
  if (!msg || msg.source !== "MergerApp") return;

  console.log("[mergerWindowLauncher] 📨 Message from merger app:", msg.type);

  switch (msg.type) {
    case "merger_ready":
      // Merger app is ready - acknowledge
      console.log(
        "[mergerWindowLauncher] ✅ Merger app ready for communication"
      );
      break;

    case "merged_files_ready":
      // Merger app has prepared merged files for export
      handleMergedFilesReady(msg.payload);
      break;

    case "merger_error":
      // Merger app encountered an error
      console.error("[mergerWindowLauncher] Merger app error:", msg.payload);
      alert(`Merger Error: ${msg.payload.message}`);
      break;

    case "merger_closed":
      // Merger app is closing
      console.log("[mergerWindowLauncher] Merger app closing...");
      closeMergerWindow();
      break;

    default:
      console.warn("[mergerWindowLauncher] Unknown message type:", msg.type);
  }
}

/**
 * Handle merged files from the merger app
 * Receives CFG and DAT data and prepares for loading
 * @function handleMergedFilesReady
 * @private
 * @param {Object} payload - Contains cfg, datContent, and filenames
 */
function handleMergedFilesReady(payload) {
  try {
    console.log("[mergerWindowLauncher] 📦 Processing merged files:", payload);
    console.log("[mergerWindowLauncher] Payload structure:", {
      hasCfg: !!payload?.cfg,
      cfgType: typeof payload?.cfg,
      hasData: !!payload?.data,
      dataType: typeof payload?.data,
      hasDatContent: !!payload?.datContent,
      datContentType: typeof payload?.datContent,
      datContentLength: payload?.datContent?.length || 0,
      keys: Object.keys(payload || {}),
    });

    // Handle both NEW structure (cfg+data) and OLD structure (cfg+datContent)
    if (!payload || !payload.cfg || (!payload.data && !payload.datContent)) {
      console.error(
        "[mergerWindowLauncher] Invalid payload - missing cfg or (data/datContent)",
        {
          payload: payload
            ? {
                ...payload,
                datContent: payload.datContent
                  ? `<${payload.datContent.length} chars>`
                  : undefined,
              }
            : null,
        }
      );
      return;
    }

    // Create a custom event with merged file data
    // Main app will listen for this event and process the files
    const event = new CustomEvent("mergedFilesReceived", {
      detail: {
        cfg: payload.cfg,
        data: payload.data, // NEW: Already-parsed data
        datContent: payload.datContent, // OLD: Raw text (for backwards compatibility)
        filenames: payload.filenames || ["merged_file"],
        fileCount: payload.fileCount || 1,
        isMerged: true, // Mark as merged for statistics
        isMergedFromCombiner: payload.isMergedFromCombiner,
      },
    });

    window.dispatchEvent(event);
    console.log(
      "[mergerWindowLauncher] ✅ Dispatched mergedFilesReceived event to main app"
    );
  } catch (error) {
    console.error(
      "[mergerWindowLauncher] Error processing merged files:",
      error
    );
    alert(`Error processing merged files: ${error.message}`);
  }
}

/**
 * Send a message to the merger app
 * Used for controlling the merger app from main app
 * @function sendToMerger
 * @private
 * @param {string} type - Message type
 * @param {Object} payload - Message payload
 */
export function sendToMerger(type, payload = {}) {
  if (!isMergerWindowOpen()) {
    console.warn("[mergerWindowLauncher] Merger window not open");
    return false;
  }

  try {
    mergerWindow.postMessage(
      {
        source: "MainApp",
        type,
        payload,
      },
      "*"
    );
    console.log("[mergerWindowLauncher] 📤 Sent message to merger:", type);
    return true;
  } catch (error) {
    console.error(
      "[mergerWindowLauncher] Failed to send message to merger:",
      error
    );
    return false;
  }
}
