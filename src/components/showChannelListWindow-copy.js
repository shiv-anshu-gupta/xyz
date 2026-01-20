// // src/components/showChannelListWindow.js
// // Opens a child window and renders the channel list with drag-and-drop support
// import { createChannelList } from './ChannelList.js';

/**
 * Opens a child window and displays the channel list.
 * @param {Object} channelState - State object with analog and digital channel info.
 * @param {Function} onChannelDrop - Callback(channelType, fromIdx, toIdx) when a channel is reordered.
 * @param {Function} onChannelColorChange - Callback(channelType, idx, color) when a channel color is changed.
 */
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

export function showChannelListWindow(
  channelState,
  onChannelDrop,
  onChannelColorChange
) {
  const win = window.open("", "ChannelListWindow", "width=900,height=700");
  if (!win) return;

  win.document.title = "Channel List";

  const tailwindScript = win.document.createElement("script");
  tailwindScript.src = "https://cdn.tailwindcss.com";
  win.document.head.appendChild(tailwindScript);

  const tabulatorCSS = win.document.createElement("link");
  tabulatorCSS.rel = "stylesheet";
  tabulatorCSS.href =
    "https://unpkg.com/tabulator-tables@5.5.2/dist/css/tabulator.min.css";
  win.document.head.appendChild(tabulatorCSS);

  const tabulatorScript = win.document.createElement("script");
  tabulatorScript.src =
    "https://unpkg.com/tabulator-tables@5.5.2/dist/js/tabulator.min.js";

  tabulatorScript.onload = () => {
    setTimeout(setupChannelList, 100);
  };
  win.document.head.appendChild(tabulatorScript);

  win.document.body.innerHTML = `
  <div id="channel-table" class="w-auto flex flex-col gap-4 rounded-md h-auto p-2 md:p-4">
    <div id="button-bar" class="flex flex-wrap gap-2 m-2 md:m-3">
      <select id="group-select" class="border rounded px-2 py-1 text-sm">
        <option value="Analog">Analog</option>
        <option value="Digital">Digital</option>
      </select>
      <button id="add-row" class="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1 rounded">
        Add Blank Row to Bottom
      </button>
      <button id="history-undo" class="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1 rounded">Undo Edit</button>
      <button id="history-redo" class="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1 rounded">Redo Edit</button>
      <button id="download-pdf" class="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1 rounded">Download PDF</button>    </div>
    <div id="channel-root" class="w-auto overflow-y-auto border border-gray-300 rounded-lg shadow-md bg-white"></div>
  </div>
  `;

  const style = win.document.createElement("style");
  style.textContent = `
    body { font-family: sans-serif; }
  `;
  win.document.head.appendChild(style);

  function setupChannelList() {
    const analogChannels =
      channelState.analog?.yLabels?.map((id, idx) => ({
        id,
        color: channelState.analog.lineColors?.[idx],
        type: "Analog",
        idx,
      })) || [];

    const digitalChannels =
      channelState.digital?.yLabels?.map((id, idx) => ({
        id,
        color: channelState.digital.lineColors?.[idx],
        type: "Digital",
        idx,
      })) || [];

    const channelListCfg = { analogChannels, digitalChannels };

    // Pass win.Tabulator and popup document & window into createChannelList
    const listEl = createChannelList(
      channelListCfg,
      (type, fromIdx, toIdx, color) => {
        if (color !== undefined && typeof onChannelColorChange === "function") {
          onChannelColorChange(type, fromIdx, color);
        } else if (typeof onChannelDrop === "function") {
          onChannelDrop(type, fromIdx, toIdx);
        }
      },
      win.Tabulator,
      win.document,
      win
    );

    win.document.getElementById("channel-table").appendChild(listEl);
  }
}
