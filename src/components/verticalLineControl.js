/**
 * Vertical Line Control Component
 * Provides a range slider to adjust vertical line position across charts
 * @module verticalLineControl
 */

/**
 * Creates a vertical line position control panel with range slider and input field
 * @param {Object} options - Configuration options
 * @param {string} options.containerId - ID of container element to mount control
 * @param {number} options.minValue - Minimum value for slider (default: 0)
 * @param {number} options.maxValue - Maximum value for slider (default: 1)
 * @param {number} options.step - Step increment for slider (default: 0.001)
 * @param {number} options.initialValue - Initial slider value (default: 0.5)
 * @param {Function} options.onSliderChange - Callback when slider changes
 * @param {Function} options.onInputChange - Callback when input field changes
 * @returns {Object} Control object with methods to update state
 *
 * @example
 * const control = createVerticalLineControl({
 *   containerId: 'control-panel',
 *   maxValue: 1,
 *   initialValue: 0.5,
 *   onSliderChange: (value) => console.log('Slider:', value),
 *   onInputChange: (value) => console.log('Input:', value)
 * });
 */
export function createVerticalLineControl(options = {}) {
  const {
    containerId = "vertical-line-control",
    minValue = 0,
    maxValue = 1,
    step = 0.001,
    initialValue = 0.5,
    onSliderChange = () => {},
    onInputChange = () => {},
  } = options;

  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`Container with ID "${containerId}" not found`);
    return null;
  }

  // Create control panel structure
  const controlPanel = createControlPanelHTML(
    minValue,
    maxValue,
    step,
    initialValue
  );
  container.appendChild(controlPanel);

  // Get references to DOM elements
  const slider = container.querySelector("#verticalLineSlider");
  const decimalIntInput = container.querySelector("#verticalLineIntValue");
  const decimalDecInput = container.querySelector("#verticalLineDecValue");
  const displayLabel = container.querySelector("#verticalLineDisplay");
  const statPercentage = container.querySelector("#statPercentage");
  const statSamplePos = container.querySelector("#statSamplePos");

  /**
   * Recalculate from decimal parts and update all controls
   */
  function updateFromDecimals() {
    const intVal = parseInt(decimalIntInput.value) || 0;
    const decVal = parseInt(decimalDecInput.value) || 0;
    let value = intVal + decVal / 1000;

    // Validate and clamp
    value = Math.max(minValue, Math.min(maxValue, value));

    // Update all controls
    slider.value = value;
    decimalIntInput.value = Math.floor(value);
    decimalDecInput.value = Math.round((value - Math.floor(value)) * 1000)
      .toString()
      .padStart(3, "0");

    updateDisplayLabel(displayLabel, value, true);
    onInputChange(value);
  }

  /**
   * Update decimal inputs from slider
   */
  function updateFromSlider(value) {
    const intPart = Math.floor(value);
    const decPart = Math.round((value - intPart) * 1000);

    decimalIntInput.value = intPart;
    decimalDecInput.value = decPart.toString().padStart(3, "0");

    updateDisplayLabel(displayLabel, value, true);
  }

  // Event listeners for slider
  slider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    updateFromSlider(value);
    onSliderChange(value);
  });

  // Event listeners for integer input
  decimalIntInput.addEventListener("change", () => {
    updateFromDecimals();
  });

  decimalIntInput.addEventListener("input", () => {
    const intVal = parseInt(decimalIntInput.value) || 0;
    const clamped = Math.max(
      Math.floor(minValue),
      Math.min(Math.floor(maxValue), intVal)
    );
    decimalIntInput.value = clamped;
  });

  // Event listeners for decimal input
  decimalDecInput.addEventListener("change", () => {
    updateFromDecimals();
  });

  decimalDecInput.addEventListener("input", () => {
    let decVal = parseInt(decimalDecInput.value) || 0;
    decVal = Math.max(0, Math.min(999, decVal));
    decimalDecInput.value = decVal.toString().padStart(3, "0");
  });

  /**
   * Update the display label with current value and percentage
   * @private
   */
  function updateDisplayLabel(label, value, updateStats = false) {
    if (label) {
      const percentage = ((value - minValue) / (maxValue - minValue)) * 100;
      const displayValue = label.querySelector(".display-value");
      if (displayValue) {
        displayValue.textContent = value.toFixed(4);
      }

      if (updateStats) {
        const statPercentageEl = container.querySelector("#statPercentage");
        const statSamplePosEl = container.querySelector("#statSamplePos");
        if (statPercentageEl) {
          statPercentageEl.textContent = `${percentage.toFixed(1)}%`;
        }
        if (statSamplePosEl) {
          // Calculate approximate sample position if sampling rate available
          const estimatedSamplePos = Math.round((value * 4000) / 1); // Assuming 4kHz default
          statSamplePosEl.textContent = `~${estimatedSamplePos} samples`;
        }
      }
    }
  }

  // Return control API
  return {
    /**
     * Get current slider value
     */
    getValue() {
      return parseFloat(slider.value);
    },

    /**
     * Set slider value programmatically
     * @param {number} value - New value to set
     */
    setValue(value) {
      value = Math.max(minValue, Math.min(maxValue, value));
      slider.value = value;
      inputField.value = value.toFixed(3);
      updateDisplayLabel(displayLabel, value);
    },

    /**
     * Enable/disable the control
     * @param {boolean} enabled - True to enable, false to disable
     */
    setEnabled(enabled) {
      slider.disabled = !enabled;
      inputField.disabled = !enabled;
    },

    /**
     * Update min and max values
     * @param {number} newMin - New minimum value
     * @param {number} newMax - New maximum value
     */
    setRange(newMin, newMax) {
      slider.min = newMin;
      slider.max = newMax;
    },

    /**
     * Get the DOM element of the control
     */
    getElement() {
      return controlPanel;
    },

    /**
     * Destroy and remove the control
     */
    destroy() {
      controlPanel.remove();
    },
  };
}

