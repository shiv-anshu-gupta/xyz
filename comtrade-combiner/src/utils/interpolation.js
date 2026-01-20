/**
 * Linear Interpolation Module
 * Provides core interpolation functionality for vertical lines and data alignment
 * across different sampling rates
 *
 * @module interpolation
 */

/**
 * Linear interpolation between two points
 *
 * Formula: y = y1 + (x - x1) × (y2 - y1) / (x2 - x1)
 *
 * Finds a value at position x between two known points (x1, y1) and (x2, y2)
 * using a straight line.
 *
 * @param {number} x1 - First x-coordinate (time value at first sample)
 * @param {number} y1 - First y-coordinate (value at first sample)
 * @param {number} x2 - Second x-coordinate (time value at second sample)
 * @param {number} y2 - Second y-coordinate (value at second sample)
 * @param {number} x - Target x-coordinate where we want to interpolate
 * @returns {number} Interpolated y value at position x
 *
 * @example
 * // Find value between two time samples
 * const y1 = 100; // value at time 0.0
 * const y2 = 110; // value at time 0.01
 * const result = linearInterpolate(0.0, 100, 0.01, 110, 0.005);
 * // result = 105 (midpoint value)
 */
export function linearInterpolate(x1, y1, x2, y2, x) {
  // Handle edge case: if both x values are the same, prevent division by zero
  if (x1 === x2) {
    return y1; // Return first point
  }

  // Standard linear interpolation formula
  return y1 + ((x - x1) * (y2 - y1)) / (x2 - x1);
}

/**
 * Get interpolated value from a dataset at a target X position
 * Finds the two nearest points and interpolates between them
 *
 * @param {Array<number>} xData - Array of X values (times)
 * @param {Array<number>} yData - Array of Y values (measurements)
 * @param {number} targetX - Target X position for interpolation
 * @param {number} nearestIdx - Index of nearest point (optimization)
 * @returns {number} Interpolated Y value at targetX
 *
 * @example
 * const times = [0.0, 0.01, 0.02, 0.03];
 * const values = [100, 110, 120, 130];
 * const result = getInterpolatedValue(times, values, 0.015, 1);
 * // result = 115 (interpolated between 110 and 120)
 */
export function getInterpolatedValue(xData, yData, targetX, nearestIdx) {
  // If target X is exactly at a data point, return the value directly
  if (xData[nearestIdx] === targetX) {
    return yData[nearestIdx];
  }

  // Find two surrounding points for linear interpolation
  let idx1 = nearestIdx;
  let idx2 = nearestIdx;

  // Determine which direction to look for the second point
  if (targetX > xData[nearestIdx] && nearestIdx < xData.length - 1) {
    // Target is after current point, use next point
    idx2 = nearestIdx + 1;
  } else if (targetX < xData[nearestIdx] && nearestIdx > 0) {
    // Target is before current point, use previous point
    idx1 = nearestIdx - 1;
    idx2 = nearestIdx;
  }

  const x1 = xData[idx1];
  const x2 = xData[idx2];
  const y1 = yData[idx1];
  const y2 = yData[idx2];

  // Handle edge cases
  if (x1 === x2 || typeof y1 !== "number" || typeof y2 !== "number") {
    return yData[nearestIdx];
  }

  // Linear interpolation: y = y1 + (y2 - y1) * (x - x1) / (x2 - x1)
  const interpolated = y1 + ((y2 - y1) * (targetX - x1)) / (x2 - x1);
  return interpolated;
}

/**
 * Find nearest index for a target value in sorted array
 * Uses binary search for efficiency on large arrays
 *
 * @param {Array<number>} arr - Sorted array of values
 * @param {number} target - Target value to find
 * @returns {number} Index of nearest value
 *
 * @example
 * const times = [0.0, 0.01, 0.02, 0.03, 0.04];
 * const idx = findNearestIndex(times, 0.025);
 * // returns 2 (time 0.02 is closest to 0.025)
 */
export function findNearestIndex(arr, target) {
  if (arr.length === 0) return 0;
  if (arr.length === 1) return 0;

  // Binary search
  let left = 0;
  let right = arr.length - 1;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);

    if (arr[mid] < target) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  // Check if we need to adjust for nearest
  if (
    left > 0 &&
    Math.abs(arr[left - 1] - target) < Math.abs(arr[left] - target)
  ) {
    return left - 1;
  }

  return left;
}

