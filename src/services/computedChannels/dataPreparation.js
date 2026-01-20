/**
 * @file dataPreparation.js
 * @module services/computedChannels/dataPreparation
 * 
 * @description
 * <h3>Data Preparation for Web Worker</h3>
 * 
 * <p>Prepares COMTRADE data for zero-copy transfer to the computation Web Worker.</p>
 * 
 * <h4>Key Optimization</h4>
 * <blockquote>
 *   Only converts channels that are actually used in the expression!
 *   Reduces memory transfer from ~300MB (all 599 channels) to ~1-5MB (only used).
 * </blockquote>
 * 
 * <h4>Process</h4>
 * <table>
 *   <tr><th>Step</th><th>Action</th></tr>
 *   <tr><td>1</td><td>Extract analog/digital arrays from globalData</td></tr>
 *   <tr><td>2</td><td>Parse expression for used channel names (IA, IB, a0, d5...)</td></tr>
 *   <tr><td>3</td><td>Convert only used channels to Float64Array</td></tr>
 *   <tr><td>4</td><td>Build transferable objects array for <code>postMessage()</code></td></tr>
 *   <tr><td>5</td><td>Serialize channel metadata for worker scope</td></tr>
 * </table>
 * 
 * <h4>ArrayBuffer Transfer</h4>
 * <p>ArrayBuffers are <strong>transferred</strong> (not copied) to Web Workers:</p>
 * <ul>
 *   <li>Zero-copy operation — moves ownership of memory</li>
 *   <li>Original buffer is <strong>detached</strong> after transfer</li>
 *   <li>Cannot use original buffer after <code>postMessage()</code></li>
 * </ul>
 * 
 * @see {@link module:services/computedChannels} - Main orchestrator
 * @see {@link module:workers/computedChannelWorker} - Consumer
 * 
 * @example
 * const { analogBuffers, digitalBuffers, transferableObjects } = 
 *   convertToTransferableBuffers(analogArray, digitalArray, "IA + IB", cfg);
 * 
 * worker.postMessage(task, transferableObjects);  // Zero-copy!
 */

/**
 * Extract and validate data sources from global objects.
 * 
 * @function extractDataSources
 * @memberof module:services/computedChannels/dataPreparation
 * @param {Object} dataObj - Global data object (window.globalData)
 * @param {Object} cfgData - Global config object (window.globalCfg)
 * @returns {Object} Extracted data
 * @returns {Array<Array<number>>} returns.analogArray - Analog data arrays
 * @returns {Array<Array<number>>} returns.digitalArray - Digital data arrays
 * @returns {number} returns.sampleCount - Number of samples
 * 
 * @example
 * const { analogArray, digitalArray, sampleCount } = extractDataSources(data, cfg);
 * console.log(`${analogArray.length} analog channels, ${sampleCount} samples each`);
 */
export const extractDataSources = (dataObj, cfgData) => {
  const analogArray = Array.isArray(dataObj?.analogData)
    ? dataObj.analogData
    : [];
  const digitalArray = Array.isArray(dataObj?.digitalData)
    ? dataObj.digitalData
    : [];

  return {
    analogArray,
    digitalArray,
    sampleCount: analogArray?.[0]?.length || 0,
  };
};

/**
 * Extract channel names used in the expression.
 * Parses the expression to find all variable names that could be channels.
 * 
 * **Matching Strategy:**
 * - Matches valid identifiers: letters, numbers, underscores
 * - Filters out math.js built-in functions (sin, cos, sqrt, etc.)
 * - Includes both named (IA, VA_PH) and indexed (a0, d5) formats
 * 
 * @function extractUsedChannelNames
 * @private
 * @param {string} mathJsExpr - The mathematical expression (e.g., "sqrt(IA^2 + IB^2)")
 * @returns {Set<string>} Set of channel identifiers used in the expression
 * 
 * @example
 * extractUsedChannelNames("sqrt(IA^2 + IB^2 + IC^2)");
 * // Set { "IA", "IB", "IC" }
 * 
 * extractUsedChannelNames("a0 + a1 * sin(d0)");
 * // Set { "a0", "a1", "d0" }  (sin filtered out)
 */
