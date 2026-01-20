import { calculateTimeFromSampleNumber } from "../utils/timeInterpolation.js";

/**
 * @file comtradeUtils.js - COMTRADE file parsing utilities
 * @module comtradeUtils
 * @description
 * Provides comprehensive parsing functions for COMTRADE .CFG and .DAT files.
 * Supports both ASCII and BINARY formats, multiple sampling rates, and implements
 * linear interpolation for uniform time spacing across different sampling rates.
 *
 * Time Calculation Flow:
 * - CFG file → Extract sampling rates and configuration
 * - DAT file → Parse samples using linear interpolation
 * - Result → Uniform time array regardless of file format
 */

/**
 * Channel metadata from COMTRADE CFG file - Analog Channel
 *
 * @typedef {Object} AnalogChannel
 * @property {number} index - Channel index (1-based in CFG, but stored as-is)
 * @property {string} id - Channel identifier/name
 * @property {string} phase - Phase designation (e.g., 'A', 'B', 'C')
 * @property {string} component - Component name (e.g., 'Voltage', 'Current')
 * @property {string} unit - Measurement unit (e.g., 'V', 'A', 'Hz')
 * @property {number} multiplier - Scaling multiplier for raw values
 * @property {number} offset - Offset to add after multiplying
 * @property {number} skew - Time skew for this channel
 * @property {number} min - Minimum valid value
 * @property {number} max - Maximum valid value
 * @property {number} primary - Primary winding value
 * @property {number} secondary - Secondary winding value
 * @property {string} reference - Reference designation
 */

/**
 * Digital Channel metadata from COMTRADE CFG file
 *
 * @typedef {Object} DigitalChannel
 * @property {number} index - Channel index (1-based in CFG)
 * @property {string} id - Channel identifier/name
 * @property {string} phase - Phase designation
 * @property {string} component - Component name
 * @property {boolean} normalState - Normal/default state (true=1, false=0)
 */

/**
 * Sampling rate definition with duration range
 *
 * @typedef {Object} SamplingRate
 * @property {number} rate - Sampling rate in Hz (samples per second)
 * @property {number} endSample - Last sample number for this rate (0-based)
 */

