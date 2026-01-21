/**
 * @file ChannelList.js
 * @module Components/Sidebars
 *
 * @description
 * <h3>Channel List Editor Component</h3>
 * 
 * <p>A comprehensive Tabulator-based channel management interface for viewing, editing, 
 * and organizing COMTRADE analog, digital, and computed channels. Supports both embedded 
 * and popup window modes with real-time synchronization to parent application state.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>Dual Communication</td><td>Supports both direct callbacks and postMessage for popup window scenarios</td></tr>
 *   <tr><td>State Synchronization</td><td>Changes propagate to parent window's channelState via structured messages</td></tr>
 *   <tr><td>Dynamic Grouping</td><td>Auto-detects and assigns unique group IDs to prevent conflicts</td></tr>
 *   <tr><td>Persistence</td><td>Computed channels are saved/loaded from localStorage for session continuity</td></tr>
 *   <tr><td>Touch-Friendly</td><td>Prevents resize conflicts during cell editing for mobile compatibility</td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>Tabulator Integration</strong> — Full-featured data grid with sorting, filtering, pagination</li>
 *   <li><strong>Inline Editing</strong> — Edit channel names, units, groups, colors, and scales directly</li>
 *   <li><strong>Computed Channels</strong> — Create mathematical expressions using MathLive LaTeX editor</li>
 *   <li><strong>Color Picker</strong> — Visual color selection for channel trace customization</li>
 *   <li><strong>Group Management</strong> — Auto-grouping with unique ID generation</li>
 *   <li><strong>Drag & Drop</strong> — Reorder rows with movable row support</li>
 *   <li><strong>Search/Filter</strong> — Header-based filtering for quick channel lookup</li>
 * </ul>
 * 
 * <h4>Channel Processing Pipeline</h4>
 * <ol>
 *   <li>Load analog/digital channels from CFG configuration</li>
 *   <li>Load persisted computed channels from localStorage</li>
 *   <li>Merge and normalize all channel data into tableData array</li>
 *   <li>Sort channels: Analog → Computed(Analog) → Digital → Computed(Digital)</li>
 *   <li>Initialize Tabulator with column definitions and formatters</li>
 *   <li>Setup event handlers for edits, deletes, and color changes</li>
 *   <li>Propagate changes via callback or postMessage to parent</li>
 * </ol>
 * 
 * <h4>Message Protocol (Child → Parent)</h4>
 * <table>
 *   <tr><th>Type</th><th>Payload</th></tr>
 *   <tr><td>callback_color</td><td>{ field: 'color', row: {...}, newValue: '#rrggbb' }</td></tr>
 *   <tr><td>callback_channelName</td><td>{ field: 'name', row: {...}, newValue: 'Label' }</td></tr>
 *   <tr><td>callback_update</td><td>{ field: string, row: {...}, newValue: any }</td></tr>
 *   <tr><td>callback_addChannel</td><td>{ ...newChannelRow }</td></tr>
 *   <tr><td>callback_delete</td><td>{ ...deletedRow }</td></tr>
 * </table>
 * 
 * @see {@link module:utils/autoGroupChannels} - Automatic channel grouping utility
 * @see {@link module:utils/computedChannelStorage} - LocalStorage persistence for computed channels
 * @see {@link module:components/showChannelListWindow} - Popup window launcher
 * 
 * @example
 * // Create channel list in popup window
 * const channelList = createChannelList(
 *   cfg,                    // COMTRADE config with analogChannels, digitalChannels
 *   onChannelUpdate,        // Callback for local changes
 *   TabulatorInstance,      // Tabulator constructor from popup
 *   popupDocument,          // Popup window document
 *   containerElement,       // Element to attach table to
 *   data,                   // Parsed COMTRADE data
 *   parentWindow            // Reference to opener window
 * );
 * 
 * @example
 * // Add computed channel with expression
 * // User enters LaTeX: I_{A} + I_{B}
 * // Converted to math.js: IA + IB
 * // Evaluated against analogData arrays
 * 
 * @mermaid
 * graph TD
 *     subgraph Initialization
 *         A[createChannelList Called] --> B[Resolve Parent Window]
 *         B --> C[Load Computed Channels<br/>from localStorage]
 *         C --> D[Merge Analog + Digital + Computed]
 *         D --> E[Sort by displayGroup]
 *     end
 *     
 *     subgraph Table_Setup
 *         E --> F[Create Tabulator Instance]
 *         F --> G[Configure Columns<br/>ID, Name, Unit, Group, Color, Scale]
 *         G --> H[Setup Custom Formatters<br/>Color Picker, MathLive Editor]
 *         H --> I[Attach Event Handlers]
 *     end
 *     
 *     subgraph User_Interactions
 *         I --> J{User Action}
 *         J -->|Edit Cell| K[cellEdited Handler]
 *         J -->|Change Color| L[Color Input Handler]
 *         J -->|Delete Row| M[Delete Button Handler]
 *         J -->|Add Computed| N[MathLive Expression Editor]
 *     end
 *     
 *     subgraph State_Propagation
 *         K --> O[Build Message Payload]
 *         L --> O
 *         M --> O
 *         N --> P[evaluateAndSaveComputedChannel]
 *         P --> O
 *         O --> Q{Running in Popup?}
 *         Q -->|Yes| R[postMessage to Parent]
 *         Q -->|No| S[Direct Callback]
 *         R --> T[Parent Updates channelState]
 *         S --> T
 *         T --> U[Charts Re-render]
 *     end
 *     
 *     style A fill:#4CAF50,color:white
 *     style T fill:#2196F3,color:white
 *     style U fill:#FF9800,color:white
 */

// src/components/ChannelList.js
// import { createCustomElement } from '../utils/helpers.js';
import { autoGroupChannels } from "../utils/autoGroupChannels.js";
import { loadComputedChannelsFromStorage } from "../utils/computedChannelStorage.js";
import { computedPalette } from "../utils/constants.js";

/**
 * ✅ HELPER: Generate unique group ID for computed channels
 * Scans all existing groups and finds the next available ID to avoid conflicts
 */
function generateUniqueComputedGroup(cfg, sourceWindow) {
  const existingGroups = new Set();

  // Get channelState from the appropriate window context
  let channelState = null;
  if (sourceWindow) {
    channelState =
      sourceWindow.channelState ||
      (sourceWindow.opener && sourceWindow.opener.channelState);
  } else if (typeof window !== "undefined") {
    channelState =
      window.channelState || (window.opener && window.opener.channelState);
  }

  console.log(
    "[generateUniqueComputedGroup] 📍 sourceWindow:",
    !!sourceWindow,
    "has channelState:",
    !!channelState
  );

  // Extract group numbers from channelState (source of truth)
  if (channelState) {
    // Get all group IDs from analog channels
    // ✅ Convert to plain array to handle Proxy objects from parent window
    const analogGroupsRaw = channelState.analog?.groups;
    const analogGroups = Array.isArray(analogGroupsRaw) 
      ? [...analogGroupsRaw] 
      : (analogGroupsRaw ? Array.from(analogGroupsRaw) : []);
    console.log("[generateUniqueComputedGroup] 📊 analogGroups:", analogGroups);
    analogGroups.forEach((groupId) => {
      if (typeof groupId === "string" && groupId.startsWith("G")) {
        const groupNum = parseInt(groupId.substring(1), 10);
        if (!isNaN(groupNum)) {
          existingGroups.add(groupNum);
        }
      }
    });

    // Get all group IDs from digital channels
    // ✅ Convert to plain array to handle Proxy objects from parent window
    const digitalGroupsRaw = channelState.digital?.groups;
    const digitalGroups = Array.isArray(digitalGroupsRaw) 
      ? [...digitalGroupsRaw] 
      : (digitalGroupsRaw ? Array.from(digitalGroupsRaw) : []);
    console.log(
      "[generateUniqueComputedGroup] 📊 digitalGroups:",
      digitalGroups
    );
    digitalGroups.forEach((groupId) => {
      if (typeof groupId === "string" && groupId.startsWith("G")) {
        const groupNum = parseInt(groupId.substring(1), 10);
        if (!isNaN(groupNum)) {
          existingGroups.add(groupNum);
        }
      }
    });
  }

  // Also check already-created computed channels
  // ✅ Convert to plain array to handle Proxy objects from parent window
  if (cfg?.computedChannels) {
    const computedChannelsArr = Array.isArray(cfg.computedChannels)
      ? cfg.computedChannels
      : (cfg.computedChannels ? Array.from(cfg.computedChannels) : []);
    computedChannelsArr.forEach((ch) => {
      if (
        ch.group &&
        typeof ch.group === "string" &&
        ch.group.startsWith("G")
      ) {
        const groupNum = parseInt(ch.group.substring(1), 10);
        if (!isNaN(groupNum)) {
          existingGroups.add(groupNum);
        }
      }
    });
  }

  // Find the lowest available group number
  let nextGroupNum = 0;
  while (existingGroups.has(nextGroupNum)) {
    nextGroupNum++;
  }

  console.log(
    "[generateUniqueComputedGroup] 🔍 channelState found:",
    !!channelState,
    "existing groups:",
    Array.from(existingGroups),
    "→ assigning G" + nextGroupNum
  );
  return `G${nextGroupNum}`;
}

/**
 * ✅ HELPER: Detect group from expression by analyzing used channel references
 * Falls back to unique group generation if no channels are referenced
 */
function detectGroupFromExpression(expression, cfg, sourceWindow) {
  if (!expression) {
    console.log(
      "[detectGroupFromExpression] 📝 No expression provided, generating unique group"
    );
    return generateUniqueComputedGroup(cfg, sourceWindow);
  }

  const channelRefPattern = /\b([A-Z][A-Z0-9_]*|[ad]\d+)\b/g;
  const matches = expression.match(channelRefPattern) || [];
  const uniqueRefs = [...new Set(matches)];
  const usedGroups = [];

  console.log(
    "[detectGroupFromExpression] 🔎 Expression:",
    expression,
    "→ Found refs:",
    uniqueRefs
  );

  uniqueRefs.forEach((ref) => {
    cfg?.analogChannels?.forEach((ch) => {
      if (ch.id === ref && ch.group) {
        console.log(
          `[detectGroupFromExpression]   ✓ Ref "${ref}" found in group "${ch.group}"`
        );
        usedGroups.push(ch.group);
      }
    });
  });

  // ✅ FIX: If no groups found, generate unique group instead of defaulting to G0
  if (usedGroups.length === 0) {
    console.log(
      "[detectGroupFromExpression] ⚠️ No groups found for references, generating unique group"
    );
    return generateUniqueComputedGroup(cfg, sourceWindow);
  }

  const groupCounts = {};
  usedGroups.forEach((g) => {
    groupCounts[g] = (groupCounts[g] || 0) + 1;
  });

  const result = Object.keys(groupCounts).reduce((a, b) =>
    groupCounts[a] > groupCounts[b] ? a : b
  );

  console.log(
    "[detectGroupFromExpression] ✅ Assigning group:",
    result,
    "from counts:",
    groupCounts
  );
  return result;
}
/**
 * ChannelList component: lists all analog and digital channels with drag-and-drop support.
 * @param {Object} cfg - COMTRADE config object with analogChannels and digitalChannels arrays.
 * @param {Function} onChannelDrop - Callback(channelType, fromIdx, toIdx) when a channel is reordered.
 * @returns {HTMLElement} The channel list element.
 */
// export function createChannelList(cfg, onChannelDrop) {
//   const container = createCustomElement('div');
//   container.className = 'channel-list-container';

//   // Helper to create a list for a channel type
//   function createList(type, channels) {
//     const section = createCustomElement('section');
//     section.className = 'channel-list-section';
//     const title = createCustomElement('h3');
//     title.textContent = type === 'analog' ? 'Analog Channels' : 'Digital Channels';
//     section.appendChild(title);
//     const list = createCustomElement('ul');
//     list.className = 'channel-list';
//     channels.forEach((ch, idx) => {
//       const li = createCustomElement('li');
//       li.className = 'channel-list-item';
//       li.setAttribute('draggable', 'true');
//       // Channel color swatch and color picker
//       const color = ch.color || ch.stroke || ch.displayColor || ch.colour || '#888';
//       const colorBox = createCustomElement('input');
//       colorBox.type = 'color';
//       colorBox.value = color;
//       colorBox.className = 'channel-color-picker';
//       colorBox.style.marginRight = '10px';
//       colorBox.addEventListener('input', (e) => {
//         ch.color = e.target.value;
//         li.style.setProperty('--channel-color', e.target.value);
//         // Use 4th argument for color change
//         if (typeof onChannelDrop === 'function') onChannelDrop(type, idx, idx, e.target.value);
//       });
//       li.appendChild(colorBox);
//       // Channel label
//       const labelSpan = createCustomElement('span');
//       labelSpan.textContent = ch.id || ch.name || `Channel ${idx+1}`;
//       li.appendChild(labelSpan);
//       li.dataset.idx = idx;
//       li.dataset.type = type;
//       // Drag events
//       li.addEventListener('dragstart', e => {
//         e.dataTransfer.effectAllowed = 'move';
//         e.dataTransfer.setData('text/plain', JSON.stringify({ type, idx }));
//         li.classList.add('dragging');
//       });
//       li.addEventListener('dragend', e => {
//         li.classList.remove('dragging');
//       });
//       li.addEventListener('dragover', e => {
//         e.preventDefault();
//         li.classList.add('drag-over');
//       });
//       li.addEventListener('dragleave', e => {
//         li.classList.remove('drag-over');
//       });
//       li.addEventListener('drop', e => {
//         e.preventDefault();
//         li.classList.remove('drag-over');
//         const { type: fromType, idx: fromIdx } = JSON.parse(e.dataTransfer.getData('text/plain'));
//         const toIdx = idx;
//         if (fromType === type && fromIdx !== toIdx) {
//           onChannelDrop(type, parseInt(fromIdx), toIdx);
//         }
//       });
//       list.appendChild(li);
//     });
//     section.appendChild(list);
//     return section;
//   }

//   // Analog channels
//   if (cfg.analogChannels && cfg.analogChannels.length > 0) {
//     container.appendChild(createList('analog', cfg.analogChannels));
//   }
//   // Digital channels
//   if (cfg.digitalChannels && cfg.digitalChannels.length > 0) {
//     container.appendChild(createList('digital', cfg.digitalChannels));
//   }

//   return container;
// }

// export function createChannelList(cfg, onChannelUpdate) {
//   const container = document.createElement("div");
//   container.className = "channel-list-container bg-white rounded-lg shadow";

//   // Merge analog + digital channel data
//   const tableData = [
//     ...cfg.analogChannels.map((ch, i) => ({
//       id: i + 1,
//       type: "Analog",
//       name: ch.id || `Analog ${i + 1}`,
//       unit: ch.unit || "",
//       group: ch.group || "Group 1",
//       color: ch.color || "#888",
//       scale: ch.scale || 1,
//       start: ch.start || 0,
//       duration: ch.duration || "",
//       invert: ch.invert || "",
//     })),
//     ...cfg.digitalChannels.map((ch, i) => ({
//       id: i + 1,
//       type: "Digital",
//       name: ch.id || `Digital ${i + 1}`,
//       unit: ch.unit || "",
//       group: ch.group || "Group 1",
//       color: ch.color || "#888",
//       scale: ch.scale || 1,
//       start: ch.start || 0,
//       duration: ch.duration || "",
//       invert: ch.invert || "",
//     })),
//   ];

