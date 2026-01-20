/**
 * Computed Channel Optimization Utilities
 * Provides caching, pre-allocation, and batching for high-performance evaluation
 */

// Cache for compiled math.js expressions to avoid recompilation
const compiledExpressionCache = new Map();

// Pre-allocated scope object template to reduce GC pressure
const scopeTemplate = {};

/**
 * Get or compile a math.js expression with caching
 * @param {string} expression - Math.js compatible expression string
 * @param {Object} mathLib - math.js library object
 * @returns {Object} Compiled expression
 */
export function getCompiledExpression(expression, mathLib) {
  const cacheKey = expression;

  if (compiledExpressionCache.has(cacheKey)) {
    return compiledExpressionCache.get(cacheKey);
  }

  try {
    const compiled = mathLib.compile(expression);
    compiledExpressionCache.set(cacheKey, compiled);
    return compiled;
  } catch (e) {
    console.error("[Optimization] Failed to compile:", expression, e.message);
    throw e;
  }
}

/**
 * Pre-allocate and reuse scope objects to reduce garbage collection
 * @param {number} analogCount - Number of analog channels
 * @param {number} digitalCount - Number of digital channels
 * @returns {Object} Pre-allocated scope object
 */
export function createScopeTemplate(analogCount, digitalCount) {
  const scope = {};

  // Pre-allocate all possible variable slots
  for (let i = 0; i < analogCount; i++) {
    scope[`a${i}`] = 0;
  }
  for (let i = 0; i < digitalCount; i++) {
    scope[`d${i}`] = 0;
  }

  return scope;
}

/**
 * High-performance evaluation loop with minimal object creation
 * @param {Object} compiled - Compiled math.js expression
 * @param {Array} analogArray - 2D array of analog data [channel][sample]
 * @param {Array} digitalArray - 2D array of digital data [channel][sample]
 * @param {Object} analogCfg - Analog channel config array
 * @param {Object} digitalCfg - Digital channel config array
 * @param {Object} scope - Pre-allocated scope object
 * @returns {Float64Array} Results array with all computed values
 */
export function evaluateExpression(
  compiled,
  analogArray,
  digitalArray,
  analogCfg,
  digitalCfg,
  scope
) {
  const sampleCount = analogArray[0]?.length || 0;
  const results = new Float64Array(sampleCount);
  let validCount = 0;

  // Main evaluation loop - optimized for performance
  for (let i = 0; i < sampleCount; i++) {
    // Update scope with current sample values (reuse object)
    for (let idx = 0; idx < analogArray.length; idx++) {
      scope[`a${idx}`] = analogArray[idx][i] ?? 0;
    }
    for (let idx = 0; idx < digitalArray.length; idx++) {
      scope[`d${idx}`] = digitalArray[idx][i] ?? 0;
    }

    // Add by channel ID (only if config provided)
    if (analogCfg) {
      for (let idx = 0; idx < analogCfg.length; idx++) {
        if (analogCfg[idx].id) {
          scope[analogCfg[idx].id] = analogArray[idx][i] ?? 0;
        }
      }
    }
    if (digitalCfg) {
      for (let idx = 0; idx < digitalCfg.length; idx++) {
        if (digitalCfg[idx].id) {
          scope[digitalCfg[idx].id] = digitalArray[idx][i] ?? 0;
        }
      }
    }

    try {
      const value = compiled.evaluate(scope);
      const numValue = Number(value) || 0;
      results[i] = numValue;
      if (!isNaN(numValue)) validCount++;
    } catch (e) {
      results[i] = 0; // Use 0 for errors instead of NaN
    }
  }

  return results;
}

/**
 * Calculate statistics efficiently using a single pass
 * @param {Float64Array} results - Results array
 * @returns {Object} Statistics {min, max, avg, mean, rms, stdDev, count, validCount}
 */
export function calculateStats(results) {
  if (results.length === 0) {
    return {
      min: 0,
      max: 0,
      avg: 0,
      mean: 0,
      rms: 0,
      stdDev: 0,
      count: 0,
      validCount: 0,
    };
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sumSquares = 0;
  let validCount = 0;

  // First pass: calculate min, max, sum, sum of squares
  for (let i = 0; i < results.length; i++) {
    const val = results[i];
    if (!isNaN(val)) {
      min = Math.min(min, val);
      max = Math.max(max, val);
      sum += val;
      sumSquares += val * val;
      validCount++;
    }
  }

  const avg = validCount > 0 ? sum / validCount : 0;
  const rms = validCount > 0 ? Math.sqrt(sumSquares / validCount) : 0;

  // Second pass: calculate standard deviation
  let sumSquaredDiff = 0;
  for (let i = 0; i < results.length; i++) {
    const val = results[i];
    if (!isNaN(val)) {
      const diff = val - avg;
      sumSquaredDiff += diff * diff;
    }
  }
  const stdDev = validCount > 0 ? Math.sqrt(sumSquaredDiff / validCount) : 0;

  return {
    min: min === Infinity ? 0 : min,
    max: max === -Infinity ? 0 : max,
    avg,
    mean: avg,
    rms,
    stdDev,
    count: results.length,
    validCount,
  };
}

/**
 * Clear expression cache to free memory
 * Useful when switching between files or on memory pressure
 */
export function clearExpressionCache() {
  compiledExpressionCache.clear();
}

/**
 * Get cache statistics for debugging
 * @returns {Object} {cacheSize, expressionCount}
 */
export function getCacheStats() {
  return {
    cacheSize: compiledExpressionCache.size,
    expressions: Array.from(compiledExpressionCache.keys()),
  };
}

/**
 * Performance timing utility for debugging
 * @param {string} label - Operation label
 * @param {Function} fn - Function to measure
 * @returns {*} Function result
 */
export function measurePerformance(label, fn) {
  const start = performance.now();
  const result = fn();
  const duration = (performance.now() - start).toFixed(2);

  console.log(`⏱️  [${label}] ${duration}ms`);

  return result;
}

/**
 * Debounce function for event handling
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in ms
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay = 300) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}