/**
 * Parse a COMTRADE .CFG configuration file
 *
 * @function parseCFG
 * @category COMTRADE Parsing / File I/O
 * @since 1.0.0
 *
 * @description
 * Parses a COMTRADE .CFG file according to IEEE C37.111 standard.
 * Extracts complete header information including:
 * - Station name, device ID, COMTRADE revision (1999, 2013)
 * - Analog and digital channel metadata
 * - Sampling rates (supports multiple rates with rate changes)
 * - Start date/time and trigger time with microsecond precision
 * - Time multiplier and file type (ASCII/BINARY)
 * - 2013-specific fields: time_code, local_code, tmq_code, leapsec
 *
 * **CRITICAL for Interpolation:**
 * - Extracts samplingRates array used by calculateTimeFromSampleNumber()
 * - Supports multiple sampling rates within single file
 * - Enables accurate uniform time calculation in parseDAT()
 *
 * @param {string} cfgText - Raw text content of the .CFG file
 * @param {string} [timeUnit='microseconds'] - Output time unit: 'seconds', 'milliseconds', or 'microseconds'
 *
 * @returns {Object} Parsed COMTRADE configuration object
 * @returns {string} returns.stationName - Station or substation identifier
 * @returns {string} returns.deviceID - Recording device identifier
 * @returns {string} returns.COMTRADE_rev - COMTRADE revision: '1999' or '2013'
 * @returns {AnalogChannel[]} returns.analogChannels - Array of analog channel objects
 * @returns {DigitalChannel[]} returns.digitalChannels - Array of digital channel objects
 * @returns {SamplingRate[]} returns.samplingRates - Array of sampling rate definitions (CRITICAL for interpolation)
 * @returns {string} returns.ft - File type: 'ASCII' or 'BINARY'
 * @returns {number} returns.baseMicroseconds - Start time in microseconds since midnight
 * @returns {number} returns.startDay - Start day (1-31)
 * @returns {number} returns.startMonth - Start month (1-12)
 * @returns {number} returns.startYear - Start year (4-digit)
 * @returns {number} returns.startHour - Start hour (0-23)
 * @returns {number} returns.startMinute - Start minute (0-59)
 * @returns {number} returns.startSecond - Start second (0-59)
 * @returns {number} returns.startMicrosecond - Start microsecond (0-999999)
 * @returns {number} returns.timemult - Time multiplier from CFG (default 1 if 0)
 * @returns {string} returns.timeUnit - Requested time unit for display
 * @returns {string|null} returns.timeCode - [2013 only] Time code designation
 * @returns {string|null} returns.localCode - [2013 only] Local code designation
 * @returns {string|null} returns.tmqCode - [2013 only] Time quality code
 * @returns {number|null} returns.leapSec - [2013 only] Leap second count
 *
 * @throws {Error} If date/time format is invalid or file structure is malformed
 *
 * @mermaid
 * flowchart TD
 *     A["Input CFG text"] --> B["Split into lines"]
 *     B --> C["Parse header info"]
 *     C --> D["Extract analog channels"]
 *     D --> E["Extract digital channels"]
 *     E --> F["Extract sampling rates<br/>(KEY for interpolation)"]
 *     F --> G["Parse start/trigger times"]
 *     G --> H["Extract timemult & file type"]
 *     H --> I["Parse 2013-specific fields"]
 *     I --> J["Return config object"]
 *     style A fill:#E3F2FD,stroke:#1565C0,color:#000
 *     style F fill:#FFF9C4,stroke:#F57F17,color:#000
 *     style J fill:#C8E6C9,stroke:#2E7D32,color:#000
 *
 * @example
 * // Basic usage
 * const cfg = parseCFG(cfgFileText);
 * console.log(cfg.stationName); // "Station A"
 * console.log(cfg.analogChannels.length); // 4
 * console.log(cfg.samplingRates); // [{ rate: 4000, endSample: 12000 }, ...]
 *
 * @example
 * // Multiple sampling rates
 * const cfg = parseCFG(cfgText);
 * // cfg.samplingRates = [
 * //   { rate: 4000, endSample: 10000 },  // High rate during event
 * //   { rate: 1000, endSample: 20000 }   // Lower rate after event
 * // ]
 * // Used by parseDAT() for accurate uniform timing
 *
 * @algorithm
 * 1. Split CFG text by newlines, parse comma-separated values
 * 2. Row 0: Station name, device ID, COMTRADE revision
 * 3. Row 1: Channel counts (TT = total, A = analog, D = digital)
 * 4. Rows 2 to (2+analogCount-1): Analog channel definitions
 * 5. Rows (2+analogCount) to (2+analogCount+digitalCount-1): Digital channel definitions
 * 6. Next rows: Sampling rate definitions (supports 1 or multiple rates)
 * 7. Near end: Start time, trigger time (MM/DD/YYYY,HH:MM:SS.mmmmmm format)
 * 8. Last rows: Time multiplier, file type, and 2013 extensions
 *
 * @performance O(n) where n = number of lines in CFG file
 *
 * @dependencies
 * - None (pure parsing function)
 *
 * @see {@link parseDAT} - Uses this configuration to parse data values
 * @see {@link calculateTimeFromSampleNumber} - Uses samplingRates from this output
 */
