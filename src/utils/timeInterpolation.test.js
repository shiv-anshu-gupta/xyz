/**
 * @file timeInterpolation.test.js
 * @description Test suite for time interpolation module
 * Run with: node timeInterpolation.test.js
 */

import {
  findSamplingRateForSample,
  calculateTimeFromSampleNumber,
  linearInterpolate,
  generateUniformTimeArray,
  interpolateData,
  compareTimestamps,
  detectUniformSpacing,
} from "./timeInterpolation.js";

// Color codes for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[36m",
};

function assert(condition, testName) {
  if (condition) {
    console.log(`${colors.green}✓${colors.reset} ${testName}`);
    return true;
  } else {
    console.log(`${colors.red}✗${colors.reset} ${testName}`);
    return false;
  }
}

function testSection(title) {
  console.log(`\n${colors.blue}━━━ ${title} ━━━${colors.reset}`);
}

// ============================================================================
// TEST 1: findSamplingRateForSample
// ============================================================================
testSection("TEST 1: findSamplingRateForSample");

let passed = 0;
let total = 0;

// Test 1.1: Single sampling rate
total++;
const samplingRates1 = [{ rate: 4000, endSample: 99999 }];
const rate1 = findSamplingRateForSample(100, samplingRates1);
if (
  assert(rate1 === 4000, "1.1 - Single rate: sample 100 should return 4000 Hz")
)
  passed++;

// Test 1.2: Multiple sampling rates
total++;
const samplingRates2 = [
  { rate: 4000, endSample: 10000 },
  { rate: 1000, endSample: 20000 },
  { rate: 500, endSample: 99999 },
];
const rate2a = findSamplingRateForSample(5000, samplingRates2);
if (
  assert(
    rate2a === 4000,
    "1.2a - Multiple rates: sample 5000 should return 4000 Hz"
  )
)
  passed++;

total++;
const rate2b = findSamplingRateForSample(15000, samplingRates2);
if (
  assert(
    rate2b === 1000,
    "1.2b - Multiple rates: sample 15000 should return 1000 Hz"
  )
)
  passed++;

total++;
const rate2c = findSamplingRateForSample(25000, samplingRates2);
if (
  assert(
    rate2c === 500,
    "1.2c - Multiple rates: sample 25000 should return 500 Hz"
  )
)
  passed++;

// ============================================================================
// TEST 2: calculateTimeFromSampleNumber
// ============================================================================
testSection("TEST 2: calculateTimeFromSampleNumber");

// Test 2.1: Basic calculation (4000 Hz)
total++;
const time0 = calculateTimeFromSampleNumber(0, [
  { rate: 4000, endSample: 99999 },
]);
if (
  assert(Math.abs(time0 - 0) < 0.000001, "2.1a - Sample 0 should be 0 seconds")
)
  passed++;

total++;
const time1 = calculateTimeFromSampleNumber(1, [
  { rate: 4000, endSample: 99999 },
]);
const expected1 = 1 / 4000; // 0.00025
if (
  assert(
    Math.abs(time1 - expected1) < 0.000001,
    `2.1b - Sample 1 should be ${expected1} seconds`
  )
)
  passed++;

total++;
const time100 = calculateTimeFromSampleNumber(100, [
  { rate: 4000, endSample: 99999 },
]);
const expected100 = 100 / 4000; // 0.025
if (
  assert(
    Math.abs(time100 - expected100) < 0.000001,
    `2.1c - Sample 100 should be ${expected100} seconds`
  )
)
  passed++;

// Test 2.2: Different sampling rate (1000 Hz)
total++;
const time1_1kHz = calculateTimeFromSampleNumber(1000, [
  { rate: 1000, endSample: 99999 },
]);
const expected1kHz = 1000 / 1000; // 1.0
if (
  assert(
    Math.abs(time1_1kHz - expected1kHz) < 0.000001,
    `2.2 - Sample 1000 at 1000 Hz should be ${expected1kHz} seconds`
  )
)
  passed++;

