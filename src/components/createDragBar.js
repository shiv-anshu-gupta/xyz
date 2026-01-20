/**
 * @module createDragBar
 * @description
 * Factory function for creating draggable bar elements that appear above each chart.
 * Drag bars display a compact list of channel colors and labels, allowing users to
 * visually identify chart contents and drag charts to reorder them.
 *
 * Key Features:
 * - Displays colored squares (one per channel) for visual identification
 * - Shows channel labels next to each color indicator
 * - Supports drag-and-drop via HTML5 Drag API
 * - Reactively updates labels when channelState changes
 * - Handles both analog and digital channel types
 * - Subscribes to yLabels updates for live synchronization
 * - Graceful fallback if subscription fails
 *
 * DOM Structure:
 * - Container: <div class="dragBar" draggable="true">
 * - Rows: <div class="dragBar-row"> containing color span + label span
 * - Color: <span class="dragBar-color"> with background-color CSS
 * - Label: <span class="dragBar-label" data-global-index="X">
 *
 * Dependencies:
 * - helpers.js: createCustomElement utility
 * - channelState: Reactive state with subscribe method
 * - cfg: COMTRADE config with channel metadata
 *
 * @example
 * import { createDragBar } from './components/createDragBar.js';
 *
 * const dragBar = createDragBar(
 *   { indices: [0, 1, 2], colors: ['#FF0000', '#00FF00', '#0000FF'] },
 *   { analogChannels: [...], digitalChannels: [...] },
 *   channelState
 * );
 *
 * // Append to chart container
 * chartParent.insertBefore(dragBar, chartDiv);
 *
 * // Now users can drag the bar to reorder charts
 * // And labels automatically update if channelState.analog.yLabels changes
 */

// src/components/createDragBar.js
import { createCustomElement } from "../utils/helpers.js";

/**
 * Create a draggable color bar displaying channel identities for a chart.
 *
 * Builds a visual drag handle element containing:
 * - Color squares corresponding to each channel in the chart
 * - Channel labels next to each color
 * - Reactive subscriptions to update labels when state changes
 *
 * The drag bar serves multiple purposes:
 * 1. Visual identification of which channels are in each chart
 * 2. Drag handle for reordering charts (via setupChartDragAndDrop)
 * 3. Live update target when channel labels change in UI
 *
 * Internal Behavior:
 * - Infers channel type (analog/digital) based on index ranges
 * - Attempts to subscribe to yLabels updates via createState API
 * - Handles both whole-array and single-element updates
 * - Gracefully ignores subscription errors on fallback systems
 * - Preserves data-global-index attributes for live label updates
 *
 * @function createDragBar
 * @param {Object} group - Group/chart definition object
 * @param {Array<number>} group.indices - Global channel indices displayed in this chart
 * @param {Array<string>} group.colors - Color hex codes (currently unused, uses channelState instead)
 * @param {Object} cfg - COMTRADE configuration object
 * @param {Array<Object>} [cfg.analogChannels] - Analog channel metadata
 * @param {Array<Object>} [cfg.digitalChannels] - Digital channel metadata
 * @param {Object} channelState - Reactive channel state (createState proxy)
 * @param {Object} channelState.analog - Analog channel state
 * @param {Array<string>} channelState.analog.yLabels - Channel names/IDs
 * @param {Array<string>} channelState.analog.lineColors - Hex color codes
 * @param {Object} channelState.digital - Digital channel state (same structure)
 * @param {Function} channelState.subscribe - Subscription method for reactive updates
 * @returns {HTMLDivElement} Draggable div with class="dragBar" and draggable="true"
 *
 * Return Element Properties:
 * - class: "dragBar"
 * - draggable: "true"
 * - Contains: <div class="dragBar-row"> elements
 * - Each row contains:
 *   - <span class="dragBar-color"> with background-color and size 14x14px
 *   - <span class="dragBar-label" data-global-index="N"> with channel name
 *
 * @example
 * // Create drag bar for analog chart with 3 channels
 * const dragBar = createDragBar(
 *   { indices: [0, 1, 2], colors: ['#FF0000', '#00FF00', '#0000FF'] },
 *   cfg,
 *   channelState
 * );
 *
 * // HTML output structure:
 * // <div class="dragBar" draggable="true" style="display:flex;...">
 * //   <div class="dragBar-row" style="display:flex;...">
 * //     <span class="dragBar-color" style="background:#FF0000;..."></span>
 * //     <span class="dragBar-label" data-global-index="0">Phase A Current</span>
 * //   </div>
 * //   <div class="dragBar-row">
 * //     <span class="dragBar-color" style="background:#00FF00;..."></span>
 * //     <span class="dragBar-label" data-global-index="1">Phase B Current</span>
 * //   </div>
 * //   <div class="dragBar-row">
 * //     <span class="dragBar-color" style="background:#0000FF;..."></span>
 * //     <span class="dragBar-label" data-global-index="2">Phase C Current</span>
 * //   </div>
 * // </div>
 *
 * @example
 * // The drag bar automatically updates when labels change
 * // Before: "Phase A Current"
 * channelState.analog.yLabels[0] = "Main Feeder A";
 * // After: Drag bar label automatically updates to "Main Feeder A"
 *
 * @example
 * // Digital channel drag bar
 * const digitalDragBar = createDragBar(
 *   { indices: [0], colors: ['#FFAA00'] },
 *   cfg,
 *   channelState  // Will infer type="digital" based on index ranges
 * );
 */