//   const columns = [
//     { title: "ID", field: "id", width: 60, hozAlign: "center" },
//     {
//       title: "Channel Name (Unit)",
//       field: "name",
//       headerFilter: "input",
//       editor: "input",
//     },
//     { title: "Unit", field: "unit", editor: "input", width: 80 },
//     { title: "Group", field: "group", editor: "input", width: 120 },
//     {
//       title: "Color",
//       field: "color",
//       formatter: (cell) => {
//         const value = cell.getValue();
//         const input = document.createElement("input");
//         input.type = "color";
//         input.value = value;
//         input.style.cssText =
//           "width:40px;height:24px;border:none;cursor:pointer;padding:0;border-radius:0.25rem;";
//         input.classList.add(
//           "focus:outline-none",
//           "focus:ring-2",
//           "focus:ring-blue-400"
//         );
//         input.addEventListener("change", (e) => {
//           cell.setValue(e.target.value);
//         });
//         return input;
//       },
//     },
//     {
//       title: "Scale",
//       field: "scale",
//       editor: "number",
//       width: 80,
//       headerSort: true,
//     },
//     {
//       title: "Start",
//       field: "start",
//       editor: "number",
//       width: 100,
//     },
//     {
//       title: "Duration",
//       field: "duration",
//       editor: "number",
//       width: 100,
//     },
//     {
//       title: "Invert",
//       field: "invert",
//       editor: true,
//       width: 80,
//     },
//     {
//       title: "Delete",
//       formatter: () =>
//         `<button class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded transition duration-150">Delete</button>`,
//       width: 80,
//       hozAlign: "center",
//       cellClick: (e, cell) => cell.getRow().delete(),
//     },
//   ];

//   if (typeof Tabulator !== "undefined") {
//     const table = new Tabulator(container, {
//       data: tableData,
//       layout: "fitColumns",
//       groupBy: "type",
//       columns,
//       movableRows: true,
//       pagination: "local",
//       paginationSize: 20,
//       paginationSizeSelector: [5, 10, 20, 50],
//       cellEdited: (cell) => {
//         if (typeof onChannelUpdate === "function")
//           onChannelUpdate("update", cell.getRow().getData());
//       },
//       rowMoved: (row) => {
//         if (typeof onChannelUpdate === "function")
//           onChannelUpdate("move", row.getData());
//       },
//       tableBuilt: () => {
//         const tableEl = container.querySelector(".tabulator-table");
//         tableEl.classList.add(
//           "w-full",
//           "text-sm",
//           "text-left",
//           "border",
//           "border-gray-200",
//           "rounded-lg",
//           "overflow-hidden",
//           "bg-green-100"
//         );

//         // Header styling
//         container.querySelectorAll(".tabulator-col").forEach((col) => {
//           col.classList.add(
//             "bg-green-100",
//             "text-gray-700",
//             "uppercase",
//             "font-medium",
//             "px-4",
//             "py-2"
//           );
//         });

//         // Rows styling with striped effect
//         container.querySelectorAll(".tabulator-row").forEach((row, index) => {
//           row.classList.add("border-b", "hover:bg-gray-50");
//           row.classList.add(index % 2 === 0 ? "bg-white" : "bg-gray-50");
//         });

//         // Cells padding
//         container.querySelectorAll(".tabulator-cell").forEach((cell) => {
//           cell.classList.add("px-4", "py-2");
//         });
//       },
//     });

//     // Add button for new channels
//     const addBtn = document.createElement("button");
//     addBtn.textContent = "Add Channel";
//     addBtn.className =
//       "w-40 mt-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded transition duration-150";
//     addBtn.addEventListener("click", () => {
//       table.addRow({
//         id: table.getDataCount(),
//         type: "Analog",
//         name: "New Channel",
//         unit: "",
//         group: "Group 1",
//         color: "#888",
//         scale: 1,
//         start: 0,
//         duration: "",
//         invert: "",
//       });
//     });

//     const wrapper = document.createElement("div");
//     wrapper.className = "flex flex-col gap-2";

//     wrapper.appendChild(addBtn);
//     wrapper.appendChild(container);

//     return wrapper;
//   } else {
//     console.error("Tabulator not loaded. Please include the CDN script.");
//   }

//   return container;
// }

// export function createChannelList(cfg, onChannelUpdate) {
//   const container = document.createElement("div");
//   container.className = "channel-list-container bg-white rounded-lg shadow";

//   // Merge analog + digital channel data
//   const tableData = [
//     ...cfg.analogChannels.map((ch, i) => ({
//       id: i + 1,
//       type: "Analog",
//       name: ch.id || `Analog ${i + 1}`,
//       unit: ch.unit || "",
//       group: ch.group || "Group 1",
//       color: ch.color || "#888",
//       scale: ch.scale || 1,
//       start: ch.start || 0,
//       duration: ch.duration || "",
//       invert: ch.invert || "",
//     })),
//     ...cfg.digitalChannels.map((ch, i) => ({
//       id: i + 1,
//       type: "Digital",
//       name: ch.id || `Digital ${i + 1}`,
//       unit: ch.unit || "",
//       group: ch.group || "Group 1",
//       color: ch.color || "#888",
//       scale: ch.scale || 1,
//       start: ch.start || 0,
//       duration: ch.duration || "",
//       invert: ch.invert || "",
//     })),
//   ];

//   const columns = [
//     { title: "ID", field: "id", width: 60, hozAlign: "center" },
//     {
//       title: "Channel Name (Unit)",
//       field: "name",
//       headerFilter: "input",
//       editor: "input",
//     },
//     { title: "Unit", field: "unit", editor: "input", width: 80 },
//     { title: "Group", field: "group", editor: "input", width: 120 },
//     {
//       title: "Color",
//       field: "color",
//       formatter: (cell) => {
//         const value = cell.getValue();
//         const input = document.createElement("input");
//         input.type = "color";
//         input.value = value;
//         input.style.cssText =
//           "width:40px;height:24px;border:none;cursor:pointer;padding:0;border-radius:0.25rem;";
//         input.classList.add(
//           "focus:outline-none",
//           "focus:ring-2",
//           "focus:ring-blue-400"
//         );
//         input.addEventListener("change", (e) => {
//           cell.setValue(e.target.value);
//         });
//         return input;
//       },
//     },
//     {
//       title: "Scale",
//       field: "scale",
//       editor: "number",
//       width: 80,
//       headerSort: true,
//     },
//     { title: "Start", field: "start", editor: "number", width: 100 },
//     { title: "Duration", field: "duration", editor: "number", width: 100 },
//     { title: "Invert", field: "invert", editor: true, width: 80 },
//     {
//       title: "Delete",
//       formatter: () =>
//         `<button class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded transition duration-150">Delete</button>`,
//       width: 80,
//       hozAlign: "center",
//       cellClick: (e, cell) => cell.getRow().delete(),
//     },
//   ];

//   if (typeof Tabulator !== "undefined") {
//     const table = new Tabulator(container, {
//       data: tableData,
//       layout: "fitColumns",
//       groupBy: "type",
//       columns,
//       movableRows: true,
//       pagination: "local",
//       paginationSize: 20,
//       paginationSizeSelector: [5, 10, 20, 50],
//       cellEdited: (cell) => {
//         if (typeof onChannelUpdate === "function")
//           onChannelUpdate("update", cell.getRow().getData());
//       },
//       rowMoved: (row) => {
//         if (typeof onChannelUpdate === "function")
//           onChannelUpdate("move", row.getData());
//       },
//       tableBuilt: () => {
//         const tableEl = container.querySelector(".tabulator-table");
//         tableEl.classList.add(
//           "w-full",
//           "text-sm",
//           "text-left",
//           "border",
//           "border-gray-200",
//           "rounded-lg",
//           "overflow-hidden",
//           "bg-green-100"
//         );

//         // Header styling
//         container.querySelectorAll(".tabulator-col").forEach((col) => {
//           col.classList.add(
//             "bg-green-100",
//             "text-gray-700",
//             "uppercase",
//             "font-medium",
//             "px-4",
//             "py-2"
//           );
//         });

//         // Rows styling with striped effect
//         container.querySelectorAll(".tabulator-row").forEach((row, index) => {
//           row.classList.add("border-b", "hover:bg-gray-50");
//           row.classList.add(index % 2 === 0 ? "bg-white" : "bg-gray-50");
//         });

//         // Cells padding
//         container.querySelectorAll(".tabulator-cell").forEach((cell) => {
//           cell.classList.add("px-4", "py-2");
//         });
//       },
//     });

//     // --- Add Channel Button with Dropdown ---
//     const addBtn = document.createElement("button");
//     addBtn.textContent = "Add Channel";
//     addBtn.className =
//       "w-40 mt-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded transition duration-150";

//     const dropdown = document.createElement("div");
//     dropdown.className = "absolute bg-white border rounded shadow mt-1 z-50";
//     dropdown.style.display = "none";

//     ["Analog", "Digital"].forEach((type) => {
//       const option = document.createElement("div");
//       option.textContent = type;
//       option.className =
//         "border border-rounded px-3 py-1 hover:bg-gray-200 cursor-pointer";
//       option.addEventListener("click", () => {
//         table.addRow({
//           id: table.getDataCount() + 1,
//           type: type,
//           name: "New Channel",
//           unit: "",
//           group: "Group 1",
//           color: "#888",
//           scale: 1,
//           start: 0,
//           duration: "",
//           invert: "",
//         });
//         dropdown.style.display = "none";
//       });
//       dropdown.appendChild(option);
//     });

//     addBtn.addEventListener("click", (e) => {
//       const rect = addBtn.getBoundingClientRect();
//       dropdown.style.top = `${rect.bottom + window.scrollY}px`;
//       dropdown.style.left = `${rect.left + window.scrollX}px`;
//       dropdown.style.display =
//         dropdown.style.display === "none" ? "block" : "none";
//     });

//     // Hide dropdown when clicking outside
//     document.addEventListener("click", (e) => {
//       if (!dropdown.contains(e.target) && e.target !== addBtn) {
//         dropdown.style.display = "none";
//       }
//     });

//     const wrapper = document.createElement("div");
//     wrapper.className = "flex flex-col gap-2";
//     wrapper.appendChild(addBtn);
//     wrapper.appendChild(dropdown);
//     wrapper.appendChild(container);

//     return wrapper;
//   } else {
//     console.error("Tabulator not loaded. Please include the CDN script.");
//   }

//   return container;
// }

// export function createChannelList(cfg, onChannelUpdate) {
//   const container = document.createElement("div");
//   container.className = "channel-list-container bg-white rounded-lg shadow";

//   // Merge analog + digital channel data
//   const tableData = [
//     ...cfg.analogChannels.map((ch, i) => ({
//       id: i + 1,
//       type: "Analog",
//       name: ch.id || `Analog ${i + 1}`,
//       unit: ch.unit || "",
//       group: ch.group || "Group 1",
//       color: ch.color || "#888",
//       scale: ch.scale || 1,
//       start: ch.start || 0,
//       duration: ch.duration || "",
//       invert: ch.invert || "",
//     })),
//     ...cfg.digitalChannels.map((ch, i) => ({
//       id: i + 1,
//       type: "Digital",
//       name: ch.id || `Digital ${i + 1}`,
//       unit: ch.unit || "",
//       group: ch.group || "Group 1",
//       color: ch.color || "#888",
//       scale: ch.scale || 1,
//       start: ch.start || 0,
//       duration: ch.duration || "",
//       invert: ch.invert || "",
//     })),
//   ];

//   const columns = [
//     { title: "ID", field: "id", width: 60, hozAlign: "center" },
//     {
//       title: "Channel Name (Unit)",
//       field: "name",
//       headerFilter: "input",
//       editor: "input",
//       resizable: true,
//     },
//     { title: "Unit", field: "unit", editor: "input", width: 80 },
//     { title: "Group", field: "group", editor: "input", width: 120 },
//     {
//       title: "Color",
//       field: "color",
//       formatter: (cell) => {
//         const value = cell.getValue();
//         const input = document.createElement("input");
//         input.type = "color";
//         input.value = value;
//         input.style.cssText =
//           "width:40px;height:24px;border:none;cursor:pointer;padding:0;border-radius:0.25rem;";
//         input.classList.add(
//           "focus:outline-none",
//           "focus:ring-2",
//           "focus:ring-blue-400"
//         );
//         input.addEventListener("change", (e) => {
//           cell.setValue(e.target.value);
//         });
//         return input;
//       },
//     },
//     {
//       title: "Scale",
//       field: "scale",
//       editor: "number",
//       width: 80,
//       headerSort: true,
//     },
//     { title: "Start", field: "start", editor: "number", width: 100 },
//     { title: "Duration", field: "duration", editor: "number", width: 100 },
//     { title: "Invert", field: "invert", editor: true, width: 80 },
//     {
//       title: "Delete",
//       formatter: () =>
//         `<button class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded transition duration-150">Delete</button>`,
//       width: 80,
//       hozAlign: "center",
//       cellClick: (e, cell) => cell.getRow().delete(),
//     },
//   ];

//   if (typeof Tabulator !== "undefined") {
//     const table = new Tabulator(container, {
//       data: tableData,
//       layout: "fitColumns",
//       responsiveLayout: "collapse",
//       groupBy: "type",
//       columns,
//       resizableColumnFit: true,
//       movableRows: true,
//       pagination: "local",
//       paginationSize: 20,
//       paginationSizeSelector: [5, 10, 20, 50],
//       responsiveLayout: "collapse",
//       cellEdited: (cell) => {
//         if (typeof onChannelUpdate === "function")
//           onChannelUpdate("update", cell.getRow().getData());
//       },
//       // rowMoved: (row) => {
//       //   if (typeof onChannelUpdate === "function")
//       //     onChannelUpdate("move", row.getData());
//       // },
//       tableBuilt: () => {
//         const tableEl = container.querySelector(".tabulator-table");
//         tableEl.classList.add(
//           "w-full",
//           "text-sm",
//           "text-left",
//           "sm:text-sm", // slightly bigger for tablets
//           "lg:text-base",
//           "border",
//           "border-gray-200",
//           "rounded-lg",
//           "overflow-hidden",
//           "bg-green-100"
//         );

//         container.querySelectorAll(".tabulator-col").forEach((col) => {
//           col.classList.add(
//             "bg-green-100",
//             "text-gray-700",
//             "uppercase",
//             "font-medium",
//             "px-4",
//             "py-2"
//           );
//         });

//         container.querySelectorAll(".tabulator-row").forEach((row, index) => {
//           row.classList.add("border-b", "hover:bg-gray-50");
//           row.classList.add(index % 2 === 0 ? "bg-white" : "bg-gray-50");
//         });

//         container.querySelectorAll(".tabulator-cell").forEach((cell) => {
//           cell.classList.add("px-4", "py-2", "sm:px-4", "sm:py-2");
//         });
//       },
//     });

//     // --- Add Channel Button with Dropdown ---
//     const addBtn = document.createElement("button");
//     addBtn.textContent = "Add Channel";
//     // addBtn.className =
//     //   "w-40 mt-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded transition duration-150";
//     addBtn.className =
//       "w-full sm:w-40 mt-2 bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 sm:px-3 sm:py-1.5 rounded transition duration-150";

