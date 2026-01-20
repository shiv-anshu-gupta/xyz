# Complete Runtime Data Flow: From MathLive to Rendering (With localStorage)

## Overview
When a user creates a **NEW computed channel at runtime** in the **MathLive editor** (inside ChannelList popup), the system:
1. Evaluates the expression using actual analog data
2. Saves to memory (globalData, cfg, channelState)
3. Saves to localStorage
4. Broadcasts event to trigger chart rendering
5. **Merges** previously saved channels from localStorage
6. Renders ALL channels (new + previously saved) on unified charts

---

## Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 📍 USER ACTION                                                  │
│ Opens ChannelList popup → Clicks Computed Channel → MathLive    │
│ Enters: sqrt(a0^2 + a1^2)                                       │
│ Clicks: "Save" Button                                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 📍 STAGE 1: POST MESSAGE (ChannelList.js → main.js)             │
│                                                                  │
│ ChannelList popup sends:                                        │
│   window.opener.postMessage({                                   │
│     source: "ChildWindow",                                      │
│     type: "evaluateComputedChannel",                            │
│     payload: {                                                  │
│       expression: "sqrt(a0^2 + a1^2)",                         │
│       unit: "V",                                                │
│       timestamp: Date.now()                                     │
│     }                                                           │
│   })                                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 📍 STAGE 2: MESSAGE HANDLER (main.js)                           │
│                                                                  │
│ window.addEventListener("message", (event) => {                │
│   case "evaluateComputedChannel": {                            │
│     handleComputedChannelEvaluation({                          │
│       expression: "sqrt(a0^2 + a1^2)",                         │
│       unit: "V"                                                │
│     })                                                         │
│   }                                                            │
│ })                                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 📍 STAGE 3: ORCHESTRATOR (services/computedChannels/index.js)  │
│                                                                  │
│ handleComputedChannelEvaluation({expression, unit})            │
│ ├─ Validate expression                                         │
│ ├─ Get window.globalCfg and window.globalData                 │
│ ├─ Extract analogArray from data.analogData                   │
│ ├─ Compile expression with math.js                            │
│ ├─ Create Web Worker for evaluation                           │
│ └─ Send task to worker                                        │
│                                                                  │
│ ✅ Web Worker evaluates for all 10,000+ samples:              │
│    for (i = 0 to 10000) {                                      │
│      scope = {a0: ana[0][i], a1: ana[1][i]}                   │
│      result = sqrt(a0² + a1²) = [24.55, 24.65, ...]          │
│    }                                                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 📍 STAGE 4: SAVE TO MEMORY (stateUpdate.js)                    │
│                                                                  │
│ onSuccess callback (after worker completes):                    │
│   ├─ results = [24.55, 24.65, 24.75, ...]                    │
│   ├─ stats = {count: 10000, min: 20.5, max: 30.2, avg: 25.1} │
│   │                                                            │
│   ├─ channelData = {                                          │
│   │   id: "computed_1234567890",                              │
│   │   name: "Phase_A_RMS",                                    │
│   │   equation: "sqrt(a0^2 + a1^2)",                          │
│   │   results: [24.55, 24.65, ...],  ← COMPUTED VALUES        │
│   │   unit: "V",                                              │
│   │   color: "#FF0000",                                       │
│   │   stats: {...},                                           │
│   │   group: null                                             │
│   │ }                                                         │
│   │                                                            │
│   ├─ saveToGlobalData(channelData)                            │
│   │  └─ window.globalData.computedData.push(channelData)      │
│   │                                                            │
│   ├─ saveToCfg(channelData, cfg)                              │
│   │  └─ cfg.computedChannels.push(channelData)                │
│   │     (SAME OBJECT as globalData entry!)                    │
│   │                                                            │
│   └─ updateStateStore(channelData)                            │
│      └─ channelState.computed.yLabels.push("Phase_A_RMS")     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 📍 STAGE 5: DISPATCH EVENT (eventHandling.js)                  │
│                                                                  │
│ dispatchChannelSavedEvent(channelData, expression, unit, ...)  │
│   ↓                                                             │
│ window.dispatchEvent(                                          │
│   new CustomEvent("computedChannelSaved", {                    │
│     detail: {                                                  │
│       channelId: "computed_1234567890",                        │
│       fullData: channelData,  ← Complete object with results! │
│       ...                                                      │
│     }                                                          │
│   })                                                           │
│ )                                                              │
│                                                                  │
│ This triggers the handleComputedChannelSaved listener in main.js
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 📍 STAGE 6: SAVE TO LOCALSTORAGE (main.js listener)            │
│                                                                  │
│ handleComputedChannelSaved = (event) => {                      │
│   data.computedData.push(event.detail.fullData)                │
│   cfg.computedChannels.push(event.detail.fullData)             │
│                                                                  │
│   // ✅ CRITICAL: Save to localStorage                         │
│   saveComputedChannelsToStorage(                               │
│     cfg.computedChannels,       ← ALL channels (new + existing)│
│     globalData.computedData                                    │
│   )                                                            │
│                                                                  │
│   localStorage["COMTRADE_COMPUTED_CHANNELS"] = JSON.stringify( │
│     [                                                          │
│       ...existing channels from before,                        │
│       ...current session channels                              │
│     ]                                                          │
│   )                                                            │
│ }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 📍 STAGE 7: REQUEST ANIMATION FRAME (main.js)                  │
│                                                                  │
│ requestAnimationFrame(() => {                                  │
│   // 1. Clear old computed charts                              │
│   chartsComputed.forEach(chart => chart.destroy())             │
│   chartsComputed = []                                          │
│                                                                  │
│   // 2. Remove old computed chart DOM elements                 │
│   oldComputedContainers.forEach(el => el.remove())             │
│ })                                                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 📍 STAGE 8: LOAD & MERGE (main.js - Inside RAF)                │
│                                                                  │
│ ✅ THE CRITICAL MERGE STEP:                                    │
│                                                                  │
│ // Load previously saved channels from localStorage            │
│ const savedChannels = loadComputedChannelsFromStorage()        │
│ // Returns: [ch1 saved before, ch2 saved before, ...]         │
│                                                                  │
│ // Merge with current data                                    │
│ savedChannels.forEach((storedChannel) => {                     │
│   // Check if already in data.computedData                    │
│   const exists = data.computedData.some(                       │
│     ch => ch.id === storedChannel.id                          │
│   )                                                            │
│                                                                  │
│   if (!exists) {                                               │
│     // ✅ Add previously saved channel back to data            │
│     data.computedData.push({                                   │
│       id: storedChannel.id,                                    │
│       name: storedChannel.name,                                │
│       equation: storedChannel.equation,                        │
│       data: storedChannel.data,  ← RESTORED FROM STORAGE!     │
│       unit: storedChannel.unit,                                │
│       color: storedChannel.color,                              │
│       group: storedChannel.group                               │
│     })                                                         │
│   }                                                            │
│ })                                                             │
│                                                                  │
│ // Now data.computedData contains:                             │
│ // ├─ [0] Previously saved channel #1                         │
│ // ├─ [1] Previously saved channel #2                         │
│ // ├─ [2] NEW channel just created                            │
│ // └─ [3] Any other saved channels                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 📍 STAGE 9: RENDER ALL CHANNELS (renderComputedChannels.js)    │
│                                                                  │
│ renderComputedChannels(                                        │
│   data,          ← Contains NEW + PREVIOUSLY SAVED channels    │
│   chartsContainer,                                             │
│   charts,                                                      │
│   verticalLinesX,                                              │
│   channelState                                                 │
│ )                                                              │
│                                                                  │
│ This function:                                                 │
│   1. Gets allComputedChannels = data.computedData             │
│      [ch1_saved, ch2_saved, ch3_NEW]                           │
│                                                                  │
│   2. Filters unassigned:                                       │
│      computedChannels = filterUnassignedComputedChannels()    │
│      (removes those assigned to analog groups)                 │
│                                                                  │
│   3. Groups by unit:                                           │
│      unitGroups = {                                            │
│        "V": [ch1_saved, ch3_NEW],                              │
│        "%": [ch2_saved]                                        │
│      }                                                         │
│                                                                  │
│   4. Creates ONE chart per unit:                               │
│      ├─ Chart 1: V (has ch1 + ch3 = 2 series)                 │
│      └─ Chart 2: % (has ch2 = 1 series)                       │
│                                                                  │
│   5. Each chart receives merged data:                          │
│      chartData = [                                             │
│        timeArray,                                              │
│        ch1_saved.data,      ← From localStorage               │
│        ch3_NEW.data,        ← Just created                     │
│      ]                                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ ✅ FINAL RESULT: RENDERED CHARTS                               │
│                                                                  │
│ Browser displays:                                              │
│ ┌──────────────────────────────────────────┐                  │
│ │ Chart 1: Voltage Group (V)               │                  │
│ │ ┌────────────────────────────────────┐   │                  │
│ │ │ Line 1: ch1_saved (previous) ────  │   │                  │
│ │ │ Line 2: ch3_NEW (just created) ─── │   │  ← Synced!       │
│ │ └────────────────────────────────────┘   │                  │
│ └──────────────────────────────────────────┘                  │
│                                                                  │
│ ┌──────────────────────────────────────────┐                  │
│ │ Chart 2: Percentage Group (%)            │                  │
│ │ ┌────────────────────────────────────┐   │                  │
│ │ │ Line 1: ch2_saved (previous) ────  │   │  ← Same time axis│
│ │ └────────────────────────────────────┘   │                  │
│ └──────────────────────────────────────────┘                  │
│                                                                  │
│ All linked with verticalLinesX for interaction sync            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Detailed Breakdown

