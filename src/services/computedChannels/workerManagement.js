/**
 * @file workerManagement.js
 * @module services/computedChannels/workerManagement
 * 
 * @description
 * <h3>Web Worker Lifecycle Management</h3>
 * 
 * <p>Creates and manages Web Workers for computed channel evaluation.</p>
 * 
 * <h4>Web Worker Benefits</h4>
 * <ul>
 *   <li><strong>Non-blocking</strong> — UI stays responsive during computation</li>
 *   <li><strong>Parallel processing</strong> — Runs on separate thread</li>
 *   <li><strong>Zero-copy transfer</strong> — ArrayBuffers moved, not copied</li>
 * </ul>
 * 
 * <h4>Worker Lifecycle</h4>
 * <ol>
 *   <li><code>createComputedChannelWorker()</code> → Create</li>
 *   <li><code>buildWorkerMessageHandler()</code> → Attach handlers</li>
 *   <li><code>buildWorkerErrorHandler()</code> → Attach error handler</li>
 *   <li><code>sendTaskToWorker()</code> → Send data</li>
 *   <li>Auto-terminate on complete/error</li>
 * </ol>
 * 
 * <h4>Message Types from Worker</h4>
 * <table>
 *   <tr><th>Type</th><th>Payload</th><th>Description</th></tr>
 *   <tr><td><code>progress</code></td><td><code>{ percent, processed, total }</code></td><td>Progress update</td></tr>
 *   <tr><td><code>complete</code></td><td><code>{ resultsBuffer, sampleCount }</code></td><td>Success</td></tr>
 *   <tr><td><code>error</code></td><td><code>{ message }</code></td><td>Failure</td></tr>
 * </table>
 * 
 * @see {@link module:services/computedChannels} - Main orchestrator
 * @see {@link module:workers/computedChannelWorker} - Worker implementation
 * 
 * @example
 * const worker = createComputedChannelWorker();
 * worker.onmessage = buildWorkerMessageHandler(worker, startTime, ...);
 * worker.onerror = buildWorkerErrorHandler(worker, onError);
 * sendTaskToWorker(worker, task, transferableObjects);
 */

/**
 * Create and configure computation Web Worker.
 * Uses `new URL()` pattern for bundler (Vite/Parcel) compatibility.
 * 
 * @function createComputedChannelWorker
 * @memberof module:services/computedChannels/workerManagement
 * @returns {Worker} Configured Web Worker instance
 * 
 * @example
 * const worker = createComputedChannelWorker();
 * // Worker loaded from: /src/workers/computedChannelWorker.js
 */
export const createComputedChannelWorker = () => {
  return new Worker(
    new URL("../../../src/workers/computedChannelWorker.js", import.meta.url),
    { type: "module" }
  );
};

/**
 * Build message handler for worker results.
 * Creates a closure that handles progress, complete, and error messages.
 * 
 * @function buildWorkerMessageHandler
 * @memberof module:services/computedChannels/workerManagement
 * @param {Worker} worker - Worker instance to terminate on completion
 * @param {number} startTime - Performance.now() timestamp for elapsed time
 * @param {string} unit - Unit of measurement
 * @param {string} expression - Original expression
 * @param {Object} cfgData - Config object for state updates
 * @param {Function} onProgress - Callback for progress updates (percent, processed, total)
 * @param {Function} onSuccess - Callback for success (resultsBuffer, count, elapsedMs, ...)
 * @param {Function} onError - Callback for errors (message)
 * @returns {Function} Message handler function for worker.onmessage
 * 
 * @example
 * const handler = buildWorkerMessageHandler(
 *   worker,
 *   performance.now(),
 *   "A",
 *   "IA + IB",
 *   cfg,
 *   (pct) => updateProgressBar(pct),
 *   (buf, count, ms) => processResults(buf),
 *   (msg) => showError(msg)
 * );
 * worker.onmessage = handler;
 */
export const buildWorkerMessageHandler = (
  worker,
  startTime,
  unit,
  expression,
  cfgData,
  onProgress,
  onSuccess,
  onError
) => {
  return function (e) {
    const {
      type,
      processed,
      total,
      percent,
      resultsBuffer,
      sampleCount: resultCount,
      message,
    } = e.data;

    switch (type) {
      case "progress":
        onProgress?.(percent, processed, total);
        break;

      case "complete": {
        const endTime = performance.now();
        const elapsedMs = (endTime - startTime).toFixed(2);

        onSuccess?.(
          resultsBuffer,
          resultCount,
          elapsedMs,
          unit,
          expression,
          cfgData
        );

        worker.terminate();
        break;
      }

      case "error":
        onError?.(message);
        worker.terminate();
        break;
    }
  };
};

/**
 * Build error handler for worker crashes.
 * Handles unrecoverable worker errors and terminates worker.
 * 
 * @function buildWorkerErrorHandler
 * @memberof module:services/computedChannels/workerManagement
 * @param {Worker} worker - Worker instance to terminate
 * @param {Function} onError - Callback for error notification
 * @returns {Function} Error handler function for worker.onerror
 * 
 * @example
 * worker.onerror = buildWorkerErrorHandler(worker, (msg) => alert(msg));
 */
export const buildWorkerErrorHandler = (worker, onError) => {
  return function (error) {
    console.error("[Worker] ❌ Worker error:", error);
    onError?.(error.message);
    worker.terminate();
  };
};

/**
 * Send task to worker with transferable objects.
 * Uses postMessage with transfer list for zero-copy ArrayBuffer transfer.
 * 
 * **Important:** After calling this, the ArrayBuffers in transferableObjects
 * are detached and can no longer be used in the main thread.
 * 
 * @function sendTaskToWorker
 * @memberof module:services/computedChannels/workerManagement
 * @param {Worker} worker - Target worker
 * @param {Object} workerTask - Task payload object
 * @param {ArrayBuffer[]} transferableObjects - ArrayBuffers to transfer (zero-copy)
 * @returns {void}
 * 
 * @example
 * sendTaskToWorker(worker, {
 *   mathJsExpr: "IA + IB",
 *   analogBuffers: [...],
 *   sampleCount: 10000
 * }, transferableObjects);
 */
export const sendTaskToWorker = (worker, workerTask, transferableObjects) => {
  worker.postMessage(workerTask, transferableObjects);
};