//     const dropdown = document.createElement("div");
//     dropdown.className =
//       "w-40 absolute bg-white rounded shadow text-black mt-1 z-50 text-center";
//     dropdown.style.display = "none";

//     ["Analog", "Digital"].forEach((type) => {
//       const option = document.createElement("div");
//       option.textContent = type;
//       option.className = "px-3 py-1 hover:bg-gray-200 cursor-pointer";

//       option.addEventListener("click", () => {
//         const allData = table.getData();

//         // Find last row index of this type
//         const lastOfTypeIndex = allData
//           .map((row) => row.type)
//           .lastIndexOf(type);

//         // Find last ID of this type
//         const lastIdOfType = allData
//           .filter((row) => row.type === type)
//           .reduce((maxId, row) => Math.max(maxId, row.id), 0);

//         const newRow = {
//           id: lastIdOfType + 1,
//           type: type,
//           name: "New Channel",
//           unit: "",
//           group: "Group 1",
//           color: "#888",
//           scale: 1,
//           start: 0,
//           duration: "",
//           invert: "",
//         };

//         // Insert after the last row of this type
//         table.addRow(newRow, false, lastOfTypeIndex + 1);

//         dropdown.style.display = "none";
//       });

//       dropdown.appendChild(option);
//     });

//     addBtn.addEventListener("click", (e) => {
//       const rect = addBtn.getBoundingClientRect();
//       dropdown.style.top = `${rect.bottom + window.scrollY}px`;
//       dropdown.style.left = `${rect.left + window.scrollX}px`;
//       dropdown.style.display =
//         dropdown.style.display === "none" ? "block" : "none";
//     });

//     document.addEventListener("click", (e) => {
//       if (!dropdown.contains(e.target) && e.target !== addBtn) {
//         dropdown.style.display = "none";
//       }
//     });

//     const wrapper = document.createElement("div");
//     wrapper.className =
//       "flex flex-col gap-2 w-full overflow-x-auto sm:px-2 md:px-4 lg:px-8";
//     wrapper.appendChild(container);

//     return wrapper;
//   } else {
//     console.error("Tabulator not loaded. Please include the CDN script.");
//   }

//   return container;
// }

// export function createChannelList(cfg, onChannelUpdate) {
//   // Create container for the table
//   const container = document.createElement("div");
//   container.className = "channel-list-container bg-green-200 rounded-lg shadow";

//   // Merge analog + digital channel data
//   const tableData = [
//     ...cfg.analogChannels.map((ch, i) => ({
//       id: i + 1,
//       type: "Analog",
//       name: ch.id || `Analog ${i + 1}`,
//       unit: ch.unit || "",
//       group: ch.group || "Group 1",
//       color: ch.color || "#888",
//       scale: ch.scale || 1,
//       start: ch.start || 0,
//       duration: ch.duration || "",
//       invert: ch.invert || "",
//     })),
//     ...cfg.digitalChannels.map((ch, i) => ({
//       id: i + 1,
//       type: "Digital",
//       name: ch.id || `Digital ${i + 1}`,
//       unit: ch.unit || "",
//       group: ch.group || "Group 1",
//       color: ch.color || "#888",
//       scale: ch.scale || 1,
//       start: ch.start || 0,
//       duration: ch.duration || "",
//       invert: ch.invert || "",
//     })),
//   ];

//   // Define table columns
//   const columns = [
//     { title: "ID", field: "id", width: 60, hozAlign: "center" },
//     {
//       title: "Channel Name (Unit)",
//       field: "name",
//       headerFilter: "input",
//       editor: "input",
//       resizable: true,
//     },
//     { title: "Unit", field: "unit", editor: "input" },
//     { title: "Group", field: "group", editor: "input" },
//     {
//       title: "Color",
//       field: "color",
//       formatter: (cell) => {
//         const value = cell.getValue();
//         const input = document.createElement("input");
//         input.type = "color";
//         input.value = value;
//         input.style.cssText =
//           "width:40px;height:24px;border:none;cursor:pointer;padding:0;border-radius:0.25rem;";
//         input.classList.add(
//           "focus:outline-none",
//           "focus:ring-2",
//           "focus:ring-blue-400"
//         );
//         input.addEventListener("change", (e) => {
//           cell.setValue(e.target.value);
//         });
//         return input;
//       },
//     },
//     {
//       title: "Scale",
//       field: "scale",
//       editor: "number",
//       headerSort: true,
//     },
//     { title: "Start", field: "start", editor: "number" },
//     { title: "Duration", field: "duration", editor: "number" },
//     { title: "Invert", field: "invert", editor: true },
//     {
//       title: "Delete",
//       formatter: () =>
//         `<button class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded transition duration-150">Delete</button>`,
//       hozAlign: "center",
//       cellClick: (e, cell) => cell.getRow().delete(),
//     },
//   ];

//   // Initialize Tabulator table
//   if (typeof Tabulator !== "undefined") {
//     const table = new Tabulator(container, {
//       data: tableData,
//       layout: "fitColumns",
//       groupBy: "type",
//       columns,
//       resizableColumnFit: true,
//       debugInvalidOptions: true,
//       movableColumns: true,
//       movableRows: true,
//       pagination: "local",
//       paginationSize: 20,
//       paginationSizeSelector: [5, 10, 20, 50],
//       cellEdited: (cell) => {
//         if (typeof onChannelUpdate === "function")
//           onChannelUpdate("update", cell.getRow().getData());
//       },
//       tableBuilt: () => {
//         container.querySelectorAll(".tabulator-row").forEach((row, index) => {
//           row.classList.add("border-b", "hover:bg-gray-50");
//           row.classList.add(index % 2 === 0 ? "bg-white" : "bg-gray-50");
//         });

//         container.querySelectorAll(".tabulator-cell").forEach((cell) => {
//           cell.classList.add("px-4", "py-2", "sm:px-4", "sm:py-2");
//         });
//       },
//     });

//     return container;
//   } else {
//     console.error("Tabulator not loaded. Please include the CDN script.");
//   }

//   return container;
// }

/**
 * Create a Tabulator-based channel list UI.
 *
 * This component is used inside the channel-list popup (child window) or can
 * be created directly in the parent. It supports two complementary
 * communication mechanisms:
 *  - Direct callback: the `onChannelUpdate` callback argument is invoked when
 *    the user edits rows (keeps existing parent-side integration working).
 *  - postMessage callbacks: when running inside a popup, the child will
 *    post structured messages to `window.opener` (parent) describing the
 *    change. The parent listens for these messages and applies them to the
 *    global `channelState` (createState) so charts update.
 *
 * Message format sent from child -> parent:
 *   { source: 'ChildWindow', type: string, payload: object }
 *
 * Known `type` values and payload shapes:
 *   - 'callback_color': { field: 'color', row: {...}, newValue: '#rrggbb' }
 *   - 'callback_channelName': { field: 'name', row: {...}, newValue: 'New Label' }
 *   - 'callback_update': { field: <fieldName>, row: {...}, newValue: <val> }
 *   - 'callback_addChannel': { ...newChannelRow }
 *   - 'callback_delete': { ...deletedRow }
 *
 * Row payloads are expected to include at least one of:
 *   - originalIndex: numeric index assigned when the table was created
 *   - id or name: used as a fallback label to locate the channel in parent state
 *
 * Parameters
 * @param {Object} cfg - { analogChannels: Array, digitalChannels: Array } channel data used to populate the table
 * @param {Function} [onChannelUpdate] - Optional callback invoked for local integrations (signature varies by event)
 * @param {Object} [TabulatorInstance] - Optional Tabulator constructor (when running in popup pass child window Tabulator)
 * @param {Document} [ownerDocument] - Document to create DOM nodes in (important for popups)
 * @param {Element} [attachToElement] - Optional element in `ownerDocument` to append the table container to
 * @returns {HTMLElement} container element that contains the Tabulator table
 */

/**
 * Converts LaTeX expression to a math.js compatible format
 * @param {string} latex - LaTeX expression
 * @returns {string} Math.js compatible expression
 */
function convertLatexToMathJs(latex) {
  if (!latex) return "";

  let expr = latex.trim();

  // Convert subscripts: I_{A} → IA, I_{B} → IB, etc.
  expr = expr.replace(/([A-Za-z])_\{([A-Za-z0-9]+)\}/g, "$1$2");

  // Convert sqrt: \sqrt{x} → sqrt(x)
  expr = expr.replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)");

  // Convert fractions: \frac{a}{b} → (a)/(b)
  expr = expr.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)");

  // Convert functions: \operatorname{func} → func
  expr = expr.replace(
    /\\operatorname\{RMS\}\s*\\left\(\s*([^)]+)\s*\\right\)/gi,
    "sqrt(mean(($1)^2))"
  );
  expr = expr.replace(
    /\\operatorname\{AVG\}\s*\\left\(\s*([^)]+)\s*\\right\)/gi,
    "mean($1)"
  );
  expr = expr.replace(/\\operatorname\{([^}]+)\}/g, "$1");

  // Convert operators
  expr = expr.replace(/\\cdot/g, "*");
  expr = expr.replace(/\\times/g, "*");

  // Convert absolute value: \left\lvert a \right\rvert → abs(a)
  expr = expr.replace(/\\left\\lvert\s*([^\\]*)\s*\\right\\rvert/g, "abs($1)");

  // Convert parentheses
  expr = expr.replace(/\\left\(/g, "(");
  expr = expr.replace(/\\right\)/g, ")");

  // Convert power: ^{n} → ^(n)
  expr = expr.replace(/\^\{([^}]+)\}/g, "^($1)");

  // Remove remaining LaTeX artifacts
  expr = expr.replace(/\\[a-zA-Z]+/g, ""); // Remove remaining commands
  expr = expr.replace(/[\{\}]/g, ""); // Remove braces

  return expr.trim();
}

/**
 * Evaluates a LaTeX expression as a computed channel and saves it
 * @param {string} latexExpression - LaTeX expression to evaluate
 * @param {Document} doc - Document object
 * @param {Window} win - Window object (popup window)
 * @returns {Object|null} Computed channel data or null if error
 */
function evaluateAndSaveComputedChannel(
  latexExpression,
  doc,
  win,
  cfg = null,
  data = null
) {
  try {
    // Get global cfg and data - use passed params first, then try window properties
    let finalCfg =
      cfg ||
      win?.globalCfg ||
      window?.globalCfg ||
      (win?.opener && win.opener.globalCfg) ||
      (window?.opener && window.opener.globalCfg);
    let finalData =
      data ||
      win?.globalData ||
      window?.globalData ||
      (win?.opener && win.opener.globalData) ||
      (window?.opener && window.opener.globalData);

    if (!finalCfg || !finalData) {
      console.error("Global cfg/data not available in popup window", {
        passedCfg: !!cfg,
        passedData: !!data,
        winGlobalCfg: !!win?.globalCfg,
        windowGlobalCfg: !!window?.globalCfg,
        openerCfg: !!(win?.opener?.globalCfg || window?.opener?.globalCfg),
      });
      return null;
    }

    cfg = finalCfg;
    data = finalData;

    // Convert LaTeX to math.js format
    const mathJsExpr = convertLatexToMathJs(latexExpression);
    console.log(
      `[ComputedChannel] LaTeX: ${latexExpression} → MathJS: ${mathJsExpr}`
    );

    // Compile expression with math.js
    const compiled =
      win.math?.compile?.(mathJsExpr) || window.math?.compile?.(mathJsExpr);
    if (!compiled) {
      throw new Error("Math.js not available. Please include mathjs CDN.");
    }

    // Get data arrays - try multiple sources for data
    let analogArray = Array.isArray(data?.analogData)
      ? data.analogData
      : Array.isArray(data?.analog)
      ? data.analog
      : [];

    let digitalArray = Array.isArray(data?.digitalData)
      ? data.digitalData
      : Array.isArray(data?.digital)
      ? data.digital
      : [];

    // If data arrays are empty, try alternative sources
    if (!analogArray || analogArray.length === 0) {
      // Try __dataArrays object (set in showChannelListWindow)
      if (win?.__dataArrays?.analogData) {
        analogArray = win.__dataArrays.analogData;
        digitalArray = win.__dataArrays.digitalData || [];
        console.log("[ComputedChannel] Got data arrays from __dataArrays");
      }
      // Try parent window's channelState
      else if (win?.opener?.channelState) {
        try {
          const parentChannelState = win.opener.channelState;
          analogArray = parentChannelState.analog || [];
          digitalArray = parentChannelState.digital || [];
          console.log(
            "[ComputedChannel] Got data arrays from parent channelState"
          );
        } catch (e) {
          console.warn("[ComputedChannel] Failed to get data from parent:", e);
        }
      }
    }

    const sampleCount = analogArray?.[0]?.length || 0;
    if (!sampleCount) {
      throw new Error(
        `No analog samples available. Cannot create computed channel. analogArray.length: ${analogArray?.length}, sampleCount: ${sampleCount}`
      );
    }

    const results = [];

    // Evaluate for each sample
    for (let i = 0; i < sampleCount; i++) {
      const scope = {};

      // Map analog channels: a0, a1, a2, ... and by ID
      analogArray.forEach((ch, idx) => {
        scope[`a${idx}`] = ch?.[i] ?? 0;
      });
      cfg?.analogChannels?.forEach((chCfg, idx) => {
        if (chCfg.id) {
          scope[chCfg.id] = analogArray?.[idx]?.[i] ?? 0;
        }
      });

      // Map digital channels: d0, d1, d2, ... and by ID
      digitalArray.forEach((ch, idx) => {
        scope[`d${idx}`] = ch?.[i] ?? 0;
      });
      cfg?.digitalChannels?.forEach((chCfg, idx) => {
        if (chCfg.id) {
          scope[chCfg.id] = digitalArray?.[idx]?.[i] ?? 0;
        }
      });

      try {
        const value = compiled.evaluate(scope);
        const numValue = Number(value);
        results.push(isFinite(numValue) ? numValue : 0);
      } catch (e) {
        results.push(0);
      }
    }

    const validResults = results.filter((v) => isFinite(v) && v !== 0);
    if (validResults.length === 0) {
      throw new Error("No valid computed values. Check your expression.");
    }

    const stats = {
      count: results.length,
      validCount: validResults.length,
      min: Math.min(...validResults),
      max: Math.max(...validResults),
      avg: validResults.reduce((a, b) => a + b, 0) / validResults.length,
    };

    // Auto-detect scaling factor based on computed results
    const resultAbsValues = validResults.map((v) => Math.abs(v));
    const maxResult = Math.max(...resultAbsValues);
    const scalingFactor = maxResult > 0 ? maxResult / 1000 : 1;

    const scaledStats = {
      min: stats.min / scalingFactor,
      max: stats.max / scalingFactor,
      avg: stats.avg / scalingFactor,
    };

    // Create computed channel data
    const computedChannelData = {
      equation: latexExpression,
      mathJsExpression: mathJsExpr,
      results,
      stats,
      scaledStats,
      scalingFactor,
      timestamp: new Date().toISOString(),
    };

    console.log(
      "[ComputedChannel] Successfully evaluated:",
      computedChannelData
    );
    return computedChannelData;
  } catch (error) {
    console.error(
      "[ComputedChannel] Error evaluating expression:",
      error.message
    );
    throw error;
  }
}