### **STEP 1: User Creates in MathLive**
```javascript
// ChannelList.js (popup window)
// User types: sqrt(a0^2 + a1^2) and clicks Save

window.opener.postMessage({
  source: "ChildWindow",
  type: "evaluateComputedChannel",
  payload: {
    expression: "sqrt(a0^2 + a1^2)",
    unit: "V",
    timestamp: 1705572600000
  }
}, "*");
```

### **STEP 2: Parent Window Receives Message**
```javascript
// main.js
window.addEventListener("message", (event) => {
  if (event.data.type === "evaluateComputedChannel") {
    handleComputedChannelEvaluation({
      expression: event.data.payload.expression,
      unit: event.data.payload.unit
    });
  }
});
```

### **STEP 3: Orchestrator Processes**
```javascript
// services/computedChannels/index.js
export const handleComputedChannelEvaluation = async (payload) => {
  const { expression, unit } = payload;

  // Get global data
  const cfg = window.globalCfg;
  const data = window.globalData;

  // Create Web Worker for evaluation
  const worker = createComputedChannelWorker();
  
  // Evaluate expression for all 10,000 samples
  worker.onmessage = (event) => {
    const { results, stats } = event.data;
    // results = [24.55, 24.65, 24.75, ...]
    
    // Create channel payload
    const channelData = {
      id: "computed_1234567890",
      name: "Phase_A_RMS",
      equation: expression,
      results: results,  // ← Actual computed values!
      stats: stats,
      unit: unit,
      color: "#FF0000",
      group: null,
      timestamp: new Date().toISOString()
    };
    
    // Dispatch event to trigger listener
    dispatchChannelSavedEvent(channelData, expression, unit, stats, results);
  };

  // Send work to worker
  worker.postMessage(workerTask);
};
```

