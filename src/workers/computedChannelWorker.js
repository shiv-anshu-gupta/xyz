/**
 * @file computedChannelWorker.js - Web Worker for Expression Evaluation
 * @module workers/computedChannelWorker
 * @description
 * Web Worker that performs mathematical expression evaluation on COMTRADE data.
 * Runs in a separate thread to avoid blocking the UI during computation.
 * 
 * **Why a Web Worker?**
 * - COMTRADE files can have 10,000+ samples per channel
 * - Evaluating `sqrt(IA^2 + IB^2 + IC^2)` for each sample takes time
 * - Without Worker: UI freezes during computation
 * - With Worker: UI stays responsive, shows progress bar
 * 
 * **Data Flow:**
 * ```
 * Main Thread                    Worker Thread
 * ───────────                    ─────────────
 * ArrayBuffers  ───transfer───→  Float64Arrays
 *                                     ↓
 *                                Build scope (IA=val, IB=val, ...)
 *                                     ↓
 *                                Evaluate expression for each sample
 *                                     ↓
 * Float64Array  ←──transfer───  resultsBuffer
 * ```
 * 
 * **Transferable Objects:**
 * ArrayBuffers are "transferred" (zero-copy), not cloned.
 * This makes data transfer nearly instant even for large datasets.
 * 
 * **Message Types:**
 * - Input: Task object with mathJsExpr, analogBuffers, digitalBuffers, etc.
 * - Output: `{ type: 'progress' | 'complete' | 'error', ... }`
 * 
 * @see {@link module:services/computedChannels/workerManagement} - Creates this worker
 * @see {@link module:services/computedChannels/dataPreparation} - Prepares input data
 * 
 * @example
 * // From main thread:
 * const worker = new Worker(new URL('./computedChannelWorker.js', import.meta.url));
 * worker.postMessage(task, transferableObjects);
 * worker.onmessage = (e) => {
 *   if (e.data.type === 'complete') {
 *     const results = new Float64Array(e.data.resultsBuffer);
 *   }
 * };
 */

/**
 * Math.js library reference.
 * Loaded dynamically to support module workers.
 * @type {Object|null}
 */
let math = null;

// Load math.js when worker starts
(async () => {
  try {
    const mathModule = await import("mathjs");
    math = mathModule;
    console.log("[Worker] math.js loaded successfully");
    // Signal ready
    self.postMessage({ type: "ready" });
  } catch (error) {
    console.error("[Worker] Failed to load math.js:", error);
    self.postMessage({
      type: "error",
      message: "Failed to load math.js",
      error: error.message,
    });
  }
})();

self.onmessage = function (e) {
  // Wait for math.js to be loaded
  if (!math) {
    console.warn("[Worker] math.js not loaded yet, retrying...");
    // Retry after a short delay
    setTimeout(() => self.onmessage(e), 50);
    return;
  }

  const {
    mathJsExpr,
    analogBuffers, // ✅ ArrayBuffers instead of arrays
    digitalBuffers, // ✅ ArrayBuffers instead of arrays
    analogChannels,
    digitalChannels,
    sampleCount,
    analogCount,
    digitalCount,
  } = e.data;

  try {
    console.log("[Worker] Starting evaluation of", sampleCount, "samples...");
    console.log("[Worker] Expression:", mathJsExpr);
    console.log("[Worker] Analog channels:", analogChannels);
    console.log("[Worker] Digital channels:", digitalChannels);

    // ✅ Convert ArrayBuffers back to typed arrays
    const analogArray = [];
    for (let i = 0; i < analogCount; i++) {
      analogArray.push(new Float64Array(analogBuffers[i]));
    }

    const digitalArray = [];
    for (let i = 0; i < digitalCount; i++) {
      digitalArray.push(new Float64Array(digitalBuffers[i]));
    }

    console.log("[Worker] Loaded analog channels:", analogArray.length);
    console.log("[Worker] Loaded digital channels:", digitalArray.length);

    // Compile expression once (not in loop)
    const compiled = math.compile(mathJsExpr);

    // Use typed array for results
    const results = new Float64Array(sampleCount);

    // Pre-allocate scope object
    const scope = {};

    // Progress reporting interval (report every 5000 samples)
    const PROGRESS_INTERVAL = 5000;
    let lastProgressReport = 0;

    // Main evaluation loop
    for (let i = 0; i < sampleCount; i++) {
      // Map analog channels by index (a0, a1, a2, ...)
      for (let idx = 0; idx < analogArray.length; idx++) {
        scope[`a${idx}`] = analogArray[idx][i] ?? 0;
      }

      // Map analog channels by ID (IA, IB, IC, ...)
      for (let idx = 0; idx < analogChannels.length; idx++) {
        if (analogChannels[idx] && analogChannels[idx].id) {
          scope[analogChannels[idx].id] = analogArray[idx][i] ?? 0;
        }
      }

      // Map digital channels by index (d0, d1, d2, ...)
      for (let idx = 0; idx < digitalArray.length; idx++) {
        scope[`d${idx}`] = digitalArray[idx][i] ?? 0;
      }

      // Map digital channels by ID
      for (let idx = 0; idx < digitalChannels.length; idx++) {
        if (digitalChannels[idx] && digitalChannels[idx].id) {
          scope[digitalChannels[idx].id] = digitalArray[idx][i] ?? 0;
        }
      }

      // 🔍 Debug first iteration scope
      if (i === 0) {
        console.log("[Worker] Sample 0 scope keys:", Object.keys(scope));
        console.log("[Worker] Sample 0 scope values:", scope);
      }

      // Evaluate expression
      try {
        const value = compiled.evaluate(scope);
        const numValue = Number(value);
        results[i] = isFinite(numValue) ? numValue : 0;
      } catch (evalError) {
        if (i === 0) {
          console.error("[Worker] Evaluation error at sample 0:", evalError);
        }
        results[i] = 0;
      }

      // Report progress periodically
      if (i - lastProgressReport >= PROGRESS_INTERVAL) {
        self.postMessage({
          type: "progress",
          processed: i,
          total: sampleCount,
          percent: Math.round((i / sampleCount) * 100),
        });
        lastProgressReport = i;
      }
    }

    console.log("[Worker] Evaluation complete");
    console.log(
      "[Worker] Result sample [0-5]:",
      Array.from(results.slice(0, 5))
    );

    // ✅ Transfer results back using ArrayBuffer (zero-copy)
    const resultsBuffer = results.buffer;

    self.postMessage(
      {
        type: "complete",
        resultsBuffer: resultsBuffer,
        sampleCount: sampleCount,
      },
      [resultsBuffer]
    ); // ✅ Transfer ownership back to main thread
  } catch (error) {
    console.error("[Worker] Error:", error);
    self.postMessage({
      type: "error",
      message: error.message,
      stack: error.stack,
    });
  }
};
