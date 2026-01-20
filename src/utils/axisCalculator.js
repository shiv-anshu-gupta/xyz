/**
 * @file axisCalculator.js - Y-Axis Pre-Calculation and Classification
 * @module axisCalculator
 * @category Architecture / Functional Approach
 * @since 2.0.0
 *
 * @description
 * Provides utilities to pre-calculate the number of Y-axes needed based on
 * channel types and units. Since uPlot cannot dynamically change axes at runtime,
 * we determine axis requirements upfront and rebuild charts only when the axis
 * count changes.
 *
 * **Y-Axis Classification Strategy:**
 * The challenge: Different unit types have incompatible scales
 * - Voltage (V, kV, mV): Range ~0-500, sensitive to small changes
 * - Current (A, kA, mA): Range ~0-1000+, different sensitivity
 * - Power (W, kW, MW, Var): Range highly variable, needs isolation
 * - Frequency (Hz): Range ~40-60, completely different magnitude
 *
 * **Solution: Assign to separate Y-axes**
 * ```
 * Axis 1 (left-inner):  Voltage (V)
 * Axis 2 (left-outer):  Current (A), Power (W), Frequency (Hz)
 * ```
 *
 * This prevents mixing units with vastly different scales on the same axis,
 * which would make one set unreadable. Each axis gets its own scale/label/grid.
 *
 * **How It Works:**
 * 1. getChannelType() maps unit strings (V, A, W, Hz) to types
 * 2. getAxisForType() maps types to axis numbers (1 or 2)
 * 3. calculateAxisCountForGroup() scans channels, finds max axis number
 * 4. Result feeds into axisBuilder to create the right number of axes
 *
 * @example
 * import { calculateAxisCountForGroup, getChannelType } from './axisCalculator.js';
 *
 * const channels = [
 *   { unit: 'V' },    // voltage -> axis 1
 *   { unit: 'A' },    // current -> axis 2
 *   { unit: 'A' }     // current -> axis 2
 * ];
 * const maxAxis = calculateAxisCountForGroup(channels);
 * // Returns: 2 (need both axis 1 and axis 2)
 * // Consumer (axisBuilder) creates 2 axes: y0 for voltage, y1 for current
 *
 * @mermaid
 * graph LR
 *     A["Channel with unit 'V'"] --> B["getChannelType('V')"]
 *     B --> C["'voltage'"]
 *     C --> D["getAxisForType('voltage')"]
 *     D --> E["1"]
 *     A2["Channel with unit 'A'"] --> B2["getChannelType('A')"]
 *     B2 --> C2["'current'"]
 *     C2 --> D2["getAxisForType('current')"]
 *     D2 --> E2["2"]
 *     E --> F["calculateAxisCountForGroup()"]
 *     E2 --> F
 *     F --> G["Math.max(1, 2) = 2"]
 *     G --> H["Create 2 Y-Axes"]
 */

/**
 * Map of unit strings to channel types
 * Used to classify channels into compatible groupings based on their units.
 *
 * Supports common SI prefixes and variations:
 * - Voltage: V, mV, kV (all mapped to 'voltage' type)
 * - Current: A, mA, kA (all mapped to 'current' type)
 * - Power: W, kW, MW, Var, kVar, VA, kVA (all mapped to 'power' type)
 * - Frequency: Hz (mapped to 'frequency' type)
 *
 * @type {Object<string, string>}
 * @private
 * @constant
 */
const UNIT_TO_TYPE = {
  V: "voltage",
  A: "current",
  W: "power",
  Hz: "frequency",
  mV: "voltage",
  kV: "voltage",
  mA: "current",
  kA: "current",
  kW: "power",
  MW: "power",
  Var: "power",
  kVar: "power",
  VA: "power",
  kVA: "power",
};

/**
 * Map of channel types to their assigned Y-axis numbers
 * Used to determine which axis a channel should be plotted on.
 *
 * **Y-Axis Assignment:**
 * - voltage: Axis 1 (left-inner position in uPlot)
 * - current: Axis 2 (left-outer position in uPlot)
 * - power: Axis 2 (shares with current due to similar scales)
 * - frequency: Axis 2 (typically low variance, can share with current/power)
 *
 * **Why This Mapping?**
 * Voltage is often the "primary" reference in power systems (axis 1).
 * Current, power, and frequency are secondary measurements (axis 2).
 * Grouping current/power/frequency together keeps axes to maximum 2,
 * which is readable and not too cluttered.
 *
 * @type {Object<string, number>}
 * @private
 * @constant
 */
const TYPE_TO_AXIS = {
  voltage: 1,
  current: 2,
  power: 2,
  frequency: 2,
};