/**
 * Creates the HTML structure for the vertical line control panel
 * @private
 */
function createControlPanelHTML(minValue, maxValue, step, initialValue) {
  const panel = document.createElement("div");
  panel.className = "vertical-line-control-panel";

  // Split initial value into integer and decimal parts
  const intPart = Math.floor(initialValue);
  const decPart = Math.round((initialValue - intPart) * 1000);

  panel.innerHTML = `
    <div class="control-header">
      <h3>📍 Vertical Line Position (seconds)</h3>
      <span id="verticalLineDisplay" class="position-display">
        <span class="display-value">${initialValue.toFixed(4)}</span>
        <span class="display-unit">s</span>
      </span>
    </div>
    
    <div class="control-body">
      <div class="control-group">
        <label for="verticalLineSlider" class="slider-label">
          Slider Control
        </label>
        <input
          type="range"
          id="verticalLineSlider"
          class="position-slider"
          min="${minValue}"
          max="${maxValue}"
          step="${step}"
          value="${initialValue}"
          aria-label="Vertical line position slider"
        />
        <span class="slider-range-text">
          Range: ${minValue.toFixed(2)} → ${maxValue.toFixed(2)} seconds
        </span>
      </div>

      <div class="control-group">
        <label class="decimal-inputs-label">
          Precise Input (Integer + Decimal)
        </label>
        <div class="decimal-input-wrapper">
          <div class="decimal-input-group">
            <label for="verticalLineIntValue" class="decimal-sublabel">Integer</label>
            <input
              type="number"
              id="verticalLineIntValue"
              class="decimal-input-field"
              min="${Math.floor(minValue)}"
              max="${Math.floor(maxValue) + 1}"
              value="${intPart}"
              aria-label="Integer part of vertical line position"
            />
          </div>
          
          <span class="decimal-separator">.</span>
          
          <div class="decimal-input-group">
            <label for="verticalLineDecValue" class="decimal-sublabel">Decimal (ms)</label>
            <input
              type="number"
              id="verticalLineDecValue"
              class="decimal-input-field decimal-field"
              min="0"
              max="999"
              value="${decPart.toString().padStart(3, "0")}"
              aria-label="Decimal part (milliseconds) of vertical line position"
            />
          </div>
          
          <span class="decimal-unit">sec</span>
        </div>
      </div>
    </div>

    <div class="control-info">
      <p class="info-text">
        💡 Use the slider for quick adjustments or decimal inputs for precise control
      </p>
      <div class="info-stats" id="controlStats">
        <span class="stat-item">Percentage: <strong id="statPercentage">50.0%</strong></span>
        <span class="stat-item">Sample Pos: <strong id="statSamplePos">-</strong></span>
      </div>
    </div>
  `;

  return panel;
}

/**
 * Updates all vertical line controls to the same value
 * Useful when syncing across multiple chart instances
 * @param {Array<Object>} controls - Array of control objects
 * @param {number} value - Value to set on all controls
 *
 * @example
 * syncVerticalLineControls([control1, control2, control3], 0.75);
 */
export function syncVerticalLineControls(controls, value) {
  controls.forEach((control) => {
    if (control && control.setValue) {
      control.setValue(value);
    }
  });
}
