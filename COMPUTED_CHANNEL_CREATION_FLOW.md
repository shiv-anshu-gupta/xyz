# Computed Channel Creation & Storage Flow

## Overview
When a user creates a computed channel from the **ChannelList (MathLive)**, the data flows through several stages before being saved to **localStorage**. This document explains the complete journey.

---

## Step-by-Step Flow

### **STAGE 1: User Creates Channel in ChannelList**

**Where:** `ChannelList.js`

User clicks on a Computed channel row to open the **MathLive editor**:

```javascript
// ChannelList.js - Line 1253
function openMathLiveEditor(
  latexExpression,
  doc,
  win,
  cfg,
  data
) {
  // Opens MathLive popup editor
  // User enters: sqrt(a0^2 + a1^2)
}
```

**What the user does:**
1. Opens ChannelList popup
2. Clicks on a "Computed" channel row
3. MathLive editor pops up
4. User enters an equation: `sqrt(a0^2 + a1^2)`
5. Clicks "Save" button

---

### **STAGE 2: MathLive Expression Evaluation**

**Where:** `ChannelList.js` - `evaluateAndSaveComputedChannel()` (Line 1067)

```javascript
function evaluateAndSaveComputedChannel(
  latexExpression,    // "sqrt(a0^2 + a1^2)"
  doc,
  win,
  cfg = null,
  data = null
) {
  // Step 1: Get global cfg and data
  let finalCfg = cfg || win?.globalCfg || window?.globalCfg;
  let finalData = data || win?.globalData || window?.globalData;

  // Step 2: Convert LaTeX to MathJS format
  const mathJsExpr = convertLatexToMathJs(latexExpression);
  // "sqrt(a0^2 + a1^2)" → "sqrt(a0 ^ 2 + a1 ^ 2)"

  // Step 3: Compile with math.js
  const compiled = window.math.compile(mathJsExpr);

  // Step 4: Get data arrays
  let analogArray = data.analogData;  // [[v1, v2, ...], [i1, i2, ...], ...]
  let digitalArray = data.digitalData;

  // Step 5: Evaluate expression for EACH sample
  const results = [];
  for (let i = 0; i < sampleCount; i++) {
    const scope = {
      a0: analogArray[0][i],  // First analog channel sample i
      a1: analogArray[1][i],  // Second analog channel sample i
      // ...
    };
    const value = compiled.evaluate(scope);
    results.push(value);
  }
  // results = [24.55, 24.65, 24.75, ...]

  // Step 6: Calculate statistics
  const stats = {
    count: results.length,
    min: Math.min(...results),
    max: Math.max(...results),
    avg: average(results)
  };
}
```

**Key Data Structure Created:**
```javascript
const computedChannelData = {
  equation: "sqrt(a0^2 + a1^2)",           // Original LaTeX
  mathJsExpression: "sqrt(a0 ^ 2 + a1 ^ 2)", // Converted
  results: [24.55, 24.65, 24.75, ...],    // ← ACTUAL COMPUTED DATA
  stats: {
    count: 10000,
    min: 20.5,
    max: 30.2,
    avg: 25.1
  },
  scaledStats: {...},
  scalingFactor: 0.03,
  timestamp: "2026-01-18T10:30:00Z"
};
```

---

### **STAGE 3: Create Channel Payload**

**Where:** `ChannelList.js` - Still in `evaluateAndSaveComputedChannel()`

```javascript
// Create the full payload that will be stored
const channelPayload = {
  id: "computed_" + Date.now(),            // Unique ID
  name: computedChannelName,               // User-given name
  equation: latexExpression,               // Original equation
  mathJsExpression: mathJsExpr,
  results: computedChannelData.results,    // The computed values!
  stats: computedChannelData.stats,
  scaledStats: computedChannelData.scaledStats,
  scalingFactor: computedChannelData.scalingFactor,
  color: selectedColor,                    // User-selected color
  unit: selectedUnit,                      // e.g., "V", "A", "%"
  timestamp: new Date().toISOString(),
  group: null,                             // To be assigned later
  lineWidth: 2,
  opacity: 1
};

console.log("[ComputedChannel] Successfully evaluated:", {
  expression: latexExpression,
  samplesProcessed: results.length,
  validResults: validResults.length
});
```

