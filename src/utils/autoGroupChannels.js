/**
 * @file autoGroupChannels.js
 * @module utils/autoGroupChannels
 * 
 * @description
 * <h3>Automatic Channel Grouping Utilities</h3>
 * 
 * <p>Intelligently groups COMTRADE channels based on naming patterns.
 * Designed for protection relays (SEL, ABB, Siemens, GE) and power quality meters.</p>
 * 
 * <h4>Purpose</h4>
 * <p>COMTRADE files can contain dozens or hundreds of channels.
 * This module auto-groups related channels for organized visualization:</p>
 * 
 * <table>
 *   <tr><th>Channel Type</th><th>Example Inputs</th><th>Result</th></tr>
 *   <tr><td>Currents</td><td>IA, IB, IC, IN</td><td>→ One chart</td></tr>
 *   <tr><td>Voltages</td><td>VA, VB, VC, VN</td><td>→ One chart</td></tr>
 *   <tr><td>Protection</td><td>TRIP, CLOSE, 52A</td><td>→ One chart</td></tr>
 *   <tr><td>Power Quality</td><td>SAG, SWELL, HARM</td><td>→ Grouped by type</td></tr>
 * </table>
 * 
 * <h4>Grouping Strategy</h4>
 * <ol>
 *   <li><strong>Pattern Matching</strong> — Match against known naming conventions</li>
 *   <li><strong>User Override</strong> — User-defined groups take priority</li>
 *   <li><strong>Catch-All</strong> — Unmatched channels go to default group</li>
 * </ol>
 * 
 * <h4>Supported Patterns</h4>
 * <p><strong>Analog:</strong></p>
 * <ul>
 *   <li><code>IA</code>, <code>IB</code>, <code>IC</code>, <code>IN</code> — Phase currents</li>
 *   <li><code>VA</code>, <code>VB</code>, <code>VC</code>, <code>VN</code> — Phase voltages</li>
 *   <li><code>IL1</code>, <code>IL2</code>, <code>IL3</code> — Line currents (IEC)</li>
 *   <li><code>UL1</code>, <code>UL2</code>, <code>UL3</code> — Line voltages (IEC)</li>
 * </ul>
 * 
 * <p><strong>Digital:</strong></p>
 * <ul>
 *   <li><code>TRIP</code>, <code>FAULT</code>, <code>BLOCK</code> — Protection events</li>
 *   <li><code>52A</code>, <code>52B</code> — Breaker status</li>
 *   <li><code>OUT</code>, <code>IN</code>, <code>RMB</code>, <code>TMB</code> — I/O signals</li>
 *   <li><code>SV</code>, <code>DP</code>, <code>VB</code> — IEC 61850</li>
 * </ul>
 * 
 * <p><strong>Power Quality:</strong></p>
 * <ul>
 *   <li><code>SAG</code>, <code>SWELL</code>, <code>INT</code> — Voltage events</li>
 *   <li><code>HARM02</code>-<code>HARM15</code> — Harmonics</li>
 *   <li><code>ITIC</code> — ITIC curve violations</li>
 * </ul>
 * 
 * @see {@link module:components/renderComtradeCharts}
 * @see {@link module:components/renderSingleAnalogChart}
 * @see {@link module:components/renderSingleDigitalChart}
 * 
 * @example
 * // Auto-group analog channels
 * import { autoGroupChannels } from "./autoGroupChannels.js";
 * 
 * const channels = [
 *   { id: "IA" }, { id: "IB" }, { id: "IC" },
 *   { id: "VA" }, { id: "VB" }, { id: "VC" }
 * ];
 * 
 * const groups = autoGroupChannels(channels);
 * // { "G0": [0, 1, 2], "G1": [3, 4, 5] }
 * // G0 = Currents, G1 = Voltages
 * 
 * @example
 * // User-defined groups with fallback
 * import { buildChannelGroups } from "./autoGroupChannels.js";
 * 
 * const userGroups = ["Currents", "Currents", "Currents", "", "", ""];
 * const groups = buildChannelGroups(userGroups, channels);
 * // { "Currents": [0, 1, 2], "G0": [3, 4, 5] }
 * 
 * @mermaid
 * graph TD
 *     A[Input: channels array] --> B{User groups?}
 *     B -->|Yes| C[Build from user assignments]
 *     B -->|No| D[autoGroupChannels]
 *     D --> E[Match GROUP_PATTERNS]
 *     E --> F[Create groups]
 *     F --> G[Remaining → catch-all]
 *     C --> H[Return groups object]
 *     G --> H
 */