/**
 * Opens a MathLive editor popup when channel name is clicked
 * @param {Object} cell - Tabulator cell object
 * @param {Document} doc - Document object
 * @param {Window} win - Window object
 * @param {Array} availableChannels - Array of available channels with {label, latex} properties
 * @param {Object} row - Current row data
 * @param {Object} cfg - COMTRADE config object
 * @param {Object} data - COMTRADE data object
 */
function openMathLiveEditor(
  cell,
  doc,
  win,
  availableChannels = [],
  row = {},
  cfg = {},
  data = {}
) {
  const currentValue = cell.getValue() || "";
  const currentUnit = row.unit || "";

  // ✅ Detect current theme from document or localStorage
  const isDarkTheme = document.documentElement.hasAttribute('data-theme-dark') || 
                      localStorage.getItem('comtrade-theme') === 'dark' ||
                      document.body.classList.contains('dark');
  
  // ✅ Theme-aware colors
  const themeColors = isDarkTheme ? {
    bgPrimary: "#2d2d2d",
    bgSecondary: "#1a1a1a",
    textPrimary: "#ffffff",
    textSecondary: "#cccccc",
    borderColor: "#404040",
    buttonBg: "#3a3a3a",
    buttonHoverBg: "#4a4a4a",
    labelColor: "#cccccc"
  } : {
    bgPrimary: "#ffffff",
    bgSecondary: "#f5f5f5",
    textPrimary: "#1a1a1a",
    textSecondary: "#666666",
    borderColor: "#e0e0e0",
    buttonBg: "#f9f9f9",
    buttonHoverBg: "#e3f2fd",
    labelColor: "#555555"
  };

  // Use provided channels or fall back to defaults
  const channels =
    availableChannels.length > 0
      ? availableChannels
      : [
          { label: "IA", latex: "I_{A}" },
          { label: "IB", latex: "I_{B}" },
          { label: "IC", latex: "I_{C}" },
          { label: "IN", latex: "I_{N}" },
          { label: "VA", latex: "V_{A}" },
          { label: "VB", latex: "V_{B}" },
          { label: "VC", latex: "V_{C}" },
          { label: "Freq", latex: "\\operatorname{f}" },
        ];

  const operators = [
    { label: "+", latex: "+", className: "operator" },
    { label: "-", latex: "-", className: "operator" },
    { label: "×", latex: "\\cdot", className: "operator" },
    { label: "÷", latex: "\\frac{#0}{#?}", className: "operator" },
    { label: "^", latex: "^{#0}", className: "operator" },
    { label: "(", latex: "(", className: "operator" },
    { label: ")", latex: ")", className: "operator" },
    { label: "==", latex: "=" },
    { label: ">", latex: ">" },
    { label: "<", latex: "<" },
    { label: "RMS()", latex: "\\operatorname{RMS}\\left(#0\\right)" },
    { label: "ABS()", latex: "\\left\\lvert #0 \\right\\rvert" },
    { label: "AVG()", latex: "\\operatorname{AVG}\\left(#0\\right)" },
  ];

  const functions = [
    {
      label: "Mag(I)",
      latex: "\\left\\lvert I \\right\\rvert",
      className: "func",
    },
    { label: "Ang(I)", latex: "\\angle I", className: "func" },
    {
      label: "d/dt",
      latex: "\\frac{d}{dt}\\left(#0\\right)",
      className: "func",
    },
    {
      label: "Trip()",
      latex: "\\operatorname{TRIP}\\left(#0\\right)",
      className: "func",
    },
    {
      label: "Pickup()",
      latex: "\\operatorname{PICKUP}\\left(#0\\right)",
      className: "func",
    },
  ];

  const overlay = doc.createElement("div");
  overlay.style.cssText =
    "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;";

  const modal = doc.createElement("div");
  modal.style.cssText = `background:${themeColors.bgPrimary};color:${themeColors.textPrimary};border-radius:8px;padding:24px;width:700px;max-width:95%;box-shadow:0 4px 16px rgba(0,0,0,0.2);max-height:90vh;overflow-y:auto;position:relative;z-index:10000;`;

  const createButtonsHTML = (items, sectionTitle) => {
    return `
      <div style="margin-bottom:16px;">
        <h4 style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:${themeColors.labelColor};">${sectionTitle}</h4>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${items
            .map(
              (item) => `
            <button class="insert-btn" data-latex="${item.latex.replace(
              /"/g,
              "&quot;"
            )}" 
              style="padding:6px 12px;border:1px solid ${themeColors.borderColor};border-radius:4px;background:${themeColors.buttonBg};color:${themeColors.textPrimary};cursor:pointer;font-size:13px;transition:all 0.2s;"
              onmouseover="this.style.background='${themeColors.buttonHoverBg}';this.style.borderColor='#2196f3';"
              onmouseout="this.style.background='${themeColors.buttonBg}';this.style.borderColor='${themeColors.borderColor}';">
              ${item.label}
            </button>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  };

  modal.innerHTML = `
    <h3 style="margin:0 0 16px 0;font-size:18px;font-weight:600;color:${themeColors.textPrimary};">Edit Channel Expression</h3>
    
    <div style="margin-bottom:16px;">
      <label style="display:block;margin-bottom:8px;font-weight:500;color:${themeColors.labelColor};">Available Channels:</label>
      <select id="channel-dropdown" style="width:100%;padding:8px;border:1px solid ${themeColors.borderColor};border-radius:4px;font-size:14px;background:${themeColors.bgSecondary};color:${themeColors.textPrimary};">
        <option value="">-- Select a channel to insert --</option>
        ${channels
          .map(
            (ch) =>
              `<option value="${ch.latex.replace(/"/g, "&quot;")}" style="background:${themeColors.bgSecondary};color:${themeColors.textPrimary};">${
                ch.label
              }</option>`
          )
          .join("")}
      </select>
    </div>
    
    ${createButtonsHTML(operators, "Operators")}
    ${createButtonsHTML(functions, "Functions")}
    
    <div style="margin-bottom:16px;">
      <label style="display:block;margin-bottom:8px;font-weight:500;color:${themeColors.labelColor};">Math Expression:</label>
      <math-field id="math-editor" virtual-keyboard-mode="manual" style="width:100%;padding:8px;border:1px solid ${themeColors.borderColor};border-radius:4px;font-size:16px;background:${themeColors.bgSecondary};color:${themeColors.textPrimary};--keyboard-zindex:10001;"></math-field>
    </div>
    
    <div style="margin-bottom:16px;">
      <label style="display:block;margin-bottom:8px;font-weight:500;color:${themeColors.labelColor};">Unit (for new computed channel):</label>
      <input type="text" id="channel-unit" placeholder="e.g., Amps, Volts, Hz" value="${currentUnit}" style="width:100%;padding:8px;border:1px solid ${themeColors.borderColor};border-radius:4px;font-size:14px;box-sizing:border-box;background:${themeColors.bgSecondary};color:${themeColors.textPrimary};">
    </div>
    
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button id="cancel-btn" style="padding:8px 16px;border:1px solid ${themeColors.borderColor};border-radius:4px;background:${themeColors.buttonBg};color:${themeColors.textPrimary};cursor:pointer;font-size:14px;">Cancel</button>
      <button id="save-btn" style="padding:8px 16px;border:none;border-radius:4px;background:#22c55e;color:#fff;cursor:pointer;font-size:14px;">Save</button>
    </div>
    <div id="status-message" style="margin-top:12px;padding:8px;border-radius:4px;display:none;font-size:13px;"></div>
  `;

  overlay.appendChild(modal);
  doc.body.appendChild(overlay);

  // ✅ Add dynamic CSS for mathLive theming
  const themeStyle = doc.createElement("style");
  themeStyle.textContent = `
    /* MathLive Editor Field Theming */
    math-field {
      --ML__fieldBackground: ${themeColors.bgSecondary} !important;
      --ML__fieldText: ${themeColors.textPrimary} !important;
      --ML__fieldBorderColor: ${themeColors.borderColor} !important;
    }

    /* MathLive Keyboard Theming */
    .ML__keyboard {
      background-color: ${themeColors.bgSecondary} !important;
      color: ${themeColors.textPrimary} !important;
      border: 1px solid ${themeColors.borderColor} !important;
    }

    /* Keyboard Keys */
    .ML__keyboard .keyboard-button,
    .ML__keyboard button {
      background-color: ${themeColors.buttonBg} !important;
      color: ${themeColors.textPrimary} !important;
      border: 1px solid ${themeColors.borderColor} !important;
    }

    .ML__keyboard .keyboard-button:hover,
    .ML__keyboard button:hover,
    .ML__keyboard .keyboard-button:focus,
    .ML__keyboard button:focus {
      background-color: ${themeColors.buttonHoverBg} !important;
      border-color: #2196f3 !important;
    }

    /* Keyboard Text/Operators */
    .ML__keyboard .keyboard-button span,
    .ML__keyboard button span {
      color: ${themeColors.textPrimary} !important;
    }

    /* MathLive Input Field */
    .ML__field {
      background-color: ${themeColors.bgSecondary} !important;
      color: ${themeColors.textPrimary} !important;
      border-color: ${themeColors.borderColor} !important;
    }

    .ML__field:focus {
      border-color: #2196f3 !important;
      box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1) !important;
    }

    /* MathLive Cursor */
    .ML__field .ML__cursor {
      background-color: ${themeColors.textPrimary} !important;
    }

    /* MathLive Selection */
    .ML__field .ML__selection {
      background-color: rgba(33, 150, 243, 0.3) !important;
    }

    /* Dropdown Select */
    select {
      accent-color: #2196f3;
    }

    option {
      background-color: ${themeColors.bgSecondary};
      color: ${themeColors.textPrimary};
    }
  `;
  doc.head.appendChild(themeStyle);

  // Make cfg and data available to popup window for evaluateAndSaveComputedChannel
  try {
    win.globalCfg = cfg;
    win.globalData = data;
  } catch (e) {
    // ignore cross-window property assignment issues
  }

  setTimeout(() => {
    const mathField = doc.getElementById("math-editor");
    const statusMsg = doc.getElementById("status-message");

    if (mathField) {
      mathField.value = currentValue;

      modal.querySelectorAll(".insert-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const latex = btn.getAttribute("data-latex");
          mathField.executeCommand(["insert", latex]);
          mathField.focus();
        });
      });

      // Add channel dropdown listener
      const channelDropdown = doc.getElementById("channel-dropdown");
      if (channelDropdown) {
        channelDropdown.addEventListener("change", (e) => {
          if (e.target.value) {
            mathField.executeCommand(["insert", e.target.value]);
            mathField.focus();
            e.target.value = ""; // Reset dropdown after insertion
          }
        });
      }

      mathField.focus();
    }

    // Helper to show status message
    const showStatus = (message, isError = false) => {
      statusMsg.textContent = message;
      statusMsg.style.background = isError ? "#fee2e2" : "#dcfce7";
      statusMsg.style.color = isError ? "#7f1d1d" : "#166534";
      statusMsg.style.display = "block";
      if (!isError) {
        setTimeout(() => {
          statusMsg.style.display = "none";
        }, 3000);
      }
    };

    // Save button: evaluate expression, create computed channel, and update cell
    doc.getElementById("save-btn").addEventListener("click", async () => {
      if (!mathField) return;

      const expression = mathField.value.trim();
      const unit = (doc.getElementById("channel-unit")?.value || "").trim();

      if (!expression) {
        showStatus("⚠️ Please enter an expression", true);
        mathField.focus();
        return;
      }

      try {
        // ✅ Show progress bar immediately when user clicks save
        const { showProgress } = await import("../components/ProgressBar.js");
        showProgress(1, `Processing: ${expression.substring(0, 30)}...`);

        // ✅ NEW: Send expression to parent window for evaluation
        // Parent has the actual data and can evaluate the expression
        showStatus("⏳ Sending expression to parent for evaluation...");

        if (win.opener && !win.opener.closed) {
          // Send expression to parent for evaluation
          win.opener.postMessage(
            {
              source: "ChildWindow",
              type: "evaluateComputedChannel",
              payload: {
                expression: expression,
                unit: unit,
                timestamp: Date.now(),
              },
            },
            "*"
          );

          showStatus(
            `✅ Expression sent to parent for evaluation${
              unit ? ` (${unit})` : ""
            }`
          );

          // Close modal after a short delay
          setTimeout(() => {
            try {
              if (doc.body.contains(overlay)) {
                doc.body.removeChild(overlay);
              }
            } catch (e) {
              // Ignore removal errors
            }
          }, 800);
        } else {
          showStatus("❌ Parent window not accessible", true);
        }
      } catch (error) {
        console.error("[MathLiveEditor] Error sending expression:", error);
        showStatus(`❌ Error: ${error.message}`, true);
      }
    });

    doc.getElementById("cancel-btn").addEventListener("click", () => {
      doc.body.removeChild(overlay);
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        doc.body.removeChild(overlay);
      }
    });

    const escHandler = (e) => {
      if (e.key === "Escape" && doc.body.contains(overlay)) {
        doc.body.removeChild(overlay);
        doc.removeEventListener("keydown", escHandler);
      }
    };
    doc.addEventListener("keydown", escHandler);
  }, 100);
}

/**
 * Converts LaTeX expressions to plain text math notation
 * @param {string} latex - LaTeX string to convert
 * @returns {string} Plain text representation
 */
function convertLatexToPlainText(latex) {
  // Handle non-string and empty values
  if (!latex || typeof latex !== "string") return "";

  let result = latex;

  result = result.replace(/([A-Za-z])_\{([A-Za-z0-9]+)\}/g, "$1$2");

  result = result.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)");

  result = result.replace(/\\cdot/g, " × ");

  result = result.replace(/\\operatorname\{([^}]+)\}/g, "$1");

  result = result.replace(/\\left\\lvert/g, "|");
  result = result.replace(/\\right\\rvert/g, "|");
  result = result.replace(/\\left\(/g, "(");
  result = result.replace(/\\right\)/g, ")");

  result = result.replace(/\\angle/g, "∠");

  result = result.replace(/\^\{([^}]+)\}/g, "^$1");

  result = result.replace(/\\/g, "");

  return result;
}

/**
 * Simple HTML fallback channel list when Tabulator is not available
 */
