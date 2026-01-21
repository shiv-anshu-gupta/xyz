/**
 * @file index.js
 * @module Services/ComputedChannels
 *
 * @description
 * <h3>Computed Channel Evaluation Orchestrator</h3>
 * 
 * <p>Main entry point for computed channel evaluation.
 * Handles the entire flow from LaTeX input to chart rendering.</p>
 * 
 * <h4>Pipeline Overview</h4>
 * <p>User Input (LaTeX) → Validation → Conversion → Data Prep → Web Worker → Results → State → Events</p>
 * 
 * <h4>Responsibilities</h4>
 * <table>
 *   <tr><th>Step</th><th>Module</th><th>Action</th></tr>
 *   <tr><td>1</td><td>validators</td><td>Validate expression &amp; global data</td></tr>
 *   <tr><td>2</td><td>expressionConversion</td><td>Convert LaTeX → math.js</td></tr>
 *   <tr><td>3</td><td>dataPreparation</td><td>Prepare zero-copy ArrayBuffers</td></tr>
 *   <tr><td>4</td><td>workerManagement</td><td>Create &amp; manage Web Worker</td></tr>
 *   <tr><td>5</td><td>resultProcessing</td><td>Process results &amp; calc stats</td></tr>
 *   <tr><td>6</td><td>stateUpdate</td><td>Update cfg, data, channelState</td></tr>
 *   <tr><td>7</td><td>eventHandling</td><td>Dispatch UI update events</td></tr>
 * </table>
 * 
 * <h4>Performance Optimizations</h4>
 * <ul>
 *   <li><strong>Web Worker</strong> — Non-blocking computation</li>
 *   <li><strong>Transferable ArrayBuffers</strong> — Zero-copy data transfer</li>
 *   <li><strong>Selective Transfer</strong> — Only channels used in expression (not all 599+)</li>
 *   <li><strong>Progress Reporting</strong> — For long computations</li>
 * </ul>
 * 
 * @see {@link module:workers/computedChannelWorker} - Worker implementation
 * @see {@link module:components/renderComputedChart} - Chart rendering
 * 
 * @example
 * import { handleComputedChannelEvaluation } from "./services/computedChannels/index.js";
 * 
 * window.addEventListener("message", async (e) => {
 *   if (e.data.type === "evaluateComputedChannel") {
 *     await handleComputedChannelEvaluation(e.data.payload);
 *   }
 * });
 * 
 * @mermaid
 * sequenceDiagram
 *     UI->>Orchestrator: handleComputedChannelEvaluation(payload)
 *     Orchestrator->>Validators: validateExpressionPayload
 *     Orchestrator->>Validators: validateGlobalData
 *     Orchestrator->>Conversion: convertLatexToMathJs
 *     Orchestrator->>DataPrep: convertToTransferableBuffers
 *     Orchestrator->>Worker: createComputedChannelWorker
 *     Orchestrator->>Worker: sendTaskToWorker
 *     Worker-->>Orchestrator: progress events
 *     Worker-->>Orchestrator: complete with resultsBuffer
 *     Orchestrator->>Results: convertResultsToArray
 *     Orchestrator->>Results: calculateStatistics
 *     Orchestrator->>State: saveToGlobalData
 *     Orchestrator->>State: saveToCfg
 *     Orchestrator->>Events: dispatchChannelSavedEvent
 *     Orchestrator-->>UI: Channel saved notification
 */

import {
  validateExpressionPayload,
  validateGlobalData,
  validateSampleData,
  validateExpressionSyntax,
} from "./validators.js";
import {
  extractDataSources,
  convertToTransferableBuffers,
  serializeChannelMetadata,
  buildWorkerTask,
} from "./dataPreparation.js";
import {
  convertResultsToArray,
  calculateStatistics,
  buildChannelData,
} from "./resultProcessing.js";
import {
  saveToGlobalData,
  saveToCfg,
  updateStateStore,
} from "./stateUpdate.js";
import {
  dispatchChannelSavedEvent,
  notifyChildWindowSuccess,
  notifyChildWindowError,
  notifyChildWindowStateUpdated,
} from "./eventHandling.js";
import {
  createComputedChannelWorker,
  buildWorkerMessageHandler,
  buildWorkerErrorHandler,
  sendTaskToWorker,
} from "./workerManagement.js";
import { convertLatexToMathJs } from "./expressionConversion.js";

