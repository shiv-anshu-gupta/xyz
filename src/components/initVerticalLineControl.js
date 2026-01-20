/**
 * Vertical Line Control Initialization
 * Initializes the vertical line position control and manages its state
 * @module initVerticalLineControl
 */

import { createVerticalLineControl } from "./verticalLineControl.js";

/**
 * Initializes the vertical line control component
 * DUMMY VERSION - Currently logs changes, ready for integration with actual vertical line rendering
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.dataState - Shared data state object
 * @param {Function} options.onPositionChange - Callback when position changes
 * @param {number} options.maxDuration - Maximum duration in seconds (from COMTRADE data)
 * @returns {Object} Control instance or null if not initialized
 *
 * @example
 * const verticalLineControl = initVerticalLineControl({
 *   dataState: state.data,
 *   maxDuration: 10,
 *   onPositionChange: (value) => updateCharts(value)
 * });
 */
export function initVerticalLineControl(options = {}) {
  const {
    dataState = null,
    onPositionChange = () => {},
    maxDuration = 1,
  } = options;

  try {
    // Create the vertical line control with callbacks
    const verticalLineControl = createVerticalLineControl({
      containerId: "vertical-line-control",
      minValue: 0,
      maxValue: maxDuration,
      step: 0.001,
      initialValue: maxDuration / 2, // Start at middle

      onSliderChange: (value) => {
        // DUMMY: Log to console
        console.log(
          `[Vertical Line] Slider moved to: ${value.toFixed(4)} seconds`
        );

        // Update dataState if available
        if (dataState) {
          dataState.verticalLinePosition = value;
          console.log(
            `[Vertical Line] Updated dataState.verticalLinePosition to: ${value}`
          );
        }

        // Call external callback
        onPositionChange(value);
      },

      onInputChange: (value) => {
        // DUMMY: Log to console
        console.log(
          `[Vertical Line] Input set to: ${value.toFixed(4)} seconds`
        );

        // Update dataState if available
        if (dataState) {
          dataState.verticalLinePosition = value;
          console.log(
            `[Vertical Line] Updated dataState.verticalLinePosition to: ${value}`
          );
        }

        // Call external callback
        onPositionChange(value);
      },
    });

    if (!verticalLineControl) {
      console.warn(
        "[Vertical Line] Failed to initialize control - container not found"
      );
      return null;
    }

    console.log(
      `[Vertical Line] Control initialized with range: 0 to ${maxDuration}`
    );

    // Return extended control with additional methods
    return {
      ...verticalLineControl,

      /**
       * Update the maximum duration (useful when loading new files)
       * @param {number} newDuration - New maximum duration
       */
      updateDuration(newDuration) {
        verticalLineControl.setRange(0, newDuration);
        const midpoint = newDuration / 2;
        verticalLineControl.setValue(midpoint);
        console.log(
          `[Vertical Line] Duration updated to: ${newDuration} seconds`
        );
      },

      /**
       * Get current position state
       * @returns {Object} Current position information
       */
      getState() {
        return {
          position: verticalLineControl.getValue(),
          maxDuration: maxDuration,
          enabled: verticalLineControl.getElement().style.display !== "none",
        };
      },

      /**
       * Show/hide the control
       * @param {boolean} visible - True to show, false to hide
       */
      setVisible(visible) {
        const element = verticalLineControl.getElement();
        element.style.display = visible ? "block" : "none";
        console.log(`[Vertical Line] Control visibility set to: ${visible}`);
      },

      /**
       * Sync with external vertical line position (from chart events, etc.)
       * @param {number} value - Position value to sync
       */
      syncPosition(value) {
        verticalLineControl.setValue(value);
        console.log(
          `[Vertical Line] Position synced to: ${value.toFixed(4)} seconds`
        );
      },
    };
  } catch (error) {
    console.error("[Vertical Line] Initialization error:", error);
    return null;
  }
}

/**
 * Create a dummy vertical line control observer
 * Logs all changes (useful for debugging)
 *
 * @param {Object} control - Vertical line control instance
 * @returns {Function} Unsubscribe function
 *
 * @example
 * const unsubscribe = attachVerticalLineObserver(control);
 * // Later...
 * unsubscribe();
 */
export function attachVerticalLineObserver(control) {
  if (!control) return () => {};

  const observer = setInterval(() => {
    const state = control.getState();
    console.log("[Vertical Line Observer]", state);
  }, 2000); // Log every 2 seconds

  return () => {
    clearInterval(observer);
    console.log("[Vertical Line Observer] Unsubscribed");
  };
}