function createSimpleChannelList(cfg, onChannelUpdate) {
  const container = document.createElement("div");
  container.className = "channel-list-container";
  container.style.cssText = "padding: 16px; font-family: sans-serif;";

  // Helper to create a list for a channel type
  function createList(type, channels) {
    const section = document.createElement("section");
    section.className = "channel-list-section";
    section.style.cssText = "margin-bottom: 24px;";

    const title = document.createElement("h3");
    title.textContent =
      type === "analog" ? "Analog Channels" : "Digital Channels";
    title.style.cssText =
      "margin: 0 0 12px 0; font-size: 1.1em; color: #00d9ff;";
    section.appendChild(title);

    const list = document.createElement("ul");
    list.className = "channel-list";
    list.style.cssText = "list-style: none; padding: 0; margin: 0;";

    channels.forEach((ch, idx) => {
      const li = document.createElement("li");
      li.className = "channel-list-item";
      li.style.cssText = `
        padding: 10px 12px;
        margin-bottom: 6px;
        background: #1a1f2e;
        border: 1px solid #2d3748;
        border-radius: 4px;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: grab;
        transition: background 0.2s;
      `;
      li.setAttribute("draggable", "true");

      // Channel color swatch and color picker
      const color =
        ch.color || ch.stroke || ch.displayColor || ch.colour || "#888";
      const colorBox = document.createElement("input");
      colorBox.type = "color";
      colorBox.value = color;
      colorBox.style.cssText =
        "width: 32px; height: 32px; border: 1px solid #444; border-radius: 3px; cursor: pointer;";
      colorBox.addEventListener("input", (e) => {
        ch.color = e.target.value;
        if (typeof onChannelUpdate === "function") {
          onChannelUpdate(type, idx, idx, e.target.value);
        }
      });
      li.appendChild(colorBox);

      // Channel label
      const labelSpan = document.createElement("span");
      labelSpan.textContent =
        ch.id || ch.name || `${type === "analog" ? "A" : "D"}${idx + 1}`;
      labelSpan.style.cssText = "flex: 1; color: #e5e7eb;";
      li.appendChild(labelSpan);

      li.dataset.idx = idx;
      li.dataset.type = type;

      // Drag events
      li.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify({ type, idx }));
        li.style.opacity = "0.5";
      });
      li.addEventListener("dragend", (e) => {
        li.style.opacity = "1";
      });
      li.addEventListener("dragover", (e) => {
        e.preventDefault();
        li.style.background = "#2a3f5f";
      });
      li.addEventListener("dragleave", (e) => {
        li.style.background = "#1a1f2e";
      });
      li.addEventListener("drop", (e) => {
        e.preventDefault();
        li.style.background = "#1a1f2e";
        try {
          const { type: fromType, idx: fromIdx } = JSON.parse(
            e.dataTransfer.getData("text/plain")
          );
          const toIdx = idx;
          if (
            fromType === type &&
            fromIdx !== toIdx &&
            typeof onChannelUpdate === "function"
          ) {
            onChannelUpdate(type, parseInt(fromIdx), toIdx);
          }
        } catch (err) {
          console.error("Drop error:", err);
        }
      });

      list.appendChild(li);
    });
    section.appendChild(list);
    return section;
  }

  // Analog channels
  if (cfg.analogChannels && cfg.analogChannels.length > 0) {
    container.appendChild(createList("analog", cfg.analogChannels));
  }
  // Digital channels
  if (cfg.digitalChannels && cfg.digitalChannels.length > 0) {
    container.appendChild(createList("digital", cfg.digitalChannels));
  }

  return container;
}

/**
 * Create a mapping from analog channel indices to their numeric group IDs
 * Uses pattern-based matching (group 1, 2, 3, ...)
 * @param {Array} analogChannels - Array of analog channel objects
 * @returns {Object} Map of { analogIndex: groupId }
 */
function createAnalogChannelGroupMap(analogChannels) {
  const groupMap = {};
  const autoIndices = []; // Channels that need auto-grouping

  // ✅ STEP 1: Collect explicit groups (user-assigned)
  // Accept groups that start with "G", "GA", or "GD" followed by digits
  // Reject invalid formats like "Currents", "Voltages", "Other"
  let hasValidExplicitGroups = false;
  analogChannels.forEach((ch, idx) => {
    if (
      ch &&
      ch.group &&
      typeof ch.group === "string" &&
      /^(GA?|GD?)\d+$/.test(ch.group)
    ) {
      // Valid explicit group format (G0, G1, GA0, GA1, GD0, etc.)
      groupMap[idx] = ch.group;
      hasValidExplicitGroups = true;
    } else {
      // Invalid or missing group -> mark for auto-grouping
      autoIndices.push(idx);
    }
  });

  // ✅ STEP 2: Auto-group any channels without valid explicit groups
  if (autoIndices.length > 0) {
    console.log(
      `[createAnalogChannelGroupMap] Found ${
        analogChannels.length - autoIndices.length
      } explicit groups and ${
        autoIndices.length
      } channels needing auto-grouping`
    );

    // Build subset of channels that need auto-grouping
    const autoChannels = autoIndices.map((idx) => analogChannels[idx]);
    const autoGroups = autoGroupChannels(autoChannels);

    // Map auto-group indices back to global indices
    // ✅ FIX: autoGroupChannels returns an object { "G0": [indices], "G1": [indices] }
    // Not an array, so we need to iterate over Object.entries
    Object.entries(autoGroups).forEach(([groupId, indices]) => {
      if (Array.isArray(indices)) {
        indices.forEach((localIdx) => {
          const globalIdx = autoIndices[localIdx];
          groupMap[globalIdx] = groupId; // Use groupId: "G0", "G1", "G2", etc.
        });
      }
    });

    console.log(
      "[createAnalogChannelGroupMap] Auto-grouping assigned groups:",
      Object.entries(autoGroups).map(([groupId, indices]) => ({
        groupId,
        count: indices?.length || 0,
      }))
    );
  } else {
    console.log(
      "[createAnalogChannelGroupMap] All channels have explicit group assignments"
    );
  }

  console.log("[createAnalogChannelGroupMap] Final group mapping:", groupMap);
  return groupMap;
}

/**
 * Extract all unique groups from tableData
 * Also include default numeric groups
 * @param {Array} tableData - Array of channel objects with group field
 * @param {Window} parentWindow - Optional parent window to read channelState from
 * @returns {Object} Object suitable for Tabulator list editor
 */
function getAllAvailableGroups(tableData, parentWindow = null) {
  // Default groups in G format (including GA/GD patterns)
  const defaultGroups = [
    "GA0", "GA1", "GA2", "GA3", "GA4", "GA5", "GA6", "GA7", "GA8", "GA9",
    "GD0", "GD1", "GD2", "GD3", "GD4", "GD5",
  ];

  // Extract unique groups from tableData
  const extractedGroups = new Set();
  if (Array.isArray(tableData)) {
    tableData.forEach((row) => {
      if (row.group !== undefined && row.group !== null && row.group !== "") {
        extractedGroups.add(row.group);
      }
    });
  }
  
  // ✅ FIX: Also extract groups from channelState (source of truth)
  try {
    const analogGroups = parentWindow?.channelState?.analog?.groups;
    const digitalGroups = parentWindow?.channelState?.digital?.groups;
    
    if (Array.isArray(analogGroups)) {
      analogGroups.forEach(g => {
        if (g && typeof g === "string") extractedGroups.add(g);
      });
    }
    if (Array.isArray(digitalGroups)) {
      digitalGroups.forEach(g => {
        if (g && typeof g === "string") extractedGroups.add(g);
      });
    }
    
    console.log("[getAllAvailableGroups] Groups from channelState:", {
      analog: analogGroups?.slice(0, 5),
      digital: digitalGroups?.slice(0, 5)
    });
  } catch (e) {
    console.warn("[getAllAvailableGroups] Could not read channelState:", e);
  }

  // Combine default + extracted groups
  const allGroups = new Set([...defaultGroups, ...extractedGroups]);
  
  // Sort groups: GA first, then GD, then G
  const sortedGroups = Array.from(allGroups).sort((a, b) => {
    // Extract prefix and number
    const matchA = a.match(/^(GA?|GD?)(\d+)$/);
    const matchB = b.match(/^(GA?|GD?)(\d+)$/);
    
    if (!matchA && !matchB) return a.localeCompare(b);
    if (!matchA) return 1;
    if (!matchB) return -1;
    
    const prefixOrder = { 'GA': 0, 'G': 1, 'GD': 2 };
    const prefixA = matchA[1];
    const prefixB = matchB[1];
    
    if (prefixA !== prefixB) {
      return (prefixOrder[prefixA] ?? 99) - (prefixOrder[prefixB] ?? 99);
    }
    
    return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
  });

  // Convert to object format for Tabulator { label: value, ... }
  const groupOptions = {};
  sortedGroups.forEach((group) => {
    groupOptions[group] = group;
  });

  console.log(
    "[getAllAvailableGroups] Available group numbers:",
    Object.keys(groupOptions)
  );
  return groupOptions;
}

