/**
 * @file resultProcessing.js
 * @module Services/ComputedChannels
 *
 * @description
 * <h3>Worker Results Processing</h3>
 * 
 * <p>Processes results from the computation Web Worker.
 * Handles ArrayBuffer conversion, statistics, and metadata building.</p>
 * 
 * <h4>Data Flow</h4>
 * <ol>
 *   <li>Worker resultsBuffer (ArrayBuffer)</li>
 *   <li>↓ <code>convertResultsToArray()</code></li>
 *   <li>JavaScript Array</li>
 *   <li>↓ <code>calculateStatistics()</code></li>
 *   <li>Stats: { min, max, mean, count }</li>
 *   <li>↓ <code>buildChannelData()</code></li>
 *   <li>Output: { metadata, values }</li>
 * </ol>
 * 
 * <h4>Output Format</h4>
 * <p>Matches the analog/digital data pattern:</p>
 * <table>
 *   <tr><th>Output</th><th>Destination</th><th>Analog Equivalent</th></tr>
 *   <tr><td>metadata</td><td><code>cfg.computedChannels[i]</code></td><td><code>cfg.analogChannels</code></td></tr>
 *   <tr><td>values</td><td><code>data.computedData[i]</code></td><td><code>data.analogData</code></td></tr>
 * </table>
 * 
 * @see {@link module:services/computedChannels} - Main orchestrator
 * @see {@link module:services/computedChannels/stateUpdate} - Consumes output
 * 
 * @example
 * const results = convertResultsToArray(resultsBuffer);
 * const stats = calculateStatistics(results);
 * const channelData = buildChannelData(results, expr, mathExpr, unit, stats, "MyChannel");
 */

/**
 * Convert ArrayBuffer to JavaScript array.
 * Worker returns Float64Array.buffer, this converts back to Array.
 * 
 * @function convertResultsToArray
 * @memberof module:services/computedChannels/resultProcessing
 * @param {ArrayBuffer} resultsBuffer - ArrayBuffer from worker
 * @returns {number[]} JavaScript array of computed values
 * 
 * @example
 * const results = convertResultsToArray(e.data.resultsBuffer);
 * console.log(results.slice(0, 5)); // [1.23, 4.56, ...]
 */
export const convertResultsToArray = (resultsBuffer) => {
  return Array.from(new Float64Array(resultsBuffer));
};

/**
 * Extract channel names used in the math expression.
 * Parses the expression to find all variable names that could be channels.
 * 
 * @function extractUsedChannels
 * @private
 * @param {string} mathJsExpr - The mathematical expression (e.g., "sqrt(IA^2 + IB^2)")
 * @returns {Set<string>} Set of channel identifiers used in the expression
 * 
 * @example
 * extractUsedChannels("sqrt(IA^2 + IB^2 + IC^2)");
 * // Set { "IA", "IB", "IC" }
 */
const extractUsedChannels = (mathJsExpr) => {
  if (!mathJsExpr || typeof mathJsExpr !== "string") {
    return new Set();
  }
  
  const usedChannels = new Set();
  // Match valid variable names: letters, numbers, underscores
  const tokens = mathJsExpr.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
  
  // Math.js functions and constants to filter out
  const mathJsFunctions = new Set([
    "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
    "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
    "sqrt", "pow", "abs", "log", "log10", "log2", "exp",
    "min", "max", "sum", "mean", "median", "std", "variance",
    "random", "floor", "ceil", "round", "fix", "sign",
    "pi", "e", "i", "true", "false", "null", "undefined",
    "mod", "gcd", "lcm", "factorial",
  ]);
  
  tokens.forEach((token) => {
    if (!mathJsFunctions.has(token.toLowerCase())) {
      usedChannels.add(token);
    }
  });
  
  return usedChannels;
};

/**
 * Check if computed values are binary (only 0 and 1).
 * Used to determine if a computed channel from digital sources should be
 * rendered as digital (binary output) or analog (non-binary like sum of digitals).
 * 
 * @function areBinaryValues
 * @memberof module:services/computedChannels/resultProcessing
 * @param {number[]} values - The computed values array
 * @returns {boolean} True if all values are 0 or 1
 * 
 * @example
 * areBinaryValues([0, 1, 1, 0, 1]);  // true - valid binary
 * areBinaryValues([0, 1, 2, 3]);     // false - contains non-binary
 * areBinaryValues([3, 3, 3]);        // false - sum of digitals
 */