/**
 * Channel grouping patterns for automatic grouping.
 * Each pattern is a regex that matches specific channel naming conventions.
 * Patterns are processed in order - first match wins.
 * 
 * @constant {Object[]}
 * @property {RegExp} regex - Regular expression to match channel IDs
 * 
 * @example
 * // Pattern matching examples:
 * // /^I[ABCN]$/i  matches: IA, IB, IC, IN (case insensitive)
 * // /^V[ABCN]$/i  matches: VA, VB, VC, VN
 * // /^HARM\d+$/i matches: HARM02, HARM03, HARM15
 */
const GROUP_PATTERNS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // ANALOG PATTERNS
  // ═══════════════════════════════════════════════════════════════════════════
  // Currents (Phase A, B, C, N)
  { regex: /^I[ABCN]$/i },
  { regex: /^I_[ABCN]$/i },
  { regex: /^IL[1234N]$/i },
  { regex: /^CUR_[ABCN]$/i },
  
  // Voltages (Phase & Line)
  { regex: /^V[ABCN]$/i },
  { regex: /^V_[ABCN]$/i },
  { regex: /^V(AB|BC|CA)$/i },
  { regex: /^UL[123N]$/i },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITAL PATTERNS - Power Quality (SEL-735, etc.)
  // ═══════════════════════════════════════════════════════════════════════════
  // Harmonics (HARM02-HARM15)
  { regex: /^HARM\d+$/i },
  
  // Voltage Sags (SAGA, SAGB, SAGC, SAG3P, SAGAB, SAGBC, SAGCA)
  { regex: /^SAG[ABC3P]+$/i },
  
  // Swells (SWA, SWB, SWC, SW3P, SWAB, SWBC, SWCA)
  { regex: /^SW[ABC3P]+$/i },
  
  // Interruptions (INTA, INTB, INTC, INT3P, INTAB, INTBC, INTCA)
  { regex: /^INT[ABC3P]+$/i },
  
  // ITIC Curve (ITIC_ND, ITIC_PR, ITIC_SR)
  { regex: /^ITIC/i },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITAL PATTERNS - I/O Signals
  // ═══════════════════════════════════════════════════════════════════════════
  // Outputs (OUT101-OUT404)
  { regex: /^OUT[1-4]\d{2}$/i },
  
  // Inputs (IN101-IN404)
  { regex: /^IN[1-4]\d{2}$/i },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITAL PATTERNS - Communication/Remote Bits
  // ═══════════════════════════════════════════════════════════════════════════
  // Remote bits A (RMB1A-RMB8A)
  { regex: /^RMB\d+A$/i },
  
  // Remote bits B (RMB1B-RMB8B)
  { regex: /^RMB\d+B$/i },
  
  // Transmit bits A (TMB1A-TMB8A)
  { regex: /^TMB\d+A$/i },
  
  // Transmit bits B (TMB1B-TMB8B)
  { regex: /^TMB\d+B$/i },
  
  // Remote bits (RB01-RB16)
  { regex: /^RB\d+$/i },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITAL PATTERNS - Setpoints & Variables
  // ═══════════════════════════════════════════════════════════════════════════
  // Setpoint Variables (SV01-SV16)
  { regex: /^SV\d+$/i },
  
  // Setpoint Variables Triggered (SV01T-SV16T)
  { regex: /^SV\d+T$/i },
  
  // SET commands (SET01-SET16)
  { regex: /^SET\d+$/i },
  
  // RST commands (RST01-RST16)
  { regex: /^RST\d+$/i },
  
  // Latches (LT01-LT16)
  { regex: /^LT\d+$/i },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITAL PATTERNS - SCADA Points
  // ═══════════════════════════════════════════════════════════════════════════
  // SCADA Quality Up (SC01QU-SC16QU)
  { regex: /^SC\d+QU$/i },
  
  // SCADA Quality Down (SC01QD-SC16QD)
  { regex: /^SC\d+QD$/i },
  
  // SCADA Remote (SC01R-SC16R)
  { regex: /^SC\d+R$/i },
  
  // SCADA Load (SC01LD-SC16LD)
  { regex: /^SC\d+LD$/i },
  
  // SCADA Control Up (SC01CU-SC16CU)
  { regex: /^SC\d+CU$/i },
  
  // SCADA Control Down (SC01CD-SC16CD)
  { regex: /^SC\d+CD$/i },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITAL PATTERNS - Data Points & Virtual Bits
  // ═══════════════════════════════════════════════════════════════════════════
  // Data Points (DP01-DP50) - groups of 16
  { regex: /^DP(0[1-9]|1[0-6])$/i },
  { regex: /^DP(1[7-9]|2\d|3[0-2])$/i },
  { regex: /^DP(3[3-9]|4\d|50)$/i },
  
  // Virtual Bits (VB001-VB128) - groups of 32
  { regex: /^VB0(0[1-9]|[12]\d|3[0-2])$/i },
  { regex: /^VB0(3[3-9]|[45]\d|6[0-4])$/i },
  { regex: /^VB0(6[5-9]|[78]\d|9[0-6])$/i },
  { regex: /^VB(09[7-9]|1[01]\d|12[0-8])$/i },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITAL PATTERNS - LEDs & Equations
  // ═══════════════════════════════════════════════════════════════════════════
  // LEDs (T01_LED-T14_LED)
  { regex: /^T\d+_LED$/i },
  
  // Equations (EQA1-EQC4, EQ3P1-EQ3P4)
  { regex: /^EQ[ABC3P]+\d+$/i },
  
  // Pushbuttons (PB01-PB04)
  { regex: /^PB\d+$/i },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITAL PATTERNS - Time Sync & Quality
  // ═══════════════════════════════════════════════════════════════════════════
  // Time Quality (TQUAL1-TQUAL8)
  { regex: /^TQUAL\d+$/i },
  
  // Time Sync (TS10SEC, TS1MIN, TS10MIN, TS2HR, TSDEM, TIMESET)
  { regex: /^(TS\d+\w+|TIMESET|TSDEM)$/i },
  
  // Time Sync Load Points (TSLDP1-TSLDP32)
  { regex: /^TSLDP\d+$/i },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITAL PATTERNS - Alarms & Status
  // ═══════════════════════════════════════════════════════════════════════════
  // Alarms (FALARM, SALARM, HALARM, PQALRM, RPQALRM)
  { regex: /^[A-Z]*ALARM$/i },
  { regex: /^[A-Z]*ALRM$/i },
  
  // Triggers (PMTRIG, TREA1-TREA4)
  { regex: /^(PMTRIG|TREA\d+)$/i },
  
  // KYZ pulses (KYZD1-KYZDT)
  { regex: /^KYZD\w+$/i },
  
  // Errors (ER1-ER3)
  { regex: /^ER\d+$/i },
  
  // Status OK signals (LBOKA, LBOKB, ROKA, ROKB, etc.)
  { regex: /^(LBOK|ROK|CBAD|RBAD)[AB]?$/i },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITAL PATTERNS - Protection Signals
  // ═══════════════════════════════════════════════════════════════════════════
  // Trip signals
  { regex: /^TRIP/i },
  
  // Fault signals
  { regex: /^[DF]?FAULT$/i },
  
  // Block signals
  { regex: /^(BLOCK|BLK|FLTBLK)/i },
  
  // Breaker status (52A, 52B)
  { regex: /^52[AB]?$/i },
];