---

### **STAGE 4: Save to Global Data & cfg**

**Where:** `ChannelList.js` → Calls functions from `stateUpdate.js`

```javascript
// ChannelList.js - Still in evaluateAndSaveComputedChannel()

// Import functions from services
import { 
  saveToCfg, 
  saveToGlobalData, 
  updateStateStore 
} from "../services/computedChannels/stateUpdate.js";

// STEP 1: Save to window.globalData
saveToGlobalData(channelPayload);
// Now: window.globalData.computedData = [channelPayload, ...]

// STEP 2: Save to cfg.computedChannels (metadata only)
saveToCfg(channelPayload, cfg);
// Now: cfg.computedChannels = [{id, name, equation, results, ...}, ...]
// Note: cfg now contains the SAME object!

// STEP 3: Update reactive state
updateStateStore(channelPayload);
// Updates channelState for UI reactivity
```

**What's in each location now:**

```javascript
// window.globalData.computedData
[
  {
    id: "computed_1234567890",
    name: "Phase_A_RMS",
    equation: "sqrt(a0^2 + a1^2)",
    results: [24.55, 24.65, ...],      // ← Full data array here!
    stats: {...},
    color: "#FF0000",
    unit: "V",
    group: null,
    timestamp: "..."
  }
]

// cfg.computedChannels
[
  {
    id: "computed_1234567890",
    name: "Phase_A_RMS",
    equation: "sqrt(a0^2 + a1^2)",
    results: [24.55, 24.65, ...],      // ← SAME object!
    stats: {...},
    color: "#FF0000",
    unit: "V",
    group: null,
    timestamp: "..."
  }
]
```

---

### **STAGE 5: Save to localStorage**

**Where:** `stateUpdate.js` - `updateStateCfg()` function (Line ~150)

```javascript
// stateUpdate.js - Line ~160
const cfgList = cfgData.computedChannels || [];
const dataList = window.globalData?.computedData || [];

saveComputedChannelsToStorage(cfgList, dataList);
//                             ↓         ↓
//                      cfg metadata   actual data
```

**Now calling:** `computedChannelStorage.js` → `saveComputedChannelsToStorage()`

```javascript
// computedChannelStorage.js - Lines 16-200
export function saveComputedChannelsToStorage(
  computedData,        // cfg.computedChannels
  dataOrMetadata,      // window.globalData.computedData
  metadata = {}
) {
  try {
    // STEP 1: Load existing channels from localStorage
    const existingData = loadComputedChannelsFromStorage();
    // Returns: [] or [previous channels]

    // STEP 2: Merge new with existing (avoid duplicates)
    const mergedData = [...existingData];
    
    computedData.forEach((newChannel) => {
      // Check if already exists
      const exists = mergedData.some(
        (ch) => ch.id === newChannel.id || 
                ch.name === newChannel.name
      );
      
      if (!exists) {
        mergedData.push(newChannel);  // Add new channel
      }
    });

    // STEP 3: Serialize and save to localStorage
    const json = JSON.stringify(mergedData);
    localStorage.setItem("COMTRADE_COMPUTED_CHANNELS", json);
    
    console.log(`✅ Saved ${mergedData.length} computed channels to localStorage`);

  } catch (error) {
    console.error("[Storage] Error:", error);
  }
}
```

---

## Complete Data Flow Diagram