export const areBinaryValues = (values) => {
  if (!Array.isArray(values) || values.length === 0) return false;
  
  // Check first 1000 samples for performance (or all if less)
  const samplesToCheck = Math.min(values.length, 1000);
  
  for (let i = 0; i < samplesToCheck; i++) {
    const val = values[i];
    // ✅ FIX: Simple check - value must be exactly 0 or 1
    // Non-binary values like 2, 3, -1, 1.5 etc. should return false
    if (val !== 0 && val !== 1) {
      console.log(`[areBinaryValues] ❌ Non-binary value at index ${i}: ${val}`);
      return false;
    }
  }
  
  console.log(`[areBinaryValues] ✅ All ${samplesToCheck} checked values are binary (0 or 1)`);
  return true;
};

/**
 * Detect whether a computed channel should be rendered as analog or digital
 * based on the source channels referenced in its formula.
 * 
 * **Detection Logic:**
 * 1. Parse the formula to extract all channel references
 * 2. Match each reference against cfg.analogChannels and cfg.digitalChannels
 * 3. Count how many analog vs digital channels are referenced
 * 4. Return the dominant type (analog wins ties, or if no matches found)
 * 
 * **Matching Strategy:**
 * - Matches by channel ID (e.g., "IA", "VA_PH")
 * - Matches by indexed format (e.g., "a0" → analog index 0, "d5" → digital index 5)
 * - Matches by channel name
 * 
 * @function detectMadeFrom
 * @memberof module:services/computedChannels/resultProcessing
 * @param {string} mathJsExpr - The math.js compatible expression
 * @returns {string} "analog" or "digital"
 * 
 * @example
 * // Formula using analog channels IA, IB, IC
 * detectMadeFrom("sqrt(IA^2 + IB^2 + IC^2)");  // "analog"
 * 
 * // Formula using digital channel indexed as d0
 * detectMadeFrom("d0 + d1");  // "digital"
 * 
 * // Formula using mixed channels - analog wins
 * detectMadeFrom("IA * d0");  // "analog" (tie goes to analog)
 */
export const detectMadeFrom = (mathJsExpr) => {
  console.log("[detectMadeFrom] 🔍 Analyzing expression:", mathJsExpr);
  
  const usedChannels = extractUsedChannels(mathJsExpr);
  
  if (usedChannels.size === 0) {
    console.log("[detectMadeFrom] ⚠️ No channel references found, defaulting to analog");
    return "analog";
  }
  
  console.log("[detectMadeFrom] 📋 Found channel references:", [...usedChannels]);
  
  // Get channel arrays from global config
  const analogChannels = window.globalCfg?.analogChannels || [];
  const digitalChannels = window.globalCfg?.digitalChannels || [];
  
  // Build lookup sets for faster matching
  const analogIds = new Set();
  const digitalIds = new Set();
  
  // Add analog channel identifiers (multiple formats)
  analogChannels.forEach((ch, idx) => {
    if (ch.channelID) analogIds.add(ch.channelID);
    if (ch.id) analogIds.add(ch.id);
    if (ch.name) analogIds.add(ch.name);
    // Add indexed format: a0, a1, a2, ...
    analogIds.add(`a${idx}`);
  });
  
  // Add digital channel identifiers (multiple formats)
  digitalChannels.forEach((ch, idx) => {
    if (ch.channelID) digitalIds.add(ch.channelID);
    if (ch.id) digitalIds.add(ch.id);
    if (ch.name) digitalIds.add(ch.name);
    // Add indexed format: d0, d1, d2, ...
    digitalIds.add(`d${idx}`);
  });
  
  console.log("[detectMadeFrom] 📊 Available channels:", {
    analogCount: analogIds.size,
    digitalCount: digitalIds.size,
  });
  
  // Count matches
  let analogMatches = 0;
  let digitalMatches = 0;
  
  for (const ref of usedChannels) {
    if (analogIds.has(ref)) {
      analogMatches++;
      console.log(`[detectMadeFrom]   ✓ "${ref}" → analog`);
    } else if (digitalIds.has(ref)) {
      digitalMatches++;
      console.log(`[detectMadeFrom]   ✓ "${ref}" → digital`);
    } else {
      console.log(`[detectMadeFrom]   ? "${ref}" → not found in cfg`);
    }
  }
  
  console.log("[detectMadeFrom] 📈 Match counts:", { analogMatches, digitalMatches });
  
  // Determine type: digital only if ALL matches are digital (and at least 1 match)
  // Otherwise default to analog
  if (digitalMatches > 0 && analogMatches === 0) {
    console.log("[detectMadeFrom] ✅ Result: digital (all references are digital)");
    return "digital";
  }
  
  console.log("[detectMadeFrom] ✅ Result: analog (default or has analog references)");
  return "analog";
};

