// src/components/ChannelList.js
// import { createCustomElement } from '../utils/helpers.js';
// /**
//  * ChannelList component: lists all analog and digital channels with drag-and-drop support.
//   * @param {Object} cfg - COMTRADE config object with analogChannels and digitalChannels arrays.
//  * @param {Function} onChannelDrop - Callback(channelType, fromIdx, toIdx) when a channel is reordered.
//  * @returns {HTMLElement} The channel list element.
//  */
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

/**
 * Creates and renders a dynamic, interactive Tabulator-based channel list table UI
 * for managing Analog and Digital channel configurations.
 *
 * The function supports adding, deleting, editing, grouping, undo/redo history,
 * and exporting the table data as a PDF. It also provides real-time callbacks
 * for external update handling.
 *
 * @function createChannelList
 * @param {Object} cfg - Configuration object containing analog and digital channel data.
 * @param {Array<Object>} cfg.analogChannels - List of analog channel objects.
 * @param {Array<Object>} cfg.digitalChannels - List of digital channel objects.
 * @param {Function} [onChannelUpdate] - Optional callback triggered on data changes.
 *   @param {("add"|"update"|"delete")} onChannelUpdate.action - The type of update event.
 *   @param {Object} onChannelUpdate.data - The affected row’s data.
 * @param {Object} [TabulatorInstance] - Optional custom Tabulator class reference.
 * @param {Document} [doc=document] - Optional document object (used for iframe or testing).
 * @param {Window} [win=window] - Optional window object (used for iframe or testing).
 *
 * @returns {HTMLDivElement} The root container element containing the Tabulator table.
 **/
