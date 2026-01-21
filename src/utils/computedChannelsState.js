/**
 * @module Utils/ComputedChannels
 * @description Computed Channels State Management
 *
 * This module provides a reactive state for managing computed channels
 * similar to how cfg and data states work.
 *
 * Features:
 * - Centralized state for all computed channels
 * - Reactive updates across parent and child windows
 * - Subscribe to changes
 * - Add/update/delete computed channels
 * - Broadcast changes between windows
 */

import { createState } from "../components/createState.js";

/**
 * @description computedChannelsState module
 */


let globalComputedChannelsState = null;

/**
 * Initialize the global computed channels state
 * @param {Object} initialChannels - Initial computed channels object {name: {data, results, unit, ...}}
 * @returns {Object} The state object with subscribe, update, and broadcast methods
 */
export function initComputedChannelsState(initialChannels = {}) {
  if (globalComputedChannelsState) {
    return globalComputedChannelsState;
  }

  // Create reactive state using createState
  const state = createState({
    channels: initialChannels,
    lastUpdated: Date.now(),
    updateSource: "init", // 'init', 'local', 'parent', 'child'
  });

  // Expose methods for updating and broadcasting
  const stateWithMethods = {
    ...state,

    /**
     * Add or update a computed channel
     * @param {string} channelName - The channel name (e.g., 'computed_0')
     * @param {Object} channelData - The channel data {data, results, unit, ...}
     * @param {string} source - Source of update ('local', 'parent', 'child')
     */
    addChannel(channelName, channelData, source = "local") {
      // Update the reactive state directly (createState returns a proxy)
      state.channels = {
        ...state.channels,
        [channelName]: channelData,
      };
      state.lastUpdated = Date.now();
      state.updateSource = source;

      // Broadcast to other windows if this is a local update
      if (source === "local") {
        broadcastComputedChannelChange("add", channelName, channelData);
      }
    },

    /**
     * Delete a computed channel
     * @param {string} channelName - The channel name to delete
     * @param {string} source - Source of update
     */
    deleteChannel(channelName, source = "local") {
      const newChannels = { ...state.channels };
      delete newChannels[channelName];

      state.channels = newChannels;
      state.lastUpdated = Date.now();
      state.updateSource = source;

      if (source === "local") {
        broadcastComputedChannelChange("delete", channelName);
      }
    },

    /**
     * Update multiple channels at once
     * @param {Object} updatedChannels - Object of channels to update/add
     * @param {string} source - Source of update
     */
    updateChannels(updatedChannels, source = "local") {
      state.channels = {
        ...state.channels,
        ...updatedChannels,
      };
      state.lastUpdated = Date.now();
      state.updateSource = source;

      if (source === "local") {
        broadcastComputedChannelChange("update", null, updatedChannels);
      }
    },

    /**
     * Get all computed channels
     * @returns {Object} The channels object
     */
    getChannels() {
      return state.channels;
    },

    /**
     * Get a specific computed channel
     * @param {string} channelName - The channel name
     * @returns {Object|null} The channel data or null if not found
     */
    getChannel(channelName) {
      return state.channels[channelName] || null;
    },

    /**
     * Check if a channel exists
     * @param {string} channelName - The channel name
     * @returns {boolean}
     */
    hasChannel(channelName) {
      return !!state.channels[channelName];
    },

    /**
     * Subscribe to channel changes
     * @param {Function} callback - Called with {channels, lastUpdated, source}
     * @returns {Function} Unsubscribe function
     */
    onChannelsChanged(callback) {
      return state.subscribe((newState, oldState) => {
        // Guard against undefined states
        if (!newState || !oldState) {
          return;
        }

        if (newState.channels !== oldState.channels) {
          callback({
            channels: newState.channels,
            lastUpdated: newState.lastUpdated,
            source: newState.updateSource,
          });
        }
      });
    },
  };

  globalComputedChannelsState = stateWithMethods;

  // Make available globally for child windows
  if (typeof window !== "undefined") {
    window.__computedChannelsState = stateWithMethods;
  }

  return stateWithMethods;
}

/**
 * Get the global computed channels state
 * @returns {Object} The state object, or initialized empty state if not yet initialized
 */
export function getComputedChannelsState() {
  if (!globalComputedChannelsState) {
    return initComputedChannelsState({});
  }
  return globalComputedChannelsState;
}

/**
 * Broadcast a computed channel change to other windows
 * @param {string} action - 'add', 'delete', 'update'
 * @param {string} channelName - The channel name
 * @param {Object} data - The channel data (for add/update)
 */
function broadcastComputedChannelChange(action, channelName, data) {
  // Send to child ChannelList window
  try {
    // ✅ Use __channelListWindow reference set by showChannelListWindow
    const channelListWindow = window.__channelListWindow;
    if (channelListWindow && !channelListWindow.closed) {
      channelListWindow.postMessage(
        {
          source: "ComputedChannelsState",
          type: "computedChannelChanged",
          action,
          channelName,
          data,
          timestamp: Date.now(),
        },
        "*"
      );
    }
  } catch (e) {
    // Ignore cross-window errors
  }

  // Send to merger window if it exists
  try {
    const mergerWindow = window.open("", "MergerWindow");
    if (mergerWindow && !mergerWindow.closed) {
      mergerWindow.postMessage(
        {
          source: "ComputedChannelsState",
          type: "computedChannelChanged",
          action,
          channelName,
          data,
          timestamp: Date.now(),
        },
        "*"
      );
    }
  } catch (e) {
    // Ignore cross-window errors
  }
}

/**
 * Listen for computed channel changes from parent window
 * Called in child windows to sync with parent state
 */
export function listenForComputedChannelChanges(callback) {
  const handleMessage = (event) => {
    if (
      event.data.source === "ComputedChannelsState" &&
      event.data.type === "computedChannelChanged"
    ) {
      callback({
        action: event.data.action,
        channelName: event.data.channelName,
        data: event.data.data,
        timestamp: event.data.timestamp,
      });
    }
  };

  window.addEventListener("message", handleMessage);

  // Return unsubscribe function
  return () => {
    window.removeEventListener("message", handleMessage);
  };
}

/**
 * Sync child window state with parent
 * Called when ChannelList window initializes
 */
export function syncComputedChannelsWithParent() {
  try {
    if (window.opener && !window.opener.closed) {
      const parentState = window.opener.__computedChannelsState;
      if (parentState) {
        const childState = initComputedChannelsState(parentState.getChannels());

        // Listen for parent changes
        listenForComputedChannelChanges(({ action, channelName, data }) => {
          if (action === "add" || action === "update") {
            childState.addChannel(channelName, data, "parent");
          } else if (action === "delete") {
            childState.deleteChannel(channelName, "parent");
          }
        });

        return childState;
      }
    }
  } catch (e) {
    console.warn("Failed to sync computed channels with parent:", e);
  }

  return initComputedChannelsState({});
}