/**
 * Main orchestrator: Handles computed channel evaluation end-to-end.
 * This is the primary entry point for creating computed channels.
 * 
 * **Execution Flow:**
 * 1. Validate expression and extract channel name
 * 2. Validate global cfg/data availability
 * 3. Extract and validate sample data
 * 4. Convert LaTeX → math.js expression
 * 5. Validate expression syntax with math.compile()
 * 6. Prepare transferable ArrayBuffers (optimized for used channels only)
 * 7. Create Web Worker and setup handlers
 * 8. Send task to worker with zero-copy transfer
 * 9. On completion: process results, update state, dispatch events
 * 
 * @async
 * @function handleComputedChannelEvaluation
 * @memberof module:services/computedChannels
 * @param {Object} payload - Evaluation request payload
 * @param {string} payload.expression - LaTeX expression from MathLive (e.g., "I_{RMS} = \\sqrt{I_A^2 + I_B^2}")
 * @param {string} [payload.unit] - Unit for the result (e.g., "A", "V")
 * @returns {Promise<void>} Resolves when evaluation completes (success or failure)
 * 
 * @fires computedChannelSaved - When channel is successfully created
 * 
 * @example
 * await handleComputedChannelEvaluation({
 *   expression: "I_{RMS} = \\sqrt{I_A^2 + I_B^2 + I_C^2}",
 *   unit: "A"
 * });
 */