export function createChannelList(
  cfg,
  onChannelUpdate,
  TabulatorInstance,
  ownerDocument,
  attachToElement,
  data = null,
  parentWindow = null // ✅ NEW: Accept parent window reference
) {
  // ✅ CRITICAL FIX: Ensure parentWindow is set with proper fallback chain
  // Priority: param > global > window.opener > window
  parentWindow =
    parentWindow ||
    (typeof window !== "undefined" && window.globalParentWindow) ||
    (typeof window !== "undefined" && window.opener) ||
    (typeof window !== "undefined" && window);

  console.log("[createChannelList] Parent window resolution:", {
    paramReceived: arguments[6],
    globalParentWindow:
      typeof window !== "undefined" && !!window.globalParentWindow,
    windowOpener: typeof window !== "undefined" && !!window.opener,
    final: !!parentWindow,
    closed: parentWindow?.closed,
  });

  // Use provided document (popup) or fallback to current document
  const doc =
    ownerDocument ||
    (typeof document !== "undefined" ? document : window.document);

  // ✅ Touch-friendly fix: Prevent Tabulator from reacting to resize while an editor is active
  try {
    const win = doc.defaultView || window;
    if (win && !win.__tabulatorResizeHookInstalled) {
      win.addEventListener(
        "resize",
        function (event) {
          try {
            const editing = doc.querySelectorAll(".tabulator-editing").length;
            if (editing) {
              // Stop other resize listeners on this target (including Tabulator)
              event.stopImmediatePropagation();
            }
          } catch (e) {
            /* ignore */
          }
        },
        true // use capture to run before Tabulator's listener
      );
      win.__tabulatorResizeHookInstalled = true;
    }
  } catch (e) {
    /* ignore */
  }

  // If data not provided, try to get from window globals (set by showChannelListWindow)
  if (!data && typeof window !== "undefined") {
    data =
      window.globalData || (window.opener && window.opener.globalData) || {};
  }

  // Create container for the table in the correct document
  const container = doc.createElement("div");
  container.className = "channel-list-container bg-green-200 rounded-lg shadow";

  // If attachToElement provided, append container into it so children are in the popup DOM
  if (attachToElement && attachToElement.appendChild) {
    try {
      attachToElement.appendChild(container);
    } catch (e) {
      console.warn("createChannelList: failed to append to attachToElement", e);
    }
  }

  // ✅ FIX: Read ACTUAL groups from channelState (source of truth for GA0, GA1, GD0, etc.)
  // instead of re-creating groups via createAnalogChannelGroupMap
  const analogGroupsRaw = parentWindow?.channelState?.analog?.groups;
  const analogGroupsFromState = Array.isArray(analogGroupsRaw)
    ? [...analogGroupsRaw]
    : (analogGroupsRaw ? Array.from(analogGroupsRaw) : []);
  
  // ✅ Convert to plain array to handle Proxy objects from parent window
  const digitalGroupsRaw = parentWindow?.channelState?.digital?.groups;
  const digitalGroupsFromState = Array.isArray(digitalGroupsRaw)
    ? [...digitalGroupsRaw]
    : (digitalGroupsRaw ? Array.from(digitalGroupsRaw) : []);
  
  console.log("[ChannelList] 📊 Groups from channelState:");
  console.log("[ChannelList]   - Analog groups:", analogGroupsFromState.slice(0, 10), "...");
  console.log("[ChannelList]   - Digital groups:", digitalGroupsFromState.slice(0, 10), "...");

  // Fallback: Create mapping only if channelState groups are empty
  const analogGroupMap = analogGroupsFromState.length > 0 
    ? {} // Not needed, we'll use analogGroupsFromState directly
    : createAnalogChannelGroupMap(cfg.analogChannels || []);

  // 💾 LOAD persisted computed channels from localStorage if not already in cfg
  if (!cfg.computedChannels || cfg.computedChannels.length === 0) {
    const storedChannels = loadComputedChannelsFromStorage();
    if (storedChannels && storedChannels.length > 0) {
      console.log(
        "[ChannelList] 💾 Loading persisted computed channels from localStorage:",
        storedChannels
      );
      cfg.computedChannels = storedChannels;
    }
  }

  // Merge analog + digital + computed channel data
  const tableData = [
    // ✅ Analog channels first - USE channelState groups as primary source
    ...cfg.analogChannels.map((ch, i) => ({
      id: i + 1,
      channelID: ch.channelID,
      originalIndex: i,
      type: "Analog",
      displayGroup: "Analog", // ✅ Just "Analog" section
      name: ch.id || `Analog ${i + 1}`,
      unit: ch.unit || "",
      // ✅ Priority: channelState > cfg > fallback
      group: analogGroupsFromState[i] || ch.group || analogGroupMap[i] || "G0",
      color: ch.color || "#888",
      scale: ch.scale || 1,
      start: ch.start || 0,
      duration: ch.duration || "",
      invert: ch.invert || "",
    })),
    // ✅ Computed channels - placed based on madeFrom (analog or digital)
    ...(cfg.computedChannels || []).map((ch, i) => {
      // Determine displayGroup based on madeFrom
      const madeFrom = (ch.madeFrom || "analog").toLowerCase();
      const displayGroup = madeFrom === "digital" ? "Digital" : "Analog";
      
      // ✅ FIX: Ensure channelID is set for delete operations
      const computedId = ch.id || ch.channelID || ch.name || `computed-${i}`;
      
      return {
        id: computedId,
        channelID: computedId,  // ✅ Ensure channelID is set (used by delete handler)
        originalIndex: i,
        type: "Computed", // ✅ KEEP as Computed type for state routing
        displayGroup: displayGroup, // ✅ Show with Analog or Digital based on madeFrom
        madeFrom: ch.madeFrom || "analog", // ✅ Preserve madeFrom for reference
        name: ch.name || ch.id || `Computed ${i + 1}`,
        unit: ch.unit || "",
        group: ch.group || detectGroupFromExpression(ch.equation, cfg),
        color: ch.color || "#4ECDC4",
        scale: ch.scale || 1,
        start: ch.start || 0,
        duration: ch.duration || "",
        invert: ch.invert || "",
      };
    }),
    // ✅ Digital channels (separate group)
    ...cfg.digitalChannels.map((ch, i) => ({
      id: i + 1,
      channelID: ch.channelID,
      originalIndex: i,
      type: "Digital",
      displayGroup: "Digital", // ✅ Custom display grouping (separate)
      name: ch.id || `Digital ${i + 1}`,
      unit: ch.unit || "",
      // ✅ FIX: Priority order for group - channelState is source of truth
      // Accept GA, GD, or G prefix patterns
      group: (() => {
        // 1. First check channelState (source of truth from charts)
        const stateGroup = digitalGroupsFromState[i];
        if (typeof stateGroup === "string" && /^(GA?|GD?)\d+$/.test(stateGroup)) {
          return stateGroup.trim();
        }
        
        // 2. Then check cfg explicit group
        const explicitGroup = ch.group;
        if (typeof explicitGroup === "string" && /^(GA?|GD?)\d+$/.test(explicitGroup)) {
          return explicitGroup.trim();
        }
        
        // 3. Default fallback
        return "GD0";
      })(),
      color: ch.color || "#888",
      scale: ch.scale || 1,
      start: ch.start || 0,
      duration: ch.duration || "",
      invert: ch.invert || "",
    })),
  ];

  // Sort tableData to ensure:
  // 1. Analog displayGroup comes before Digital displayGroup
  // 2. Within each displayGroup, regular channels come before Computed channels
  tableData.sort((a, b) => {
    // First sort by displayGroup (Analog before Digital)
    if (a.displayGroup !== b.displayGroup) {
      return a.displayGroup === "Analog" ? -1 : 1;
    }
    // Within same displayGroup, put regular channels before Computed
    if (a.type !== b.type) {
      if (a.type === "Computed") return 1;
      if (b.type === "Computed") return -1;
    }
    return 0; // Maintain original order otherwise
  });

  // 🔍 DEBUG: Check computed channels state when popup opens
  console.log("[ChannelList] 🔍 COMPUTED CHANNELS DEBUG (on popup open):", {
    computedChannelsExists: !!cfg.computedChannels,
    computedChannelsLength: cfg.computedChannels?.length || 0,
    computedChannels: cfg.computedChannels,
    tableDataLength: tableData.length,
    tableDataTypes: tableData.map((r) => r.type),
    tableDataDisplayGroups: tableData.map((r) => r.displayGroup),
    tableDataSummary: {
      analogCount: tableData.filter((r) => r.type === "Analog").length,
      digitalCount: tableData.filter((r) => r.type === "Digital").length,
      computedCount: tableData.filter((r) => r.type === "Computed").length,
      computedInAnalogGroup: tableData.filter((r) => r.type === "Computed" && r.displayGroup === "Analog").length,
      computedInDigitalGroup: tableData.filter((r) => r.type === "Computed" && r.displayGroup === "Digital").length,
    },
  });

  // Debug: Log first few channels with their units
  console.log(
    "[ChannelList] Table data - Analog channels:",
    cfg.analogChannels.slice(0, 2).map((ch) => ({ id: ch.id, unit: ch.unit }))
  );
  console.log(
    "[ChannelList] Table data - Digital channels:",
    cfg.digitalChannels.slice(0, 2).map((ch) => ({ id: ch.id, unit: ch.unit }))
  );
  console.log(
    "[ChannelList] Prepared tableData units:",
    tableData.slice(0, 3).map((row) => ({ name: row.name, unit: row.unit }))
  );
  console.log(
    "[ChannelList] FULL tableData object:",
    JSON.stringify(tableData, null, 2)
  );

  // Define table columns
  const columns = [
    { title: "ID", field: "id", width: 60, hozAlign: "center" },
    {
      title: "Channel Name (Unit)",
      field: "name",
      headerFilter: "input",
      editor: (cell) => {
        // For Computed channels, show dropdown of available channels
        const rowData = cell.getRow().getData();
        if (rowData.type === "Computed") {
          // Create a select element for channel selection
          const select = doc.createElement("select");
          select.style.cssText =
            "width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;";

          // Add default option
          const defaultOption = doc.createElement("option");
          defaultOption.value = "";
          defaultOption.textContent = "-- Select available channel --";
          select.appendChild(defaultOption);

          // Add analog channels
          (cfg.analogChannels || []).forEach((ch, idx) => {
            const option = doc.createElement("option");
            option.value = ch.id || `Analog ${idx + 1}`;
            option.textContent = `${ch.id || `Analog ${idx + 1}`} (${
              ch.unit || "N/A"
            })`;
            select.appendChild(option);
          });

          // Add digital channels
          (cfg.digitalChannels || []).forEach((ch, idx) => {
            const option = doc.createElement("option");
            option.value = ch.id || `Digital ${idx + 1}`;
            option.textContent = `${ch.id || `Digital ${idx + 1}`} (${
              ch.unit || "N/A"
            })`;
            select.appendChild(option);
          });

          select.addEventListener("change", (e) => {
            cell.setValue(e.target.value);
          });

          return select;
        } else {
          // For Analog/Digital channels, use simple text input
          const input = doc.createElement("input");
          input.type = "text";
          input.value = cell.getValue() || "";
          input.style.cssText =
            "width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;";
          input.addEventListener("blur", () => {
            cell.setValue(input.value);
          });
          return input;
        }
      },
      resizable: true,
      formatter: (cell) => {
        const value = cell.getValue();
        const displayValue = convertLatexToPlainText(value);
        return displayValue || value;
      },
      cellClick: (e, cell) => {
        // Open MathLive editor only for Computed channels
        const rowData = cell.getRow().getData();
        if (rowData.type === "Computed") {
          // Get all available channels for dropdown
          const analogChannels = (cfg.analogChannels || []).map((ch, idx) => {
            const label = ch.id || `Analog ${idx + 1}`;
            return {
              label,
              latex: label, // Use actual channel name as LaTeX
            };
          });
          const digitalChannels = (cfg.digitalChannels || []).map((ch, idx) => {
            const label = ch.id || `Digital ${idx + 1}`;
            return {
              label,
              latex: label, // Use actual channel name as LaTeX
            };
          });
          const allChannels = [...analogChannels, ...digitalChannels];

          openMathLiveEditor(
            cell,
            doc,
            doc.defaultView || window,
            allChannels,
            rowData,
            cfg,
            data
          );
        }
      },
    },
    {
      title: "Unit",
      field: "unit",
      editor: "input",
      width: 100,
      headerFilter: "input",
    },
    {
      title: "Group",
      field: "group",
      width: 150,
      headerFilter: "input",
      hozAlign: "center",
      // ✅ CUSTOM EDITOR: Fixed for touchpad blur issue
      // The native list editor closes immediately on touchpad due to phantom blur events
      editor: function(cell, onRendered, success, cancel, editorParams) {
        const currentValue = cell.getValue() || "GA0";
        // ✅ FIX: Pass parentWindow to get actual groups from channelState
        const groupsObj = getAllAvailableGroups(tableData, parentWindow);
        const groups = Object.keys(groupsObj);
        
        // Debug: Log what the cell and tableData contain
        console.log("[Group Editor] 📋 Custom editor created");
        console.log("[Group Editor] 📋 Current cell value:", currentValue);
        console.log("[Group Editor] 📋 Available groups (includes channelState):", groups);
        console.log("[Group Editor] 📋 TableData sample (first 3 rows):", tableData.slice(0, 3).map(r => ({ name: r.name, group: r.group })));
        
        // Detect document context
        const usedDoc = typeof doc !== "undefined" ? doc : 
                       (typeof document !== "undefined" ? document : window.document);
        
        // ✅ Theme detection
        const getIsDark = () => {
          return usedDoc.documentElement.hasAttribute('data-theme-dark') || 
                 usedDoc.documentElement.classList.contains('dark') ||
                 usedDoc.body.classList.contains('dark') ||
                 localStorage.getItem('comtrade-theme') === 'dark';
        };
        
        const getThemeColors = () => {
          const isDark = getIsDark();
          return isDark ? {
            bg: '#1e293b',
            bgHover: '#334155',
            bgSelected: '#3b82f6',
            text: '#e2e8f0',
            border: '#475569',
            inputBg: '#0f172a',
            inputBorder: '#475569',
            shadow: 'rgba(0,0,0,0.4)'
          } : {
            bg: '#ffffff',
            bgHover: '#f0f0f0',
            bgSelected: '#e3f2fd',
            text: '#1e293b',
            border: '#d1d5db',
            inputBg: '#ffffff',
            inputBorder: '#d1d5db',
            shadow: 'rgba(0,0,0,0.15)'
          };
        };
        
        let colors = getThemeColors();
        
        // Create container
        const container = usedDoc.createElement("div");
        container.style.cssText = "position: relative; width: 100%;";
        
        // Create input
        const input = usedDoc.createElement("input");
        input.type = "text";
        input.value = currentValue;
        input.style.cssText = `
          width: 100%; padding: 4px 8px; border: 1px solid ${colors.border}; border-radius: 4px;
          background: ${colors.inputBg}; color: ${colors.text}; font-size: 13px; outline: none;
        `;
        container.appendChild(input);
        
        // Create dropdown - append to BODY with fixed positioning to avoid clipping
        const dropdown = usedDoc.createElement("div");
        dropdown.style.cssText = `
          position: fixed; z-index: 999999;
          background: ${colors.bg}; border: 1px solid ${colors.border}; border-radius: 4px;
          box-shadow: 0 4px 12px ${colors.shadow}; max-height: 280px; overflow-y: auto;
          display: none;
        `;
        usedDoc.body.appendChild(dropdown); // ✅ Append to body to avoid overflow clipping
        
        // ✅ Add "New Group" input row at top of dropdown
        const inputRow = usedDoc.createElement("div");
        inputRow.style.cssText = `
          display: flex; padding: 6px; border-bottom: 1px solid ${colors.border}; 
          gap: 4px; position: sticky; top: 0; background: ${colors.bg};
        `;
        
        const newGroupInput = usedDoc.createElement("input");
        newGroupInput.type = "text";
        newGroupInput.placeholder = "New Group ID...";
        newGroupInput.style.cssText = `
          flex: 1; padding: 4px 8px; border: 1px solid ${colors.inputBorder}; 
          border-radius: 4px; font-size: 12px; background: ${colors.inputBg}; color: ${colors.text};
        `;
        
        const addBtn = usedDoc.createElement("button");
        addBtn.type = "button";
        addBtn.textContent = "Add";
        addBtn.style.cssText = `
          padding: 4px 10px; background: #3b82f6; color: white; 
          border: none; border-radius: 4px; font-size: 12px; cursor: pointer;
        `;
        
        // Add new group handler
        const addNewGroup = () => {
          const newGroup = newGroupInput.value.trim();
          if (newGroup) {
            console.log("[Group Editor] ✅ Adding new group:", newGroup);
            input.value = newGroup;
            cleanupDropdown();
            success(newGroup);
          }
        };
        
        addBtn.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        addBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          addNewGroup();
        });
        
        newGroupInput.addEventListener("mousedown", (e) => e.stopPropagation());
        newGroupInput.addEventListener("keydown", (e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            addNewGroup();
          }
        });
        
        inputRow.appendChild(newGroupInput);
        inputRow.appendChild(addBtn);
        dropdown.appendChild(inputRow);
        
        // Options container (below the input row)
        const optionsContainer = usedDoc.createElement("div");
        dropdown.appendChild(optionsContainer);
        
        // Position dropdown below input
        const positionDropdown = () => {
          const rect = input.getBoundingClientRect();
          dropdown.style.top = (rect.bottom + 2) + "px";
          dropdown.style.left = rect.left + "px";
          dropdown.style.minWidth = Math.max(rect.width, 180) + "px";
        };
        
        // Cleanup function to remove dropdown from body
        const cleanupDropdown = () => {
          if (dropdown.parentNode) {
            dropdown.parentNode.removeChild(dropdown);
          }
        };
        
        // Populate dropdown options
        const renderOptions = (filter = "") => {
          optionsContainer.innerHTML = "";
          const filterLower = filter.toLowerCase();
          
          // Debug: Log what groups we have
          console.log("[Group Editor] 🔍 Rendering options, groups:", groups, "filter:", filter);
          
          let visibleCount = 0;
          groups.forEach(groupValue => {
            if (filter && !groupValue.toLowerCase().includes(filterLower)) return;
            visibleCount++;
            
            const option = usedDoc.createElement("div");
            option.textContent = groupValue;
            const isSelected = groupValue === input.value;
            option.style.cssText = `
              padding: 8px 12px; cursor: pointer; color: ${colors.text};
              background: ${isSelected ? colors.bgSelected : 'transparent'};
            `;
            option.addEventListener("mouseenter", () => { 
              if (!isSelected) option.style.background = colors.bgHover; 
            });
            option.addEventListener("mouseleave", () => { 
              option.style.background = isSelected ? colors.bgSelected : 'transparent'; 
            });
            option.addEventListener("mousedown", (e) => {
              e.preventDefault(); // ✅ CRITICAL: Prevent blur before value is set
              e.stopPropagation();
            });
            option.addEventListener("click", (e) => {
              e.stopPropagation();
              console.log("[Group Editor] ✅ Option selected:", groupValue);
              input.value = groupValue;
              cleanupDropdown();
              success(groupValue);
            });
            optionsContainer.appendChild(option);
          });
          
          console.log("[Group Editor] 🔍 Rendered", visibleCount, "options");
        };
        renderOptions();
        
        // Show dropdown and position it
        positionDropdown();
        dropdown.style.display = "block";
        
        // Filter on input
        input.addEventListener("input", () => {
          renderOptions(input.value);
        });
        
        // ✅ TOUCHPAD FIX: Debounced blur handling
        // Don't cancel immediately on blur - wait to see if focus returns
        let blurTimeout = null;
        let isClosing = false;
        let hasUserInteracted = false; // Track if user actually interacted
        
        // Mark as interacted on any real user action
        input.addEventListener("keydown", () => { hasUserInteracted = true; });
        input.addEventListener("input", () => { hasUserInteracted = true; });
        dropdown.addEventListener("click", () => { hasUserInteracted = true; });
        
        const handleBlur = (e) => {
          console.log("[Group Editor] 🔍 BLUR event, relatedTarget:", e.relatedTarget?.tagName);
          
          // ✅ FIX: Check if blur target is in container OR dropdown (dropdown is appended to body)
          if (e.relatedTarget && (container.contains(e.relatedTarget) || dropdown.contains(e.relatedTarget))) {
            console.log("[Group Editor] Blur to dropdown/container element, ignoring");
            return;
          }
          
          // ✅ TOUCHPAD FIX: If blur goes to BODY/undefined and user hasn't interacted,
          // this is likely a phantom touchpad blur - ignore it completely
          if (!e.relatedTarget || e.relatedTarget === usedDoc.body) {
            console.log("[Group Editor] ⚠️ Blur to BODY/undefined detected");
            
            // If user hasn't typed or clicked anything, this is likely a phantom blur
            // Re-focus the input after a short delay
            blurTimeout = setTimeout(() => {
              if (!isClosing) {
                const activeEl = usedDoc.activeElement;
                console.log("[Group Editor] ⏱️ Blur timeout expired, activeElement:", activeEl?.tagName);
                
                // ✅ FIX: Also check if active element is inside dropdown
                if ((activeEl === usedDoc.body || !activeEl) && container.parentNode) {
                  console.log("[Group Editor] 🔄 Re-focusing input (phantom blur recovery)");
                  input.focus();
                } else if (activeEl !== input && !container.contains(activeEl) && !dropdown.contains(activeEl)) {
                  // Focus went to a real element outside editor AND dropdown - actually close
                  console.log("[Group Editor] ❌ Cancelling edit (focus moved to:", activeEl?.tagName, ")");
                  isClosing = true;
                  cancel();
                } else if (dropdown.contains(activeEl)) {
                  // Focus is in dropdown (e.g., newGroupInput) - keep editor open
                  console.log("[Group Editor] ✅ Focus moved to dropdown element, keeping open");
                }
              }
            }, 150);
            return;
          }
          
          // ✅ FIX: Final check - if relatedTarget is in dropdown, don't close
          if (e.relatedTarget && dropdown.contains(e.relatedTarget)) {
            console.log("[Group Editor] Blur to dropdown element (late check), ignoring");
            return;
          }
          
          // Blur to a specific element outside editor - close immediately
          console.log("[Group Editor] ❌ Blur to external element, cancelling");
          isClosing = true;
          cleanupDropdown();
          cancel();
        };
        
        input.addEventListener("blur", handleBlur);
        
        // Re-focus should cancel the blur timeout
        input.addEventListener("focus", () => {
          console.log("[Group Editor] 🔍 FOCUS event (re-focused)");
          if (blurTimeout) {
            clearTimeout(blurTimeout);
            blurTimeout = null;
          }
        });
        
        // Handle Enter key
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            console.log("[Group Editor] ✅ Enter pressed, saving:", input.value);
            isClosing = true;
            cleanupDropdown();
            success(input.value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            console.log("[Group Editor] ❌ Escape pressed, cancelling");
            isClosing = true;
            cleanupDropdown();
            cancel();
          }
        });
        
        // Prevent container events from bubbling
        container.addEventListener("mousedown", e => e.stopPropagation());
        container.addEventListener("pointerdown", e => e.stopPropagation());
        dropdown.addEventListener("mousedown", e => e.stopPropagation());
        dropdown.addEventListener("pointerdown", e => e.stopPropagation());
        
        // Focus input when editor is rendered
        onRendered(() => {
          console.log("[Group Editor] 🎯 Editor rendered, focusing input...");
          setTimeout(() => {
            positionDropdown(); // Re-position after render
            input.focus();
            input.select();
          }, 50); // Small delay to ensure DOM is ready
        });
        
        return container;
      },
      // ✅ Logging callbacks
      cellClick: function(e, cell) {
        console.log("[Group Cell] 🖱️ ═══════════════════════════════════════════");
        console.log("[Group Cell] 🖱️ CELL CLICK EVENT FIRED");
        console.log("[Group Cell] Event type:", e.type);
        console.log("[Group Cell] Event pointerType:", e.pointerType || "N/A");
        console.log("[Group Cell] Event button:", e.button);
        console.log("[Group Cell] Cell value:", cell.getValue());
        if (e.type === 'focus') {
          console.log("[Group Cell] ⚠️ WARNING: cellClick triggered by FOCUS event");
        }
        console.log("[Group Cell] ═══════════════════════════════════════════");
      },
      cellEditing: function(cell) {
        console.log("[Group Cell] ✏️ CELL EDITING STARTED at", Date.now());
      },
      cellEditCancelled: function(cell) {
        console.log("[Group Cell] ❌ CELL EDIT CANCELLED at", Date.now());
      },
      cellEdited: function(cell) {
        console.log("[Group Cell] ✅ CELL EDITED, new value:", cell.getValue());
      },
    },
    {
      title: "Color",
      field: "color",
      formatter: (cell) => {
        const value = cell.getValue();
        // use the createChannelList doc (ownerDocument) to ensure nodes come from the popup document
        const usedDoc =
          typeof doc !== "undefined"
            ? doc
            : typeof document !== "undefined"
            ? document
            : window.document;
        const input = usedDoc.createElement("input");
        input.type = "color";
        input.value = value;
        input.style.cssText =
          "width:40px;height:24px;border:none;cursor:pointer;padding:0;border-radius:0.25rem;";
        input.classList.add(
          "focus:outline-none",
          "focus:ring-2",
          "focus:ring-blue-400"
        );
        // Prevent table click/blur from closing picker on touchpad
        input.addEventListener("mousedown", (e) => e.stopPropagation());
        input.addEventListener("click", (e) => e.stopPropagation());
        input.addEventListener("change", (e) => {
          cell.setValue(e.target.value);
        });
        return input;
      },
    },
    {
      title: "Scale",
      field: "scale",
      editor: "number",
      headerSort: true,
    },
    { title: "Start", field: "start", editor: "number" },
    { title: "Duration", field: "duration", editor: "number" },
    { title: "Invert", field: "invert", editor: true },
    {
      title: "Delete",
      field: "delete",
      formatter: () =>
        `<button class="theme-btn-danger px-2 py-1 rounded transition duration-150">Delete</button>`,
      hozAlign: "center",
      cellClick: (e, cell) => {
        console.log("[ChannelList] 🗑️ DELETE BUTTON CLICKED");
        console.log("[ChannelList] Cell info:", {
          hasRow: !!cell.getRow,
          rowData: cell.getRow?.().getData?.(),
        });
        try {
          const row = cell.getRow();
          console.log("[ChannelList] Row object:", row);
          console.log("[ChannelList] Calling row.delete()...");
          row.delete();
          console.log("[ChannelList] ✅ row.delete() called successfully");
        } catch (err) {
          console.error("[ChannelList] ❌ Error calling row.delete():", err);
        }
      },
    },
  ];

  console.log("[ChannelList] 🎯 DELETE COLUMN DEFINITION:");
  const deleteCol = columns.find((c) => c.field === "delete");
  console.log({
    found: !!deleteCol,
    hasCellClick: deleteCol && typeof deleteCol.cellClick === "function",
    formatter: deleteCol?.formatter?.toString().substring(0, 100),
  });

  // Use Tabulator from popup window if provided, fallback to global
  // Prefer Tabulator from the popup's window (ownerDocument.defaultView) if available
  const popupWindow = doc && doc.defaultView ? doc.defaultView : null;
  let TabulatorClass =
    (popupWindow && popupWindow.Tabulator) ||
    TabulatorInstance ||
    (typeof Tabulator !== "undefined" ? Tabulator : null);

  if (!TabulatorClass) {
    // Fallback to simple HTML list when Tabulator is not available
    console.warn("Tabulator not available. Using simple list fallback.");
    return createSimpleChannelList(cfg, onChannelUpdate);
  }

  // Debugging: log which Tabulator we're using and document ownership
  try {
    console.debug(
      "createChannelList: using Tabulator from:",
      popupWindow
        ? "popupWindow"
        : TabulatorInstance
        ? "passed instance"
        : "global"
    );
    console.debug("createChannelList: TabulatorClass:", TabulatorClass);
    console.debug(
      "createChannelList: container.ownerDocument:",
      container.ownerDocument
    );
  } catch (e) {
    /* ignore */
  }

  // Initialize Tabulator table
  // Create an explicit root element for Tabulator in the correct document and append it
  const tableRoot = doc.createElement("div");
  tableRoot.className = "tabulator-root w-full";
  container.appendChild(tableRoot);

  const table = new TabulatorClass(tableRoot, {
    data: tableData,
    layout: "fitColumns",
    groupBy: "displayGroup", // ✅ CHANGED: Group by custom displayGroup field
    groupStartOpen: true, // ✅ Expand all groups by default
    columns,
    resizableColumnFit: true,
    movableColumns: true, // ✅ Column dragging enabled
    movableRows: true,
    rowHandle: true, // ✅ Require dragging on handle to move rows to avoid accidental closures on touchpad
    popupContainer: true, // ✅ Append dropdowns/popups to document body to avoid clipping
    pagination: "local",
    paginationSize: 20,
    paginationSizeSelector: [5, 10, 20, 50],
    debugInvalidOptions: true,
    // note: event handlers (cellEdited, tableBuilt) are attached below via table.on(...) to avoid
    // 'Invalid table constructor option' warnings on mismatched Tabulator builds
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔍 DEBUG: Add comprehensive event logging to debug touchpad dropdown issue
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("[ChannelList] 🔍 Setting up cell event logging for touchpad debugging...");
  
  // Track all pointer/mouse events at the table root level
  const logEvent = (eventName, e) => {
    console.log(`[Tabulator Event] ${eventName}:`, {
      type: e.type,
      target: e.target?.tagName + (e.target?.className ? '.' + e.target.className.split(' ')[0] : ''),
      pointerType: e.pointerType || 'N/A',
      button: e.button,
      buttons: e.buttons,
      detail: e.detail,
      isTrusted: e.isTrusted,
      timeStamp: Math.round(e.timeStamp),
      isPrimary: e.isPrimary,
      pointerId: e.pointerId,
    });
  };
  
  // Add event listeners to track the event sequence
  ['pointerdown', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click', 'dblclick'].forEach(eventName => {
    tableRoot.addEventListener(eventName, (e) => {
      // Only log if it's on a cell or editor element
      const isCell = e.target.closest('.tabulator-cell');
      const isEditor = e.target.closest('.tabulator-edit-select-list, .tabulator-editor');
      if (isCell || isEditor) {
        logEvent(eventName.toUpperCase(), e);
      }
    }, true); // Use capture phase to see events before they're handled
  });
  
  // Log focus/blur events on editors
  tableRoot.addEventListener('focusin', (e) => {
    if (e.target.closest('.tabulator-editor, .tabulator-edit-select-list')) {
      console.log('[Tabulator Event] FOCUSIN on editor:', e.target.tagName, e.target.className);
    }
  }, true);
  
  tableRoot.addEventListener('focusout', (e) => {
    if (e.target.closest('.tabulator-editor, .tabulator-edit-select-list')) {
      console.log('[Tabulator Event] FOCUSOUT from editor:', e.target.tagName, e.target.className);
      console.log('[Tabulator Event] FOCUSOUT relatedTarget:', e.relatedTarget?.tagName, e.relatedTarget?.className);
    }
  }, true);
  
  console.log("[ChannelList] ✅ Cell event logging set up successfully");
  // ═══════════════════════════════════════════════════════════════════════════

  // 🎯 Store Tabulator instance in the popup window for runtime updates
  // popupWindow is already defined earlier in this function (line 2177)
  if (popupWindow && typeof popupWindow === "object") {
    popupWindow.__tabulatorInstance = table;
    console.log("[ChannelList] ✅ Stored Tabulator instance in popup window");
  } else {
    console.warn("[ChannelList] ⚠️ Could not store Tabulator instance - popup window not available");
  }

  // Debug: Log Tabulator data and columns after initialization
  console.log(
    "[ChannelList] Tabulator initialized with tableData:",
    table.getData()
  );
  console.log("[ChannelList] Tabulator columns definition:", columns);
  console.log(
    "[ChannelList] Checking Unit column field:",
    columns.find((c) => c.field === "unit")
  );
  const unitColumnData = table
    .getData()
    .map((row) => ({ name: row.name, unit: row.unit, type: row.type }));
  console.log("[ChannelList] Unit values in displayed rows:", unitColumnData);

  // Attach event handlers after initialization to avoid constructor option warnings
  try {
    if (table && typeof table.on === "function") {
      table.on("cellEdited", (cell) => {
        const field = cell.getField ? cell.getField() : null;
        const rowData = cell.getRow().getData();
        const newValue = cell.getValue();

        // ✅ If group field was edited, update dropdown options dynamically
        if (field === "group" && newValue) {
          const currentData = table.getData();
          const updatedOptions = getAllAvailableGroups(currentData);

          // Update the group column's editorParams with new options
          const groupColumn = table.getColumn("group");
          if (groupColumn && groupColumn.getDefinition) {
            const colDef = groupColumn.getDefinition();
            if (colDef.editorParams) {
              colDef.editorParams.values = updatedOptions;
              console.log(
                "[ChannelList] ✅ Updated group dropdown options:",
                Object.keys(updatedOptions)
              );
            }
          }
        }

        // ✅ FIX: Define type and payload BEFORE try/catch (variable scoping fix)
        // Determine message type based on field edited
        let messageType = "callback_update"; // Default
        let payload = { row: rowData };

        if (field === "color") {
          // ✅ Use separate callback type for computed channels (ID-based lookup)
          if (rowData?.type && rowData.type.toLowerCase() === "computed") {
            messageType = "callback_computed_color";
            payload = {
              id: rowData?.id,
              channelID: rowData?.channelID,
              color: newValue,
              row: rowData,
            };
            console.log(`[ChannelList] 📤 COMPUTED COLOR MESSAGE:`, {
              id: rowData?.id,
              color: newValue,
            });
          } else {
            // Analog/Digital use regular color callback
            messageType = "callback_color";
            const idx =
              rowData && typeof rowData.originalIndex === "number"
                ? rowData.originalIndex
                : rowData && typeof rowData.id === "number"
                ? rowData.id - 1
                : undefined;
            payload = {
              channelID: rowData?.channelID,
              type: rowData?.type,
              idx: idx,
              color: newValue,
              row: rowData,
            };
          }
        } else if (field === "scale") {
          messageType = "callback_scale";
          payload = {
            channelID: rowData?.channelID,
            scale: newValue,
            row: rowData,
            value: newValue, // Also include as 'value' for consistency with new handler
          };
        } else if (field === "unit") {
          // ✅ UNIT CHANGE: Triggers Y-axis recalculation (similar to group change)
          messageType = "callback_unit";
          
          const channelType = rowData?.type?.toLowerCase() || "analog";
          const isComputed = channelType === "computed";
          
          payload = {
            channelID: rowData?.channelID || rowData?.id,
            id: rowData?.id,
            unit: newValue,
            value: newValue,
            oldUnit: rowData?.unit,
            row: rowData,
            channelType: channelType,
            isComputed: isComputed,
            originalIndex: rowData?.originalIndex,
          };
          
          console.log(`[ChannelList] 📐 UNIT CHANGE: ${rowData?.name} → ${newValue}`);
        } else if (field === "start" || field === "duration") {
          // Time window changes (start/duration)
          messageType = "callback_time_window";
          payload = {
            channelID: rowData?.channelID,
            field: field,
            value: newValue,
            row: rowData,
          };
        } else if (field === "group") {
          // ✅ UNIFIED: Use single callback_group for ALL channel types (analog, digital, computed)
          // The handler will detect channel type from row.type and route appropriately
          messageType = "callback_group";
          
          const channelType = rowData?.type?.toLowerCase() || "analog";
          const isComputed = channelType === "computed";
          
          payload = {
            channelID: rowData?.channelID || rowData?.id,
            id: rowData?.id,
            group: newValue,
            oldGroup: rowData?.group,
            value: newValue,
            row: rowData,
            channelType: channelType,
            isComputed: isComputed,
            madeFrom: rowData?.madeFrom,
            originalIndex: rowData?.originalIndex,
          };
        }

        // 1) Call local callback if provided (existing flow)
        if (typeof onChannelUpdate === "function") {
          try {
            // Keep existing behavior: color gets a concise callback form so
            // callers can handle immediate color updates (type, idx, _, value).
            if (field === "color") {
              const type =
                rowData && rowData.type
                  ? rowData.type.toLowerCase()
                  : undefined;
              const idx =
                rowData && typeof rowData.originalIndex === "number"
                  ? rowData.originalIndex
                  : rowData && typeof rowData.id === "number"
                  ? rowData.id - 1
                  : undefined;
              onChannelUpdate(type, idx, undefined, newValue);
            } else {
              // For other fields (including scale/start/duration/invert)
              // keep the generic update callback so existing callers work.
              onChannelUpdate("update", rowData);
            }
          } catch (e) {
            console.warn("cellEdited handler failed:", e);
            try {
              onChannelUpdate("update", rowData);
            } catch (e2) {
              /* ignore */
            }
          }
        }

        // 2) Post a structured message to the parent (child -> parent)
        try {
          const targetParent =
            parentWindow ||
            (typeof window !== "undefined" && window.globalParentWindow) ||
            (typeof window !== "undefined" && window.opener);

          if (targetParent && !targetParent.closed) {
            targetParent.postMessage(
              {
                source: "ChildWindow",
                type: messageType,
                payload: payload,
              },
              "*"
            );
          }
        } catch (postErr) {
          console.error(`[ChannelList] postMessage failed:`, postErr);
        }
      });

      table.on("tableBuilt", () => {
        // Expand all groups to ensure Computed channels are visible
        try {
          table.getGroups().forEach((group) => {
            group.show();
            console.log("[ChannelList] Expanded group:", group.getKey());
          });
        } catch (e) {
          console.warn("[ChannelList] Error expanding groups:", e);
        }

        container.querySelectorAll(".tabulator-row").forEach((row, index) => {
          row.classList.add("border-b", "hover:bg-gray-50");
          row.classList.add(index % 2 === 0 ? "bg-white" : "bg-gray-50");
        });

        container.querySelectorAll(".tabulator-cell").forEach((cell) => {
          cell.classList.add("px-4", "py-2", "sm:px-4", "sm:py-2");
        });
      });
    }

    // Listen for rowAdded and rowDeleted events so we can notify parent
    try {
      console.log(
        "[ChannelList] 🎯 Registering table event handlers - checking table object",
        {
          hasTable: !!table,
          hasOn: table && typeof table.on === "function",
          tableType: table?.constructor?.name,
        }
      );

      if (table && typeof table.on === "function") {
        console.log(
          "[ChannelList] ✅ table.on() method found, registering event handlers"
        );

        table.on("rowAdded", (row) => {
          const data = row.getData ? row.getData() : row;
          // local callback
          if (typeof onChannelUpdate === "function") {
            try {
              onChannelUpdate("add", data);
            } catch (e) {
              /* ignore */
            }
          }
        });
        console.log("[ChannelList] ✅ rowAdded event handler registered");

        table.on("rowDeleted", (row) => {
          console.log("[ChannelList] 🔔 rowDeleted event handler callback FIRED");
          const data = row.getData ? row.getData() : row;
          console.group("[ChannelList] 📤 ROW DELETED EVENT FIRED");
          console.log("  Row data:", data);
          console.log("  Row object:", row);
          console.groupEnd();

          // local callback
          if (typeof onChannelUpdate === "function") {
            try {
              console.log("[ChannelList] 🔔 Calling local onChannelUpdate('delete', data)");
              onChannelUpdate("delete", data);
              console.log("[ChannelList] ✅ Local callback executed");
            } catch (e) {
              console.error("[ChannelList] ❌ Local callback error:", e);
            }
          }
          
          try {
            const targetParent =
              parentWindow ||
              (typeof window !== "undefined" && window.globalParentWindow) ||
              (typeof window !== "undefined" && window.opener);

            console.group("[ChannelList] 📤 DELETE MESSAGE TO PARENT");
            console.log("  Target parent exists:", !!targetParent);
            console.log("  Parent closed:", targetParent?.closed);
            console.log("  Row data:", data);
            console.groupEnd();

            if (
              typeof window !== "undefined" &&
              targetParent &&
              !targetParent.closed
            ) {
              const messagePayload = {
                source: "ChildWindow",
                type: "callback_delete",
                payload: data,
              };
              console.log("[ChannelList] 📤 Posting message:", messagePayload);
              targetParent.postMessage(messagePayload, "*");
              console.log("[ChannelList] ✅ Message posted successfully");
            } else {
              console.error("[ChannelList] ❌ Cannot post message:", {
                hasParent: !!targetParent,
                parentClosed: targetParent?.closed,
              });
            }
          } catch (e) {
            console.error("[ChannelList] ❌ Error posting delete message:", e);
          }
        });
      }
    } catch (e) {
      console.error(
        "[ChannelList] ❌ CRITICAL ERROR during table.on() registration:",
        e
      );
      console.error("[ChannelList] This explains why delete/rowDeleted isn't working!");
    }
    // Listen for parent ack when a newly added row is accepted and assigned a stable channelID
    try {
      // ✅ FIX: Use popup window for message listener, not parent window
      const popupWindow = doc.defaultView || window;
      if (
        popupWindow &&
        typeof popupWindow.addEventListener === "function"
      ) {
        console.log("[ChannelList] 📡 Attaching message listener to popup window");
        popupWindow.addEventListener("message", (ev) => {
          try {
            const d = ev && ev.data;
            if (!d) {
              console.log("[ChannelList] Received message with no data");
              return;
            }

            // Handle computed channel state updates from parent
            if (d.type === "COMPUTED_CHANNEL_STATE_UPDATED") {
              console.log(
                "[ChannelList] ✅ Received COMPUTED_CHANNEL_STATE_UPDATED message",
                {
                  source: d.source,
                  channelCount: d.computedChannels?.length || 0,
                  channels: d.computedChannels,
                }
              );

              if (!d.computedChannels || d.computedChannels.length === 0) {
                console.warn(
                  "[ChannelList] ⚠️ No computed channels in message"
                );
                return;
              }

              // Add new computed channels to table
              d.computedChannels.forEach((ch) => {
                console.log("[ChannelList] Processing channel:", ch.name);
                const existingRow = table.getRows().find((r) => {
                  const rowData = r.getData();
                  return (
                    rowData.type === "Computed" && rowData.name === ch.name
                  );
                });

                if (!existingRow) {
                  // Determine displayGroup based on madeFrom
                  const madeFrom = (ch.madeFrom || "analog").toLowerCase();
                  const displayGroup = madeFrom === "digital" ? "Digital" : "Analog";
                  
                  // ✅ FIX: Ensure channelID is set for delete operations
                  const computedId = ch.id || ch.name || `computed-${table.getRows().length + 1}`;
                  
                  console.log("[ChannelList] ✅ Adding new row for:", ch.name, "madeFrom:", madeFrom, "displayGroup:", displayGroup);
                  table.addRow(
                    {
                      id: computedId,
                      channelID: computedId, // ✅ Ensure channelID is set (used by delete handler)
                      type: "Computed", // ✅ Keep as Computed for state routing
                      displayGroup: displayGroup, // ✅ Show with Analog or Digital based on madeFrom
                      madeFrom: ch.madeFrom || "analog", // ✅ Preserve madeFrom
                      name: ch.name,
                      unit: ch.unit || "",
                      group: ch.group || "G0", // ✅ Use numeric group G0
                      color: ch.color || "#FF6B6B",
                      scale: 1,
                      start: 0,
                      duration: "",
                      invert: false,
                    },
                    false
                  );
                  console.log(
                    "[ChannelList] ✅ Row added successfully. Total rows:",
                    table.getRows().length
                  );
                } else {
                  console.log(
                    "[ChannelList] ℹ️ Row already exists for:",
                    ch.name
                  );
                }
              });
              return;
            }

            if (d.source !== "ParentWindow") return;

            // deprecated: ack_addChannel flow removed
          } catch (e) {
            /* ignore */
          }
        });
      }
    } catch (e) {
      /* ignore */
    }
  } catch (e) {
    console.warn("Failed to attach Tabulator events:", e);
  }

  // --- Optional UI controls (undo/redo, add-row, group-select, download) ---
  try {
    const rootDoc =
      typeof doc !== "undefined" && doc
        ? doc
        : typeof document !== "undefined"
        ? document
        : null;
    const rootWin =
      typeof win !== "undefined" && win
        ? win
        : typeof window !== "undefined"
        ? window
        : null;

    const undoBtn =
      rootDoc && rootDoc.getElementById
        ? rootDoc.getElementById("history-undo")
        : null;
    const redoBtn =
      rootDoc && rootDoc.getElementById
        ? rootDoc.getElementById("history-redo")
        : null;
    const addRowBtn =
      rootDoc && rootDoc.getElementById
        ? rootDoc.getElementById("add-row")
        : null;
    const groupSelect =
      rootDoc && rootDoc.getElementById
        ? rootDoc.getElementById("group-select")
        : null;
    const downloadBtn =
      rootDoc && rootDoc.getElementById
        ? rootDoc.getElementById("download-pdf")
        : null;

    function updateUndoRedoButtons() {
      try {
        if (undoBtn)
          undoBtn.disabled = !(
            table.getHistoryUndoSize && table.getHistoryUndoSize() > 0
          );
        if (redoBtn)
          redoBtn.disabled = !(
            table.getHistoryRedoSize && table.getHistoryRedoSize() > 0
          );
      } catch (e) {
        /* ignore */
      }
    }

    // Wire undo/redo buttons
    if (undoBtn) {
      undoBtn.addEventListener("click", () => {
        try {
          if (table && typeof table.undo === "function") table.undo();
        } catch (e) {
          /* ignore */
        } finally {
          updateUndoRedoButtons();
        }
      });
    }
    if (redoBtn) {
      redoBtn.addEventListener("click", () => {
        try {
          if (table && typeof table.redo === "function") table.redo();
        } catch (e) {
          /* ignore */
        } finally {
          updateUndoRedoButtons();
        }
      });
    }

    // Wire add-row button (uses group-select to choose type)
    if (addRowBtn) {
      addRowBtn.addEventListener("click", () => {
        const groupType = (groupSelect && groupSelect.value) || "Analog";
        // Determine madeFrom based on selected group type
        const madeFrom = groupType.toLowerCase() === "digital" ? "digital" : "analog";
        const displayGroup = madeFrom === "digital" ? "Digital" : "Analog";
        
        try {
          // ✅ Create a temporary cell object that will be used by the expression editor
          // This cell is NOT in the table - it's just a placeholder for the editor
          const tempCell = {
            getValue: () => "",
            setValue: (channelName) => {
              // After user saves expression, CREATE the actual row with the computed channel name
              const computedRows = table
                .getRows()
                .filter((r) => r.getData().type === "Computed");
              
              // ✅ FIX: Use channelName as the ID (consistent with how computed channels are created)
              const computedId = channelName || `computed-${computedRows.length + 1}`;

              const newRow = {
                id: computedId,
                channelID: computedId, // ✅ Ensure channelID is set (used by delete handler)
                type: "Computed", // ✅ Keep as Computed for state routing
                displayGroup: displayGroup, // ✅ Show with Analog or Digital based on selection
                madeFrom: madeFrom, // ✅ Store madeFrom for reference
                name: channelName,
                unit: "",
                group: "G0", // ✅ Use numeric group G0
                color: "#888",
                scale: 1,
                start: 0,
                duration: "",
                invert: false,
              };

              // Add row to table - this WILL trigger rowAdded event and postMessage
              table.addRow(newRow, true);
            },
          };

          // Get all available channels for dropdown
          const analogChannels = (cfg.analogChannels || []).map((ch, idx) => {
            const label = ch.id || `Analog ${idx + 1}`;
            return {
              label,
              latex: label, // Use actual channel name as LaTeX
            };
          });
          const digitalChannels = (cfg.digitalChannels || []).map((ch, idx) => {
            const label = ch.id || `Digital ${idx + 1}`;
            return {
              label,
              latex: label, // Use actual channel name as LaTeX
            };
          });
          const allChannels = [...analogChannels, ...digitalChannels];

          // Open the expression editor with the temporary cell (NOT added to table yet)
          // We pass cfg and data directly so evaluation works
          openMathLiveEditor(
            tempCell,
            doc,
            doc.defaultView || window,
            allChannels,
            {},
            cfg,
            data
          );
        } catch (e) {
          console.warn("add-row failed:", e);
        }
      });
    }

    // Wire download (PDF) if requested
    if (downloadBtn) {
      downloadBtn.addEventListener("click", async () => {
        try {
          const jsPDFLib =
            (rootWin && (rootWin.jspdf || rootWin.jsPDF)) ||
            window.jspdf ||
            window.jsPDF;
          if (!jsPDFLib || !jsPDFLib.jsPDF) {
            alert("jsPDF not loaded yet. Please wait a second and try again.");
            return;
          }
          // ensure Tabulator can find jsPDF
          if (rootWin) rootWin.jspdf = jsPDFLib;
          table.download("pdf", "channel-list.pdf", {
            orientation: "landscape",
            title: "Channel List",
            autoTable: {
              theme: "grid",
              styles: { fontSize: 8, cellPadding: 2 },
              headStyles: { fillColor: [41, 128, 185], textColor: 255 },
              margin: { top: 25 },
            },
          });
        } catch (err) {
          console.error("Error generating PDF:", err);
        }
      });
    }

    // Initialize undo/redo disabled state
    updateUndoRedoButtons();

    // Listen for computed channel updates and refresh table
    if (window && window.addEventListener) {
      window.addEventListener("computedChannelSaved", (event) => {
        console.log("[ChannelList] 🎯 computedChannelSaved event FIRED!");
        console.log(
          "[ChannelList] cfg.computedChannels:",
          cfg.computedChannels
        );
        console.log(
          "[ChannelList] cfg.computedChannels.length:",
          cfg.computedChannels?.length
        );

        try {
          if (
            table &&
            cfg.computedChannels &&
            cfg.computedChannels.length > 0
          ) {
            // Create new row data for the computed channel
            const computedCh =
              cfg.computedChannels[cfg.computedChannels.length - 1];

            // ✅ CHECK: Does this channel already exist?
            const existingRows = table.getRows();
            const alreadyExists = existingRows.some((row) => {
              const rowData = row.getData();
              return (
                rowData.type === "Analog" &&
                (rowData.name === computedCh.name ||
                  rowData.channelID === computedCh.channelID ||
                  rowData.id === computedCh.id)
              );
            });

            if (alreadyExists) {
              console.log(
                "[ChannelList] ℹ️ Channel already exists, skipping:",
                computedCh.name
              );
              return;
            }

            console.log("[ChannelList] 📝 Creating newRow from:", computedCh);

            // Determine displayGroup based on madeFrom
            const madeFrom = (computedCh.madeFrom || "analog").toLowerCase();
            const displayGroup = madeFrom === "digital" ? "Digital" : "Analog";

            // ✅ FIX: Ensure channelID is set for delete operations
            const computedId = computedCh.id || computedCh.channelID || computedCh.name || `computed-${cfg.computedChannels.length}`;

            // ✅ USE STORED ID FROM cfg.computedChannels
            const newRow = {
              id: computedId, // ✅ Use computed ID
              channelID: computedId, // ✅ Ensure channelID is set (used by delete handler)
              originalIndex: cfg.computedChannels.length - 1,
              type: "Computed", // ✅ Keep as Computed for state routing
              displayGroup: displayGroup, // ✅ Show with Analog or Digital based on madeFrom
              madeFrom: computedCh.madeFrom || "analog", // ✅ Preserve madeFrom
              name: computedCh.name || computedCh.id || `Computed ${cfg.computedChannels.length}`,
              unit: computedCh.unit || "",
              group:
                computedCh.group ||
                detectGroupFromExpression(computedCh.equation, cfg), // ✅ Use stored or detected group
              color: computedCh.color || "#4ECDC4", // ✅ Computed channel color
              scale: computedCh.scale || 1,
              start: computedCh.start || 0,
              duration: computedCh.duration || "",
              invert: computedCh.invert || "",
            };

            console.log("[ChannelList] ✅ newRow created:", newRow);
            console.log("[ChannelList] 🔍 newRow.id:", newRow.id);
            console.log("[ChannelList] 🔍 newRow.type:", newRow.type);
            console.log("[ChannelList] 🔍 newRow.displayGroup:", newRow.displayGroup);
            console.log("[ChannelList] 🔍 newRow.group:", newRow.group);

            // Add row to table
            table.addRow(newRow, true);
            console.log(
              "[ChannelList] ✅ Computed channel added with ID:",
              newRow.id
            );

            console.log(
              "[ChannelList] ✅ Row added! Current table rows:",
              table.getRows().length
            );
            console.log("[ChannelList] 📊 All table data:", table.getData());
            console.log(
              "[ChannelList] Computed channel added to table:",
              newRow.name
            );
          } else {
            console.warn(
              "[ChannelList] ⚠️ Cannot add row - conditions not met:",
              {
                tableExists: !!table,
                computedChannelsExists: !!cfg.computedChannels,
                computedChannelsLength: cfg.computedChannels?.length || 0,
              }
            );
          }
        } catch (err) {
          console.error("[ChannelList] ❌ Error adding computed channel:", err);
        }
      });
    }
  } catch (e) {
    /* ignore */
  }

  return container;
}