const extractUsedChannelNames = (mathJsExpr) => {
  const usedChannels = new Set();
  // Match valid variable names: letters, numbers, underscores
  // This extracts all identifiers from the expression
  const tokens = mathJsExpr.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
  tokens.forEach((token) => {
    // Filter out Math.js functions and constants
    const mathJsFunctions = new Set([
      "sin",
      "cos",
      "tan",
      "sqrt",
      "pow",
      "abs",
      "log",
      "exp",
      "min",
      "max",
      "sum",
      "mean",
      "random",
      "floor",
      "ceil",
      "round",
      "pi",
      "e",
    ]);
    if (!mathJsFunctions.has(token)) {
      usedChannels.add(token);
    }
  });
  return usedChannels;
};

/**
 * Convert arrays to ArrayBuffers (transferable objects).
 * 
 * **CRITICAL OPTIMIZATION:**
 * Only converts channels that are used in the expression!
 * This reduces memory transfer from ~300MB (all 599 channels) to ~1-5MB.
 * 
 * **How It Works:**
 * 1. Parse expression to find used channel names
 * 2. For each channel, check if its ID or index appears in expression
 * 3. If used: convert to Float64Array and add to transferableObjects
 * 4. If unused: store null as placeholder (maintains index alignment)
 * 
 * @function convertToTransferableBuffers
 * @memberof module:services/computedChannels/dataPreparation
 * @param {Array<Array<number>>} analogArray - Analog channel data arrays
 * @param {Array<Array<number>>} digitalArray - Digital channel data arrays
 * @param {string} [mathJsExpr=""] - Expression to analyze for used channels
 * @param {Object} [cfgData=null] - Config with channel metadata for ID lookup
 * @returns {Object} Prepared buffers
 * @returns {ArrayBuffer[]} returns.analogBuffers - ArrayBuffers (or null for unused)
 * @returns {ArrayBuffer[]} returns.digitalBuffers - ArrayBuffers (or null for unused)
 * @returns {ArrayBuffer[]} returns.transferableObjects - All non-null buffers for transfer
 * 
 * @example
 * // Expression only uses IA and IB
 * const { analogBuffers, transferableObjects } = convertToTransferableBuffers(
 *   data.analogData,   // 50 channels
 *   data.digitalData,  // 100 channels
 *   "sqrt(IA^2 + IB^2)",
 *   cfg
 * );
 * // analogBuffers: [Buffer, Buffer, null, null, ...]  (only 2 converted)
 * // transferableObjects.length: 2  (only used channels)
 */