export const handleComputedChannelEvaluation = async (payload) => {
  try {
    // 1️⃣ VALIDATE INPUT & EXTRACT CHANNEL NAME
    const validation1 = validateExpressionPayload(payload);
    if (!validation1.valid) {
      console.warn("[ComputedChannel]", validation1.error);
      return;
    }
    const { expression, unit } = payload;
    const { channelName, mathExpression } = validation1; // ← Extract from validator

    // 2️⃣ VALIDATE DATA AVAILABILITY
    const cfgData =
      window.globalCfg || (window.opener && window.opener.globalCfg);
    const dataObj =
      window.globalData || (window.opener && window.opener.globalData);

    const validation2 = validateGlobalData(cfgData, dataObj);
    if (!validation2.valid) {
      console.error(
        "[ComputedChannel]",
        validation2.error,
        validation2.details
      );
      return;
    }

    // 3️⃣ EXTRACT & VALIDATE DATA
    const { analogArray, digitalArray, sampleCount } = extractDataSources(
      dataObj,
      cfgData
    );

    const validation3 = validateSampleData(analogArray);
    if (!validation3.valid) {
      console.error("[ComputedChannel]", validation3.error);
      return;
    }

    // 4️⃣ CONVERT EXPRESSION FORMAT
    const mathJsExpr = convertLatexToMathJs(expression);

    // 5️⃣ VALIDATE EXPRESSION SYNTAX
    const validation4 = validateExpressionSyntax(mathJsExpr);
    if (!validation4.valid) {
      console.error(
        "[ComputedChannel] Invalid expression syntax:",
        validation4.error
      );
      return;
    }

    // 6️⃣ PREPARE DATA FOR WORKER
    // ✅ OPTIMIZATION: Only convert channels used in the expression
    const { analogBuffers, digitalBuffers, transferableObjects } =
      convertToTransferableBuffers(
        analogArray,
        digitalArray,
        mathJsExpr,
        cfgData
      );
    const { analogChannelsMeta, digitalChannelsMeta } =
      serializeChannelMetadata(cfgData);
    const workerTask = buildWorkerTask(
      mathJsExpr,
      analogBuffers,
      digitalBuffers,
      analogChannelsMeta,
      digitalChannelsMeta,
      sampleCount,
      analogArray,
      digitalArray
    );

    console.log("[ComputedChannel] ⚡ Starting worker evaluation...");

    // 7️⃣ CREATE WORKER & SETUP HANDLERS
    const worker = createComputedChannelWorker();
    const startTime = performance.now();

    // Import progress functions
    const { showProgress, updateProgress, hideProgress } = await import(
      "../../components/ProgressBar.js"
    );

    // Show progress bar immediately
    showProgress(
      1,
      `Processing: ${channelName || expression.substring(0, 20)}...`
    );

    const onProgress = (percent, processed, total) => {
      console.log(`[Worker] 📊 Progress: ${percent}% (${processed}/${total})`);
      // Update UI progress bar
      updateProgress(
        Math.max(1, percent),
        `Processing: ${percent}% (${processed}/${total})`
      );
    };

    const onSuccess = (
      resultsBuffer,
      resultCount,
      elapsedMs,
      unit,
      expression,
      cfgData
    ) => {
      console.log(`[ComputedChannel] ✅ Worker completed in ${elapsedMs}ms`);
      // Hide progress bar
      hideProgress();

      // Process results
      const results = convertResultsToArray(resultsBuffer);
      const stats = calculateStatistics(results);
      const channelData = buildChannelData(
        results,
        expression,
        mathJsExpr,
        unit,
        stats,
        channelName // ← NEW: Pass extracted channel name
      );

      // ═══════════════════════════════════════════════════════════════════
      // 🔍 DEBUG: Log channelData structure after buildChannelData
      // ═══════════════════════════════════════════════════════════════════
      console.group("🔍 [onSuccess] channelData from buildChannelData");
      console.log("channelData keys:", Object.keys(channelData));
      console.log("channelData.metadata:", channelData.metadata);
      console.log("channelData.values length:", channelData.values?.length);
      console.log("channelData.values first 5:", channelData.values?.slice(0, 5));
      console.log("cfgData passed to saveToCfg:", cfgData ? "EXISTS" : "UNDEFINED");
      console.log("window.globalCfg:", window.globalCfg ? "EXISTS" : "UNDEFINED");
      console.log("window.globalData:", window.globalData ? "EXISTS" : "UNDEFINED");
      console.groupEnd();
      // ═══════════════════════════════════════════════════════════════════

      // Update state
      saveToGlobalData(channelData);
      saveToCfg(channelData, cfgData);
      updateStateStore(channelData);

      // ═══════════════════════════════════════════════════════════════════
      // 🔍 DEBUG: Log AFTER state updates
      // ═══════════════════════════════════════════════════════════════════
      console.group("🔍 [onSuccess] AFTER state updates");
      console.log("cfg.computedChannels count:", cfgData?.computedChannels?.length);
      console.log("cfg.computedChannels:", cfgData?.computedChannels);
      console.log("data.computedData count:", window.globalData?.computedData?.length);
      console.log("data.computedData[0] length:", window.globalData?.computedData?.[0]?.length);
      console.groupEnd();
      // ═══════════════════════════════════════════════════════════════════

      // Dispatch events
      // ✅ FIX: Pass combined object (with data) for backward compatibility with event handlers
      dispatchChannelSavedEvent(channelData.combined, expression, unit, stats, results);
      notifyChildWindowSuccess(
        channelData.metadata.name,
        resultCount,
        unit,
        stats,
        elapsedMs
      );

      // ✅ Notify child window to update Tabulator with new computed channel
      notifyChildWindowStateUpdated(cfgData.computedChannels);

      console.log("[ComputedChannel] ✅ Channel saved and events dispatched");
    };

    const onError = (message) => {
      console.error("[ComputedChannel] ❌ Error:", message);
      // Hide progress bar on error
      hideProgress();
      notifyChildWindowError(message);
    };

    // Setup message and error handlers
    const messageHandler = buildWorkerMessageHandler(
      worker,
      startTime,
      unit,
      expression,
      cfgData,
      onProgress,
      onSuccess,
      onError
    );

    const errorHandler = buildWorkerErrorHandler(worker, onError);

    worker.onmessage = messageHandler;
    worker.onerror = errorHandler;

    // 8️⃣ SEND TASK TO WORKER
    sendTaskToWorker(worker, workerTask, transferableObjects);
    console.log("[ComputedChannel] ✅ Task sent to worker (zero-copy)");
  } catch (error) {
    console.error("[ComputedChannel] ❌ Unexpected error:", error);
  }
};
