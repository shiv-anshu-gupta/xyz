// // src/components/showChannelListWindow.js
// // Opens a child window and renders the channel list with drag-and-drop support
// import { createChannelList } from './ChannelList.js';

// /**
//  * Opens a child window and displays the channel list.
//  * @param {Object} channelState - State object with analog and digital channel info.
//  * @param {Function} onChannelDrop - Callback(channelType, fromIdx, toIdx) when a channel is reordered.
//  * @param {Function} onChannelColorChange - Callback(channelType, idx, color) when a channel color is changed.
//  */
// export function showChannelListWindow(channelState, onChannelDrop, onChannelColorChange) {
//   const win = window.open('', 'ChannelListWindow', 'width=400,height=600');
//   if (!win) return;
//   win.document.title = 'Channel List';
//   // Basic styles for the list
//   win.document.head.innerHTML = `
//     <title>Channel List</title>
//     <style>
//       body { font-family: Arial, sans-serif; margin: 0; padding: 12px; background: #f9f9f9; }
//       .channel-list-container { padding: 8px; }
//       .channel-list-section { margin-bottom: 18px; }
//       .channel-list { list-style: none; padding: 0; margin: 0; }
//       .channel-list-item { padding: 6px 12px; margin-bottom: 4px; background: #fff; border: 1px solid #ccc; border-radius: 4px; cursor: grab; transition: background 0.2s; }
//       .channel-list-item.dragging { opacity: 0.5; }
//       .channel-list-item.drag-over { background: #e6f0fa; }
//       h3 { margin: 8px 0 8px 0; font-size: 1.1em; }
//     </style>
//   `;
//   win.document.body.innerHTML = '';
//   // Render the channel list
//   const renderList = () => {
//     win.document.body.innerHTML = '';
//     // Unwrap channelState if it's a proxy/state object
//     const analogChannels = channelState.analog?.yLabels?.map((id, idx) => ({
//       id,
//       color: channelState.analog.lineColors[idx],
//       type: 'analog',
//       idx
//     })) || [];
//     const digitalChannels = channelState.digital?.yLabels?.map((id, idx) => ({
//       id,
//       color: channelState.digital.lineColors[idx],
//       type: 'digital',
//       idx
//     })) || [];
//     // Compose a cfg-like object for createChannelList
//     const channelListCfg = {
//       analogChannels,
//       digitalChannels
//     };
//     const listEl = createChannelList(channelListCfg, (type, fromIdx, toIdx, color) => {
//       if (color !== undefined && typeof onChannelColorChange === 'function') {
//         onChannelColorChange(type, fromIdx, color);
//       } else {
//         onChannelDrop(type, fromIdx, toIdx);
//       }
//       renderList();
//     });
//     win.document.body.appendChild(listEl);
//   };
//   renderList();
// }

import { createChannelList } from "./ChannelList.js";
import { autoGroupChannels } from "../utils/autoGroupChannels.js";
import themeBroadcast from "../utils/themeBroadcast.js";
/**
 * Open a Channel List popup and initialize the child UI.
 *
 * This function prepares the child window (loads Tailwind + Tabulator) and
 * injects the ChannelList UI into the popup. It serializes the current
 * `channelState` (analog/digital arrays) and passes them to the child. The
 * child runs `createChannelList` inside its own context and uses
 * `window.opener.postMessage(...)` to notify the parent of user-driven
 * changes (color/name/add/delete). The parent listens for these messages and
 * updates `channelState` (createState), which in turn notifies chart
 * subscribers.
 *
 * Note: the child may also call the `onChannelColorChange` or `onChannelDrop`
 * callbacks directly if they are supplied, keeping compatibility with the
 * existing callback-based integration.
 *
 * @param {Object} channelState - reactive state (createState) containing channel metadata
 * @param {Function} [onChannelDrop] - optional callback(type, fromIdx, toIdx)
 * @param {Function} [onChannelColorChange] - optional callback(type, idx, color)
 * @param {Window} [parentWindow] - optional: reference to parent window for postMessage communication
 * @returns {Window|undefined} the popup window object if opened
 */
