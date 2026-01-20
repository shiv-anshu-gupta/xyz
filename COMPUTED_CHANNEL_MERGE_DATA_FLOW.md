# Computed Channel → Analog Chart Merge Data Flow

## Quick Answer
When a computed channel has been **assigned a group ID** that matches an analog group, the system:
1. **Extracts the group ID** from the first channel in the analog group
2. **Loads computed channels** for that group ID  
3. **Merges metadata** (labels, colors, units) from computed into analog arrays
4. **Includes computed data** in the final chart data array
5. **Renders single chart** with both analog + computed series

---

## Step-by-Step Data Flow

### Phase 1: Group Identification
**Location:** `renderAnalogCharts.js` → `renderSingleAnalogChart.js`

```javascript
// renderSingleAnalogChart.js - Phase 2: Validate Indices
const groupId = extractGroupId(validIndices, userGroups, groupName);
// Returns: "Group_1" or "Group_Phase_A" etc
```

**What happens:**
- Takes the first valid analog channel from the group
- Accesses `userGroups[firstChannelIndex]` to get the group ID
- Example: `userGroups[5]` = "Phase_A" → That's the group ID

**Why it matters:**
- This group ID is the **key** that matches computed channels to analog charts
- Computed channels have a `group` property that must equal this ID

---

### Phase 2: Load Computed Channels
**Location:** `chartDataProcessor.js` → `prepareChartDataContext()`

```javascript
const computedForGroup = loadComputedChannelsForGroup(groupId);
// Returns: [
//   { name: "Phase_A_RMS", data: [...], color: "#FF0000", group: "Phase_A" },
//   { name: "Phase_A_THD", data: [...], color: "#00FF00", group: "Phase_A" }
// ]
```

**What happens:**
1. Takes the `groupId` from Phase 1 (e.g., "Phase_A")
2. Searches `channelState.computedChannels` array
3. Filters for channels where `channel.group === groupId`
4. Returns array of computed channel objects with data arrays

**Data structure returned:**
```javascript
{
  name: string,           // "Phase_A_RMS"
  data: Array<number>,    // [24.5, 24.6, 24.7, ...]
  color: string,          // "#FF0000"
  unit: string,          // "V"
  group: string,         // "Phase_A" (matches analog group)
  equation: string,      // "(ch1 + ch2) / 2"
  computedAt: timestamp
}
```

---

### Phase 3: Merge Dimensions
**Location:** `chartDataProcessor.js` → `computeChartDataDimensions()`

```javascript
const dataContext = computeChartDataDimensions(
  validIndices,      // Analog channel indices: [5, 12, 18]
  data,              // COMTRADE data object
  computedForGroup   // Computed channels for this group
);
```

**What happens:**
1. Counts analog series: `validIndices.length` = 3
2. Counts computed series: `computedForGroup.length` = 2
3. **Total series for chart:** 3 + 2 = 5 series

**Returns:**
```javascript
{
  sampleCount: 10000,           // Total samples in time array
  analogSeriesCount: 3,
  computedSeriesCount: 2,
  totalSeriesCount: 5           // 3 analog + 2 computed
}
```

---

### Phase 4: Build Chart Data Array
**Location:** `groupingUtils.js` → `buildChartData()`

This is where analog and computed data get combined:

```javascript
function buildChartData(timeArray, analogSeriesWithData, data, sampleCount, computedForGroup) {
  const chartData = [timeArray];  // Start: [time, time, time, ...]

  // Step 1: Add analog series
  analogSeriesWithData.forEach((idx) => {
    const series = data.analogData?.[idx];
    chartData.push(series.slice(0, sampleCount));  // Add each analog series
  });
  // Now: [time, analog1, analog2, analog3]

  // Step 2: Add computed series
  computedForGroup.forEach((computedCh) => {
    chartData.push(computedCh.data.slice(0, sampleCount));  // Add computed data
  });
  // Final: [time, analog1, analog2, analog3, computed1, computed2]

  return chartData;
}
```

**Visual:**
```
Chart Data Structure:
┌─────────────────────────────────────────────────┐
│ Index  │ Data          │ Length │ Series Name   │
├─────────────────────────────────────────────────┤
│ [0]    │ timeArray     │ 10000  │ Time (X-axis) │
│ [1]    │ analogData[5] │ 10000  │ Phase_A Volts │
│ [2]    │ analogData[12]│ 10000  │ Phase_A Amps  │
│ [3]    │ analogData[18]│ 10000  │ Phase_A Watts │
│ [4]    │ computed.data │ 10000  │ Phase_A_RMS   │
│ [5]    │ computed.data │ 10000  │ Phase_A_THD   │
└─────────────────────────────────────────────────┘
```