/**
 * Determine channel type from unit string
 *
 * Maps unit strings to channel types by looking up in UNIT_TO_TYPE.
 * Handles normalized lookups (uppercase, trimmed) for robustness.
 *
 * @function getChannelType
 * @category Type Classification
 *
 * @param {string} unit - Unit string (e.g., 'V', 'A', 'kV', 'mA', 'W', 'Hz')
 * @returns {string} Channel type: 'voltage', 'current', 'power', 'frequency', or 'unknown'
 *
 * @description
 * **Lookup Strategy:**
 * 1. Check if unit is a valid string (reject null, undefined, non-strings)
 * 2. Try exact match first (fast path for clean units)
 * 3. Try normalized match (trim spaces, uppercase)
 * 4. Return 'unknown' if no match found
 *
 * Unknown units default to 'unknown' type, which later maps to axis 1
 * (via getAxisForType's default).
 *
 * @example
 * getChannelType('V');       // 'voltage'
 * getChannelType('kV');      // 'voltage'
 * getChannelType('mA');      // 'current'
 * getChannelType('A');       // 'current'
 * getChannelType('W');       // 'power'
 * getChannelType('kW');      // 'power'
 * getChannelType('Hz');      // 'frequency'
 * getChannelType('rad/s');   // 'unknown' (not in mapping)
 * getChannelType(null);      // 'unknown' (type check failed)
 */
export function getChannelType(unit) {
  if (!unit || typeof unit !== "string") {
    return "unknown";
  }

  // Exact match first
  if (UNIT_TO_TYPE[unit]) {
    return UNIT_TO_TYPE[unit];
  }

  // Try normalized lookup (trim spaces)
  const normalized = unit.trim().toUpperCase();
  if (UNIT_TO_TYPE[normalized]) {
    return UNIT_TO_TYPE[normalized];
  }

  return "unknown";
}

/**
 * Determine Y-axis number for a channel type
 *
 * Maps channel types (voltage, current, power, frequency) to Y-axis numbers.
 * Unknown types default to axis 1.
 *
 * @function getAxisForType
 * @category Type Classification
 *
 * @param {string} channelType - Channel type from getChannelType()
 * @returns {number} Y-axis number (1 or 2)
 *
 * @description
 * **Return Values:**
 * - 1: Used by voltage channels (primary reference axis)
 * - 2: Used by current, power, frequency channels (secondary axes)
 * - 1: Default for unknown types (safe fallback)
 *
 * The axis number determines physical position and scale setup in the chart.
 * uPlot uses scales like "y", "y1", "y2" to map data series to their axes.
 *
 * @example
 * getAxisForType('voltage');   // 1 (primary axis)
 * getAxisForType('current');   // 2 (secondary axis)
 * getAxisForType('power');     // 2 (secondary axis)
 * getAxisForType('frequency'); // 2 (secondary axis)
 * getAxisForType('unknown');   // 1 (safe default)
 */
export function getAxisForType(channelType) {
  return TYPE_TO_AXIS[channelType] || 1;
}

/**
 * Calculate the maximum Y-axis number needed for a group of channels
 *
 * Scans all channels in a group, determines their types, maps to axes,
 * and returns the highest axis number needed. This ensures the chart
 * is created with enough axes upfront.
 *
 * @function calculateAxisCountForGroup
 * @category Axis Calculation
 *
 * @param {Array<Object>} channels - Array of channel objects with `unit` property
 * @returns {number} Maximum axis number needed (1 or 2)
 *
 * @description
 * **Algorithm:**
 * 1. Return 1 immediately if channels array is empty or invalid
 * 2. Initialize maxAxis = 1
 * 3. For each channel:
 *    - Extract unit string
 *    - Call getChannelType() to get type
 *    - Call getAxisForType() to get axis number
 *    - Track maximum axis number seen
 * 4. Return maxAxis
 *
 * **Result Meaning:**
 * - Returns 1: All channels are same type or voltage only
 *   → Create chart with 1 Y-axis
 * - Returns 2: At least one channel is current/power/frequency
 *   → Create chart with 2 Y-axes (one for voltage, one for current/power/frequency)
 *
 * **Example Scenarios:**
 * ```
 * Group with only V channels      → maxAxis = 1
 * Group with V + A channels       → maxAxis = 2
 * Group with A + W channels       → maxAxis = 2 (both non-voltage)
 * Group with V + A + W channels   → maxAxis = 2 (voltage is 1, others are 2)
 * ```
 *
 * @example
 * // All voltage channels
 * calculateAxisCountForGroup([
 *   { unit: 'V' },
 *   { unit: 'kV' },
 *   { unit: 'mV' }
 * ]);
 * // Returns: 1 (only axis 1 needed for voltage)
 *
 * @example
 * // Mixed voltage and current
 * calculateAxisCountForGroup([
 *   { unit: 'V' },
 *   { unit: 'A' },
 *   { unit: 'kA' }
 * ]);
 * // Returns: 2 (need axis 1 for voltage, axis 2 for current)
 *
 * @example
 * // Empty or invalid
 * calculateAxisCountForGroup([]);
 * // Returns: 1 (default, avoid creating empty charts)
 */