/**
 * Automatically group channels by pattern matching.
 * Works for BOTH analog and digital channels from COMTRADE files.
 * 
 * **Algorithm:**
 * 1. Iterate through GROUP_PATTERNS in order
 * 2. For each pattern, find all matching channels not yet assigned
 * 3. Create a group (G0, G1, G2...) for each pattern with matches
 * 4. Put all remaining unmatched channels in a final catch-all group
 * 
 * **Pattern Priority:**
 * Patterns are processed in the order defined in GROUP_PATTERNS.
 * This means currents (IA, IB, IC) will always be grouped before
 * voltages (VA, VB, VC) if both exist.
 * 
 * @function autoGroupChannels
 * @memberof module:utils/autoGroupChannels
 * @since 1.0.0
 * 
 * @param {Object[]} channels - Array of channel objects with 'id' property
 * @param {string} channels[].id - Channel identifier used for pattern matching
 * 
 * @returns {Object<string, number[]>} Groups object mapping group IDs to channel indices
 *   Format: { "G0": [0, 1, 2], "G1": [3, 4, 5], ... }
 * 
 * @example
 * // Auto-group analog channels
 * const channels = [
 *   { id: "IA" }, { id: "IB" }, { id: "IC" },
 *   { id: "VA" }, { id: "VB" }, { id: "VC" },
 *   { id: "Frequency" }
 * ];
 * 
 * const groups = autoGroupChannels(channels);
 * // Result:
 * // {
 * //   "G0": [0, 1, 2],  // Currents: IA, IB, IC
 * //   "G1": [3, 4, 5],  // Voltages: VA, VB, VC
 * //   "G2": [6]         // Unmatched: Frequency
 * // }
 * 
 * @example
 * // Auto-group digital channels
 * const digitalChannels = [
 *   { id: "TRIP" }, { id: "CLOSE" },
 *   { id: "SAGA" }, { id: "SAGB" }, { id: "SAGC" },
 *   { id: "OUT101" }, { id: "OUT102" }
 * ];
 * 
 * const groups = autoGroupChannels(digitalChannels);
 * // Result:
 * // {
 * //   "G0": [2, 3, 4],  // SAG signals
 * //   "G1": [5, 6],     // Outputs
 * //   "G2": [0, 1]      // Unmatched: TRIP, CLOSE
 * // }
 * 
 * @mermaid
 * graph TD
 *     A[channels array] --> B[Initialize empty groups]
 *     B --> C[For each pattern in GROUP_PATTERNS]
 *     C --> D{Channels match pattern?}
 *     D -->|Yes| E[Add to new group Gn]
 *     D -->|No| C
 *     E --> C
 *     C --> F[Collect remaining unmatched]
 *     F --> G{Any remaining?}
 *     G -->|Yes| H[Add to final group]
 *     G -->|No| I[Return groups]
 *     H --> I
 */