/**
 * Calculate statistics from computed results.
 * Filters out non-finite and zero values before calculation.
 * 
 * @function calculateStatistics
 * @memberof module:services/computedChannels/resultProcessing
 * @param {number[]} results - Array of computed values
 * @returns {Object} Statistics object
 * @returns {number} returns.min - Minimum valid value
 * @returns {number} returns.max - Maximum valid value
 * @returns {number} returns.mean - Mean of valid values
 * @returns {number} returns.count - Total sample count
 * @returns {number} returns.validCount - Count of valid (finite, non-zero) values
 * 
 * @example
 * const stats = calculateStatistics([1, 2, 3, 0, Infinity, NaN, 4]);
 * // { min: 1, max: 4, mean: 2.5, count: 7, validCount: 4 }
 */
export const calculateStatistics = (results) => {
  const validResults = results.filter((v) => isFinite(v) && v !== 0);

  if (validResults.length === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      count: results.length,
      validCount: 0,
    };
  }

  return {
    min: Math.min(...validResults),
    max: Math.max(...validResults),
    mean: validResults.reduce((a, b) => a + b, 0) / validResults.length,
    count: results.length,
    validCount: validResults.length,
  };
};

/**
 * Generate unique channel name.
 * Uses custom name if provided, otherwise generates timestamp-based name.
 * 
 * @function generateChannelName
 * @memberof module:services/computedChannels/resultProcessing
 * @param {string|null} [customChannelName=null] - User-provided name (from "name = expr" format)
 * @returns {string} Channel name to use
 * 
 * @example
 * generateChannelName("I_RMS");  // "I_RMS"
 * generateChannelName(null);      // "computed_1705678901234"
 * generateChannelName("");        // "computed_1705678901234"
 */
export const generateChannelName = (customChannelName = null) => {
  if (
    customChannelName &&
    typeof customChannelName === "string" &&
    customChannelName.trim()
  ) {
    const finalName = customChannelName.trim();
    console.log("[resultProcessing] ✅ Using custom channel name:", finalName);
    return finalName;
  }

  const timestampName = `computed_${Date.now()}`;
  console.log(
    "[resultProcessing] ⏱️ No custom name, using timestamp:",
    timestampName
  );
  return timestampName;
};