---

### Phase 5: Merge Metadata (Labels, Colors, Units)
**Location:** `groupingUtils.js` → `mergeAnalogAndComputedMetadata()`

```javascript
export function mergeAnalogAndComputedMetadata(
  includedAnalogIndices,  // [5, 12, 18]
  metadata,              // { yLabels: [...], lineColors: [...], yUnits: [...] }
  computedForGroup       // Computed channels for this group
) {
  // Start with analog metadata
  const mergedLabels = [...metadata.yLabels];      // ["V_Phase_A", "A_Phase_A", "W_Phase_A"]
  const mergedColors = [...metadata.lineColors];   // ["#FF0000", "#00FF00", "#0000FF"]
  const mergedUnits = [...metadata.yUnits];        // ["V", "A", "W"]

  // Append computed metadata
  computedForGroup.forEach((computedCh) => {
    mergedLabels.push(computedCh.name);            // Add "Phase_A_RMS"
    mergedColors.push(computedCh.color);           // Add computed color
    mergedUnits.push(computedCh.unit);             // Add "V"
    mergedAxesScales.push(1);
  });

  // Final arrays now have BOTH analog and computed
  return {
    yLabels: [...analog, ...computed],
    lineColors: [...analog, ...computed],
    yUnits: [...analog, ...computed],
    axesScales: [...analog, ...computed]
  };
}
```

**Visual:**
```
Metadata Merge:
BEFORE:
┌──────────────────────────────────────┐
│ yLabels:   ["V_Phase_A", "A_Phase_A", "W_Phase_A"]     │
│ lineColors: ["#FF0000", "#00FF00", "#0000FF"]          │
│ yUnits:    ["V", "A", "W"]                             │
└──────────────────────────────────────┘

AFTER merging computed channels:
┌──────────────────────────────────────────────────────────────────────┐
│ yLabels:   ["V_Phase_A", "A_Phase_A", "W_Phase_A", "Phase_A_RMS", "Phase_A_THD"]  │
│ lineColors: ["#FF0000", "#00FF00", "#0000FF", "#FF6600", "#9900FF"]              │
│ yUnits:    ["V", "A", "W", "V", "%"]                                             │
└──────────────────────────────────────────────────────────────────────┘
```

---

### Phase 6: Create uPlot Options Object
**Location:** `chartCreationUtils.js` → `buildChartOptions()`

```javascript
const options = {
  title: groupName,  // "Phase_A"
  series: [
    { label: "Time" },  // X-axis
    // Analog series options
    { label: "V_Phase_A", stroke: "#FF0000", ... },
    { label: "A_Phase_A", stroke: "#00FF00", ... },
    { label: "W_Phase_A", stroke: "#0000FF", ... },
    // Computed series options (now added)
    { label: "Phase_A_RMS", stroke: "#FF6600", ... },
    { label: "Phase_A_THD", stroke: "#9900FF", ... }
  ],
  axes: [
    { label: "Time (s)" },
    // Y-axes for analog + computed
    { label: "V" },  // For analog
    { label: "A" },  // For analog
    { label: "W" },  // For analog
    { label: "V" },  // For computed RMS
    { label: "%" }   // For computed THD
  ]
};
```

**Key point:** Series array has entries for BOTH analog AND computed

---

### Phase 7: Initialize uPlot with Merged Data
**Location:** `chartCreationUtils.js` → `initializeChartInstance()`

```javascript
const uplotInstance = new uPlot(
  options,           // Contains 5 series definitions (3 analog + 2 computed)
  chartData,         // [time, analog1, analog2, analog3, computed1, computed2]
  chartContainer     // DOM element
);
```

**What uPlot does:**
1. Reads `chartData[0]` as X-axis (time)
2. Reads `chartData[1-5]` as Y series
3. Applies `options.series[1-5]` styling (colors, labels, etc.)
4. Renders all 5 lines on the same chart
5. Creates 5 Y-axes (one per series)

**Result:** Single chart with 5 lines (3 analog + 2 computed) all synchronized on same time axis

---

## Complete Data Flow Diagram

