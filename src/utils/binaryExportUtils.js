/**
 * binaryExportUtils.js
 * Binary export utilities for COMTRADE 32-bit and 64-bit formats
 */

/**
 * Encode a signed 32-bit integer to 4 bytes (little-endian)
 * @param {number} value - Value to encode
 * @returns {Uint8Array} 4-byte array
 */
export function encodeInt32(value) {
  const int32 = new Int32Array([value]);
  return new Uint8Array(int32.buffer);
}

/**
 * Encode a 64-bit IEEE 754 double to 8 bytes (little-endian)
 * @param {number} value - Value to encode
 * @returns {Uint8Array} 8-byte array
 */
export function encodeFloat64(value) {
  const float64 = new Float64Array([value]);
  return new Uint8Array(float64.buffer);
}

/**
 * Generate CFG content for Binary 32-bit format
 * @param {Array} computedChannels - Array of computed channel objects
 * @param {number} sampleRate - Sample rate
 * @returns {string} CFG content with BINARY file type
 */
export function generateCFGContentBinary32(
  computedChannels,
  sampleRate = 4800
) {
  const numAnalog = computedChannels.length;

  let cfg = "";

  // Line 1: Station,Device,COMTRADE version
  cfg += `MID=COMPUTED_CHANNELS,BATCH_${Date.now()},2013\n`;

  // Line 2: Total channels, Analog channels, Digital channels
  cfg += `${numAnalog},${numAnalog}A,0D\n`;

  // Analog channel definitions - one per computed channel
  computedChannels.forEach((ch, idx) => {
    const min = ch.stats?.min || 0;
    const max = ch.stats?.max || 1;
    const range = max - min;

    const intMin = -2147483648;
    const intMax = 2147483647;
    const intRange = intMax - intMin;

    const multiplier = range / intRange;
    const offset = min - intMin * multiplier;

    const chNum = idx + 1;
    const chId = ch.id || `computed_${idx}`;

    // Index,Id,Phase,Component,Unit,Multiplier,Offset,Skew,Min,Max,Primary,Secondary,PS
    cfg += `${chNum},${chId},,,${ch.unit || "V"},${multiplier.toExponential(
      15
    )},${offset.toExponential(15)},0,${intMin},${intMax},${sampleRate},1,P\n`;
  });

  // Digital channels count line
  cfg += `0\n`;

  // Sampling rates
  const totalSamples = computedChannels[0]?.data?.length || 0;
  cfg += `0\n`;
  cfg += `${sampleRate},${totalSamples}\n`;

  // Time format
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const microseconds = String(now.getMilliseconds() * 1000).padStart(6, "0");

  const timeStr = `${day}/${month}/${year},${hours}:${minutes}:${seconds}.${microseconds}`;

  cfg += `${timeStr}\n`;
  cfg += `${timeStr}\n`;

  // KEY DIFFERENCE: Mark as BINARY format (32-bit)
  cfg += `BINARY\n`;
  cfg += `1.0\n`;
  cfg += `0\n`;
  cfg += `0\n`;

  return cfg;
}

/**
 * Generate DAT content in Binary 32-bit format (raw bytes)
 * @param {Array} computedChannels - Array of computed channel objects
 * @param {number} sampleRate - Sample rate
 * @returns {Uint8Array} Binary DAT content
 */
export function generateDATContentBinary32(
  computedChannels,
  sampleRate = 4800
) {
  const totalSamples = computedChannels[0]?.data?.length || 0;

  // Calculate total bytes needed:
  // Per sample: 4 bytes (sampleNum) + 4 bytes (timeMs) + (4 bytes × numChannels) for values
  const bytesPerSample = 8 + computedChannels.length * 4;
  const totalBytes = bytesPerSample * totalSamples;

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  let offset = 0;

  for (let idx = 0; idx < totalSamples; idx++) {
    const sampleNum = idx + 1;
    const timestampMs = Math.round((idx / sampleRate) * 1000);

    // Write sample number (32-bit signed int, little-endian)
    view.setInt32(offset, sampleNum, true);
    offset += 4;

    // Write timestamp (32-bit signed int, little-endian)
    view.setInt32(offset, timestampMs, true);
    offset += 4;

    // Write channel values
    computedChannels.forEach((ch) => {
      const value = ch.data?.[idx] || 0;
      const min = ch.stats?.min || 0;
      const max = ch.stats?.max || 1;
      const range = max - min;

      const intMin = -2147483648;
      const intMax = 2147483647;
      const intRange = intMax - intMin;

      const multiplier = range / intRange;
      const offset_val = min - intMin * multiplier;

      // Convert display value to raw integer
      const rawValue = Math.round((value - offset_val) / multiplier);

      // Write as 32-bit signed int, little-endian
      view.setInt32(offset, rawValue, true);
      offset += 4;
    });
  }

  return new Uint8Array(buffer);
}

/**
 * Generate CFG content for Binary 64-bit format
 * @param {Array} computedChannels - Array of computed channel objects
 * @param {number} sampleRate - Sample rate
 * @returns {string} CFG content with BINARY file type (64-bit variant)
 */