export const convertToTransferableBuffers = (
  analogArray,
  digitalArray,
  mathJsExpr = "",
  cfgData = null
) => {
  const analogBuffers = [];
  const digitalBuffers = [];
  const transferableObjects = [];

  // Extract used channels if expression is provided
  const usedChannels = mathJsExpr
    ? extractUsedChannelNames(mathJsExpr)
    : new Set();
  const shouldCheckUsage = mathJsExpr && cfgData; // Only optimize if we have both expression and config

  // Convert analog channels (only used ones if optimization is enabled)
  for (let i = 0; i < analogArray.length; i++) {
    let shouldInclude = true;

    if (shouldCheckUsage) {
      // Get channel identifier
      const channel = cfgData.analogChannels?.[i];
      const channelId = channel?.id || `a${i}`;
      const shortId = `a${i}`;

      // Only include if used in expression
      shouldInclude = usedChannels.has(channelId) || usedChannels.has(shortId);
    }

    if (shouldInclude) {
      const buffer = new Float64Array(analogArray[i]).buffer;
      analogBuffers.push(buffer);
      transferableObjects.push(buffer);
    } else {
      analogBuffers.push(null); // Placeholder for unused channels
    }
  }

  // Convert digital channels (only used ones if optimization is enabled)
  for (let i = 0; i < digitalArray.length; i++) {
    let shouldInclude = true;

    if (shouldCheckUsage) {
      // Get channel identifier
      const channel = cfgData.digitalChannels?.[i];
      const channelId = channel?.id || `d${i}`;
      const shortId = `d${i}`;

      // Only include if used in expression
      shouldInclude = usedChannels.has(channelId) || usedChannels.has(shortId);
    }

    if (shouldInclude) {
      const buffer = new Float64Array(digitalArray[i]).buffer;
      digitalBuffers.push(buffer);
      transferableObjects.push(buffer);
    } else {
      digitalBuffers.push(null); // Placeholder for unused channels
    }
  }

  const channelsConverted = transferableObjects.length;
  const totalChannels = analogArray.length + digitalArray.length;
  console.log(
    `[DataPreparation] ✅ Converted ${channelsConverted}/${totalChannels} channels (${Math.round(
      (channelsConverted / totalChannels) * 100
    )}%)`
  );

  return {
    analogBuffers,
    digitalBuffers,
    transferableObjects,
  };
};

/**
 * Extract and serialize channel metadata for worker scope building.
 * The worker needs channel IDs to map variable names to array indices.
 * 
 * @function serializeChannelMetadata
 * @memberof module:services/computedChannels/dataPreparation
 * @param {Object} cfgData - COMTRADE config object
 * @returns {Object} Serialized metadata
 * @returns {Object[]} returns.analogChannelsMeta - Analog channel metadata
 * @returns {Object[]} returns.digitalChannelsMeta - Digital channel metadata
 * 
 * @example
 * const { analogChannelsMeta } = serializeChannelMetadata(cfg);
 * // [{ id: "IA", ph: "A", units: "A" }, { id: "IB", ... }, ...]
 */
export const serializeChannelMetadata = (cfgData) => {
  const analogChannelsMeta = (cfgData?.analogChannels || []).map((ch) => ({
    id: ch.id,
    ph: ch.ph,
    units: ch.units,
  }));

  const digitalChannelsMeta = (cfgData?.digitalChannels || []).map((ch) => ({
    id: ch.id,
    ph: ch.ph,
    units: ch.units,
  }));

  return {
    analogChannelsMeta,
    digitalChannelsMeta,
  };
};

/**
 * Build the complete worker task payload.
 * Combines expression, buffers, and metadata into single message object.
 * 
 * @function buildWorkerTask
 * @memberof module:services/computedChannels/dataPreparation
 * @param {string} mathJsExpr - Math.js compatible expression
 * @param {ArrayBuffer[]} analogBuffers - Prepared analog ArrayBuffers
 * @param {ArrayBuffer[]} digitalBuffers - Prepared digital ArrayBuffers
 * @param {Object[]} analogChannelsMeta - Analog channel metadata
 * @param {Object[]} digitalChannelsMeta - Digital channel metadata
 * @param {number} sampleCount - Number of samples to process
 * @param {Array} analogArray - Original analog array (for count)
 * @param {Array} digitalArray - Original digital array (for count)
 * @returns {Object} Worker task payload
 * 
 * @example
 * const task = buildWorkerTask(expr, aBuffers, dBuffers, aMeta, dMeta, 10000, aArr, dArr);
 * worker.postMessage(task, transferableObjects);
 */
export const buildWorkerTask = (
  mathJsExpr,
  analogBuffers,
  digitalBuffers,
  analogChannelsMeta,
  digitalChannelsMeta,
  sampleCount,
  analogArray,
  digitalArray
) => {
  return {
    mathJsExpr,
    analogBuffers,
    digitalBuffers,
    analogChannels: analogChannelsMeta,
    digitalChannels: digitalChannelsMeta,
    sampleCount,
    analogCount: analogArray.length,
    digitalCount: digitalArray.length,
  };
};
