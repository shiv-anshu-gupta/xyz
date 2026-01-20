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
    const analogGroups = channelState.analog?.groups || [];
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
    const digitalGroups = channelState.digital?.groups || [];
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
  if (cfg?.computedChannels) {
    cfg.computedChannels.forEach((ch) => {
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
  // Only accept groups that start with "G" followed by digits (valid format)
  // Reject invalid formats like "Currents", "Voltages", "Other"
  let hasValidExplicitGroups = false;
  analogChannels.forEach((ch, idx) => {
    if (
      ch &&
      ch.group &&
      typeof ch.group === "string" &&
      /^G\d+$/.test(ch.group)
    ) {
      // Valid explicit group format (G0, G1, G2, etc.)
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
    autoGroups.forEach((group) => {
      group.indices.forEach((localIdx) => {
        const globalIdx = autoIndices[localIdx];
        groupMap[globalIdx] = group.groupId; // Use groupId: "G0", "G1", "G2", etc.
      });
    });

    console.log(
      "[createAnalogChannelGroupMap] Auto-grouping assigned groups:",
      autoGroups.map((g) => ({
        groupId: g.groupId,
        name: g.name,
        count: g.indices.length,
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
 * @returns {Object} Object suitable for Tabulator list editor
 */
function getAllAvailableGroups(tableData) {
  // Default groups in G format
  const defaultGroups = [
    "G0",
    "G1",
    "G2",
    "G3",
    "G4",
    "G5",
    "G6",
    "G7",
    "G8",
    "G9",
  ];

  // Extract unique groups from tableData
  const extractedGroups = new Set();
  if (Array.isArray(tableData)) {
    tableData.forEach((row) => {
      if (row.group !== undefined && row.group !== null) {
        extractedGroups.add(row.group);
      }
    });
  }

  // Combine default + extracted groups
  const allGroups = new Set([...defaultGroups, ...extractedGroups]);

  // Convert to object format for Tabulator { label: value, ... }
  const groupOptions = {};
  allGroups.forEach((group) => {
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

  // Create mapping of analog channel indices to their numeric group IDs
  const analogGroupMap = createAnalogChannelGroupMap(cfg.analogChannels || []);
  const digitalGroupsFromState = Array.isArray(
    parentWindow?.channelState?.digital?.groups
  )
    ? parentWindow.channelState.digital.groups
    : [];

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
    // ✅ Analog channels first
    ...cfg.analogChannels.map((ch, i) => ({
      id: i + 1,
      channelID: ch.channelID,
      originalIndex: i,
      type: "Analog",
      displayGroup: "Analog", // ✅ Just "Analog" section
      name: ch.id || `Analog ${i + 1}`,
      unit: ch.unit || "",
      group: analogGroupMap[i] || "G0",
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
      group: (() => {
        const explicitGroup =
          typeof ch.group === "string" && /^G\d+$/.test(ch.group)
            ? ch.group.trim()
            : "";
        if (explicitGroup) return explicitGroup;

        const stateGroup =
          typeof digitalGroupsFromState[i] === "string" &&
          /^G\d+$/.test(digitalGroupsFromState[i])
            ? digitalGroupsFromState[i].trim()
            : "";
        if (stateGroup) return stateGroup;

        return "G0";
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
      // ✅ Custom dropdown: input for new group + list of existing groups (theme-aware)
      formatter: function(cell) {
        const currentValue = cell.getValue() || "G0";
        const groupsObj = getAllAvailableGroups(tableData);
        const groups = Object.keys(groupsObj);
        
        const usedDoc = typeof doc !== "undefined" ? doc : 
                       (typeof document !== "undefined" ? document : window.document);
        
        // ✅ Detect current theme
        const getIsDark = () => {
          return usedDoc.documentElement.hasAttribute('data-theme-dark') || 
                 usedDoc.documentElement.classList.contains('dark') ||
                 usedDoc.body.classList.contains('dark') ||
                 localStorage.getItem('comtrade-theme') === 'dark';
        };
        
        // ✅ Theme colors
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
        
        // Container (just holds the button)
        const container = usedDoc.createElement("div");
        container.style.cssText = "position: relative; width: 100%;";
        
        // Display button
        const displayBtn = usedDoc.createElement("button");
        displayBtn.type = "button";
        displayBtn.innerHTML = `<span>${currentValue}</span><span>▼</span>`;
        
        const updateButtonStyle = () => {
          colors = getThemeColors();
          displayBtn.style.cssText = `
            width: 100%; padding: 4px 8px; border: 1px solid ${colors.border}; border-radius: 4px;
            background: ${colors.bg}; color: ${colors.text}; cursor: pointer;
            display: flex; justify-content: space-between; align-items: center; font-size: 13px;
          `;
        };
        updateButtonStyle();
        container.appendChild(displayBtn);
        
        // Dropdown panel - append to BODY to avoid clipping
        const dropdown = usedDoc.createElement("div");
        
        const updateDropdownStyle = () => {
          colors = getThemeColors();
          dropdown.style.cssText = `
            position: fixed;
            background: ${colors.bg}; border: 1px solid ${colors.border}; border-radius: 4px;
            box-shadow: 0 4px 12px ${colors.shadow}; z-index: 99999;
            display: none; max-height: 280px; overflow-y: auto; min-width: 150px;
          `;
        };
        updateDropdownStyle();
        usedDoc.body.appendChild(dropdown);
        
        // Input row for new group
        const inputRow = usedDoc.createElement("div");
        
        const newGroupInput = usedDoc.createElement("input");
        newGroupInput.type = "text";
        newGroupInput.placeholder = "New Group ID...";
        
        const addBtn = usedDoc.createElement("button");
        addBtn.type = "button";
        addBtn.textContent = "Add";
        
        const updateInputRowStyle = () => {
          colors = getThemeColors();
          inputRow.style.cssText = `display: flex; padding: 6px; border-bottom: 1px solid ${colors.border}; gap: 4px; position: sticky; top: 0; background: ${colors.bg};`;
          newGroupInput.style.cssText = `flex: 1; padding: 4px 8px; border: 1px solid ${colors.inputBorder}; border-radius: 4px; font-size: 12px; background: ${colors.inputBg}; color: ${colors.text};`;
          addBtn.style.cssText = "padding: 4px 10px; background: #3b82f6; color: white; border: none; border-radius: 4px; font-size: 12px; cursor: pointer;";
        };
        updateInputRowStyle();
        
        inputRow.appendChild(newGroupInput);
        inputRow.appendChild(addBtn);
        dropdown.appendChild(inputRow);
        
        // List of existing groups
        const optionsContainer = usedDoc.createElement("div");
        dropdown.appendChild(optionsContainer);
        
        const renderOptions = () => {
          colors = getThemeColors();
          optionsContainer.innerHTML = '';
          groups.forEach(groupValue => {
            const option = usedDoc.createElement("div");
            option.textContent = groupValue;
            const isSelected = groupValue === cell.getValue();
            option.style.cssText = `padding: 8px 12px; cursor: pointer; color: ${colors.text}; background: ${isSelected ? colors.bgSelected : 'transparent'};`;
            option.addEventListener("mouseenter", () => { if (!isSelected) option.style.background = colors.bgHover; });
            option.addEventListener("mouseleave", () => { option.style.background = isSelected ? colors.bgSelected : 'transparent'; });
            option.addEventListener("click", (e) => {
              e.stopPropagation();
              cell.setValue(groupValue);
              displayBtn.querySelector("span").textContent = groupValue;
              dropdown.style.display = "none";
            });
            optionsContainer.appendChild(option);
          });
        };
        renderOptions();
        
        // ✅ Update styles when theme changes
        const updateAllStyles = () => {
          updateButtonStyle();
          updateDropdownStyle();
          updateInputRowStyle();
          renderOptions();
        };
        
        // Listen for theme changes via storage event
        const storageListener = (e) => {
          if (e.key === 'comtrade-theme') updateAllStyles();
        };
        window.addEventListener('storage', storageListener);
        
        // Also watch for class changes on document
        const observer = new MutationObserver(() => updateAllStyles());
        observer.observe(usedDoc.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme-dark'] });
        observer.observe(usedDoc.body, { attributes: true, attributeFilter: ['class'] });
        
        // Add new group
        const addNewGroup = () => {
          const newGroup = newGroupInput.value.trim();
          if (newGroup) {
            cell.setValue(newGroup);
            displayBtn.querySelector("span").textContent = newGroup;
            dropdown.style.display = "none";
            newGroupInput.value = "";
          }
        };
        
        addBtn.addEventListener("click", (e) => { e.stopPropagation(); addNewGroup(); });
        newGroupInput.addEventListener("keydown", (e) => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); addNewGroup(); }
        });
        
        // Position and toggle dropdown
        const positionDropdown = () => {
          const rect = displayBtn.getBoundingClientRect();
          dropdown.style.top = rect.bottom + 2 + "px";
          dropdown.style.left = rect.left + "px";
          dropdown.style.minWidth = rect.width + "px";
        };
        
        displayBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (dropdown.style.display === "none") {
            updateAllStyles(); // Refresh theme before showing
            positionDropdown();
            dropdown.style.display = "block";
          } else {
            dropdown.style.display = "none";
          }
        });
        
        // Stop events from bubbling to Tabulator
        [container, dropdown, newGroupInput].forEach(el => {
          el.addEventListener("mousedown", e => e.stopPropagation());
          el.addEventListener("pointerdown", e => e.stopPropagation());
        });
        
        // Close on outside click and cleanup
        const closeDropdown = (e) => {
          if (!container.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = "none";
          }
        };
        usedDoc.addEventListener("click", closeDropdown);
        
        // Cleanup when cell is removed
        const cleanup = () => {
          usedDoc.removeEventListener("click", closeDropdown);
          window.removeEventListener('storage', storageListener);
          observer.disconnect();
          if (dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
        };
        
        // Watch for cell removal
        const cellObserver = new MutationObserver((mutations) => {
          if (!usedDoc.body.contains(container)) {
            cleanup();
            cellObserver.disconnect();
          }
        });
        cellObserver.observe(usedDoc.body, { childList: true, subtree: true });
        
        return container;
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
