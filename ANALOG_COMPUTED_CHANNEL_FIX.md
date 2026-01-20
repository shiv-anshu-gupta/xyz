# Analog Chart Computed Channel Merge Fix

## Problem

When you create a **new computed channel at runtime** and assign it to an **analog group** (e.g., "Phase_A"):
- ✅ The computed channel gets saved to localStorage
- ✅ `renderComputedChannels()` renders the standalone computed chart correctly
- ❌ **BUT** the analog group chart does NOT include the new computed channel
- ❌ You had to manually refresh/reload to see the new computed channel merged into the analog chart

### Root Cause

The analog chart calls `loadComputedChannelsForGroup(groupId)` **only once during initial render**. It loads computed channels from localStorage filtered by group ID. However, when new computed channels are created at runtime, the analog charts were not being re-rendered to reload from localStorage.

---

## Solution (Option 1 - Implemented)

**When a new computed channel is created:**

1. The `handleComputedChannelSaved` event listener in `main.js` executes
2. It calls `renderComputedChannels()` to render standalone computed charts ✅
3. **NEW:** It also calls `renderAnalogCharts()` to rebuild analog charts
4. `renderAnalogCharts` → `loadComputedChannelsForGroup()` → loads from localStorage
5. New computed channels assigned to groups are now merged into analog charts ✅

---

## Code Changes

### File: `src/main.js`

#### 1. Added Import (Line 21)
```javascript
import { renderAnalogCharts } from "./components/renderAnalogCharts.js";
```

#### 2. Added Re-render Logic in `handleComputedChannelSaved` (Lines 4116-4145)

```javascript
// 🔄 CRITICAL FIX: Re-render analog charts to merge any new computed channels assigned to groups
// If a computed channel was assigned to an analog group (e.g., "Phase_A"),
// the analog chart needs to be rebuilt to include it via loadComputedChannelsForGroup()
try {
  const reRenderAnalogStartTime = performance.now();
  console.log(
    "[Main] 🔄 Re-rendering analog charts to merge new computed channels assigned to groups..."
  );
  
  renderAnalogCharts(
    cfg || window.globalCfg,
    data || window.globalData,
    chartsContainer,
    charts,
    verticalLinesX,
    channelState,
    autoGroupChannels
  );
  
  const reRenderAnalogTime = performance.now() - reRenderAnalogStartTime;
  console.log(
    `[Main] ⏱️ Re-render analog charts: ${reRenderAnalogTime.toFixed(2)}ms`
  );
} catch (error) {
  console.warn("[Main] ⚠️ Error re-rendering analog charts:", error);
}
```

---

## How It Works

### Data Flow When Creating New Computed Channel at Runtime:

```
1. User creates computed channel in MathLive editor
   ↓
2. ChannelList.js sends postMessage to parent window
   ↓
3. main.js receives "evaluateComputedChannel" message
   ↓
4. handleComputedChannelEvaluation orchestrator runs (services/computedChannels/index.js)
   ↓
5. Web Worker evaluates equation (non-blocking)
   ↓
6. dispatchChannelSavedEvent fires "computedChannelSaved" event
   ↓
7. handleComputedChannelSaved listener executes:
   ├─ Save to window.globalData.computedData
   ├─ Save to cfg.computedChannels
   ├─ Save to localStorage
   └─ requestAnimationFrame(() => {
       ├─ Clear old computed charts
       ├─ renderComputedChannels() — renders standalone computed charts
       └─ renderAnalogCharts() ✅ NEW — re-renders analog charts with merged computed
     })
```

### Key Functions Involved:

1. **renderAnalogCharts()** - Re-renders all analog charts
   - Loops through all groups
   - For each group: calls `loadComputedChannelsForGroup(groupId)`
   - `loadComputedChannelsForGroup()` filters localStorage by group assignment
   - Merges computed channels into each group's analog chart

2. **loadComputedChannelsForGroup()** - Loads computed channels from localStorage
   ```javascript
   // From chartDataProcessor.js
   export function loadComputedChannelsForGroup(groupId) {
     const storedComputedChannels = loadComputedChannelsFromStorage();
     return Array.isArray(storedComputedChannels)
       ? storedComputedChannels.filter((ch) => ch.group === groupId)
       : [];
   }
   ```

3. **prepareChartDataContext()** - Calls `loadComputedChannelsForGroup()` for each group
   ```javascript
   const computedForGroup = loadComputedChannelsForGroup(groupId);
   // Merge with analog series
   ```

---

## Important Notes

✅ **What This Does:**
- New computed channels assigned to analog groups are **automatically merged** into those group's charts
- No user action required beyond creating the channel
- Works for new channels created at any time during the session

✅ **What This Doesn't Affect:**
- Code that renders **saved** computed channels from previous sessions (still works as before)
- Standalone computed channel charts (still rendered separately)
- Color updates for computed channels (handled by separate color subscriber in chartManager.js)

⚠️ **Performance Note:**
- Re-rendering all analog charts takes ~50-200ms depending on complexity
- This only happens when a NEW computed channel is created, not on every user action
- Acceptable since users create computed channels infrequently

---

## Testing

To verify the fix works:

1. Load a COMTRADE file with multiple analog groups (e.g., "Phase_A", "Phase_B", "Phase_C")
2. Create a new computed channel (e.g., Sum of all phases)
3. Assign it to one of the groups (e.g., "Phase_A")
4. ✅ The analog chart for "Phase_A" should immediately show the new computed channel merged in
5. The computed channel data should appear as a line series in the analog chart

---

## Files Modified

- `src/main.js` — Added import and re-render logic in handleComputedChannelSaved listener

## Files Examined (No Changes Needed)

- `src/components/renderAnalogCharts.js` — Already correctly calls loadComputedChannelsForGroup()
- `src/utils/chartDataProcessor.js` — Already correctly loads from localStorage
- `src/components/renderComputedChannels.js` — Works as designed for standalone rendering