export function calculateAxisCountForGroup(channels) {
  if (!Array.isArray(channels) || channels.length === 0) {
    return 1; // Default to 1 axis if no channels
  }

  // ✅ FIX: Count UNIQUE axes, not max axis number
  // Before (WRONG): [A,A,A] → Math.max(2,2,2) = 2
  // After (CORRECT): [A,A,A] → Set{2}.size = 1
  const uniqueAxes = new Set();

  for (const channel of channels) {
    const unit = channel?.unit || "unknown";
    const type = getChannelType(unit);
    const axisIdx = getAxisForType(type); // voltage=1, current=2
    uniqueAxes.add(axisIdx); // Set automatically removes duplicates
  }

  const result = uniqueAxes.size;

  // Debug logging to validate fix
  const units = channels.map((ch) => ch?.unit || "?").join(",");
  console.log(
    `[calculateAxisCountForGroup] Debug: { units: [${units}], result: ${result} }`
  );

  return result;
}

/**
 * Calculate axis requirements for all groups
 *
 * Returns an array of axis counts indexed by group number, allowing
 * quick lookup of how many axes each group needs.
 *
 * @function calculateAxisCountsForAllGroups
 * @param {Array} groups - Array of group objects (each with `indices` property)
 * @param {Array} allChannels - Complete array of all channel objects with `unit` property
 * @returns {Array<number>} Array of axis counts: [axisCount0, axisCount1, ...]
 *
 * @example
 * const groups = [
 *   { name: 'Group0', indices: [0, 1] },  // V and A
 *   { name: 'Group1', indices: [2, 3] }   // V and W
 * ];
 * const allChannels = [
 *   { unit: 'V' },
 *   { unit: 'A' },
 *   { unit: 'V' },
 *   { unit: 'W' }
 * ];
 * calculateAxisCountsForAllGroups(groups, allChannels);
 * // Returns: [2, 2] (both groups need 2 axes)
 */
export function calculateAxisCountsForAllGroups(groups, allChannels) {
  if (!Array.isArray(groups) || !Array.isArray(allChannels)) {
    return [];
  }

  return groups.map((group) => {
    if (!Array.isArray(group.indices)) {
      return 1;
    }

    const groupChannels = group.indices
      .map((idx) => allChannels[idx])
      .filter((ch) => ch != null);

    return calculateAxisCountForGroup(groupChannels);
  });
}

/**
 * Detect if axis count changed between old and new configurations
 *
 * Compares two axis count arrays and returns true if any group's axis
 * requirement changed. Used to determine if charts need rebuilding.
 *
 * @function didAxisCountChange
 * @param {Array<number>} oldAxisCounts - Previous axis counts
 * @param {Array<number>} newAxisCounts - New axis counts
 * @returns {boolean} True if any axis count changed or array length changed
 *
 * @example
 * didAxisCountChange([1, 2], [1, 2]);      // false
 * didAxisCountChange([1, 2], [2, 2]);      // true (group 0 changed)
 * didAxisCountChange([1, 2], [1, 2, 1]);   // true (length changed)
 */
export function didAxisCountChange(oldAxisCounts, newAxisCounts) {
  if (oldAxisCounts.length !== newAxisCounts.length) {
    return true;
  }

  for (let i = 0; i < oldAxisCounts.length; i++) {
    if (oldAxisCounts[i] !== newAxisCounts[i]) {
      return true;
    }
  }

  return false;
}

/**
 * Get detailed axis information for a group
 *
 * Returns object containing all axis-related metadata for debugging
 * and configuration purposes.
 *
 * @function getGroupAxisInfo
 * @param {Array} channels - Array of channel objects with `unit` property
 * @returns {Object} Axis information object
 * @returns {number} returns.maxAxis - Highest axis number needed
 * @returns {Array<string>} returns.types - Unique channel types in group
 * @returns {Array<number>} returns.requiredAxes - List of required axis numbers
 * @returns {Object} returns.typeCount - Count of each type (e.g., { voltage: 2, current: 1 })
 *
 * @example
 * const info = getGroupAxisInfo([
 *   { unit: 'V' },
 *   { unit: 'V' },
 *   { unit: 'A' }
 * ]);
 * // Returns:
 * // {
 * //   maxAxis: 2,
 * //   types: ['voltage', 'current'],
 * //   requiredAxes: [1, 2],
 * //   typeCount: { voltage: 2, current: 1 }
 * // }
 */
export function getGroupAxisInfo(channels) {
  const typeCount = {};
  const requiredAxes = new Set();

  if (!Array.isArray(channels)) {
    return {
      maxAxis: 1,
      types: [],
      requiredAxes: [1],
      typeCount: {},
    };
  }

  channels.forEach((channel) => {
    const unit = channel?.unit || "unknown";
    const type = getChannelType(unit);
    const axis = getAxisForType(type);

    typeCount[type] = (typeCount[type] || 0) + 1;
    requiredAxes.add(axis);
  });

  const requiredAxesArray = Array.from(requiredAxes).sort((a, b) => a - b);
  const maxAxis = Math.max(...requiredAxesArray, 1);
  const types = Object.keys(typeCount);

  return {
    maxAxis,
    types,
    requiredAxes: requiredAxesArray,
    typeCount,
  };
}