### **STEP 4: Event Listener in main.js Processes**
```javascript
// main.js - Listener attached at startup
const handleComputedChannelSaved = (event) => {
  // ✅ Add to data.computedData
  data.computedData.push(event.detail.fullData);

  // ✅ Add to cfg.computedChannels
  cfg.computedChannels.push(event.detail.fullData);

  // ✅ SAVE TO LOCALSTORAGE
  saveComputedChannelsToStorage(
    cfg.computedChannels,  // ALL channels
    data.computedData      // Includes new one
  );

  // ✅ Trigger chart re-render
  requestAnimationFrame(() => {
    // ... rendering code ...
  });
};

window.addEventListener("computedChannelSaved", handleComputedChannelSaved);
```

### **STEP 5: Chart Re-render with Merge**
```javascript
// Inside requestAnimationFrame callback (main.js)

// 1. Load previously saved from localStorage
const savedChannels = loadComputedChannelsFromStorage();
// Returns: [
//   {id: "ch1_old", name: "Voltage_Prev", data: [...], ...},
//   {id: "ch2_old", name: "Harmonic_Prev", data: [...], ...}
// ]

// 2. Merge with current data
savedChannels.forEach((storedChannel) => {
  if (!data.computedData.some(ch => ch.id === storedChannel.id)) {
    data.computedData.push({
      id: storedChannel.id,
      name: storedChannel.name,
      equation: storedChannel.equation,
      data: storedChannel.data,  // ← From localStorage!
      unit: storedChannel.unit,
      color: storedChannel.color,
      group: storedChannel.group
    });
  }
});

// Now data.computedData has:
// [ch1_saved, ch2_saved, ch3_NEW]

// 3. Render all
renderComputedChannels(
  data,  // ← Contains ALL channels
  chartsContainer,
  charts,
  verticalLinesX,
  channelState
);
```

### **STEP 6: renderComputedChannels Renders All**
```javascript
// renderComputedChannels.js
export function renderComputedChannels(data, chartsContainer, ...) {
  // Get all computed channels (new + saved)
  const allComputedChannels = data.computedData;
  // [ch1_saved, ch2_saved, ch3_NEW]

  // Filter: Keep only unassigned
  const computedChannels = filterUnassignedComputedChannels(
    allComputedChannels,
    channelState.analog.groups
  );

  // Group by unit
  const unitGroups = groupChannelsByUnit(computedChannels);
  // {
  //   "V": [ch1_saved, ch3_NEW],
  //   "%": [ch2_saved]
  // }

  // Create one chart per unit
  unitGroups.forEach((channels, unit) => {
    // For "V" unit: channels = [ch1_saved, ch3_NEW]
    
    const chartData = [timeArray];
    channels.forEach(ch => {
      chartData.push(ch.data);  // Both ch1 and ch3 data arrays
    });

    // chartData = [time, ch1_saved.data, ch3_NEW.data]
    
    // Create uPlot instance
    const chart = new uPlot(options, chartData, container);
    charts.push(chart);
  });
}
```