// ============================================================================
// TEST 3: linearInterpolate
// ============================================================================
testSection("TEST 3: linearInterpolate");

// Test 3.1: Basic interpolation
total++;
const interp1 = linearInterpolate(0, 10, 4, 20, 2);
if (
  assert(
    Math.abs(interp1 - 15) < 0.000001,
    "3.1 - Interpolate at midpoint: should be 15"
  )
)
  passed++;

// Test 3.2: Quarter point
total++;
const interp2 = linearInterpolate(0, 10, 4, 20, 1);
if (
  assert(
    Math.abs(interp2 - 12.5) < 0.000001,
    "3.2 - Interpolate at 1/4: should be 12.5"
  )
)
  passed++;

// Test 3.3: Three-quarter point
total++;
const interp3 = linearInterpolate(0, 10, 4, 20, 3);
if (
  assert(
    Math.abs(interp3 - 17.5) < 0.000001,
    "3.3 - Interpolate at 3/4: should be 17.5"
  )
)
  passed++;

// Test 3.4: Edge case - x1 == x2
total++;
const interp4 = linearInterpolate(5, 10, 5, 20, 5);
if (assert(interp4 === 10, "3.4 - Edge case x1==x2: should return y1"))
  passed++;

// ============================================================================
// TEST 4: generateUniformTimeArray
// ============================================================================
testSection("TEST 4: generateUniformTimeArray");

// Test 4.1: Generate 10 samples at 4000 Hz
total++;
const timeArray = generateUniformTimeArray(10, [
  { rate: 4000, endSample: 99999 },
]);
if (assert(timeArray.length === 10, "4.1a - Should generate 10 time points"))
  passed++;

total++;
if (
  assert(Math.abs(timeArray[0] - 0) < 0.000001, "4.1b - First time should be 0")
)
  passed++;

total++;
const expectedTime9 = 9 / 4000;
if (
  assert(
    Math.abs(timeArray[9] - expectedTime9) < 0.000001,
    `4.1c - Last time should be ${expectedTime9}`
  )
)
  passed++;

// Test 4.2: Check uniform spacing
total++;
const intervals = [];
for (let i = 1; i < timeArray.length; i++) {
  intervals.push(timeArray[i] - timeArray[i - 1]);
}
const avgInterval = 1 / 4000;
let uniformSpacing = intervals.every(
  (interval) => Math.abs(interval - avgInterval) < 0.000001
);
if (
  assert(
    uniformSpacing,
    "4.2 - All intervals should be uniform (0.00025 seconds)"
  )
)
  passed++;

// ============================================================================
// TEST 5: interpolateData
// ============================================================================
testSection("TEST 5: interpolateData");

// Test 5.1: Interpolate simple data
total++;
const origTimes = [0, 1, 2];
const origData = [10, 15, 20];
const newTimes = [0, 0.5, 1, 1.5, 2];
const interpData = interpolateData(origTimes, origData, newTimes);

if (
  assert(interpData.length === 5, "5.1a - Should return 5 interpolated values")
)
  passed++;

total++;
if (
  assert(
    Math.abs(interpData[0] - 10) < 0.000001,
    "5.1b - First value should be 10"
  )
)
  passed++;

total++;
if (
  assert(
    Math.abs(interpData[1] - 12.5) < 0.000001,
    "5.1c - Value at 0.5 should be 12.5"
  )
)
  passed++;

total++;
if (
  assert(
    Math.abs(interpData[2] - 15) < 0.000001,
    "5.1d - Value at 1 should be 15"
  )
)
  passed++;

// ============================================================================
// TEST 6: compareTimestamps
// ============================================================================
testSection("TEST 6: compareTimestamps");

// Test 6.1: Compare uniform vs non-uniform timestamps
total++;
const fileTs = [0, 1, 2, 6, 7, 8, 10];
const calcTs = [0, 0.00025, 0.0005, 0.00075, 0.001, 0.00125, 0.0015];
const comparison = compareTimestamps(fileTs, calcTs);

if (assert(comparison.hasGaps === true, "6.1a - Should detect gaps")) passed++;