```
User Selects "Phase_A" Group
                    ↓
renderSingleAnalogChart receives:
  - validIndices: [5, 12, 18]
  - userGroups: ["Phase_B", "Phase_A", "Phase_A", ..., "Phase_A"]
  - groupName: "Phase_A"
                    ↓
PHASE 1: extractGroupId(validIndices, userGroups)
  groupId = userGroups[5] = "Phase_A"
                    ↓
PHASE 2: loadComputedChannelsForGroup("Phase_A")
  Returns: [
    {name: "Phase_A_RMS", data: [...], group: "Phase_A"},
    {name: "Phase_A_THD", data: [...], group: "Phase_A"}
  ]
                    ↓
PHASE 3: computeChartDataDimensions(validIndices, data, computedForGroup)
  Returns: {sampleCount: 10000, analogCount: 3, computedCount: 2, totalCount: 5}
                    ↓
PHASE 4: buildChartData(timeArray, [5,12,18], data, 10000, computedForGroup)
  Returns: [
    [time, time, ...],           // Index 0: X-axis
    [24.5, 24.6, ...],           // Index 1: Analog channel 5
    [100.2, 100.1, ...],         // Index 2: Analog channel 12
    [2400, 2410, ...],           // Index 3: Analog channel 18
    [24.55, 24.65, ...],         // Index 4: Computed RMS
    [3.2, 3.1, ...]              // Index 5: Computed THD
  ]
                    ↓
PHASE 5: mergeAnalogAndComputedMetadata(...)
  Returns: {
    yLabels: ["V_A", "A_A", "W_A", "RMS", "THD"],
    lineColors: ["#FF0000", "#00FF00", "#0000FF", "#FF6600", "#9900FF"],
    yUnits: ["V", "A", "W", "V", "%"]
  }
                    ↓
PHASE 6: buildChartOptions(...)
  Creates series array with 5 entries (1 analog time + 3 analog + 2 computed)
                    ↓
PHASE 7: new uPlot(options, chartData, container)
  
  ╔════════════════════════════════════════════════════════════════╗
  ║ Single Chart Instance Rendered                                 ║
  ║ ┌──────────────────────────────────────────────────────────┐  ║
  ║ │  Phase_A                                          Legend  │  ║
  ║ │  2500 ┤     ┌──────                            V_A ████  │  ║
  ║ │  2000 ┤    ╱    ╲     ╱─┐                      A_A ████  │  ║
  ║ │  1500 ┤───╱      ╲───╱  ╲     ← Analog (3 lines)       │  ║
  ║ │  1000 ┤          RMS line  ─── ← Computed (2 lines)    │  ║
  ║ │   500 ┤                    THD ←                         │  ║
  ║ │     0 └────────────────────────────────────────────────┘  ║
  ║ │     0        5        10       15       20   Time (s)      ║
  ║ └──────────────────────────────────────────────────────────┘  ║
  ║ 5 synchronized lines (3 analog + 2 computed) on same chart  ║
  ╚════════════════════════════════════════════════════════════════╝
```

---

## Key Insights

### 1. **Group ID is the Merge Key**
```javascript
// This is the ONLY connection point:
const groupId = userGroups[validIndices[0]];  // From analog group
const computed = computedChannels.filter(ch => ch.group === groupId);  // Match computed by group
```

### 2. **Data Arrays Are Parallel**
Each function receives/returns arrays where **index position matters**:
- Index 0: Always time array (X-axis)
- Indices 1-N: Series in same order as labels/colors/units arrays

### 3. **No Database Queries**
- `loadComputedChannelsForGroup()` does **in-memory filtering**, not database queries
- All computed channels are already loaded in `channelState.computedChannels`
- Just filters by group ID

### 4. **Single Chart, Multiple Series**
- uPlot receives **one merged array** with all analog + computed data
- uPlot creates one chart instance with N series
- All series share same X-axis (time)
- Each series has its own Y-axis (or shared, depending on units)

### 5. **The "Merge" Happens at Array Level**
```javascript
// NOT concatenating objects, but arrays:
chartData = [time, analog1, analog2, analog3, computed1, computed2]
labels = ["V_A", "A_A", "W_A", "Phase_A_RMS", "Phase_A_THD"]
colors = ["#FF0000", "#00FF00", "#0000FF", "#FF6600", "#9900FF"]

// Index positions match:
// Position 0: time / "Time" / (no color)
// Position 1: analog1 / "V_A" / "#FF0000"
// Position 2: analog2 / "A_A" / "#00FF00"
// ...
// Position 4: computed1 / "Phase_A_RMS" / "#FF6600"
```

---

## Example: Full Trace