export function autoGroupChannels(channels) {
  if (!channels?.length) return {};
  
  const groups = {};
  const usedIndices = new Set();
  let groupNum = 0;
  
  // Match channels against patterns
  for (const pattern of GROUP_PATTERNS) {
    const indices = [];
    
    channels.forEach((ch, idx) => {
      if (!usedIndices.has(idx) && pattern.regex.test(ch.id)) {
        indices.push(idx);
        usedIndices.add(idx);
      }
    });
    
    if (indices.length > 0) {
      groups[`G${groupNum}`] = indices;
      groupNum++;
    }
  }
  
  // Remaining unmatched channels → next group
  const remaining = channels
    .map((_, idx) => idx)
    .filter(idx => !usedIndices.has(idx));
  
  if (remaining.length > 0) {
    groups[`G${groupNum}`] = remaining;
  }
  
  return groups;
}

/**
 * Get the next available group number from existing groups.
 * Finds the highest existing group number and returns +1.
 * 
 * @function getNextGroupNum
 * @private
 * @param {Object<string, number[]>} groups - Existing groups object
 * @returns {number} Next available group number
 * 
 * @example
 * getNextGroupNum({ "G0": [0,1], "G2": [2,3] });  // Returns 3
 * getNextGroupNum({});                              // Returns 0
 * getNextGroupNum({ "Currents": [0,1] });           // Returns 0 (no Gn pattern)
 */
function getNextGroupNum(groups) {
  if (!groups || Object.keys(groups).length === 0) return 0;
  
  const nums = Object.keys(groups)
    .map(g => parseInt(g.replace('G', ''), 10))
    .filter(n => !isNaN(n));
  
  return nums.length > 0 ? Math.max(...nums) + 1 : 0;
}

/**
 * Build channel groups from user assignments OR fall back to auto-grouping.
 * This is the primary entry point for channel grouping in the application.
 * 
 * **Priority:**
 * 1. If user has assigned ANY groups, use user assignments
 * 2. Unassigned channels in user mode go to a new auto-numbered group
 * 3. If no user assignments, fall back to autoGroupChannels()
 * 
 * **User Group Format:**
 * User groups are stored as a per-channel array where each element is the
 * group ID for that channel index. Empty strings mean "unassigned".
 * 
 * @function buildChannelGroups
 * @memberof module:utils/autoGroupChannels
 * @since 1.0.0
 * 
 * @param {string[]} userGroups - Per-channel group assignments
 *   Example: ["G0", "G0", "G0", "G1", "G1", "G1", ""]
 *   Empty string "" means channel is unassigned
 * 
 * @param {Object[]} channels - Array of channel objects with 'id' property
 * 
 * @returns {Object<string, number[]>} Groups object mapping group IDs to channel indices
 * 
 * @example
 * // User-defined groups with some unassigned
 * const userGroups = ["Currents", "Currents", "Currents", "", "", ""];
 * const channels = [
 *   { id: "IA" }, { id: "IB" }, { id: "IC" },
 *   { id: "VA" }, { id: "VB" }, { id: "VC" }
 * ];
 * 
 * const groups = buildChannelGroups(userGroups, channels);
 * // Result:
 * // {
 * //   "Currents": [0, 1, 2],  // User-assigned
 * //   "G0": [3, 4, 5]         // Auto-assigned unassigned channels
 * // }
 * 
 * @example
 * // No user groups - falls back to auto-grouping
 * const groups = buildChannelGroups([], channels);
 * // Same as: autoGroupChannels(channels)
 * 
 * @example
 * // All channels user-assigned
 * const userGroups = ["A", "A", "A", "B", "B", "B"];
 * const groups = buildChannelGroups(userGroups, channels);
 * // Result: { "A": [0, 1, 2], "B": [3, 4, 5] }
 * 
 * @mermaid
 * graph TD
 *     A[userGroups, channels] --> B{Any user groups?}
 *     B -->|Yes| C[Build from user assignments]
 *     B -->|No| D[autoGroupChannels]
 *     C --> E{Unassigned channels?}
 *     E -->|Yes| F[Add to new group Gn]
 *     E -->|No| G[Return groups]
 *     F --> G
 *     D --> G
 */