```
USER CREATES COMPUTED CHANNEL
         ↓
┌─────────────────────────────────────────────┐
│ ChannelList.js                              │
│ openMathLiveEditor()                        │
│ ↓                                           │
│ User enters: sqrt(a0^2 + a1^2)             │
│ Clicks: Save Button                         │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│ evaluateAndSaveComputedChannel()            │
│ ↓                                           │
│ 1. Convert LaTeX → MathJS                   │
│    "sqrt(a0^2 + a1^2)" → "sqrt(...)"       │
│ ↓                                           │
│ 2. Get data.analogData from window.globalData
│    [[v0, v0, ...], [i0, i0, ...], ...]    │
│ ↓                                           │
│ 3. Compile expression with math.js         │
│ ↓                                           │
│ 4. Evaluate for EACH sample (10,000 times) │
│    for (i = 0 to 10000) {                   │
│      scope = {a0: ana[0][i], a1: ana[1][i]}│
│      result = compiled.evaluate(scope)      │
│      results.push(result)                   │
│    }                                        │
│ ↓                                           │
│ 5. results = [24.55, 24.65, 24.75, ...]   │
│ ↓                                           │
│ 6. Create payload with results             │
│    {id, name, equation, results, ...}      │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│ stateUpdate.js                              │
│                                              │
│ saveToCfg(payload, cfg)                     │
│ ↓                                           │
│ cfg.computedChannels.push(payload)          │
│                                              │
│ saveToGlobalData(payload)                   │
│ ↓                                           │
│ window.globalData.computedData.push(payload)│
│                                              │
│ updateStateStore(payload)                   │
│ ↓                                           │
│ channelState.computed.yLabels.push(...)     │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│ saveComputedChannelsToStorage()             │
│ (computedChannelStorage.js)                 │
│ ↓                                           │
│ 1. Load existing from localStorage          │
│    existingData = JSON.parse(               │
│      localStorage.getItem(                  │
│        "COMTRADE_COMPUTED_CHANNELS"         │
│      )                                      │
│    )                                        │
│ ↓                                           │
│ 2. Merge with new                           │
│    mergedData = [...existing, ...new]       │
│ ↓                                           │
│ 3. Save back to localStorage                │
│    localStorage.setItem(                    │
│      "COMTRADE_COMPUTED_CHANNELS",          │
│      JSON.stringify(mergedData)             │
│    )                                        │
└─────────────────────────────────────────────┘
         ↓
    PERSISTED! ✅
    
┌─────────────────────────────────────────────┐
│ localStorage["COMTRADE_COMPUTED_CHANNELS"]   │
│                                              │
│ [                                           │
│   {                                         │
│     id: "computed_1234567890",              │
│     name: "Phase_A_RMS",                    │
│     equation: "sqrt(a0^2 + a1^2)",          │
│     results: [24.55, 24.65, ...],          │
│     stats: {...},                           │
│     color: "#FF0000",                       │
│     unit: "V",                              │
│     group: null,                            │
│     timestamp: "2026-01-18T..."             │
│   },                                        │
│   {...},                                    │
│   {...}                                     │
│ ]                                           │
└─────────────────────────────────────────────┘
```

---

## Data Structure Transformations

### **1. At MathLive Editor**
```javascript
User Input:
  equation = "sqrt(a0^2 + a1^2)"
  color = "#FF0000"
  unit = "V"
  name = "Phase_A_RMS"
```

### **2. After Evaluation**
```javascript
computedChannelData = {
  equation: "sqrt(a0^2 + a1^2)",
  mathJsExpression: "sqrt(a0 ^ 2 + a1 ^ 2)",
  results: [24.55, 24.65, 24.75, ...],     // ← 10,000 values!
  stats: {
    count: 10000,
    min: 20.5,
    max: 30.2,
    avg: 25.1
  },
  scaledStats: {
    min: 20.5 / scalingFactor,
    max: 30.2 / scalingFactor,
    avg: 25.1 / scalingFactor
  },
  scalingFactor: 0.03,
  timestamp: "2026-01-18T10:30:00Z"
}
```