total++;
if (assert(comparison.maxGap > 5, "6.1b - Max gap should be significant (> 5)"))
  passed++;

// ============================================================================
// TEST 7: detectUniformSpacing
// ============================================================================
testSection("TEST 7: detectUniformSpacing");

// Test 7.1: Uniform spacing
total++;
const uniformTimes = [0, 0.00025, 0.0005, 0.00075, 0.001];
const uniformAnalysis = detectUniformSpacing(uniformTimes);

if (
  assert(
    uniformAnalysis.isUniform === true,
    "7.1a - Should detect uniform spacing"
  )
)
  passed++;

total++;
if (
  assert(
    Math.abs(uniformAnalysis.avgInterval - 0.00025) < 0.000001,
    "7.1b - Average interval should be 0.00025"
  )
)
  passed++;

// Test 7.2: Non-uniform spacing
total++;
const nonUniformTimes = [0, 0.001, 0.002, 0.006, 0.007];
const nonUniformAnalysis = detectUniformSpacing(nonUniformTimes);

if (
  assert(
    nonUniformAnalysis.isUniform === false,
    "7.2 - Should detect non-uniform spacing"
  )
)
  passed++;

// ============================================================================
// SUMMARY
// ============================================================================
testSection("TEST SUMMARY");

const percentage = ((passed / total) * 100).toFixed(1);
console.log(
  `\n${colors.blue}Total Tests: ${passed}/${total} (${percentage}%)${colors.reset}`
);

if (passed === total) {
  console.log(`${colors.green}All tests passed! ✓${colors.reset}\n`);
} else {
  console.log(
    `${colors.yellow}${total - passed} test(s) failed${colors.reset}\n`
  );
}

// ============================================================================
// PRACTICAL EXAMPLE: COMTRADE Data Simulation
// ============================================================================
testSection("PRACTICAL EXAMPLE: COMTRADE Simulation");

console.log("\n📊 Simulating COMTRADE data with 4000 Hz sampling rate:");

const cfg = {
  analogChannels: [
    { id: "IA", unit: "A" },
    { id: "IB", unit: "A" },
    { id: "IC", unit: "A" },
  ],
  samplingRates: [{ rate: 4000, endSample: 99999 }],
};

// Simulate DAT file data (non-uniform timestamps)
const datFileTimestamps = [0, 1, 2, 6, 7, 8, 10]; // Non-uniform!
const iaData = [10, 12, 14, 18, 20, 22, 25];

console.log("\n📁 DAT File Timestamps (non-uniform):");
console.log("  ", datFileTimestamps);

// Calculate uniform timestamps
const uniformTimestamps = generateUniformTimeArray(
  datFileTimestamps.length,
  cfg.samplingRates
);
console.log("\n✨ Calculated Uniform Timestamps:");
console.log(
  "  ",
  uniformTimestamps.map((t) => t.toFixed(6))
);

// Compare
const comp = compareTimestamps(datFileTimestamps, uniformTimestamps);
console.log("\n📊 Comparison Analysis:");
console.log("  Has Gaps:", comp.hasGaps);
console.log("  Max Gap:", comp.maxGap.toFixed(6));

// Interpolate data
const newTimestamps = generateUniformTimeArray(7, cfg.samplingRates);
const interpolatedIA = interpolateData(
  datFileTimestamps,
  iaData,
  newTimestamps
);

console.log("\n🔄 Data Interpolation:");
console.log("  Original IA Data:", iaData);
console.log(
  "  Interpolated IA:",
  interpolatedIA.map((v) => v.toFixed(2))
);

// Detect uniformity
const uniformityCheck = detectUniformSpacing(uniformTimestamps);
console.log("\n🎯 Uniformity Check:");
console.log("  Is Uniform:", uniformityCheck.isUniform);
console.log(
  "  Avg Interval:",
  uniformityCheck.avgInterval.toFixed(6),
  "seconds"
);
console.log(
  "  Max Deviation:",
  uniformityCheck.maxDeviation.toFixed(9),
  "seconds"
);