/**
 * Interpolate entire array at new time points
 * Useful for resampling data at different rates
 *
 * @param {Array<number>} sourceX - Original X values (times)
 * @param {Array<number>} sourceY - Original Y values (measurements)
 * @param {Array<number>} targetX - Target X values for interpolation
 * @returns {Array<number>} Interpolated Y values at target X points
 *
 * @example
 * const times = [0.0, 0.01, 0.02];
 * const values = [100, 110, 120];
 * const newTimes = [0.0, 0.005, 0.01, 0.015, 0.02];
 * const result = interpolateArray(times, values, newTimes);
 * // result = [100, 105, 110, 115, 120]
 */
export function interpolateArray(sourceX, sourceY, targetX) {
  return targetX.map((x) => {
    const nearestIdx = findNearestIndex(sourceX, x);
    return getInterpolatedValue(sourceX, sourceY, x, nearestIdx);
  });
}

/**
 * Resample data to a new frequency
 * Useful when combining files with different sampling rates
 *
 * @param {Array<number>} originalTimes - Original time array
 * @param {Array<number>} originalValues - Original value array
 * @param {number} originalFrequency - Original sampling frequency (Hz)
 * @param {number} targetFrequency - Target sampling frequency (Hz)
 * @returns {Object} { times, values } - Resampled data
 *
 * @example
 * const original = [0, 1, 2, 3, 4];
 * const values = [10, 20, 30, 40, 50];
 * const resampled = resampleData(original, values, 1, 2);
 * // Doubles the sample rate, creating intermediate values via interpolation
 */
export function resampleData(
  originalTimes,
  originalValues,
  originalFrequency,
  targetFrequency
) {
  if (originalTimes.length < 2) {
    return { times: originalTimes, values: originalValues };
  }

  // Calculate new sample interval
  const newInterval = 1 / targetFrequency;
  const originalInterval = 1 / originalFrequency;

  // Generate new time points
  const startTime = originalTimes[0];
  const endTime = originalTimes[originalTimes.length - 1];
  const newTimes = [];

  for (let t = startTime; t <= endTime; t += newInterval) {
    newTimes.push(t);
  }

  // Interpolate values at new time points
  const newValues = interpolateArray(originalTimes, originalValues, newTimes);

  return { times: newTimes, values: newValues };
}

/**
 * Calculate statistics about interpolation accuracy
 * Useful for understanding data quality after interpolation
 *
 * @param {Array<number>} originalX - Original X values
 * @param {Array<number>} originalY - Original Y values
 * @param {Array<number>} interpolatedX - New X values for interpolation
 * @returns {Object} Statistics including error metrics
 *
 * @example
 * const stats = getInterpolationStats(times, values, newTimes);
 * // returns { maxError, avgError, interpolatedPoints, ... }
 */
export function getInterpolationStats(originalX, originalY, interpolatedX) {
  const stats = {
    interpolatedPoints: interpolatedX.length,
    exactMatches: 0,
    interpolatedCount: 0,
    errorMetrics: {
      min: Infinity,
      max: -Infinity,
      average: 0,
    },
  };

  let totalError = 0;

  interpolatedX.forEach((x) => {
    const idx = findNearestIndex(originalX, x);

    // Check if this is an exact match
    if (Math.abs(originalX[idx] - x) < 1e-10) {
      stats.exactMatches++;
    } else {
      stats.interpolatedCount++;
      // Calculate error as distance from nearest point
      const error = Math.abs(originalX[idx] - x);
      stats.errorMetrics.min = Math.min(stats.errorMetrics.min, error);
      stats.errorMetrics.max = Math.max(stats.errorMetrics.max, error);
      totalError += error;
    }
  });

  if (stats.interpolatedCount > 0) {
    stats.errorMetrics.average = totalError / stats.interpolatedCount;
  }

  return stats;
}

export default {
  linearInterpolate,
  getInterpolatedValue,
  findNearestIndex,
  interpolateArray,
  resampleData,
  getInterpolationStats,
};