export function generateCFGContentBinary64(
  computedChannels,
  sampleRate = 4800
) {
  const numAnalog = computedChannels.length;

  let cfg = "";

  // Line 1: Station,Device,COMTRADE version
  cfg += `MID=COMPUTED_CHANNELS_64,BATCH_${Date.now()},2013\n`;

  // Line 2: Total channels, Analog channels, Digital channels
  cfg += `${numAnalog},${numAnalog}A,0D\n`;

  // Analog channel definitions - for 64-bit, we use full double precision
  computedChannels.forEach((ch, idx) => {
    const min = ch.stats?.min || 0;
    const max = ch.stats?.max || 1;

    const chNum = idx + 1;
    const chId = ch.id || `computed_${idx}`;

    // For 64-bit: No multiplier/offset needed, values stored as doubles
    // Use multiplier=1.0, offset=0 as placeholder
    cfg += `${chNum},${chId},,,${
      ch.unit || "V"
    },1.0,0.0,0,${min},${max},${sampleRate},1,P\n`;
  });

  // Digital channels count line
  cfg += `0\n`;

  // Sampling rates
  const totalSamples = computedChannels[0]?.data?.length || 0;
  cfg += `0\n`;
  cfg += `${sampleRate},${totalSamples}\n`;

  // Time format
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const microseconds = String(now.getMilliseconds() * 1000).padStart(6, "0");

  const timeStr = `${day}/${month}/${year},${hours}:${minutes}:${seconds}.${microseconds}`;

  cfg += `${timeStr}\n`;
  cfg += `${timeStr}\n`;

  // Mark as BINARY 64-bit format
  cfg += `BINARY\n`;
  cfg += `1.0\n`;
  cfg += `0\n`;
  cfg += `0\n`;

  return cfg;
}

/**
 * Generate DAT content in Binary 64-bit format (IEEE 754 doubles)
 * @param {Array} computedChannels - Array of computed channel objects
 * @param {number} sampleRate - Sample rate
 * @returns {Uint8Array} Binary DAT content with 64-bit doubles
 */
export function generateDATContentBinary64(
  computedChannels,
  sampleRate = 4800
) {
  const totalSamples = computedChannels[0]?.data?.length || 0;

  // Calculate total bytes needed:
  // Per sample: 4 bytes (sampleNum) + 8 bytes (timeMs as double) + (8 bytes × numChannels) for 64-bit values
  const bytesPerSample = 4 + 8 + computedChannels.length * 8;
  const totalBytes = bytesPerSample * totalSamples;

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  let offset = 0;

  for (let idx = 0; idx < totalSamples; idx++) {
    const sampleNum = idx + 1;
    const timestampMs = (idx / sampleRate) * 1000;

    // Write sample number (32-bit signed int, little-endian)
    view.setInt32(offset, sampleNum, true);
    offset += 4;

    // Write timestamp (64-bit double, little-endian)
    view.setFloat64(offset, timestampMs, true);
    offset += 8;

    // Write channel values as 64-bit doubles
    computedChannels.forEach((ch) => {
      const value = ch.data?.[idx] || 0;

      // Write as 64-bit IEEE 754 double, little-endian
      view.setFloat64(offset, value, true);
      offset += 8;
    });
  }

  return new Uint8Array(buffer);
}

/**
 * Generate CFG content for Float 32-bit format
 * @param {Array} computedChannels - Array of computed channel objects
 * @param {number} sampleRate - Sample rate
 * @returns {string} CFG content with BINARY file type
 */
export function generateCFGContentFloat32(computedChannels, sampleRate = 4800) {
  const numAnalog = computedChannels.length;

  let cfg = "";

  // Line 1: Station,Device,COMTRADE version
  cfg += `MID=COMPUTED_CHANNELS_F32,BATCH_${Date.now()},2013\n`;

  // Line 2: Total channels, Analog channels, Digital channels
  cfg += `${numAnalog},${numAnalog}A,0D\n`;

  // Analog channel definitions - for Float32, no multiplier/offset needed
  computedChannels.forEach((ch, idx) => {
    const min = ch.stats?.min || 0;
    const max = ch.stats?.max || 1;

    const chNum = idx + 1;
    const chId = ch.id || `computed_${idx}`;

    // For float: multiplier=1.0, offset=0, use actual min/max
    cfg += `${chNum},${chId},,,${
      ch.unit || "V"
    },1.0,0.0,0,${min},${max},${sampleRate},1,P\n`;
  });

  // Digital channels count line
  cfg += `0\n`;

  // Sampling rates
  const totalSamples = computedChannels[0]?.data?.length || 0;
  cfg += `0\n`;
  cfg += `${sampleRate},${totalSamples}\n`;

  // Time format
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const microseconds = String(now.getMilliseconds() * 1000).padStart(6, "0");

  const timeStr = `${day}/${month}/${year},${hours}:${minutes}:${seconds}.${microseconds}`;

  cfg += `${timeStr}\n`;
  cfg += `${timeStr}\n`;

  // Mark as BINARY Float32 format
  cfg += `BINARY\n`;
  cfg += `1.0\n`;
  cfg += `0\n`;
  cfg += `0\n`;

  return cfg;
}