export function parseCFG(cfgText, timeUnit = "microseconds") {
  const rows = cfgText.split(/\r?\n/);
  const cells = rows.map((row) => row.split(",").map((cell) => cell.trim()));
  const lastRowEmpty = cells[cells.length - 1].every((cell) => cell === "")
    ? 1
    : 0;
  // 1️⃣ Parse Header Information
  const [stationName, deviceID, COMTRADE_rev] = cells[0];
  const [channelCount, analogCount, digitalCount] = [
    Number(cells[1][0]),
    Number(cells[1][1].replace("A", "")),
    Number(cells[1][2].replace("D", "")),
  ];
  const comtrade_revoffset =
    COMTRADE_rev == "1999" ? 0 : COMTRADE_rev == "2013" ? 2 : 0;

  // 2️⃣ Parse Analog Channels
  const analogChannels = [];
  for (let i = 2; i < 2 + analogCount; i++) {
    const row = cells[i];
    analogChannels.push({
      index: parseInt(row[0]),
      id: row[1],
      phase: row[2],
      component: row[3],
      unit: row[4],
      multiplier: parseFloat(row[5]),
      offset: parseFloat(row[6]),
      skew: parseFloat(row[7]),
      min: parseFloat(row[8]),
      max: parseFloat(row[9]),
      primary: parseFloat(row[10]),
      secondary: parseFloat(row[11]),
      reference: row[12],
    });
  }

  // 3️⃣ Parse Digital Channels
  const digitalChannels = [];
  for (let i = 2 + analogCount; i < 2 + analogCount + digitalCount; i++) {
    const row = cells[i];
    digitalChannels.push({
      index: parseInt(row[0]),
      id: row[1],
      phase: row[2],
      component: row[3],
      normalState: row[4] === "1",
    });
  }

  // 4️⃣ Parse Line Frequency and Sampling Rates
  const samplingRates = [];
  const frequencyIndex = 2 + channelCount;
  let frequencyRow = cells[frequencyIndex] || [];
  let nratesIndex = frequencyIndex + 1;
  let nratesRow = cells[nratesIndex] || [];
  const nextRow = cells[nratesIndex + 1] || [];
  const looksLikeStartTime = nextRow.some((cell) => /[/:]/.test(cell));

  if (nratesRow.length >= 2 && frequencyRow.length <= 1 && looksLikeStartTime) {
    nratesIndex = frequencyIndex;
    nratesRow = frequencyRow;
    frequencyRow = [];
  }

  const parsedLineFrequency = Number(frequencyRow[0]);
  const lineFrequency = Number.isFinite(parsedLineFrequency) && parsedLineFrequency > 0
    ? parsedLineFrequency
    : null;

  const parsedNrates = Number(nratesRow[0]);
  const nrates = Number.isFinite(parsedNrates) ? parsedNrates : 0;
  const firstRateIndex = nratesIndex + 1;

  if (nrates <= 0) {
    const fallbackRow = cells[firstRateIndex] || [];
    const rate = Number(fallbackRow[0]);
    const endSample = Number(fallbackRow[1]);
    if (Number.isFinite(rate) || Number.isFinite(endSample)) {
      samplingRates.push({
        rate: Number.isFinite(rate) ? rate : 0,
        endSample: Number.isFinite(endSample) ? endSample : 0,
      });
    }
  } else {
    for (let i = 0; i < nrates; i += 1) {
      const row = cells[firstRateIndex + i];
      if (!row) break;
      const rate = Number(row[0]);
      const endSample = Number(row[1]);
      if (!Number.isFinite(rate) && !Number.isFinite(endSample)) {
        continue;
      }
      samplingRates.push({
        rate: Number.isFinite(rate) ? rate : 0,
        endSample: Number.isFinite(endSample) ? endSample : 0,
      });
    }
  }

  // 5️⃣ Parse Start Time and Trigger Time
  const timeLines = rows.slice(
    -4 - lastRowEmpty - comtrade_revoffset,
    -2 - lastRowEmpty - comtrade_revoffset
  );
  const dateRegex =
    /^\d{1,2}\/\d{1,2}\/\d{2,4},\d{1,2}:\d{1,2}:\d{1,2}\.\d{0,12}$/;
  if (
    !dateRegex.test(timeLines[0].trim()) ||
    !dateRegex.test(timeLines[1].trim())
  ) {
    throw new Error(
      "Invalid or missing start time and trigger time in CFG file."
    );
  }

  const parseTime = (timeLine) => {
    const [datePart, timePart] = timeLine.split(",");
    const [day, month, year] = datePart.split("/").map(Number);
    const [hour, minute, secMicro] = timePart.split(":");
    const [second, micro = "000000"] = secMicro.split(".");

    // Convert time components into microseconds
    const totalMicroseconds =
      ((hour * 60 + minute) * 60 + parseInt(second)) * 1e6 +
      parseInt(micro.padEnd(6, "0"));

    return {
      totalMicroseconds, // microseconds since midnight
      day,
      month,
      year,
      hour: Number(hour),
      minute: Number(minute),
      second: Number(second),
      microsecond: Number(micro.padEnd(6, "0")),
    };
  };

  const startTimeObj = parseTime(timeLines[0]);
  const triggerTimeObj = parseTime(timeLines[1]);

  // 6️⃣ Parse Time Multiplier and File Type
  const timemult = isNaN(
    cells[rows.length - 1 - lastRowEmpty - comtrade_revoffset][0]
  )
    ? 0
    : parseFloat(cells[rows.length - 1 - lastRowEmpty - comtrade_revoffset][0]);
  const ft = cells[rows.length - 2 - lastRowEmpty - comtrade_revoffset][0];

  // 7️⃣ Parse 2013-specific fields: time_code, local_code, tmq_code, leapsec
  let timeCode = null,
    localCode = null,
    tmqCode = null,
    leapSec = null;
  if (COMTRADE_rev == "2013") {
    // time_code, local_code
    const timeCodeLine = rows[rows.length - 1 - 1 - lastRowEmpty]
      .split(",")
      .map((s) => s.trim());
    timeCode = timeCodeLine[0] || null;
    localCode = timeCodeLine[1] || null;
    // tmq_code, leapsec
    const tmqLine = rows[rows.length - 1 - lastRowEmpty]
      .split(",")
      .map((s) => s.trim());
    tmqCode = tmqLine[0] || null;
    leapSec = tmqLine[1] || null;
  }

  // Return Parsed Configuration
  return {
    stationName,
    deviceID,
    COMTRADE_rev,
    analogChannels,
    digitalChannels,
    samplingRates,
    lineFrequency,
    ft,
    baseMicroseconds: startTimeObj.totalMicroseconds,
    startDay: startTimeObj.day,
    startMonth: startTimeObj.month,
    startYear: startTimeObj.year,
    startHour: startTimeObj.hour,
    startMinute: startTimeObj.minute,
    startSecond: startTimeObj.second,
    startMicrosecond: startTimeObj.microsecond,
    timemult,
    timeUnit,
    // 2013-specific fields
    timeCode,
    localCode,
    tmqCode,
    leapSec,
  };
}