export function buildChannelGroups(userGroups, channels) {
  const hasUserGroups = userGroups?.some(g => g && g !== "");
  
  if (hasUserGroups) {
    // Build from user assignments
    const groups = {};
    const unassigned = [];
    
    userGroups.forEach((groupId, idx) => {
      if (groupId && groupId !== "") {
        if (!groups[groupId]) groups[groupId] = [];
        groups[groupId].push(idx);
      } else {
        unassigned.push(idx);
      }
    });
    
    if (unassigned.length > 0) {
      const nextNum = getNextGroupNum(groups);
      groups[`G${nextNum}`] = unassigned;
    }
    
    return groups;
  }
  
  // No user groups → auto-group
  return autoGroupChannels(channels);
}

/**
 * Group uploaded files into CFG/DAT pairs by matching base names.
 * COMTRADE files come in pairs: .CFG (configuration) and .DAT (data).
 * This function matches them by filename prefix.
 * 
 * **Matching Rules:**
 * - Case insensitive matching
 * - Base name must match exactly (before extension)
 * - Both .CFG and .DAT must exist for a valid pair
 * - Unpaired files are ignored
 * 
 * @function groupCfgDatFiles
 * @memberof module:utils/autoGroupChannels
 * @since 1.0.0
 * 
 * @param {File[]} files - Array of File objects from file input or drag-drop
 * 
 * @returns {Object[]} Array of file pair objects
 * @returns {File} returns[].cfg - The CFG file
 * @returns {File} returns[].dat - The DAT file  
 * @returns {string} returns[].baseName - The matched base name (uppercase)
 * 
 * @example
 * // Single pair
 * const files = [
 *   new File([], "event_001.CFG"),
 *   new File([], "event_001.DAT")
 * ];
 * 
 * const pairs = groupCfgDatFiles(files);
 * // Result: [{ cfg: File, dat: File, baseName: "EVENT_001" }]
 * 
 * @example
 * // Multiple pairs with some unmatched
 * const files = [
 *   new File([], "fault_A.cfg"),
 *   new File([], "fault_A.dat"),
 *   new File([], "fault_B.cfg"),
 *   new File([], "fault_B.dat"),
 *   new File([], "orphan.cfg")  // No matching .dat - ignored
 * ];
 * 
 * const pairs = groupCfgDatFiles(files);
 * // Result: [
 * //   { cfg: File, dat: File, baseName: "FAULT_A" },
 * //   { cfg: File, dat: File, baseName: "FAULT_B" }
 * // ]
 * 
 * @mermaid
 * graph TD
 *     A[files array] --> B[Build fileMap by baseName]
 *     B --> C[For each file]
 *     C --> D{Has .CFG or .DAT ext?}
 *     D -->|Yes| E[Add to fileMap baseName]
 *     D -->|No| C
 *     E --> C
 *     C --> F[Find pairs with both CFG and DAT]
 *     F --> G[Return pairs array]
 */
export function groupCfgDatFiles(files) {
  const fileMap = {};

  for (const file of files) {
    const name = file.name.toUpperCase();
    const match = name.match(/^(.+)\.(CFG|DAT)$/);
    if (!match) continue;

    const baseName = match[1];
    const ext = match[2];
    if (!fileMap[baseName]) fileMap[baseName] = {};
    fileMap[baseName][ext] = file;
  }

  const pairs = [];
  for (const baseName in fileMap) {
    const pair = fileMap[baseName];
    if (pair.CFG && pair.DAT) {
      pairs.push({ cfg: pair.CFG, dat: pair.DAT, baseName });
    }
  }
  
  return pairs;
}
