/**
 * @file eventHandling.js
 * @module services/computedChannels/eventHandling
 * 
 * @description
 * <h3>Computed Channel Event Dispatch</h3>
 * 
 * <p>Handles event dispatching and cross-window communication.</p>
 * 
 * <h4>Event Types</h4>
 * <table>
 *   <tr><th>Event</th><th>Target</th><th>Purpose</th></tr>
 *   <tr><td><code>computedChannelSaved</code></td><td><code>window</code> (CustomEvent)</td><td>Trigger chart rendering</td></tr>
 *   <tr><td><code>postMessage</code></td><td>ChannelListWindow</td><td>Success/error notifications</td></tr>
 *   <tr><td><code>COMPUTED_CHANNEL_STATE_UPDATED</code></td><td>Tabulator</td><td>Trigger row addition</td></tr>
 * </table>
 * 
 * <h4>Cross-Window Communication</h4>
 * <p>The ChannelList runs in a separate popup window:</p>
 * <ol>
 *   <li>Main window opens popup with <code>window.open("ChannelList")</code></li>
 *   <li>Main window sends data via <code>postMessage(payload)</code></li>
 *   <li>Always check <code>window.closed</code> before sending</li>
 * </ol>
 * 
 * @see {@link module:services/computedChannels} - Main orchestrator
 * @see {@link module:components/ChannelList} - Event consumer
 * 
 * @example
 * // Dispatch channel saved event
 * dispatchChannelSavedEvent(channelData, expression, unit, stats, results);
 * 
 * // Notify child window of success
 * notifyChildWindowSuccess("I_RMS", 10000, "A", stats, 123.45);
 */

/**
 * Dispatch computedChannelSaved event to trigger chart rendering.
 * Fires a CustomEvent on the window that main.js listens for.
 * 
 * @function dispatchChannelSavedEvent
 * @memberof module:services/computedChannels/eventHandling
 * @param {Object} channelData - Complete channel data object
 * @param {string} channelData.id - Channel identifier
 * @param {string} channelData.name - Display name
 * @param {string} expression - Original expression
 * @param {string} unit - Unit of measurement
 * @param {Object} stats - Statistics object { min, max, mean }
 * @param {number[]} results - Computed values array
 * @returns {void}
 * 
 * @fires window#computedChannelSaved
 * 
 * @example
 * dispatchChannelSavedEvent(
 *   { id: "i_rms", name: "I_RMS" },
 *   "sqrt(IA^2+IB^2+IC^2)",
 *   "A",
 *   { min: 0, max: 100, mean: 50 },
 *   [1.2, 3.4, 5.6, ...]
 * );
 */
export const dispatchChannelSavedEvent = (
  channelData,
  expression,
  unit,
  stats,
  results
) => {
  window.dispatchEvent(
    new CustomEvent("computedChannelSaved", {
      detail: {
        channelId: channelData.id,
        channelName: channelData.name,
        equation: expression,
        samples: results.length,
        unit: unit || "",
        stats: stats,
        fullData: channelData,
      },
    })
  );
};

/**
 * Notify child window (ChannelList) of successful evaluation.
 * Sends postMessage with success payload to popup window.
 * 
 * @function notifyChildWindowSuccess
 * @memberof module:services/computedChannels/eventHandling
 * @param {string} channelName - Created channel name
 * @param {number} resultCount - Number of computed samples
 * @param {string} unit - Unit of measurement
 * @param {Object} stats - Statistics object
 * @param {number} elapsedMs - Computation time in milliseconds
 * @returns {void}
 * 
 * @example
 * notifyChildWindowSuccess("I_RMS", 10000, "A", { min: 0, max: 100 }, 123.45);
 * // ChannelList shows: "Created I_RMS (10000 samples) in 123.45ms"
 */
export const notifyChildWindowSuccess = (
  channelName,
  resultCount,
  unit,
  stats,
  elapsedMs
) => {
  try {
    // ✅ Use __channelListWindow reference set by showChannelListWindow
    const channelListWindow = window.__channelListWindow;
    if (channelListWindow && !channelListWindow.closed) {
      channelListWindow.postMessage(
        {
          source: "ParentWindow",
          type: "computedChannelEvaluated",
          payload: {
            success: true,
            channelName: channelName,
            samples: resultCount,
            unit: unit,
            stats: stats,
            elapsedMs: elapsedMs,
          },
        },
        "*"
      );
    }
  } catch (e) {
    console.warn("[main.js] Failed to notify child window:", e);
  }
};

/**
 * Notify child window (ChannelList) of evaluation error.
 * Sends postMessage with error payload to popup window.
 * 
 * @function notifyChildWindowError
 * @memberof module:services/computedChannels/eventHandling
 * @param {string} message - Error message to display
 * @returns {void}
 * 
 * @example
 * notifyChildWindowError("Invalid expression: unexpected end of input");
 */
export const notifyChildWindowError = (message) => {
  try {
    // ✅ Use __channelListWindow reference set by showChannelListWindow
    const channelListWindow = window.__channelListWindow;
    if (channelListWindow && !channelListWindow.closed) {
      channelListWindow.postMessage(
        {
          source: "ParentWindow",
          type: "computedChannelEvaluated",
          payload: {
            success: false,
            error: message,
          },
        },
        "*"
      );
    }
  } catch (e) {
    console.warn("[main.js] Failed to notify child window of error:", e);
  }
};

/**
 * Notify child window of computed channel state update.
 * Triggers Tabulator to add a new row for the computed channel.
 * 
 * @function notifyChildWindowStateUpdated
 * @memberof module:services/computedChannels/eventHandling
 * @param {Object[]} computedChannels - Array of all computed channel metadata
 * @returns {void}
 * 
 * @example
 * notifyChildWindowStateUpdated(cfg.computedChannels);
 * // ChannelList Tabulator adds new row with channel data
 */
export const notifyChildWindowStateUpdated = (computedChannels) => {
  try {
    // ✅ Use __channelListWindow reference set by showChannelListWindow
    const channelListWindow = window.__channelListWindow;
    if (channelListWindow && !channelListWindow.closed) {
      const payload = {
        source: "ParentWindow",
        type: "COMPUTED_CHANNEL_STATE_UPDATED",
        computedChannels: computedChannels.map((ch) => ({
          id: ch.id || ch.name,
          name: ch.name || ch.id,
          unit: ch.unit || "",
          group: ch.group || "G0",
          color: ch.color || "#FF6B6B",
          equation: ch.equation || "",
          madeFrom: ch.madeFrom || "analog", // ✅ Include madeFrom for displayGroup routing
        })),
      };
      
      console.log("[eventHandling] 📢 Sending COMPUTED_CHANNEL_STATE_UPDATED:", {
        channelCount: payload.computedChannels.length,
        channels: payload.computedChannels.map(ch => ({ name: ch.name, madeFrom: ch.madeFrom })),
      });
      
      channelListWindow.postMessage(payload, "*");
      console.log(
        "[eventHandling] ✅ Notified child window of state update with",
        computedChannels.length,
        "channels"
      );
    } else {
      console.log("[eventHandling] ⚠️ Child window not available for state update notification");
    }
  } catch (e) {
    console.warn("[eventHandling] Failed to notify child window state:", e);
  }
};