---

## Data Object States During Runtime

### **Before User Creates Channel**
```javascript
data.computedData = [
  {id: "ch1", name: "Voltage", data: [24.5, 24.6, ...], unit: "V"},
  {id: "ch2", name: "THD", data: [3.2, 3.1, ...], unit: "%"}
]

localStorage["COMTRADE_COMPUTED_CHANNELS"] = [
  {id: "ch1", name: "Voltage", data: [24.5, 24.6, ...], unit: "V"},
  {id: "ch2", name: "THD", data: [3.2, 3.1, ...], unit: "%"}
]
```

### **After User Creates NEW Channel (Before Merge)**
```javascript
data.computedData = [
  {id: "ch1", name: "Voltage", data: [24.5, 24.6, ...], unit: "V"},
  {id: "ch2", name: "THD", data: [3.2, 3.1, ...], unit: "%"},
  {id: "ch3_NEW", name: "RMS", data: [24.55, 24.65, ...], unit: "V"}  ← Just added
]

localStorage["COMTRADE_COMPUTED_CHANNELS"] = [
  {id: "ch1", name: "Voltage", data: [24.5, 24.6, ...], unit: "V"},
  {id: "ch2", name: "THD", data: [3.2, 3.1, ...], unit: "%"},
  {id: "ch3_NEW", name: "RMS", data: [24.55, 24.65, ...], unit: "V"}  ← Saved!
]
```

### **After Merge (Ready to Render)**
```javascript
data.computedData = [
  // From localStorage (restored):
  {id: "ch1", name: "Voltage", data: [24.5, 24.6, ...], unit: "V"},
  {id: "ch2", name: "THD", data: [3.2, 3.1, ...], unit: "%"},
  // New one just created:
  {id: "ch3_NEW", name: "RMS", data: [24.55, 24.65, ...], unit: "V"}
]
```

---

## Key Points

### 1. **The Critical Merge Happens in RAF**
```javascript
// Without this merge, previously saved channels would be lost!
const savedChannels = loadComputedChannelsFromStorage();
savedChannels.forEach((ch) => {
  if (!exists) data.computedData.push(ch);
});
```

### 2. **Data Flows Through Three Locations**
| Location | Purpose | Updated When |
|----------|---------|--------------|
| `data.computedData` | Runtime data for rendering | Channel created |
| `cfg.computedChannels` | Metadata with data arrays | Channel created |
| `localStorage` | Persistent storage | Event listener triggers save |

### 3. **The Event Chain**
```
User saves in MathLive
  ↓
postMessage to parent
  ↓
handleComputedChannelEvaluation
  ↓
Worker evaluates
  ↓
dispatchChannelSavedEvent
  ↓
handleComputedChannelSaved listener
  ↓
saveComputedChannelsToStorage
  ↓
requestAnimationFrame (render trigger)
  ↓
loadComputedChannelsFromStorage (merge)
  ↓
renderComputedChannels (displays ALL)
```

### 4. **NEW + SAVED Rendering**
- **NEW channels** come from `data.computedData` (just created in memory)
- **SAVED channels** come from `localStorage` (restored during merge)
- **Both rendered together** on same charts (grouped by unit)
- **All synchronized** via `verticalLinesX` reactive state

---

## Summary

**The Complete Flow:**

1. 🧮 **User creates** in MathLive: `sqrt(a0^2 + a1^2)`
2. 📨 **PostMessage** sends to parent window
3. ⚙️ **Orchestrator** receives, validates, creates Worker
4. 🔢 **Worker evaluates** 10,000+ samples → `results = [24.55, 24.65, ...]`
5. 💾 **State update** saves to `data.computedData` + `cfg.computedChannels`
6. 📤 **Event dispatch** triggers "computedChannelSaved" event
7. 💿 **localStorage save** persists ALL channels
8. 🎨 **requestAnimationFrame** clears old charts
9. 🔄 **Merge step** loads saved channels from localStorage
10. 📊 **renderComputedChannels** renders NEW + SAVED together
11. ✅ **Charts display** with both old and new computed channels

**Key insight:** The merge in Step 9 is what ensures previously saved channels aren't lost when creating new ones!
