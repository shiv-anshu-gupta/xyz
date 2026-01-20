// src/components/ChannelList.js
export function createChannelList(
  cfg,
  onChannelUpdate,
  TabulatorInstance,
  ownerDocument,
  attachToElement
) {
  const doc =
    ownerDocument ||
    (typeof document !== "undefined" ? document : window.document);
  const rootWin =
    (doc && doc.defaultView) || (typeof window !== "undefined" ? window : null);

  const container = doc.createElement("div");
  container.className =
    "channel-list-container rounded-lg shadow p-4 flex flex-col gap-4 transition-colors duration-300 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100";

  if (attachToElement && attachToElement.appendChild) {
    try {
      attachToElement.appendChild(container);
    } catch (e) {
      console.warn("createChannelList: failed to append to attachToElement", e);
    }
  }

  // Tailwind mapping for groups
  const groupClasses = {
    "Group 1": "bg-pink-100",
    "Group 2": "bg-green-100",
    "Group 3": "bg-blue-100",
  };

  // defensively build tableData
  const analog = Array.isArray(cfg?.analogChannels) ? cfg.analogChannels : [];
  const digital = Array.isArray(cfg?.digitalChannels)
    ? cfg.digitalChannels
    : [];

  const tableData = [
    ...analog.map((ch, i) => ({
      id: i + 1,
      channelID: ch.channelID,
      originalIndex: i,
      type: "Analog",
      name: ch.id || `Analog ${i + 1}`,
      unit: ch.unit || "",
      group: ch.group || "Group 1",
      color: ch.color || "#888888",
      scale: ch.scale ?? 1,
      start: ch.start ?? 0,
      duration: ch.duration ?? "",
      invert: ch.invert ?? false,
      isNew: false,
    })),
    ...digital.map((ch, i) => ({
      id: i + 1,
      channelID: ch.channelID,
      originalIndex: i,
      type: "Digital",
      name: ch.id || `Digital ${i + 1}`,
      unit: ch.unit || "",
      group: ch.group || "Group 1",
      color: ch.color || "#888888",
      scale: ch.scale ?? 1,
      start: ch.start ?? 0,
      duration: ch.duration ?? "",
      invert: ch.invert ?? false,
      isNew: false,
    })),
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
      validator: "required",
    },
    {
      title: "Color",
      field: "color",
      width: 120,
      hozAlign: "center",
      validator: "required",
      formatter: (cell) => {
        const v = cell.getValue() || "#888888";
        return `<input type="color" value="${v}" class="w-10 h-6 border-none cursor-pointer p-0 rounded focus:outline-none" />`;
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
      validator: "numeric",
    },
    {
      title: "Group",
      field: "group",
      responsive: 1,
      width: 150,
      hozAlign: "center",
      editor: "list",
      editorParams: {
        autocomplete: true,
        allowEmpty: true,
        listOnEmpty: true,
        values: {
          "Group 1": "Group 1",
          "Group 2": "Group 2",
          "Group 3": "Group 3",
        },
      },
    },
    {
      title: "Scale",
      field: "scale",
      editor: "input",
      headerSort: true,
      responsive: 2,
      width: 150,
      hozAlign: "center",
      validator: "numeric",
    },
    {
      title: "Start",
      field: "start",
      editor: "input",
      responsive: 2,
      width: 150,
      hozAlign: "center",
      validator: "numeric",
    },
    {
      title: "Duration",
      field: "duration",
      editor: "input",
      responsive: 1,
      hozAlign: "center",
      width: 150,
      validator: "numeric",
    },
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
            <div class="w-11 h-6 bg-gray-200 dark:bg-gray-600 rounded-full peer peer-checked:bg-green-500
                        peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-400
                        after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                        after:bg-white after:border-gray-300 after:border after:rounded-full
                        after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full
                        peer-checked:after:border-white relative"></div>
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
    { title: "isNew", field: "isNew", visible: false },
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

  // choose Tabulator (popup's Tabulator preferred)
  let TabulatorClass =
    (rootWin && rootWin.Tabulator) ||
    TabulatorInstance ||
    (typeof Tabulator !== "undefined" ? Tabulator : null);
  if (!TabulatorClass) {
    console.error("Tabulator not available. Please ensure it's loaded.");
    return container;
  }

  // create table root in the correct document
  const tableRoot = doc.createElement("div");
  tableRoot.className = "tabulator-root w-full";
  container.appendChild(tableRoot);

  const table = new TabulatorClass(tableRoot, {
    data: tableData,
    layout: "fitDataStretch",
    responsiveLayout: "collapse",
    responsiveLayoutCollapseStartOpen: false,
    groupBy: "type",
    columns,
    history: true,
    resizableColumnFit: true,
    movableColumns: true,
    movableRows: true,
    pagination: "local",
    paginationSize: 20,
    paginationSizeSelector: [5, 10, 20, 50],
    debugInvalidOptions: true,
  });

  // cellEdited: call local callback + postMessage to parent (if popup)
  try {
    table.on("cellEdited", (cell) => {
      const field = cell.getField ? cell.getField() : null;
      const rowData = cell.getRow().getData();
      const newValue = cell.getValue();

      // Local callback compatibility:
      if (typeof onChannelUpdate === "function") {
        try {
          if (field === "color") {
            const type = rowData?.type ? rowData.type.toLowerCase() : undefined;
            const idx =
              typeof rowData?.originalIndex === "number"
                ? rowData.originalIndex
                : typeof rowData?.id === "number"
                ? rowData.id - 1
                : undefined;
            onChannelUpdate(type, idx, undefined, newValue);
          } else {
            onChannelUpdate("update", rowData);
          }
        } catch (e) {
          try {
            onChannelUpdate("update", rowData);
          } catch (_) {}
        }
      }

      // Post message to parent if opened as popup
      try {
        if (
          typeof window !== "undefined" &&
          window.opener &&
          !window.opener.closed
        ) {
          const payload = {
            field,
            row: rowData,
            newValue,
            channelID: rowData?.channelID ?? null,
            args: [null, rowData?.channelID ?? null, newValue],
          };
          let type = "callback_update";
          if (field === "color") type = "callback_color";
          else if (field === "name") type = "callback_channelName";
          else if (field === "group") type = "callback_group";
          else if (field === "scale") type = "callback_scale";
          else if (field === "start") type = "callback_start";
          else if (field === "duration") type = "callback_duration";
          else if (field === "invert") type = "callback_invert";

          window.opener.postMessage(
            { source: "ChildWindow", type, payload },
            "*"
          );
        }
      } catch (e) {
        /* non-fatal */
      }

      // When group changed, update row background class
      if (field === "group") {
        const row = cell.getRow();
        const rowEl = row.getElement();
        const newGroup = (cell.getValue() || "")
          .trim()
          .replace(/^\w/, (c) => c.toUpperCase());
        rowEl.classList.remove("bg-pink-100", "bg-green-100", "bg-blue-100");
        const newClass = groupClasses[newGroup];
        if (newClass) rowEl.classList.add(newClass);
      }

      // When a new row gets a name, move it after last of same type & clear isNew
      if (
        rowData.isNew &&
        field === "name" &&
        rowData.name &&
        rowData.name.trim()
      ) {
        const activeRows = table.getRows("active");
        const sameType = activeRows.filter(
          (r) =>
            r !== cell.getRow() &&
            r.getData().type === rowData.type &&
            !r.getData().isNew
        );
        const lastOfType = sameType[sameType.length - 1];
        if (lastOfType) {
          cell.getRow().update({ isNew: false });
          cell.getRow().move(lastOfType, "after");
          const el = cell.getRow().getElement();
          el.classList.add("bg-yellow-100");
          setTimeout(() => el.classList.remove("bg-yellow-100"), 800);
        } else {
          cell.getRow().update({ isNew: false });
        }
      }

      updateUndoRedoButtons();
    });

    // tableBuilt styling + apply group classes
    table.on("tableBuilt", () => {
      table.getRows().forEach((row) => {
        const rowEl = row.getElement();
        const grp = (row.getData().group || "").trim();
        const formatted = grp.replace(/^\w/, (c) => c.toUpperCase());
        rowEl.classList.remove("bg-pink-100", "bg-green-100", "bg-blue-100");
        if (groupClasses[formatted])
          rowEl.classList.add(groupClasses[formatted]);
      });

      container.querySelectorAll(".tabulator-row").forEach((row) => {
        row.classList.add(
          "hover:bg-gray-50",
          "dark:hover:bg-gray-700",
          "dark:bg-gray-800",
          "rounded-md",
          "shadow-sm",
          "transition-colors",
          "duration-200"
        );
      });
      container.querySelectorAll(".tabulator-cell").forEach((cell) => {
        cell.classList.add("px-4", "py-2", "sm:px-4", "sm:py-2");
      });

      updateUndoRedoButtons();
    });
  } catch (e) {
    console.warn("Failed to attach Tabulator events:", e);
  }

  // rowAdded / rowDeleted notifications (local + parent)
  try {
    table.on("rowAdded", (row) => {
      const data = row.getData ? row.getData() : row;
      try {
        data.tempClientId = `tmp-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;
      } catch (e) {
        data.tempClientId = `tmp-${Date.now()}`;
      }
      if (typeof onChannelUpdate === "function") {
        try {
          onChannelUpdate("add", data);
        } catch (_) {}
      }
      try {
        if (
          typeof window !== "undefined" &&
          window.opener &&
          !window.opener.closed
        ) {
          window.opener.postMessage(
            {
              source: "ChildWindow",
              type: "callback_addChannel",
              payload: data,
            },
            "*"
          );
        }
      } catch (e) {}
      updateUndoRedoButtons();
    });

    table.on("rowDeleted", (row) => {
      const data = row.getData ? row.getData() : row;
      if (typeof onChannelUpdate === "function") {
        try {
          onChannelUpdate("delete", data);
        } catch (_) {}
      }
      try {
        if (
          typeof window !== "undefined" &&
          window.opener &&
          !window.opener.closed
        ) {
          window.opener.postMessage(
            { source: "ChildWindow", type: "callback_delete", payload: data },
            "*"
          );
        }
      } catch (e) {}
      updateUndoRedoButtons();
    });
  } catch (e) {
    /* ignore */
  }

  // parent ack handler for addChannel (matches tempClientId)
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.addEventListener === "function"
    ) {
      window.addEventListener("message", (ev) => {
        try {
          const d = ev && ev.data;
          if (!d || d.source !== "ParentWindow") return;
          if (d.type === "ack_addChannel" && d.payload) {
            const { tempClientId, channelID, assignedIndex } = d.payload;
            if (!tempClientId || !channelID) return;
            const rows = table.getRows ? table.getRows() : [];
            for (let r of rows) {
              const rd = r.getData ? r.getData() : null;
              if (!rd) continue;
              if (rd.tempClientId && rd.tempClientId === tempClientId) {
                const updateObj = { channelID };
                if (typeof assignedIndex === "number")
                  updateObj.originalIndex = assignedIndex;
                updateObj.tempClientId = null;
                try {
                  if (typeof r.update === "function") r.update(updateObj);
                } catch (e) {
                  rd.channelID = channelID;
                  if (typeof assignedIndex === "number")
                    rd.originalIndex = assignedIndex;
                }
                break;
              }
            }
          }
        } catch (e) {}
      });
    }
  } catch (e) {}

  // Optional controls (undo/redo/add-row/download) — looks up IDs in the provided doc
  try {
    const rootDoc = doc;
    const rootWindow = rootWin;

    const undoBtn = rootDoc?.getElementById
      ? rootDoc.getElementById("history-undo")
      : null;
    const redoBtn = rootDoc?.getElementById
      ? rootDoc.getElementById("history-redo")
      : null;
    const addRowBtn = rootDoc?.getElementById
      ? rootDoc.getElementById("add-row")
      : null;
    const groupSelect = rootDoc?.getElementById
      ? rootDoc.getElementById("group-select")
      : null;
    const downloadBtn = rootDoc?.getElementById
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
      } catch (e) {}
    }

    if (undoBtn) {
      undoBtn.addEventListener("click", () => {
        try {
          if (table && typeof table.undo === "function") table.undo();
        } catch (e) {
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
        } finally {
          updateUndoRedoButtons();
        }
      });
    }

    if (addRowBtn) {
      addRowBtn.addEventListener("click", (e) => {
        const groupType = (groupSelect && groupSelect.value) || "Analog";
        const addBlank = !!(e && e.altKey);
        try {
          const groupRows = table
            .getRows()
            .filter((r) => r.getData().type === groupType);
          const maxIdForType =
            groupRows.length > 0
              ? Math.max(...groupRows.map((r) => r.getData().id))
              : 0;
          const lastGroupRow = groupRows[groupRows.length - 1];
          const groupName = lastGroupRow
            ? lastGroupRow.getData().group
            : "Group 1";

          let newRow;
          if (addBlank) {
            newRow = {
              id: maxIdForType + 1,
              type: groupType,
              name: "",
              unit: "",
              group: "",
              color: "#888",
              scale: "",
              start: "",
              duration: "",
              invert: "",
            };
          } else {
            newRow = {
              id: maxIdForType + 1,
              type: groupType,
              name: `${groupType} ${maxIdForType + 1}`,
              unit: "",
              group: groupName,
              color: "#888",
              scale: 1,
              start: 0,
              duration: "",
              invert: false,
              isNew: true,
            };
          }
          table.addRow(newRow, true);
        } catch (e) {
          console.warn("add-row failed:", e);
        }
      });
    }

    if (downloadBtn) {
      downloadBtn.addEventListener("click", async () => {
        try {
          const jsPDFLib =
            (rootWindow && (rootWindow.jspdf || rootWindow.jsPDF)) ||
            window.jspdf ||
            window.jsPDF;
          if (!jsPDFLib || !jsPDFLib.jsPDF) {
            alert("jsPDF not loaded yet. Please wait a second and try again.");
            return;
          }
          if (rootWindow) rootWindow.jspdf = jsPDFLib;
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

    updateUndoRedoButtons();
  } catch (e) {}

  // keyboard undo/redo
  try {
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
    rootWin?.addEventListener?.("keydown", keyHandler);
    if (rootWin) {
      const cleanup = () =>
        rootWin.removeEventListener?.("keydown", keyHandler);
      rootWin.addEventListener?.("beforeunload", cleanup);
    }
  } catch (e) {}

  function updateUndoRedoButtons() {
    // placeholder: actual function bound inside controls block above when available
    try {
      const u =
        (doc && doc.getElementById && doc.getElementById("history-undo")) ||
        null;
      const r =
        (doc && doc.getElementById && doc.getElementById("history-redo")) ||
        null;
      if (u)
        u.disabled = !(
          table.getHistoryUndoSize && table.getHistoryUndoSize() > 0
        );
      if (r)
        r.disabled = !(
          table.getHistoryRedoSize && table.getHistoryRedoSize() > 0
        );
    } catch (e) {}
  }

  return container;
}