### Input State
```javascript
// User has:
// - Selected/assigned 3 analog channels to "Phase_A" group (indices 5, 12, 18)
// - Created 2 computed channels assigned to same "Phase_A" group

// renderAnalogCharts receives this group and calls renderSingleAnalogChart:
renderSingleAnalogChart(
  {
    channels: [5, 12, 18],           // Analog indices
    name: "Phase_A",
    computedForGroup: []             // Empty until we load it
  },
  cfg,
  data,
  charts,
  channelState,
  userGroups: ["...", "Phase_A", "...", "Phase_A", "...", "Phase_A"]
)
```

### Execution Trace
```
1. extractGroupId([5, 12, 18], userGroups, "Phase_A")
   → userGroups[5] = "Phase_A"
   → RETURN: "Phase_A"

2. loadComputedChannelsForGroup("Phase_A")
   → Filter: computedChannels.filter(ch => ch.group === "Phase_A")
   → RETURN: [
       {name: "Phase_A_RMS", data: [24.55, 24.65, ...], color: "#FF6600", unit: "V"},
       {name: "Phase_A_THD", data: [3.2, 3.1, ...], color: "#9900FF", unit: "%"}
     ]

3. computeChartDataDimensions([5, 12, 18], data, computedForGroup)
   → analogCount = 3
   → computedCount = 2
   → totalCount = 5
   → RETURN: {sampleCount: 10000, totalSeriesCount: 5}

4. buildChartData(timeArray, [5,12,18], data, 10000, computedForGroup)
   → chartData = [timeArray]
   → chartData += [data.analogData[5], data.analogData[12], data.analogData[18]]
   → chartData += [computedForGroup[0].data, computedForGroup[1].data]
   → RETURN: [time, analog1, analog2, analog3, computed1, computed2]

5. mergeAnalogAndComputedMetadata([5,12,18], metadata, computedForGroup)
   → mergedLabels = ["V_Phase_A", "A_Phase_A", "W_Phase_A", "Phase_A_RMS", "Phase_A_THD"]
   → mergedColors = ["#FF0000", "#00FF00", "#0000FF", "#FF6600", "#9900FF"]
   → mergedUnits = ["V", "A", "W", "V", "%"]
   → RETURN: {yLabels, lineColors, yUnits}

6. buildChartOptions("Phase_A", mergedMetadata, computedForGroup.length + 3)
   → series: [{label:"Time"}, {label:"V_Phase_A"}, {...}, {...}, {...}, {label:"Phase_A_RMS"}, {label:"Phase_A_THD"}]
   → RETURN: options object with 6 series definitions

7. new uPlot(options, chartData, container)
   → uPlot renders 5 lines (indices 1-5 from chartData)
   → Uses colors/labels from options.series[1-5]
   → All synchronized on timeArray
   → RETURN: uplotInstance

8. charts.push(uplotInstance)
   → Store for later interaction sync (vertical lines, etc.)
```

### Output
**Single chart showing:**
- 3 analog voltage/current/power lines
- 2 computed RMS and THD lines
- All synchronized on same time axis
- Each with their own label, color, and Y-axis unit

---

## Validation Points

### Where Group ID is Used
1. **Phase 1:** `extractGroupId()` pulls from `userGroups[firstAnalogIndex]`
2. **Phase 2:** `loadComputedChannelsForGroup(groupId)` uses it to filter
3. **Phase 5:** Series metadata order maintained (computed appended after analog)

### Why It Works
- Computed channels **must have `group` property** matching analog group ID
- The `group` property is set when user **assigns computed channel to group** in UI
- System **assumes group IDs match** between saved computed channels and analog groups
- If group ID doesn't match, computed channel won't load for that group (no error, just skipped)

### Safeguards in Code
```javascript
// In loadComputedChannelsForGroup:
const computed = channelState.computedChannels?.filter(
  ch => ch.group === groupId
) || [];
// If no computed channels match, returns empty array (chart still renders with just analog)

// In buildChartData:
if (Array.isArray(computedCh.data) && computedCh.data.length > 0) {
  // Only adds computed if data exists
}
```

---

## Summary

**The computed channel merges with analog because:**
1. ✅ System **extracts group ID** from first analog channel
2. ✅ System **searches computed channels** for matching group ID
3. ✅ System **merges data arrays** (analog + computed)
4. ✅ System **merges metadata arrays** (labels, colors, units)
5. ✅ System **passes merged arrays** to uPlot
6. ✅ uPlot **renders single chart** with all series synchronized

**Key lesson:** The merge happens at the **array level**, not object level. Each array (chartData, labels, colors, units) has parallel indices that match by position, with computed entries appended after analog entries.