export function showChannelListWindow(
  channelState,
  onChannelDrop,
  onChannelColorChange,
  charts, // optional: pass charts array so we can inspect digital chart plugin for display colors
  cfg, // COMTRADE config
  data, // COMTRADE data
  parentWindow = null // ✅ FIX: Accept explicit parent window reference
) {
  // ✅ FIX: Set up parentWindow reference with fallback
  parentWindow = parentWindow || window;
  console.log(
    "[showChannelListWindow] Received parentWindow, will pass to ChannelList",
    { hasParentWindow: !!parentWindow }
  );

  const win = window.open("", "ChannelListWindow", "width=600,height=700");
  if (!win) {
    console.error("Failed to open popup window - popups may be blocked");
    return false;
  }

  // ✅ REGISTER window immediately (before other setup)
  themeBroadcast.registerWindow("ChannelListWindow", win);

  // ✅ Load theme CSS
  themeBroadcast.loadThemeCSS(win);

  // ✅ Store reference for cleanup
  window.__channelListWindow = win;

  // ✅ Unregister when popup closes
  win.addEventListener("beforeunload", () => {
    console.log(
      "[ChannelList] Popup closing, unregistering from theme broadcast"
    );
    themeBroadcast.unregisterWindow("ChannelListWindow");
    window.__channelListWindow = null;
  });

  win.document.title = "Channel List";

  // Bind full cfg/data to the popup for module scripts to consume
  try {
    win.globalCfg = cfg;
    win.globalData = data;

    // ✅ Pass color constants to popup window
    if (typeof window !== "undefined" && window.COMPUTED_CHANNEL_COLORS) {
      win.COMPUTED_CHANNEL_COLORS = window.COMPUTED_CHANNEL_COLORS;
      console.log(
        "[showChannelListWindow] ✅ Passed computed color palette to popup:",
        win.COMPUTED_CHANNEL_COLORS
      );
    }

    // Also create a serialized data object with analog and digital arrays for expression evaluation
    if (data && typeof data === "object") {
      win.__dataArrays = {
        analogData: data.analog || data.analogData || [],
        digitalData: data.digital || data.digitalData || [],
        TIME_UNIT: data.TIME_UNIT,
        TIME_DATA: data.TIME_DATA || data.time || data.t || [],
      };
      console.log(
        "[showChannelListWindow] Bound data arrays to child window:",
        {
          analogCount: win.__dataArrays.analogData.length,
          digitalCount: win.__dataArrays.digitalData.length,
        }
      );
    }

    // Also bind the computed channels state for reactive updates
    if (typeof window !== "undefined" && window.__computedChannelsState) {
      win.__computedChannelsState = window.__computedChannelsState;
    }
  } catch (e) {
    console.warn("[showChannelListWindow] Failed to bind globals:", e);
  }

  // Add Math.js - needed for expression evaluation in ChannelList
  const mathScript = win.document.createElement("script");
  mathScript.src =
    "https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.11.0/math.min.js";
  win.document.head.appendChild(mathScript);

  // Tailwind CSS
  const tailwindScript = win.document.createElement("script");
  tailwindScript.src = "https://cdn.tailwindcss.com";
  win.document.head.appendChild(tailwindScript);

  // ✅ Add MathLive CSS for LaTeX editor
  const mlCoreCSS = win.document.createElement("link");
  mlCoreCSS.rel = "stylesheet";
  mlCoreCSS.href = "https://unpkg.com/mathlive/dist/mathlive.core.css";
  win.document.head.appendChild(mlCoreCSS);

  const mlCSS = win.document.createElement("link");
  mlCSS.rel = "stylesheet";
  mlCSS.href = "https://unpkg.com/mathlive/dist/mathlive.css";
  win.document.head.appendChild(mlCSS);

  // ✅ Add custom CSS for MathLive keyboard z-index
  const mlKeyboardStyle = win.document.createElement("style");
  mlKeyboardStyle.textContent = `
    .ML__keyboard {
      z-index: 10002 !important;
    }
  `;
  win.document.head.appendChild(mlKeyboardStyle);

  // ✅ Add MathLive JavaScript
  const mlScript = win.document.createElement("script");
  mlScript.defer = true;
  mlScript.src = "https://unpkg.com/mathlive";
  win.document.head.appendChild(mlScript);

  // Add Tabulator CSS
  const tabulatorCSS = win.document.createElement("link");
  tabulatorCSS.rel = "stylesheet";
  tabulatorCSS.href =
    "https://unpkg.com/tabulator-tables@5.5.2/dist/css/tabulator.min.css";
  win.document.head.appendChild(tabulatorCSS);

  // Add Tabulator JS
  const tabulatorScript = win.document.createElement("script");
  tabulatorScript.src =
    "https://unpkg.com/tabulator-tables@5.5.2/dist/js/tabulator.min.js";
  // tabulatorScript.onload = () => {
  //   setTimeout(setupChannelList, 20); // small delay to ensure Tailwind is ready
  // };
  // win.document.head.appendChild(tabulatorScript);
  tailwindScript.onload = () => {
    tabulatorScript.onload = () => {
      // Debug Tabulator versions to detect mismatches
      try {
        console.debug(
          "popup Tabulator version:",
          win.Tabulator &&
            win.Tabulator.prototype &&
            win.Tabulator.prototype.constructor &&
            win.Tabulator.prototype.constructor.VERSION
            ? win.Tabulator.prototype.constructor.VERSION
            : win.Tabulator?.version || null
        );
      } catch (e) {
        console.debug("popup Tabulator version: (unavailable)");
      }
      try {
        console.debug(
          "main Tabulator version:",
          window.Tabulator?.version || null
        );
      } catch (e) {
        console.debug("main Tabulator version: (unavailable)");
      }
      // Ensure math.js is available before initializing table
      if (typeof win.math === "undefined") {
        mathScript.addEventListener("load", () => setupChannelList());
      } else {
        setupChannelList();
      }
    };
    win.document.head.appendChild(tabulatorScript);
  };

  // Root container with Tailwind styling
  // win.document.body.innerHTML = `
  //   <div id="channel-root" class="p-4 bg-red-50 min-h-screen overflow-x-auto"></div>
  // `;

  win.document.body.innerHTML = `
  <div id="channel-table" class="w-auto flex flex-col gap-4 rounded-md h-auto p-2 md:p-4 theme-bg">
    <div id="button-bar" class="flex flex-wrap gap-2 m-2 md:m-3">
      <select id="group-select" class="border rounded px-2 py-1 text-sm theme-border theme-bg" style="color: var(--chart-text);">
        <option value="Analog">Analog</option>
        <option value="Digital">Digital</option>
      </select>
      <button id="add-row" class="theme-btn-success text-sm px-3 py-1 rounded">
        Add Blank Row
      </button>
      <button id="history-undo" class="theme-btn-primary text-sm px-3 py-1 rounded">Undo Edit</button>
      <button id="history-redo" class="theme-btn-primary text-sm px-3 py-1 rounded">Redo Edit</button>
      <button id="download-pdf" class="theme-btn-primary text-sm px-3 py-1 rounded">Download PDF</button>
    </div>
    <div id="channel-root" class="w-auto overflow-y-auto border theme-border rounded-lg shadow-md" style="background-color: var(--chart-background);"></div>
  </div>
  `;

  // 🎨 Add custom CSS with COMPLETE theme variables (Light + Dark) + Tabulator styling
  const themeStyle = win.document.createElement("style");
  themeStyle.textContent = `
    /* ========== LIGHT THEME (Default) ========== */
    :root {
      --bg-primary: #f8fafc;
      --bg-secondary: #ffffff;
      --bg-tertiary: #f1f5f9;
      --text-primary: #1e293b;
      --text-secondary: #64748b;
      --text-muted: #94a3b8;
      --border-color: #e2e8f0;
      --chart-bg: #ffffff;
      --chart-text: #1e293b;
      --chart-grid: #cbd5e1;
      --chart-axis: #64748b;
      --chart-background: #ffffff;
    }

    /* ========== DARK THEME ========== */
    [data-theme="dark"] {
      --bg-primary: #1a1a1a;
      --bg-secondary: #2d2d2d;
      --bg-tertiary: #3a3a3a;
      --text-primary: #ffffff;
      --text-secondary: #cccccc;
      --text-muted: #888888;
      --border-color: #404040;
      --chart-bg: #252525;
      --chart-text: #ffffff;
      --chart-grid: #404040;
      --chart-axis: #cccccc;
      --chart-background: #252525;
    }

    /* ========== BASE ELEMENTS ========== */
    * {
      box-sizing: border-box;
    }

    body {
      background-color: var(--bg-primary);
      color: var(--text-primary);
      font-family: sans-serif;
      margin: 0;
      padding: 0;
    }

    /* ========== CONTAINER STYLING ========== */
    #channel-table {
      background-color: var(--bg-primary);
      color: var(--text-primary);
    }

    #button-bar {
      background-color: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
    }

    #channel-root {
      background-color: var(--chart-background) !important;
      border-color: var(--border-color) !important;
    }

    /* ========== TABULATOR STYLING FOR DARK THEME ========== */
    .tabulator {
      background-color: var(--chart-background) !important;
      border-color: var(--border-color) !important;
    }

    .tabulator-table {
      background-color: var(--chart-background) !important;
      border-color: var(--border-color) !important;
    }

    .tabulator-header {
      background-color: var(--bg-secondary) !important;
      color: var(--text-primary) !important;
      border-color: var(--border-color) !important;
    }

    .tabulator-header .tabulator-col {
      background-color: var(--bg-secondary) !important;
      color: var(--text-primary) !important;
      border-color: var(--border-color) !important;
    }

    .tabulator-header .tabulator-col:hover {
      background-color: var(--bg-tertiary) !important;
    }

    .tabulator-row {
      background-color: var(--chart-background) !important;
      color: var(--text-primary) !important;
      border-color: var(--border-color) !important;
    }

    .tabulator-row:hover {
      background-color: var(--bg-tertiary) !important;
    }

    .tabulator-cell {
      background-color: var(--chart-background) !important;
      color: var(--text-primary) !important;
      border-color: var(--border-color) !important;
    }

    .tabulator-group {
      background-color: var(--bg-secondary) !important;
      color: var(--text-primary) !important;
      border-color: var(--border-color) !important;
    }

    .tabulator-group-visible .tabulator-group-toggle {
      color: var(--text-primary) !important;
    }

    .tabulator-placeholder {
      color: var(--text-muted) !important;
    }

    .tabulator-paginator {
      background-color: var(--bg-secondary) !important;
      color: var(--text-primary) !important;
      border-color: var(--border-color) !important;
    }

    .tabulator-paginator .tabulator-page.active {
      background-color: var(--text-primary) !important;
      color: var(--chart-background) !important;
    }

    /* ========== BUTTONS & CONTROLS ========== */
    .theme-btn-primary {
      background-color: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .theme-btn-primary:hover {
      background-color: var(--bg-tertiary);
    }

    .theme-btn-success {
      background-color: #d4edda;
      color: #155724;
      border: 1px solid #155724;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .theme-btn-success:hover {
      background-color: #155724;
      color: #d4edda;
    }

    .theme-btn-danger {
      background-color: #f8d7da;
      color: #721c24;
      border: 1px solid #721c24;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
    }
    .theme-btn-danger:hover {
      background-color: #721c24;
      color: #f8d7da;
    }

    /* ========== FORM ELEMENTS ========== */
    select, input {
      background-color: var(--bg-secondary) !important;
      color: var(--text-primary) !important;
      border-color: var(--border-color) !important;
      padding: 6px 8px;
      border-radius: 4px;
    }

    select:focus, input:focus {
      outline: none;
      border-color: var(--text-primary) !important;
    }

    option {
      background-color: var(--bg-secondary) !important;
      color: var(--text-primary) !important;
    }

    /* ========== THEME-AWARE CLASSES ========== */
    .theme-bg {
      background-color: var(--chart-bg) !important;
      color: var(--chart-text) !important;
    }
    .theme-border {
      border-color: var(--border-color) !important;
    }

    /* ========== SCROLLBAR STYLING ========== */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background-color: var(--bg-primary);
    }

    ::-webkit-scrollbar-thumb {
      background-color: var(--border-color);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background-color: var(--text-muted);
    }
  `;
  win.document.head.appendChild(themeStyle);

  // 🎯 Apply current theme to popup AFTER CSS is loaded
  // This ensures CSS variables are defined BEFORE we try to use them
  const savedTheme = localStorage.getItem("comtrade-theme") || "dark";
  console.log("[showChannelListWindow] Setting initial theme to:", savedTheme);
  win.document.documentElement.setAttribute("data-theme", savedTheme);

  // ✅ UNIFIED Theme Message Handler (replaces the broken dual listeners)
  win.addEventListener("message", (event) => {
    // Safety check: only accept from parent window
    if (event.source !== window.opener && event.source !== window) {
      return;
    }

    const data = event.data || {};
    console.log("[showChannelListWindow] Received message:", {
      hasTheme: !!data.theme,
      hasType: !!data.type,
      source: data.source,
    });

    // Handle simple theme message format: { theme: "dark" }
    // (sent by some parts of themeBroadcast)
    if (data.theme && !data.type) {
      console.log("[showChannelListWindow] ✅ Applying theme (simple format):", data.theme);
      win.document.documentElement.setAttribute("data-theme", data.theme);
      win.localStorage.setItem("comtrade-theme", data.theme);
      return;
    }

    // Handle structured message format: { source: "MainApp", type: "theme_change", payload: {...} }
    // (sent by applyTheme in themeBroadcast.js)
    if (data.source === "MainApp" && data.type === "theme_change") {
      const { theme, colors } = data.payload || {};
      console.log("[showChannelListWindow] ✅ Applying theme (structured format):", theme);

      // Set data-theme attribute for CSS selector matching
      if (theme) {
        win.document.documentElement.setAttribute("data-theme", theme);
        win.localStorage.setItem("comtrade-theme", theme);
      }

      // Apply CSS variables directly (for immediate visual update)
      if (colors && typeof colors === "object") {
        const root = win.document.documentElement.style;
        Object.entries(colors).forEach(([key, value]) => {
          root.setProperty(key, value);
          console.log(`  [showChannelListWindow] Set CSS variable: ${key} = ${value}`);
        });
      }

      console.log("[showChannelListWindow] Theme updated successfully!");
      return;
    }
  });

  // Request current theme from parent on load
  if (window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage(
        {
          source: "ChildApp",
          type: "theme_request",
          payload: {
            windowType: "channelList",
            timestamp: Date.now(),
          },
        },
        "*"
      );
    } catch (err) {
      console.warn(
        "[ChannelListWindow] Could not request theme from parent:",
        err
      );
    }
  }

  function setupChannelList() {
    // Build analog channel objects and compute group names using autoGroupChannels
    const analogChannels =
      channelState.analog?.yLabels?.map((id, idx) => ({
        id,
        name: id,
        channelID: channelState.analog.channelIDs?.[idx],
        color: channelState.analog.lineColors[idx],
        type: "Analog",
        idx,
      })) || [];

    console.log(
      "[showChannelListWindow] Analog channels from channelState:",
      analogChannels
    );
    console.log(
      "[showChannelListWindow] channelState.analog.yUnits:",
      channelState.analog?.yUnits
    );

    // Compute grouping for analog channels based on ids/units
    let analogGroupMap = {};
    try {
      const groups = autoGroupChannels(
        analogChannels.map((ch, i) => ({
          id: ch.id,
          unit: channelState.analog.yUnits?.[i],
        }))
      );
      groups.forEach((g) => {
        g.indices.forEach((gi) => {
          analogGroupMap[gi] = g.name;
        });
      });
    } catch (e) {
      // fallback: leave analogGroupMap empty
    }

    // Prefer using the chart's displayed color for digital channels when available
    const digitalChannels =
      channelState.digital?.yLabels?.map((id, idx) => {
        let color = channelState.digital.lineColors[idx];
        try {
          if (charts && charts.length > 0) {
            const digitalChart = charts.find((c) => c && c._chartType === "digital");
            const plugin =
              digitalChart &&
              digitalChart.plugins &&
              digitalChart.plugins.find((p) => p && p.id === "digitalFill");
            if (plugin && typeof plugin.getSignalColors === "function") {
              const mapping = plugin.getSignalColors();
              // Each channel's original index in the state matches its idx in the channelList
              // Use this to find the displayed color for this channel if it's visible
              const found = mapping.find((m) => m.originalIndex === idx);
              if (found && found.color) {
                // If this channel is currently displayed, use its display color
                color = found.color;
              }
            }
          }
        } catch (e) {
          /* ignore and fallback to channelState color */
        }

        const cfgGroup = cfg?.digitalChannels?.[idx]?.group;
        const stateGroup = channelState.digital?.groups?.[idx];

        return {
          id,
          name: id,
          channelID: channelState.digital.channelIDs?.[idx],
          color: color,
          type: "Digital",
          idx,
          originalIndex: idx,
          group:
            (typeof cfgGroup === "string" && /^G\d+$/.test(cfgGroup)
              ? cfgGroup.trim()
              : "") ||
            (typeof stateGroup === "string" && /^G\d+$/.test(stateGroup)
              ? stateGroup.trim()
              : "") ||
            "G0",
        };
      }) || [];

    // Attach group names to analog channels (default to 'Group 1' when unknown)
    const analogChannelsWithGroup = analogChannels.map((ch, i) => ({
      ...ch,
      unit: channelState.analog?.yUnits?.[i] || "", // ← Add unit from channelState
      // prefer persisted group from channelState if present, else autoGroup map, else default
      group:
        (channelState.analog &&
          channelState.analog.groups &&
          channelState.analog.groups[i]) ||
        analogGroupMap[i] ||
        "Group 1",
    }));

    console.log(
      "[showChannelListWindow] analogChannelsWithGroup (with units):",
      analogChannelsWithGroup
    );

    // Build computed channels from cfg if available
    const computedChannels =
      cfg && cfg.computedChannels
        ? cfg.computedChannels.map((ch, idx) => ({
            id: ch.id,
            channelID: ch.id, // alias for uniformity
            name: ch.name,
            type: "Computed",
            unit: ch.unit || "",
            group: ch.group || "Computed",
            color: ch.color || "#888",
            idx,
          }))
        : [];

    // Also include computed channels from channelState if available
    if (
      channelState?.computed?.channelIDs &&
      channelState.computed.channelIDs.length > 0
    ) {
      channelState.computed.channelIDs.forEach((id, idx) => {
        // Only add if not already in computedChannels
        if (!computedChannels.some((ch) => ch.id === id)) {
          computedChannels.push({
            id,
            channelID: id, // alias for uniformity
            name: channelState.computed.yLabels[idx] || id,
            type: "Computed",
            unit: channelState.computed.yUnits[idx] || "",
            group: channelState.computed.groups[idx] || "Computed",
            color: channelState.computed.lineColors[idx] || "#FF6B6B",
            idx: computedChannels.length,
          });
        }
      });
    }

    console.log(
      "[showChannelListWindow] cfg.computedChannels:",
      cfg?.computedChannels
    );
    console.log(
      "[showChannelListWindow] computedChannels (with units):",
      computedChannels
    );

    const channelListCfg = {
      analogChannels: analogChannelsWithGroup,
      digitalChannels,
      computedChannels,
    };

    console.log(
      "[showChannelListWindow] Final channelListCfg being sent to popup:",
      channelListCfg
    );

    // Call createChannelList and append
    // const listEl = createChannelList.call(
    //   win,
    //   channelListCfg,
    //   (type, fromIdx, toIdx, color) => {
    //     if (color !== undefined && typeof onChannelColorChange === "function") {
    //       onChannelColorChange(type, fromIdx, color);
    //     } else if (typeof onChannelDrop === "function") {
    //       onChannelDrop(type, fromIdx, toIdx);
    //     }
    //   }
    // );

    // win.document.getElementById("channel-root").appendChild(listEl);

    const root = win.document.getElementById("channel-root");

    // Update globalCfg to use channelListCfg so that MathLive editor has access to all channels
    win.globalCfg = channelListCfg;

    // ✅ CRITICAL: Store parentWindow reference in popup window globals so cellEdited handler can access it
    win.globalParentWindow = parentWindow;
    console.log(
      "[showChannelListWindow] Stored parentWindow in popup globals:",
      {
        parentWindow: !!parentWindow,
        globalParentWindow: !!win.globalParentWindow,
        closed: parentWindow?.closed,
      }
    );

    // ✅ FIX: Pass Tabulator to createChannelList directly instead of trying to import
    // This avoids the MIME type error from trying to import modules in a popup context

    try {
      // Wait a moment for Tabulator to be available globally in the child window
      if (typeof win.Tabulator === "undefined") {
        console.warn(
          "[showChannelListWindow] Tabulator not available yet, waiting..."
        );
        setTimeout(() => {
          if (typeof win.Tabulator !== "undefined") {
            // Call createChannelList directly with the child window's Tabulator instance
            createChannelList(
              channelListCfg,
              (type, fromIdx, toIdx, color) => {
                // Notify parent of changes via postMessage
                if (window.opener && !window.opener.closed) {
                  window.opener.postMessage(
                    {
                      source: "ChannelListWindow",
                      type: "channel_update",
                      payload: { channelType: type, fromIdx, toIdx, color },
                    },
                    "*"
                  );
                }
              },
              win.Tabulator, // ✅ Pass the child window's Tabulator
              win.document, // ✅ Use child window's document
              root, // ✅ Append to child window's root
              parentWindow // ✅ FIX: Pass explicit parent window reference
            );
            console.log(
              "[showChannelListWindow] ChannelList initialized with child Tabulator"
            );
          } else {
            console.error(
              "[showChannelListWindow] Tabulator still not available after timeout"
            );
          }
        }, 500);
      } else {
        // Tabulator is already available
        createChannelList(
          channelListCfg,
          (type, fromIdx, toIdx, color) => {
            // Notify parent of changes via postMessage
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage(
                {
                  source: "ChannelListWindow",
                  type: "channel_update",
                  payload: { channelType: type, fromIdx, toIdx, color },
                },
                "*"
              );
            }
          },
          win.Tabulator, // ✅ Pass the child window's Tabulator
          win.document, // ✅ Use child window's document
          root, // ✅ Append to child window's root
          parentWindow // ✅ FIX: Pass explicit parent window reference
        );
        console.log(
          "[showChannelListWindow] ChannelList initialized with child Tabulator"
        );
      }
    } catch (err) {
      console.error(
        "[showChannelListWindow] Failed to initialize ChannelList:",
        err
      );
    }
  }

  // ✅ Listen for theme changes and computed channel updates from parent
  win.addEventListener("message", (event) => {
    // Only accept from parent
    if (event.source !== window.opener && event.source !== window) return;

    const { source, type, payload } = event.data || {};

    // Handle theme changes
    if (source === "MainApp" && type === "theme_change") {
      const { theme, colors } = payload;
      console.log(`[ChannelList] Received theme change: ${theme}`);

      // Apply theme
      win.document.documentElement.setAttribute("data-theme", theme);

      // Apply CSS variables if needed
      if (colors) {
        Object.entries(colors).forEach(([key, value]) => {
          win.document.documentElement.style.setProperty(key, value);
        });
      }
    }

    // 🎯 Handle computed channel creation/updates at runtime
    if (source === "MainApp" && type === "computed_channels_updated") {
      const { computedChannels } = payload || {};
      console.log("[showChannelListWindow] 📢 Received computed channels update:", {
        count: computedChannels?.length || 0,
        channels: computedChannels?.map((c) => c.id),
      });

      if (computedChannels && Array.isArray(computedChannels)) {
        // Update the global cfg with new computed channels
        if (win.globalCfg) {
          win.globalCfg.computedChannels = computedChannels;
          console.log(
            "[showChannelListWindow] ✅ Updated globalCfg.computedChannels"
          );
        }

        // Get reference to the Tabulator table instance stored in the window
        if (win.__tabulatorInstance) {
          const table = win.__tabulatorInstance;
          const currentData = table.getData();

          console.log("[showChannelListWindow] 🔍 Current table data before update:", {
            total: currentData.length,
            analog: currentData.filter((r) => r.type === "Analog").length,
            digital: currentData.filter((r) => r.type === "Digital").length,
            computed: currentData.filter((r) => r.type === "Computed").length,
          });

          // Keep ALL analog and digital channels as-is
          const analogAndDigitalRows = currentData.filter(
            (row) => row.type === "Analog" || row.type === "Digital"
          );

          // ✅ CRITICAL: Keep EXISTING computed channels that are NOT in the new list
          // This preserves previously stored channels that came from localStorage
          const existingComputedRows = currentData.filter(
            (row) => row.type === "Computed"
          );

          console.log("[showChannelListWindow] Keeping analog & digital rows:", {
            count: analogAndDigitalRows.length,
          });

          console.log("[showChannelListWindow] 📦 Existing computed channels before merge:", {
            count: existingComputedRows.length,
            ids: existingComputedRows.map((r) => r.channelID),
          });

          // Build NEW computed channels from broadcast (runtime created channels)
          const newComputedRows = computedChannels.map((ch, idx) => {
            // Match the structure from ChannelList.js line 1894-1900
            return {
              id: ch.id || `computed_${idx}`,
              channelID: ch.id,  // Important: channelID must match the ch.id
              originalIndex: idx,
              type: "Computed",
              displayGroup: "Analog & Computed",  // ✅ CRITICAL: Must match initial load (Analog & Computed, NOT just Computed)
              name: ch.name || ch.id || `Computed ${idx + 1}`,
              unit: ch.unit || "",
              group: ch.group || "Computed",
              color: ch.color || "#4ECDC4",
              scale: ch.scale || 1,
              start: ch.start || 0,
              duration: ch.duration || "",
              invert: ch.invert || "",
            };
          });

          // ✅ MERGE: Combine existing computed channels with new ones
          // For each existing channel, check if it's already in the new list
          // If it's in the new list, use the updated version; otherwise keep the existing one
          const mergedComputedRows = [
            // Keep existing computed channels that are NOT being updated
            ...existingComputedRows.filter(
              (existing) =>
                !computedChannels.some((ch) => ch.id === existing.channelID)
            ),
            // Add all new/updated computed channels
            ...newComputedRows,
          ];

          console.log("[showChannelListWindow] 📦 Computed channels after merge:", {
            count: mergedComputedRows.length,
            fromExisting: existingComputedRows.filter(
              (existing) =>
                !computedChannels.some((ch) => ch.id === existing.channelID)
            ).length,
            fromNew: newComputedRows.length,
            ids: mergedComputedRows.map((r) => r.channelID),
          });

          // Final data: analog + digital + merged computed
          const updatedData = [...analogAndDigitalRows, ...mergedComputedRows];

          console.log("[showChannelListWindow] 📊 Final merged table data:", {
            totalRows: updatedData.length,
            analog: updatedData.filter((r) => r.type === "Analog").length,
            digital: updatedData.filter((r) => r.type === "Digital").length,
            computed: updatedData.filter((r) => r.type === "Computed").length,
            groupBreakdown: {
              "Analog & Computed": updatedData.filter((r) => r.displayGroup === "Analog & Computed").length,
              "Digital": updatedData.filter((r) => r.displayGroup === "Digital").length,
            },
          });

          // Update Tabulator with new data
          try {
            table.setData(updatedData);
            console.log("[showChannelListWindow] ✅ Table updated successfully!");
          } catch (err) {
            console.error("[showChannelListWindow] ❌ Failed to update table:", err);
          }
        } else {
          console.warn(
            "[showChannelListWindow] ⚠️ Tabulator instance not found in window"
          );
        }
      }
    }
  });

  return true;
}