/**
 * Parse a COMTRADE .DAT data file with LINEAR INTERPOLATION support
 *
 * @function parseDAT
 * @category COMTRADE Parsing / File I/O
 * @since 1.0.0
 *
 * @description
 * Parses COMTRADE .DAT data file in ASCII or BINARY format. Implements linear
 * interpolation to create **uniform time spacing** using sampling rates from CFG,
 * instead of relying on potentially non-uniform timestamps in the DAT file.
 *
 * **KEY FEATURE - Linear Interpolation for Multi-Rate Support:**
 * - Reads sample number and ignores DAT file timestamps
 * - Uses cfg.samplingRates to calculate precise uniform time: time = sampleNumber / rate
 * - Supports seamless transitions between different sampling rates
 * - Result: Consistent X-axis scaling for charts regardless of rate changes
 * - Enables perfect vertical line alignment when comparing files with different rates
 *
 * **File Format Support:**
 * - ASCII: Comma-separated values, space-trimmed
 * - BINARY: Little-endian 32-bit integers and 16-bit shorts
 * - Both formats skip DAT timestamps and use sample-based interpolation
 *
 * **Data Extraction:**
 * - Analog values: Retrieved from CFG column positions, missing values stored as 99999
 * - Digital values: Stored as 0 or 1, invalid stored as 0
 * - Channel arrays: Parallel arrays indexed by channel order from CFG
 *
 * @param {string|Buffer} datContent - Raw content of the .DAT file
 *                                      - string for ASCII format
 *                                      - Buffer for BINARY format
 * @param {Object} cfg - Parsed COMTRADE configuration from parseCFG()
 * @param {SamplingRate[]} cfg.samplingRates - Sampling rate array (CRITICAL for interpolation)
 * @param {AnalogChannel[]} cfg.analogChannels - Analog channel definitions
 * @param {DigitalChannel[]} cfg.digitalChannels - Digital channel definitions
 * @param {number} cfg.baseMicroseconds - Start time reference
 * @param {string} ft - File type: 'ASCII' or 'BINARY' (from cfg.ft or override)
 * @param {string} [timeUnit='microseconds'] - Output time unit:
 *                                             - 'seconds': Divide by 1,000,000
 *                                             - 'milliseconds': Divide by 1,000
 *                                             - 'microseconds': No conversion
 *
 * @returns {Object} Parsed data object
 * @returns {number[]} returns.time - Array of uniformly-spaced time values (created via interpolation)
 * @returns {number[][]} returns.analogData - 2D array [channelIdx][sampleIdx] of analog values
 * @returns {number[][]} returns.digitalData - 2D array [channelIdx][sampleIdx] of digital values (0 or 1)
 * @returns {Object} returns.startDateInfo - Start date/time reference information
 * @returns {number} returns.startDateInfo.day - Day (1-31)
 * @returns {number} returns.startDateInfo.month - Month (1-12)
 * @returns {number} returns.startDateInfo.year - Year (4-digit)
 * @returns {number} returns.startDateInfo.hour - Hour (0-23)
 * @returns {number} returns.startDateInfo.minute - Minute (0-59)
 * @returns {number} returns.startDateInfo.second - Second (0-59)
 * @returns {number} returns.startDateInfo.microsecond - Microsecond (0-999999)
 *
 * @throws {Error} If file format is invalid or data is insufficient
 *
 * @mermaid
 * flowchart TD
 *     A["Input DAT content + CFG"] --> B["Determine format:<br/>ASCII or BINARY"]
 *     B -->|ASCII| C["Split by newlines"]
 *     B -->|BINARY| D["Create DataView"]
 *     C --> E["For each line/record"]
 *     D --> E
 *     E --> F["Extract sample number"]
 *     F --> G["Calculate time using<br/>LINEAR INTERPOLATION<br/>(sample/rate)<br/>KEY FEATURE ⭐"]
 *     G --> H["Extract analog values<br/>from CFG positions"]
 *     H --> I["Extract digital values<br/>and mask bits"]
 *     I --> J["Append to arrays"]
 *     J --> K{"More<br/>records?"}
 *     K -->|Yes| E
 *     K -->|No| L["Return time, analogData,<br/>digitalData, startDateInfo"]
 *     style A fill:#E3F2FD,stroke:#1565C0,color:#000
 *     style G fill:#FFF9C4,stroke:#F57F17,color:#000,font-weight:bold
 *     style L fill:#C8E6C9,stroke:#2E7D32,color:#000
 *
 * @example
 * // Parse ASCII format file
 * const { time, analogData, digitalData } = parseDAT(asciiContent, cfg, 'ASCII', 'seconds');
 * console.log(time[0]); // 0 (start time in seconds)
 * console.log(time[1]); // 0.00025 (1/4000 Hz at 4000 Hz sampling)
 * console.log(analogData[0].length); // 100000 (samples for channel 0)
 *
 * @example
 * // Parse BINARY format file
 * const { time, analogData } = parseDAT(binaryBuffer, cfg, 'BINARY');
 * // time array will be uniform: [0, 0.00025, 0.0005, 0.00075, ...]
 * // regardless of timestamps in binary file
 *
 * @example
 * // Multi-rate file support
 * // cfg.samplingRates = [
 * //   { rate: 4000, endSample: 12000 },  // Samples 0-12000 at 4000 Hz
 * //   { rate: 1000, endSample: 20000 }   // Samples 12001-20000 at 1000 Hz
 * // ]
 * const { time } = parseDAT(content, cfg, 'ASCII');
 * // time[12000] = 3.0 seconds (12000/4000)
 * // time[13000] = 13.0 seconds (1000 + 12000/1000) ← smooth transition
 *
 * @algorithm
 * **Linear Interpolation Implementation:**
 * 1. For each sample record:
 *    a. Extract sampleNumber from record header
 *    b. Call calculateTimeFromSampleNumber(sampleNumber, cfg.samplingRates)
 *    c. This function finds applicable rate and returns: time = sampleNumber / rate
 *    d. Result: Perfectly uniform time spacing
 * 2. Supports rate changes mid-file:
 *    - samplingRates array defines boundaries (endSample values)
 *    - When sampleNumber <= endSample[i], use rate[i]
 *    - Enables smooth transitions between different sampling periods
 *
 * **ASCII Format:**
 * - Each line: sampleNumber,timestamp,analog1,analog2,...,digital1,digital2,...
 * - Parse by comma split and value extraction
 * - Skip timestamp, use sampleNumber for interpolation
 *
 * **BINARY Format:**
 * - Record: [sampleNumber:uint32][timestamp:uint32][analogs:int16*N][digitals:uint16*M]
 * - Parse using DataView with little-endian byte order
 * - Each analog: 2 bytes signed integer
 * - Digital: 16 channels per 2-byte word, extract via bit masking
 *
 * @performance
 * - ASCII: O(n) where n = number of samples (linear scan)
 * - BINARY: O(n) with lower constant factor (byte array access)
 * - Interpolation lookup: O(m) where m = number of rate changes (typically 1-3)
 *
 * @dependencies
 * - {@link calculateTimeFromSampleNumber} - Implements the linear interpolation
 * - cfg.samplingRates - Must be populated by parseCFG()
 * - cfg.analogChannels - Channel count and positions
 * - cfg.digitalChannels - Channel count and positions
 *
 * @see {@link parseCFG} - Must be called first to generate cfg parameter
 * @see {@link calculateTimeFromSampleNumber} - Core interpolation function
 * @see {@link findSamplingRateForSample} - Finds rate for a given sample number
 *
 * @testcase
 * Input: ASCII file with 4000 Hz sampling, 4 analog channels
 * Expected: time = [0, 0.00025, 0.0005, ...], uniform spacing of 250µs
 *
 * @testcase
 * Input: BINARY file, rate changes from 4000 Hz to 1000 Hz at sample 10000
 * Expected: Smooth transition at boundary, no discontinuities
 *
 * @testcase
 * Input: File with missing analog values (99999 in ASCII)
 * Expected: Preserved as-is for chart rendering to handle
 *
 * @note
 * DAT file timestamps are **intentionally ignored** in favor of sample-based
 * interpolation. This ensures chart consistency regardless of DAT file content.
 */