### **3. As Payload**
```javascript
channelPayload = {
  ...computedChannelData,
  id: "computed_1234567890",
  name: "Phase_A_RMS",
  color: "#FF0000",
  unit: "V",
  group: null,                    // Assigned later when used in analog group
  lineWidth: 2,
  opacity: 1
}
```

### **4. Stored in Three Places Simultaneously**

```
window.globalData.computedData
          ↓
    [channelPayload, ...]
          ↑
   cfg.computedChannels
   (SAME OBJECT!)
          ↑
   channelState.computed
   (Just metadata for UI)
```

### **5. In localStorage**
```javascript
localStorage["COMTRADE_COMPUTED_CHANNELS"] = JSON.stringify([
  channelPayload,
  ...existing
])
```

---

## Key Points

### 1. **Data Creation**
- Happens in `evaluateAndSaveComputedChannel()` in `ChannelList.js`
- User's LaTeX equation is evaluated for **every sample** (10,000+ times)
- Results are **stored as arrays** (one value per sample)

### 2. **Three Storage Locations**
| Location | Contains | Purpose |
|----------|----------|---------|
| **window.globalData.computedData** | Full channel objects with data | Runtime access |
| **cfg.computedChannels** | Full channel objects with data | Config reference |
| **localStorage** | Serialized JSON | Persistence across reloads |

### 3. **Same Object**
- `cfg.computedChannels[0]` is the **same object** as `window.globalData.computedData[0]`
- Changes to one affect the other
- Both are serialized to localStorage

### 4. **Data Flow Path**
```
MathLive Editor
    ↓
evaluateAndSaveComputedChannel()
    ↓
saveToCfg() + saveToGlobalData() + updateStateStore()
    ↓
saveComputedChannelsToStorage()
    ↓
localStorage["COMTRADE_COMPUTED_CHANNELS"]
```

### 5. **Group Assignment**
- When created: `group = null`
- When user assigns to analog group in UI: `group = "Phase_A"`
- This happens AFTER creation, via `updateComputedChannelGroupInStorage()`

---

## File Dependencies

```
ChannelList.js (1067)
    ↓
evaluateAndSaveComputedChannel()
    ├─ convertLatexToMathJs()
    ├─ window.math.compile()
    └─ stateUpdate.js
        ├─ saveToCfg()
        ├─ saveToGlobalData()
        ├─ updateStateStore()
        └─ saveComputedChannelsToStorage()
            └─ computedChannelStorage.js
                ├─ loadComputedChannelsFromStorage()
                └─ localStorage.setItem()
```

---

## localStorage Structure

```javascript
Key: "COMTRADE_COMPUTED_CHANNELS"

Value (as JSON):
[
  {
    id: string,                    // "computed_1234567890"
    name: string,                  // "Phase_A_RMS"
    equation: string,              // Original LaTeX
    mathJsExpression: string,      // Converted to math.js
    results: number[],             // [24.55, 24.65, ...]
    stats: {
      count: number,
      min: number,
      max: number,
      avg: number,
      validCount: number
    },
    scaledStats: {
      min: number,
      max: number,
      avg: number
    },
    scalingFactor: number,
    color: string,                 // "#FF0000"
    unit: string,                  // "V", "A", "%"
    group: string | null,          // null or "Phase_A"
    lineWidth: number,
    opacity: number,
    timestamp: string,             // ISO datetime
    ...other metadata
  },
  ...
]
```

---

## Summary

1. **User creates** computed channel in ChannelList MathLive editor
2. **System evaluates** LaTeX expression for all 10,000+ samples
3. **System saves** to three locations: `globalData`, `cfg`, `channelState`
4. **System persists** by serializing to `localStorage["COMTRADE_COMPUTED_CHANNELS"]`
5. **When loading** a file, `renderAnalogCharts` loads from localStorage via `loadComputedChannelsForGroup()`

The **results array** (computed values) is what makes the computed channel usable later — it's the actual data that gets rendered on charts!
