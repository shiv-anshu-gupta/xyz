/**
 * @file timeInterpolation.js
 * @description Time interpolation utilities for COMTRADE data with non-uniform sampling
 * @module timeInterpolation
 */

/**
 * Find the applicable sampling rate for a given sample number
 * @param {number} sampleNumber - The sample number
 * @param {Array} samplingRates - Array of sampling rate objects from CFG
 * @returns {number} The sampling rate in Hz
 */
export function findSamplingRateForSample(sampleNumber, samplingRates) {
  for (let sr of samplingRates) {
    if (sampleNumber <= sr.endSample) {
      return sr.rate;
    }
  }
  // Default to last rate if sample exceeds all end samples
  return samplingRates[samplingRates.length - 1].rate;
}

/**
 * Calculate time from sample number using sampling rate
 * Creates UNIFORM time spacing regardless of DAT file timestamps
 *
 * @param {number} sampleNumber - The sample index (0, 1, 2, ...)
 * @param {Array} samplingRates - Array of { rate, endSample } objects
 * @returns {number} Time in seconds
 *
 * @example
 * // Sampling rate: 4000 Hz
 * // Result: [0, 0.00025, 0.0005, 0.00075, 0.001, ...]
 * const time = calculateTimeFromSampleNumber(0, [{ rate: 4000, endSample: 99999 }]);
 */
export function calculateTimeFromSampleNumber(sampleNumber, samplingRates) {
  const samplingRate = findSamplingRateForSample(sampleNumber, samplingRates);
  return sampleNumber / samplingRate;
}

/**
 * Linear interpolation between two points
 *
 * @param {number} x1 - First x coordinate
 * @param {number} y1 - First y value
 * @param {number} x2 - Second x coordinate
 * @param {number} y2 - Second y value
 * @param {number} x - Position where you want to interpolate
 * @returns {number} Interpolated y value
 *
 * @example
 * const result = linearInterpolate(0, 10, 4, 20, 2);
 * console.log(result); // 15
 */
export function linearInterpolate(x1, y1, x2, y2, x) {
  if (x2 === x1) return y1; // Avoid division by zero
  const slope = (y2 - y1) / (x2 - x1);
  return y1 + (x - x1) * slope;
}

/**
 * Generate uniform time array from sample numbers
 *
 * @param {number} totalSamples - Total number of samples
 * @param {Array} samplingRates - Sampling rate configuration
 * @returns {Array<number>} Uniform time array in seconds
 *
 * @example
 * const times = generateUniformTimeArray(1000, [{ rate: 4000, endSample: 99999 }]);
 * // Result: [0, 0.00025, 0.0005, 0.00075, ..., 0.24975]
 */
export function generateUniformTimeArray(totalSamples, samplingRates) {
  const timeArray = [];
  for (let i = 0; i < totalSamples; i++) {
    timeArray.push(calculateTimeFromSampleNumber(i, samplingRates));
  }
  return timeArray;
}

/**
 * Interpolate data values at new time points
 * Useful for resampling or filling missing values
 *
 * @param {Array<number>} originalTimes - Original time array
 * @param {Array<number>} originalData - Original data values
 * @param {Array<number>} newTimes - New time points where to interpolate
 * @returns {Array<number>} Interpolated data values
 *
 * @example
 * const original = { times: [0, 0.001, 0.002], data: [10, 15, 20] };
 * const newTimes = [0, 0.0005, 0.001, 0.0015, 0.002];
 * const interpolated = interpolateData(original.times, original.data, newTimes);
 * // Result: [10, 12.5, 15, 17.5, 20]
 */
export function interpolateData(originalTimes, originalData, newTimes) {
  const interpolatedData = [];

  for (let newTime of newTimes) {
    // Find surrounding points
    let leftIdx = -1;
    let rightIdx = -1;

    for (let i = 0; i < originalTimes.length; i++) {
      if (originalTimes[i] <= newTime) {
        leftIdx = i;
      }
      if (originalTimes[i] >= newTime) {
        rightIdx = i;
        break;
      }
    }

    // Handle edge cases
    if (leftIdx === -1) {
      // Before first point
      interpolatedData.push(originalData[0]);
    } else if (rightIdx === -1) {
      // After last point
      interpolatedData.push(originalData[originalData.length - 1]);
    } else if (leftIdx === rightIdx) {
      // Exact match
      interpolatedData.push(originalData[leftIdx]);
    } else {
      // Interpolate between two points
      const t1 = originalTimes[leftIdx];
      const v1 = originalData[leftIdx];
      const t2 = originalTimes[rightIdx];
      const v2 = originalData[rightIdx];

      const interpolatedValue = linearInterpolate(t1, v1, t2, v2, newTime);
      interpolatedData.push(interpolatedValue);
    }
  }

  return interpolatedData;
}

/**
 * Compare original timestamps (from DAT) with calculated timestamps
 * Useful for detecting non-uniform sampling
 *
 * @param {Array<number>} fileTimestamps - Timestamps from DAT file
 * @param {Array<number>} calculatedTimestamps - Calculated from sample numbers
 * @returns {Object} Comparison statistics
 *
 * @example
 * const comparison = compareTimestamps([0, 1, 2, 6, 7], [0, 0.00025, 0.0005, 0.00075, 0.001]);
 * console.log(comparison);
 * // { differences: [0, 0.99975, 1.9995, 5.99925, 6.999], hasGaps: true, maxGap: 5.99925 }
 */
export function compareTimestamps(fileTimestamps, calculatedTimestamps) {
  const differences = [];
  let maxGap = 0;
  let hasGaps = false;

  for (
    let i = 0;
    i < Math.min(fileTimestamps.length, calculatedTimestamps.length);
    i++
  ) {
    const diff = Math.abs(fileTimestamps[i] - calculatedTimestamps[i]);
    differences.push(diff);

    if (diff > 0.0001) {
      // Threshold for considering it a gap
      hasGaps = true;
      maxGap = Math.max(maxGap, diff);
    }
  }

  return {
    differences,
    hasGaps,
    maxGap,
    totalDifference: differences.reduce((a, b) => a + b, 0),
  };
}

/**
 * Detect if time array has uniform spacing
 *
 * @param {Array<number>} timeArray - Time values
 * @param {number} toleranceMicroSeconds - Tolerance in microseconds (default: 1)
 * @returns {Object} Uniformity analysis
 *
 * @example
 * const uniform = detectUniformSpacing([0, 0.00025, 0.0005, 0.00075]);
 * console.log(uniform);
 * // { isUniform: true, intervals: [0.00025, 0.00025, 0.00025], avgInterval: 0.00025 }
 */
export function detectUniformSpacing(timeArray, toleranceMicroSeconds = 1) {
  if (timeArray.length < 2) {
    return { isUniform: true, intervals: [], avgInterval: 0 };
  }

  const intervals = [];
  for (let i = 1; i < timeArray.length; i++) {
    intervals.push(timeArray[i] - timeArray[i - 1]);
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const tolerance = toleranceMicroSeconds / 1e6; // Convert to seconds

  let isUniform = true;
  for (let interval of intervals) {
    if (Math.abs(interval - avgInterval) > tolerance) {
      isUniform = false;
      break;
    }
  }

  return {
    isUniform,
    intervals,
    avgInterval,
    maxDeviation: Math.max(...intervals.map((i) => Math.abs(i - avgInterval))),
  };
}

export default {
  findSamplingRateForSample,
  calculateTimeFromSampleNumber,
  linearInterpolate,
  generateUniformTimeArray,
  interpolateData,
  compareTimestamps,
  detectUniformSpacing,
};