export function createChannelList(
  cfg,
  onChannelUpdate,
  TabulatorInstance,
  doc = document,
  win = window
) {
  const rootDoc = doc || document;
  const rootWin = win || window;
  console.log("cfg:", cfg);

  const container = rootDoc.createElement("div");
  container.className =
    "channel-list-container rounded-lg shadow p-4 flex flex-col gap-4";

  const tableData = [
    ...cfg.analogChannels.map((ch, i) => ({
      id: i + 1,
      type: "Analog",
      name: ch.id || `Analog ${i + 1}`,
      unit: ch.unit || "",
      group: ch.group || "Group 1",
      color: ch.color || "#888888",
      scale: ch.scale || 1,
      start: ch.start || 0,
      duration: ch.duration || "",
      invert: ch.invert || "",
    })),
    ...cfg.digitalChannels
      .map((ch, i) => ({
        id: i + 1,
        type: "Digital",
        name: ch.id || `Digital ${i + 1}`,
        unit: ch.unit || "",
        group: ch.group || "Group 1",
        color: ch.color || "#888888",
        scale: ch.scale || 1,
        start: ch.start || 0,
        duration: ch.duration || "",
        invert: ch.invert || "",
      }))
      .reverse(),
  ];

  const columns = [
    { title: "ID", field: "id", width: 60, hozAlign: "center", responsive: 0 },
    {
      title: "Channel Name (Unit)",
      field: "name",
      headerFilter: "input",
      editor: "input",
      resizable: true,
      responsive: 0,
      width: 150,
      hozAlign: "center",
    },
    {
      title: "Color",
      field: "color",
      width: 120,
      hozAlign: "center",

      formatter: (cell) => {
        const value = cell.getValue();
        return `<input type="color" value="${value}" class="w-10 h-6 border-none cursor-pointer p-0 rounded focus:outline-none focus:ring-2 focus:ring-blue-400" />`;
      },
      cellClick: (e, cell) => {
        if (e.target.tagName === "INPUT" && e.target.type === "color") {
          e.target.addEventListener(
            "change",
            (evt) => cell.setValue(evt.target.value),
            { once: true }
          );
        }
      },
    },
    {
      title: "Unit",
      field: "unit",
      editor: "input",
      responsive: 1,
      width: 150,
      hozAlign: "center",
    },
    {
      title: "Group",
      field: "group",
      editor: "input",
      responsive: 1,
      width: 150,
      hozAlign: "center",
    },

    {
      title: "Scale",
      field: "scale",
      editor: "number",
      headerSort: true,
      responsive: 2,
      width: 150,
      hozAlign: "center",
    },
    {
      title: "Start",
      field: "start",
      editor: "number",
      responsive: 2,
      width: 150,
      hozAlign: "center",
    },
    {
      title: "Duration",
      field: "duration",
      editor: "number",
      responsive: 1,
      width: 150,
    },
    // {
    //   title: "Invert",
    //   field: "invert",
    //   editor: true,
    //   responsive: 1,
    //   width: 150,
    // },
    {
      title: "Invert",
      field: "invert",
      hozAlign: "center",
      responsive: 1,
      width: 150,
      formatter: (cell) => {
        const value = cell.getValue() === true || cell.getValue() === "true";
        const checked = value ? "checked" : "";
        return `
          <label class="inline-flex items-center cursor-pointer relative">
            <input type="checkbox" class="sr-only peer" ${checked}>
            <div
              class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-green-500
                     peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-400
                     after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                     after:bg-white after:border-gray-300 after:border after:rounded-full
                     after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full
                     peer-checked:after:border-white relative">
            </div>
          </label>
        `;
      },
      cellClick: (e, cell) => {
        const checkbox = e.target.closest("label")?.querySelector("input");
        if (checkbox) {
          const newValue = !checkbox.checked;
          checkbox.checked = newValue;
          cell.setValue(newValue);
        }
      },
    },

    {
      title: "Delete",
      field: "delete",
      width: 150,
      formatter: () =>
        `<button class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded transition duration-150">Delete</button>`,
      hozAlign: "center",
      cellClick: (e, cell) => cell.getRow().delete(),
      responsive: 2,
    },
  ];

  const TabulatorClass =
    TabulatorInstance ||
    (typeof rootWin?.Tabulator !== "undefined"
      ? rootWin.Tabulator
      : typeof Tabulator !== "undefined"
      ? Tabulator
      : null);
  if (!TabulatorClass) {
    console.error(
      "Tabulator not available. Please ensure it's loaded in the target window."
    );
    return container;
  }

  const tableDiv = rootDoc.createElement("div");
  tableDiv.id = "channel-root-table";
  tableDiv.className =
    "w-full border border-gray-300 rounded-lg shadow-md bg-white";
  container.appendChild(tableDiv);

  const table = new TabulatorClass(tableDiv, {
    data: tableData,
    layout: "fitDataStretch",
    // layout: "fitColumns",
    responsiveLayout: "collapse",
    responsiveLayoutCollapseStartOpen: false,
    groupBy: "type",
    groupHeader: (value, count) =>
      `<span class="font-semibold text-lg">${value}</span>
       <span class="text-gray-500 ml-2">(${count} items)</span>`,
    history: true,
    columns,
    resizableColumnFit: true,
    movableColumns: true,
    movableRows: true,
    pagination: "local",
    paginationSize: 20,
    paginationSizeSelector: [5, 10, 20, 50],
  });

  console.log("Tabulator instance:", table);

  // const downloadBtn = doc.getElementById("download-pdf");
  // if (downloadBtn) {
  //   downloadBtn.addEventListener("click", () => {
  //     console.log("📄 Downloading PDF...");
  //     table.download("pdf", "channel-list.pdf", {
  //       orientation: "landscape",
  //       title: "Channel List",
  //       autoTable: {
  //         theme: "grid",
  //         styles: { fontSize: 8, cellPadding: 2 },
  //         headStyles: { fillColor: [41, 128, 185], textColor: 255 },
  //         margin: { top: 25 },
  //       },
  //     });
  //   });
  // } else {
  //   console.warn("⚠️ PDF button not found in popup");
  // }

  const downloadBtn = doc.getElementById("download-pdf");

  if (downloadBtn) {
    downloadBtn.addEventListener("click", async () => {
      console.log("📄 Downloading PDF...");

      // ✅ Ensure jsPDF and AutoTable are properly loaded in popup window
      const jsPDFLib =
        rootWin.jspdf || rootWin.jsPDF || window.jspdf || window.jsPDF;

      if (!jsPDFLib || !jsPDFLib.jsPDF) {
        alert("⚠️ jsPDF not loaded yet. Please wait a second and try again.");
        console.error("jsPDF or autotable not found in popup window.");
        return;
      }

      // ✅ Register jsPDF in popup global scope (required by Tabulator export)
      rootWin.jspdf = jsPDFLib;

      try {
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
        console.log("✅ PDF generation triggered successfully.");
      } catch (err) {
        console.error("❌ Error generating PDF:", err);
      }
    });
  } else {
    console.warn("⚠️ PDF button not found in popup");
  }

  table.on("cellEdited", (cell) => {
    updateUndoRedoButtons();
    if (typeof onChannelUpdate === "function")
      onChannelUpdate("update", cell.getRow().getData());
  });

  table.on("rowDeleted", (row) => {
    updateUndoRedoButtons();
    if (typeof onChannelUpdate === "function")
      onChannelUpdate("delete", row.getData());
  });

  table.on("rowAdded", (row) => {
    updateUndoRedoButtons();
    if (typeof onChannelUpdate === "function")
      onChannelUpdate("add", row.getData());
  });

  table.on("tableBuilt", () => {
    container.querySelectorAll(".tabulator-row").forEach((row) => {
      row.classList.add(
        "hover:bg-gray-50",
        "bg-white",
        "mb-2",
        "rounded-md",
        "shadow-sm",
        "p-2"
      );
    });
    container.querySelectorAll(".tabulator-cell").forEach((cell) => {
      cell.classList.add("px-4", "py-2", "sm:px-4", "sm:py-2");
    });
    updateUndoRedoButtons();
  });

  table.on("rowAdded", (row) => {
    const el = row.getElement();

    el.classList.add(
      "hover:bg-gray-50",
      "bg-white",
      "mb-2",
      "rounded-md",
      "shadow-sm",
      "p-2"
    );

    el.querySelectorAll(".tabulator-cell").forEach((cell) => {
      cell.classList.add("px-4", "py-2", "sm:px-4", "sm:py-2");
    });

    updateUndoRedoButtons();

    if (typeof onChannelUpdate === "function")
      onChannelUpdate("add", row.getData());
  });

  function updateUndoRedoButtons() {
    const undoBtn = rootDoc.getElementById("history-undo");
    const redoBtn = rootDoc.getElementById("history-redo");
    if (undoBtn)
      undoBtn.disabled =
        !table.getHistoryUndoSize || table.getHistoryUndoSize() === 0;
    if (redoBtn)
      redoBtn.disabled =
        !table.getHistoryRedoSize || table.getHistoryRedoSize() === 0;
  }

  const undoBtn = rootDoc.getElementById("history-undo");
  const redoBtn = rootDoc.getElementById("history-redo");
  const addRowBtn = rootDoc.getElementById("add-row");
  const groupSelect = rootDoc.getElementById("group-select");

  undoBtn?.addEventListener("click", () => {
    if (table.undo()) updateUndoRedoButtons();
  });

  redoBtn?.addEventListener("click", () => {
    if (table.redo()) updateUndoRedoButtons();
  });

  addRowBtn?.addEventListener("click", () => {
    const groupType = groupSelect?.value;

    if (!groupType) {
      alert("Please select a channel type (Analog or Digital)");
      return;
    }

    const groupRows = table
      .getRows()
      .filter((r) => r.getData().type === groupType);

    const maxIdForType =
      groupRows.length > 0
        ? Math.max(...groupRows.map((r) => r.getData().id))
        : 0;

    const lastGroupRow = groupRows[groupRows.length - 1];
    const groupName = lastGroupRow ? lastGroupRow.getData().group : "Group 1";

    // Create new row with next ID for that type
    const newRow = {
      id: maxIdForType + 1,
      type: groupType,
      name: `${groupType} ${maxIdForType + 1}`,
      unit: "",
      group: groupName,
      color: "#888888",
      scale: 1,
      start: 0,
      duration: "",
      invert: "",
    };

    table.addRow(newRow, true);
  });

  const keyHandler = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      if (table.undo()) updateUndoRedoButtons();
    } else if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === "y" || (e.key === "z" && e.shiftKey))
    ) {
      e.preventDefault();
      if (table.redo()) updateUndoRedoButtons();
    }
  };

  rootWin.addEventListener?.("keydown", keyHandler);

  if (rootWin) {
    const cleanup = () => {
      rootWin.removeEventListener?.("keydown", keyHandler);
    };
    rootWin.addEventListener?.("beforeunload", cleanup);
  }

  return container;
}