/**
 * Generate DAT content in Float 32-bit format (IEEE 754 singles)
 * @param {Array} computedChannels - Array of computed channel objects
 * @param {number} sampleRate - Sample rate
 * @returns {Uint8Array} Binary DAT content with 32-bit floats
 */
export function generateDATContentFloat32(computedChannels, sampleRate = 4800) {
  const totalSamples = computedChannels[0]?.data?.length || 0;

  // Calculate total bytes needed:
  // Per sample: 4 bytes (sampleNum) + 4 bytes (timeMs as float32) + (4 bytes × numChannels) for 32-bit values
  const bytesPerSample = 4 + 4 + computedChannels.length * 4;
  const totalBytes = bytesPerSample * totalSamples;

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  let offset = 0;

  for (let idx = 0; idx < totalSamples; idx++) {
    const sampleNum = idx + 1;
    const timestampMs = (idx / sampleRate) * 1000;

    // Write sample number (32-bit signed int, little-endian)
    view.setInt32(offset, sampleNum, true);
    offset += 4;

    // Write timestamp (32-bit float, little-endian)
    view.setFloat32(offset, timestampMs, true);
    offset += 4;

    // Write channel values as 32-bit floats
    computedChannels.forEach((ch) => {
      const value = ch.data?.[idx] || 0;

      // Write as 32-bit IEEE 754 float, little-endian
      view.setFloat32(offset, value, true);
      offset += 4;
    });
  }

  return new Uint8Array(buffer);
}

/**
 * Generate CFG content for Float 64-bit format
 * @param {Array} computedChannels - Array of computed channel objects
 * @param {number} sampleRate - Sample rate
 * @returns {string} CFG content with BINARY file type
 */
export function generateCFGContentFloat64(computedChannels, sampleRate = 4800) {
  const numAnalog = computedChannels.length;

  let cfg = "";

  // Line 1: Station,Device,COMTRADE version
  cfg += `MID=COMPUTED_CHANNELS_F64,BATCH_${Date.now()},2013\n`;

  // Line 2: Total channels, Analog channels, Digital channels
  cfg += `${numAnalog},${numAnalog}A,0D\n`;

  // Analog channel definitions - for Float64, no multiplier/offset needed
  computedChannels.forEach((ch, idx) => {
    const min = ch.stats?.min || 0;
    const max = ch.stats?.max || 1;

    const chNum = idx + 1;
    const chId = ch.id || `computed_${idx}`;

    // For float: multiplier=1.0, offset=0, use actual min/max
    cfg += `${chNum},${chId},,,${
      ch.unit || "V"
    },1.0,0.0,0,${min},${max},${sampleRate},1,P\n`;
  });

  // Digital channels count line
  cfg += `0\n`;

  // Sampling rates
  const totalSamples = computedChannels[0]?.data?.length || 0;
  cfg += `0\n`;
  cfg += `${sampleRate},${totalSamples}\n`;

  // Time format
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const microseconds = String(now.getMilliseconds() * 1000).padStart(6, "0");

  const timeStr = `${day}/${month}/${year},${hours}:${minutes}:${seconds}.${microseconds}`;

  cfg += `${timeStr}\n`;
  cfg += `${timeStr}\n`;

  // Mark as BINARY Float64 format
  cfg += `BINARY\n`;
  cfg += `1.0\n`;
  cfg += `0\n`;
  cfg += `0\n`;

  return cfg;
}

/**
 * Generate DAT content in Float 64-bit format (IEEE 754 doubles)
 * @param {Array} computedChannels - Array of computed channel objects
 * @param {number} sampleRate - Sample rate
 * @returns {Uint8Array} Binary DAT content with 64-bit floats
 */
export function generateDATContentFloat64(computedChannels, sampleRate = 4800) {
  const totalSamples = computedChannels[0]?.data?.length || 0;

  // Calculate total bytes needed:
  // Per sample: 4 bytes (sampleNum) + 8 bytes (timeMs as float64) + (8 bytes × numChannels) for 64-bit values
  const bytesPerSample = 4 + 8 + computedChannels.length * 8;
  const totalBytes = bytesPerSample * totalSamples;

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  let offset = 0;

  for (let idx = 0; idx < totalSamples; idx++) {
    const sampleNum = idx + 1;
    const timestampMs = (idx / sampleRate) * 1000;

    // Write sample number (32-bit signed int, little-endian)
    view.setInt32(offset, sampleNum, true);
    offset += 4;

    // Write timestamp (64-bit float, little-endian)
    view.setFloat64(offset, timestampMs, true);
    offset += 8;

    // Write channel values as 64-bit floats
    computedChannels.forEach((ch) => {
      const value = ch.data?.[idx] || 0;

      // Write as 64-bit IEEE 754 double, little-endian
      view.setFloat64(offset, value, true);
      offset += 8;
    });
  }

  return new Uint8Array(buffer);
}

/**
 * Create a Blob from binary data
 * @param {Uint8Array} binaryData - Binary data
 * @returns {Blob} Blob object for download
 */
export function createBinaryBlob(binaryData) {
  return new Blob([binaryData], { type: "application/octet-stream" });
}