function detectComputedGroup() {
  const parseIndex = (value) => {
    if (typeof value !== "string") return null;
    if (!value.startsWith("G")) return null;
    const parsed = parseInt(value.slice(1), 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  let maxIndex = -1;

  try {
    const globalRef =
      typeof window !== "undefined"
        ? window
        : typeof globalThis !== "undefined"
        ? globalThis
        : null;
    const metadataState = globalRef?.__chartMetadataState;
    if (metadataState) {
      const { charts, nextUserGroupId } = metadataState;
      if (Array.isArray(charts)) {
        charts.forEach((chart) => {
          const idx = parseIndex(chart?.userGroupId);
          if (idx !== null && idx > maxIndex) {
            maxIndex = idx;
          }
        });
      }
      if (typeof nextUserGroupId === "number") {
        maxIndex = Math.max(maxIndex, nextUserGroupId - 1);
      }
    }

    const cfgGroups = globalRef?.globalCfg?.computedChannels;
    if (Array.isArray(cfgGroups)) {
      cfgGroups.forEach((item) => {
        const idx = parseIndex(item?.group);
        if (idx !== null && idx > maxIndex) {
          maxIndex = idx;
        }
      });
    }

    const collectFromState = (list) => {
      if (!Array.isArray(list)) return;
      list.forEach((value) => {
        const idx = parseIndex(value);
        if (idx !== null && idx > maxIndex) {
          maxIndex = idx;
        }
      });
    };

    collectFromState(globalRef?.channelState?.analog?.groups);
    collectFromState(globalRef?.channelState?.digital?.groups);
    collectFromState(globalRef?.channelState?.computed?.groups);
  } catch (error) {
    console.warn(
      "[resultProcessing] Group detection failed, defaulting to G0",
      error
    );
  }

  const nextIndex = maxIndex + 1;
  return `G${Math.max(0, nextIndex)}`;
}

/**
 * Build channel data object from results
 * ✅ REFACTORED: Returns SEPARATE metadata and values (like analog/digital)
 * 
 * Structure matches analog/digital pattern:
 * - metadata → goes to cfg.computedChannels[] (like cfg.analogChannels)
 * - values   → goes to data.computedData[][] (like data.analogData)
 * 
 * @param {Array} results - Computed values array
 * @param {string} expression - Original LaTeX expression
 * @param {string} mathJsExpr - Converted math.js expression
 * @param {string} unit - Unit string
 * @param {Object} stats - Statistics object
 * @param {string} customChannelName - Custom name or null
 * @param {string} groupOverride - Group override or null
 * @returns {Object} { metadata: {...}, values: [...] }
 */
export const buildChannelData = (
  results,
  expression,
  mathJsExpr,
  unit,
  stats,
  customChannelName = null,
  groupOverride = null
) => {
  console.log("[resultProcessing] 🏗️ buildChannelData called with:", {
    customChannelName: customChannelName,
    expression: expression,
    mathJsExpr: mathJsExpr,
    hasResults: !!results,
    resultCount: results?.length,
  });

  const channelName = generateChannelName(customChannelName);

  console.log("[resultProcessing] 📝 Final channel name:", channelName);

  const resolvedGroup =
    typeof groupOverride === "string" && groupOverride.trim()
      ? groupOverride
      : detectComputedGroup();

  // ✅ ASSIGN COLOR FROM PALETTE (index-based at creation time)
  // Count existing channels from BOTH cfg.computedChannels (metadata) 
  const cfgComputedCount = window.globalCfg?.computedChannels?.length || 0;
  const dataComputedCount = Array.isArray(window.globalData?.computedData) 
    ? window.globalData.computedData.length 
    : 0;
  const computedIndex = Math.max(cfgComputedCount, dataComputedCount);
  
  const computedPalette = (typeof window !== "undefined" &&
    window.COMPUTED_CHANNEL_COLORS) || [
    "#dc2626", // red-600
    "#2563eb", // blue-600
    "#16a34a", // green-600
    "#9333ea", // purple-700
    "#ea580c", // orange-600
    "#0d9488", // teal-600
    "#b45309", // amber-700
    "#be185d", // pink-600
  ];
  const assignedColor = computedPalette[computedIndex % computedPalette.length];

  console.log("[resultProcessing] 🎨 Assigned color:", {
    index: computedIndex,
    color: assignedColor,
    paletteSize: computedPalette.length,
  });

  // ✅ DETECT SOURCE TYPE (analog or digital) based on formula references
  let madeFromType = detectMadeFrom(mathJsExpr);
  let finalResults = results;  // May be converted to binary

  console.log("[resultProcessing] 🏷️ Detected madeFrom from formula:", madeFromType);

  // ✅ SMART CONVERSION: If madeFrom is "digital" but values are NOT binary (0/1),
  // convert values to binary using OR logic (any non-zero → 1)
  // This allows digital formulas like A+B+C to produce valid digital output
  if (madeFromType === "digital" && !areBinaryValues(results)) {
    console.log("[resultProcessing] 🔄 Digital formula produced non-binary values!");
    console.log("[resultProcessing]   Sample BEFORE conversion:", results.slice(0, 10));
    
    // Convert to binary: value > 0 → 1, value == 0 → 0 (OR logic)
    finalResults = results.map(v => (v > 0 ? 1 : 0));
    
    console.log("[resultProcessing]   Sample AFTER conversion:", finalResults.slice(0, 10));
    console.log("[resultProcessing] ✅ Converted to binary OR output - keeping madeFrom='digital'");
  }

  console.log("[resultProcessing] 🏷️ Final madeFrom:", madeFromType);

  // ✅ METADATA ONLY (like cfg.analogChannels) - NO data array!
  const metadata = {
    index: computedIndex,
    id: channelName,
    channelID: channelName,
    name: channelName,
    equation: expression,
    mathJsExpression: mathJsExpr,
    unit: unit || "",
    group: resolvedGroup,
    color: assignedColor,
    type: "Computed",
    madeFrom: madeFromType,  // ✅ Now auto-detected from formula!
    stats: stats,
    sampleCount: finalResults.length,  // ✅ Use finalResults
    createdAt: Date.now(),
    // ❌ NO data/results array here - matches analog pattern!
  };

  // ✅ VALUES ONLY (like data.analogData[]) - Just the number array
  const values = finalResults;  // ✅ Use finalResults (may be converted to binary)

  console.log("[resultProcessing] ✅ Built SEPARATED structure:", {
    metadataKeys: Object.keys(metadata),
    valuesLength: values.length,
    hasDataInMetadata: "data" in metadata, // Should be false
    madeFrom: madeFromType,
    sampleValues: values.slice(0, 5),
  });

  return {
    metadata,
    values,
    // ✅ LEGACY: Keep combined object for backward compatibility during transition
    combined: {
      ...metadata,
      data: finalResults,     // ✅ Use finalResults
      results: finalResults,  // ✅ Use finalResults
    }
  };
};