export function parseDAT(datContent, cfg, ft, timeUnit = "microseconds") {
  const time = [];
  //  console.log(`COMTRADE: Parsing DAT file...`,ft);
  const analogData = cfg.analogChannels.map(() => []);
  const digitalData = cfg.digitalChannels.map(() => []);

  // Helper to convert microseconds to desired unit
  function convertTime(us) {
    if (timeUnit === "seconds") return us / 1e6;
    if (timeUnit === "milliseconds") return us / 1e3;
    return us; // microseconds
  }

  // Reference start date/time info from cfg
  const startDateInfo = {
    day: cfg.startDay,
    month: cfg.startMonth,
    year: cfg.startYear,
    hour: cfg.startHour,
    minute: cfg.startMinute,
    second: cfg.startSecond,
    microsecond: cfg.startMicrosecond,
  };
  const timemult = cfg.timemult == 0 ? 1 : cfg.timemult; // Time multiplier from CFG
  //console.log(`COMTRADE: Time Multiplier =`, timemult,cfg.timemult);

  // DEBUG: Log sampling rates and configuration
  // console.log(`[parseDAT] CFG sampling rates:`, cfg.samplingRates);
  // console.log(
  //   `[parseDAT] Analog channels: ${cfg.analogChannels.length}, Digital channels: ${cfg.digitalChannels.length}`
  // );
  // console.log(`[parseDAT] File type: ${ft}`);

  if (ft === "ASCII") {
    // Parse ASCII format
    const lines = datContent.trim().split(/\r?\n/);
    let parseCount = 0;

    lines.forEach((line) => {
      const parts = line
        .trim()
        .split(",")
        .map((val) => val.trim());
      if (
        parts.length <
        2 + cfg.analogChannels.length + cfg.digitalChannels.length
      )
        return;

      // Parse sample number
      const sampleNumber = parseInt(parts[0]);
      parseCount++;

      // Calculate uniform time using sampling rate (linear interpolation)
      const timeSeconds = calculateTimeFromSampleNumber(
        sampleNumber,
        cfg.samplingRates
      );
      const relTimeMicroSec = timeSeconds * 1e6; // Convert to microseconds

      time.push(relTimeMicroSec); // Store in microseconds (uniform spacing)

      // DEBUG: Log first few and every 10000th sample (DISABLED for performance)
      // if (parseCount <= 5 || parseCount % 10000 === 0) {
      //   console.log(
      //     `[parseDAT] Sample ${parseCount}: sampleNumber=${sampleNumber}, timeSeconds=${timeSeconds}, relTimeMicroSec=${relTimeMicroSec}`
      //   );
      // }

      // Parse analog data
      cfg.analogChannels.forEach((ch, idx) => {
        const analogValue = parseFloat(parts[2 + idx]);
        analogData[idx].push(isNaN(analogValue) ? 99999 : analogValue); // Missing values = 99999
      });

      // Parse digital data
      cfg.digitalChannels.forEach((ch, idx) => {
        const digitalValue = parseInt(
          parts[2 + cfg.analogChannels.length + idx]
        );
        digitalData[idx].push(digitalValue === 1 ? 1 : 0); // Only valid values are 0 or 1
      });
    });

    // DEBUG: Log final results
    console.log(
      `[parseDAT] ASCII parsing complete. Total samples: ${parseCount}`
    );
    console.log(`[parseDAT] Time array length: ${time.length}`);
    if (time.length > 0) {
      console.log(
        `[parseDAT] Time array first 10 values (μs):`,
        time.slice(0, 10)
      );
      console.log(`[parseDAT] Time array last 5 values (μs):`, time.slice(-5));
    }
  } else if (ft === "BINARY") {
    // Parse Binary format using ArrayBuffer and DataView
    const dataView = new DataView(datContent);
    let offset = 0;

    while (offset < dataView.byteLength) {
      // Ensure there is enough data for sample number and timestamp (8 bytes)
      if (offset + 8 > dataView.byteLength) {
        console.error("Insufficient data for sample number and timestamp.");
        break;
      }

      // Parse sample number (4 bytes, unsigned)
      const sampleNumber = dataView.getUint32(offset, true); // Little-endian
      offset += 4;

      // Skip timestamp (4 bytes, unsigned) - not used for interpolation
      const timestampRaw = dataView.getUint32(offset, true); // Little-endian (ignored)
      offset += 4;

      // Calculate uniform time using sampling rate (linear interpolation)
      const timeSeconds = calculateTimeFromSampleNumber(
        sampleNumber,
        cfg.samplingRates
      );
      const relTimeSec = timeSeconds; // Already in seconds
      time.push(relTimeSec);

      // Ensure there is enough data for analog channels
      const analogDataSize = cfg.analogChannels.length * 2; // 2 bytes per analog channel
      if (offset + analogDataSize > dataView.byteLength) {
        console.error("Insufficient data for analog channels.");
        break;
      }

      // Parse analog data (2 bytes each, signed)
      cfg.analogChannels.forEach((ch, idx) => {
        const analogValue = dataView.getInt16(offset, true); // Little-endian
        analogData[idx].push(analogValue === -32768 ? 99999 : analogValue); // Missing values = 0x8000
        offset += 2;
      });

      // Ensure there is enough data for digital channels
      const digitalWords = Math.ceil(cfg.digitalChannels.length / 16);
      const digitalDataSize = digitalWords * 2; // 2 bytes per 16 digital channels
      if (offset + digitalDataSize > dataView.byteLength) {
        console.error("Insufficient data for digital channels.");
        break;
      }

      // Parse digital data (grouped in 2 bytes for every 16 channels)
      for (let i = 0; i < digitalWords; i++) {
        const digitalWord = dataView.getUint16(offset, true); // Little-endian
        for (let bit = 0; bit < 16; bit++) {
          const channelIndex = i * 16 + bit;
          if (channelIndex < cfg.digitalChannels.length) {
            const digitalValue = (digitalWord >> bit) & 1;
            digitalData[channelIndex].push(digitalValue);
          }
        }
        offset += 2;
      }
    }
  } else {
    throw new Error("Unsupported file type. Must be 'ASCII' or 'BINARY'.");
  }

  // Ensure time array is in microseconds for consistency across ASCII and BINARY formats
  // ASCII stores time in microseconds directly
  // BINARY stores time in seconds, so convert it to microseconds
  const normalizedTime =
    ft === "BINARY"
      ? time.map((t) => t * 1e6) // Convert seconds to microseconds
      : time; // Already in microseconds from ASCII

  // console.log(`COMTRADE-parseDAT: Parsed ${time.length} timestamps.`);
  // console.log(`COMTRADE-parseDAT: Parsed ${analogData.length} analog channels.`);
  // console.log(`COMTRADE-parseDAT: Parsed ${digitalData.length} digital channels.`);
  // console.log("Time=",time,"Analog=",analogData,"Digital=",digitalData);
  return { time: normalizedTime, analogData, digitalData, startDateInfo };
}