export function createDragBar(group, cfg, channelState) {
  const handleDiv = createCustomElement("div", "dragBar");
  handleDiv.setAttribute("draggable", "true");
  handleDiv.style.display = "flex";
  handleDiv.style.flexDirection = "column";
  // handleDiv.style.alignItems = "flex-start";
  // handleDiv.style.gap = "2px";
  // handleDiv.style.whiteSpace = "normal";
  // handleDiv.style.wordBreak = "break-word";

  // Build rows with data-global-index so we can update labels live
  handleDiv.innerHTML = group.indices
    .map((globalIdx, i) => {
      // prefer channelState labels when available
      const fromAnalog =
        channelState &&
        channelState.analog &&
        Array.isArray(channelState.analog.yLabels);
      const fromDigital =
        channelState &&
        channelState.digital &&
        Array.isArray(channelState.digital.yLabels);
      let color =
        (fromAnalog && channelState.analog.lineColors[globalIdx]) ||
        (fromDigital && channelState.digital.lineColors[globalIdx]) ||
        (cfg.analogChannels &&
          cfg.analogChannels[i] &&
          cfg.analogChannels[i].color) ||
        "#888";
      // determine initial label: try analog then digital then cfg
      let labelText =
        (fromAnalog && channelState.analog.yLabels[globalIdx]) ||
        (fromDigital && channelState.digital.yLabels[globalIdx]) ||
        (cfg.analogChannels &&
          cfg.analogChannels[i] &&
          cfg.analogChannels[i].id) ||
        `Ch${globalIdx}`;
      return (
        `<div class="dragBar-row">` +
        `<span class="dragBar-color" style="background:${color};"></span>` +
        `<span class="dragBar-label" data-global-index="${globalIdx}">${labelText}</span>` +
        `</div>`
      );
    })
    .join("");

  // Subscribe to channelState yLabels updates so dragBar labels update live
  try {
    // Infer type for these indices: prefer analog if channelState.analog contains these indices
    const type =
      channelState &&
      channelState.analog &&
      channelState.analog.yLabels &&
      channelState.analog.yLabels.length > Math.max(...group.indices)
        ? "analog"
        : "digital";
    channelState.subscribe(
      (change) => {
        if (!change || !Array.isArray(change.path)) return;
        const [chgType, prop, idx] = change.path;
        if (prop !== "yLabels") return;
        if (chgType !== type) return;
        // whole-array replacement
        if (change.path.length === 2 && Array.isArray(change.newValue)) {
          // update all labels belonging to this drag bar
          const spans = handleDiv.querySelectorAll(".dragBar-label");
          spans.forEach((sp) => {
            const g = Number(sp.getAttribute("data-global-index"));
            if (Number.isFinite(g)) {
              const newLbl =
                (channelState[type] &&
                  channelState[type].yLabels &&
                  channelState[type].yLabels[g]) ||
                sp.textContent;
              sp.textContent = newLbl;
            }
          });
        } else if (change.path.length === 3 && Number.isFinite(idx)) {
          // single-element update
          const span = handleDiv.querySelector(
            '.dragBar-label[data-global-index="' + idx + '"]'
          );
          if (span) {
            const newLbl = change.newValue;
            span.textContent = newLbl;
          }
        }
      },
      { descendants: true }
    );
  } catch (e) {
    // ignore subscription errors
  }
  return handleDiv;
}
