# Computed Channel Grouping System - Complete Explanation

## 🎯 Quick Overview

Think of it like organizing recipes in a cookbook:
- **Analog channels** = Base recipes (main dishes)
- **Computed channels** = Derived recipes (sauces made from base ingredients)
- **Groups** = Recipe categories (Italian, French, Indian, etc.)

When you assign a computed channel to a group, it becomes part of that group's "recipe collection" and displays WITH the base recipes in that group.

---

## 📊 The Architecture (Three Main Components)

### Component 1: **Storage Layer** (localStorage)
```
localStorage["computed_channels"] = [
  {
    id: "c1",
    name: "Power Loss",
    unit: "kW",
    group: "G0",        ← GROUP ASSIGNMENT STORED HERE
    data: [...],        ← Time series values
    color: "#FF0000"
  },
  {
    id: "c2",
    name: "Efficiency",
    unit: "%",
    group: "G1",        ← Different group
    data: [...],
    color: "#00FF00"
  }
]
```

**Why?** When user closes and reopens the app, computed channels remember which group they belong to.

---

### Component 2: **Data Layer** (In-Memory State)
```
data.computedData = [
  { id: "c1", group: "G0", ... },   ← Mirror of localStorage
  { id: "c2", group: "G1", ... }
]
```

**Why?** Charts read from this fast in-memory copy during rendering, not from slow localStorage every time.

---

### Component 3: **Rendering Layer** (Three Types of Charts)

```
┌─────────────────────────────────────────────┐
│         COMTRADE VISUALIZATION              │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────────┐  ┌────────────────┐ │
│  │  ANALOG CHARTS   │  │COMPUTED CHARTS │ │
│  │  (Group-based)   │  │  (Unit-based)  │ │
│  │                  │  │                │ │
│  │ ┌──────────────┐ │  │ ┌────────────┐ │ │
│  │ │ Group "G0"   │ │  │ │ Unit "kV"  │ │ │
│  │ │ ✓ Voltage    │ │  │ │ ✓ Computed │ │ │
│  │ │ ✓ Current    │ │  │ │   (c1)     │ │ │
│  │ │ ✓ Power Loss │ │  │ │ ✓ Computed │ │ │
│  │ │   (c1)       │ │  │ │   (c3)     │ │ │
│  │ └──────────────┘ │  │ └────────────┘ │ │
│  │                  │  │                │ │
│  │ ┌──────────────┐ │  │ ┌────────────┐ │ │
│  │ │ Group "G1"   │ │  │ │ Unit "%"   │ │ │
│  │ │ ✓ Temp       │ │  │ │ ✓ Computed │ │ │
│  │ │ ✓ Efficiency │ │  │ │   (c2)     │ │ │
│  │ │   (c2)       │ │  │ └────────────┘ │ │
│  │ └──────────────┘ │  │                │ │
│  └──────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────┘
```

**Key Rule:** Each computed channel displays in **exactly ONE place**:
- If `channel.group` = "G0" → shows in Analog Chart G0
- If `channel.group` = "kV" (not an analog group) → shows in Computed Chart (kV unit)

---

## 🔄 The Complete Flow (When User Changes Group)

### Step 1️⃣: User Action in Tabulator
```
User clicks on computed channel row → Changes group from "G4" to "G0"
                          ↓
                 Message sent to main.js
```

**File:** `src/main.js` (line ~4830)

---

### Step 2️⃣: Main.js Receives Message
```javascript
case "callback_computed_group": {
  const channelId = "c1";      // Which channel?
  const newGroup = "G0";       // New group assignment
  
  // MESSAGE CONTENT:
  // {
  //   source: "ChildWindow",
  //   type: "callback_computed_group",
  //   payload: {
  //     id: "c1",
  //     group: "G0"
  //   }
  // }
}
```

**Why this message?** The tabulator runs in a child window (popup), so it needs to tell the parent app what changed.

---

### Step 3️⃣: Update Storage (localStorage)
```javascript
// STEP 1: Update localStorage
updateComputedChannelGroupInStorage("c1", "G0");

// This modifies:
// localStorage["computed_channels"][0].group = "G0"
```

**Why?** So when user closes/reopens app, channel remembers it belongs to G0.

---

### Step 4️⃣: Update In-Memory State (cfg)
```javascript
// STEP 3: Update cfg.computedChannels
cfg.computedChannels[0].group = "G0"

// Also update computed state if available
computedState.groups[0] = "G0"
```

**Why?** cfg is used during chart creation. Must be in sync with storage.

---

### Step 5️⃣: **[CRITICAL]** Update data.computedData
```javascript
// ✅ NEW DATA SYNC FIX (lines 5066-5076 in main.js)
if (Array.isArray(renderData?.computedData)) {
  for (let i = 0; i < renderData.computedData.length; i++) {
    if (renderData.computedData[i].id === "c1") {
      renderData.computedData[i].group = "G0"  // ← OWNERSHIP RULE sees this
      break;
    }
  }
}
```

**⚠️ MOST IMPORTANT STEP!** 

This is where the ownership rule gets the updated group. Without this:
- Storage updated ✓
- cfg updated ✓
- **But renderComputedChannels() sees OLD group in data.computedData** ✗

---

### Step 6️⃣: Clear All Charts
```javascript
// Destroy old uPlot instances
window.globalCharts.forEach(chart => chart.destroy());

// Empty the container
chartsContainer.innerHTML = "";
```

**Why?** Start fresh. Can't reuse old charts because their structure changed.

---

### Step 7️⃣: Call renderComtradeCharts()
This is the **main orchestrator** that calls all three renderers:

**File:** `src/components/renderComtradeCharts.js`

```javascript
renderComtradeCharts(
  cfg,           // Updated config
  data,          // Updated in-memory data
  chartsContainer,
  charts,
  verticalLinesX,
  channelState,
  createState,
  calculateDeltas,
  TIME_UNIT
);
```

---

## 🎬 Phase 1: Render Analog Charts

**File:** `src/components/renderAnalogCharts.js`

```
USER GOAL: Show c1 in Group G0
           ↓
         Call renderAnalogCharts()
           ↓
    For each user-assigned group (G0, G1, G2, ...):
           ↓
    Create ONE chart per group
           ↓
    For Group "G0":
    ├─ Load analog channels in G0
    │  ├─ Voltage (A1)
    │  ├─ Current (A2)
    │  └─ Power Loss (A3)
    │
    ├─ Load computed channels in G0 ← NEW!
    │  ├─ c1 (Power Loss) ← Just assigned
    │  └─ c3 (if any in G0)
    │
    └─ Create merged chart with all
       (analog + computed together)
```

**How?** Inside `renderSingleAnalogChart()`:

**File:** `src/components/renderSingleAnalogChart.js` (lines 47-54)

```javascript
const dataContext = prepareChartDataContext({
  validIndices,      // Analog channel indices for this group
  userGroups,
  channelState,
  data,
  groupName: "G0"    // Group name
});

// prepareChartDataContext() calls:
// → loadComputedChannelsForGroup("G0")
//   └─ Loads c1, c3, etc. (all computed channels with group="G0")
//   └─ Merges them with analog data
```

**Result:** One analog chart with merged computed channels.

---

## 🎬 Phase 2: Render Computed Channels

**File:** `src/components/renderComputedChannels.js`

```
USER GOAL: c1 should NOT appear here anymore
           (because it's now in Group G0)
           ↓
       Call renderComputedChannels()
           ↓
  Get all computed channels from data.computedData
           ↓
  ┌─────────────────────────────────────────┐
  │  OWNERSHIP RULE (THE KEY CONCEPT!)      │
  │                                         │
  │  For each computed channel:             │
  │  ├─ Is channel.group in analogGroupIds? │
  │  │  YES → Channel is OWNED by analog    │
  │  │        → EXCLUDE from standalone     │
  │  │                                      │
  │  │  NO → Channel is NOT owned           │
  │  │       → INCLUDE in standalone        │
  └─────────────────────────────────────────┘
           ↓
  Filter result:
  ├─ c1 (group="G0")    → EXCLUDED ✗
  ├─ c2 (group="G1")    → EXCLUDED ✗
  └─ c4 (group="G4")    → INCLUDED ✓ (G4 not analog group)
           ↓
  Create standalone charts for included channels
```

**Code:** `src/utils/computedChannelDataProcessor.js` (lines ~80-110)

```javascript
export function filterUnassignedComputedChannels(
  allComputedChannels,  // [c1, c2, c3, c4, ...]
  analogGroupIds        // ["G0", "G1", "G2", "G3"]
) {
  return allComputedChannels.filter((ch) => {
    // Is this channel's group in the analog groups list?
    if (ch && ch.group && analogGroupIds.includes(ch.group)) {
      return false;  // ← OWNED by analog, exclude
    }
    return true;     // ← NOT owned, include in standalone
  });
}
```

**Example:**
```
Channel c1: group="G0"
analogGroupIds: ["G0", "G1", "G2", "G3"]
Check: Is "G0" in ["G0", "G1", "G2", "G3"]? YES
Result: EXCLUDE from standalone ✗
         (Will appear in Analog G0 instead)
```

---

## 🧠 The Ownership Rule Explained

### What Is It?
A **deterministic rule** that decides where each computed channel renders based on **one simple fact:** its group ID.

### Why Does It Exist?
To prevent **duplicate rendering**:
- Without rule: computed channel could show in 2 places (analog + standalone)
- With rule: computed channel shows in exactly 1 place

### How Does It Work?

```
BEFORE grouping (fresh app):
┌─────────────────────────┐
│   Analog Groups         │     │   Standalone Computed   │
│   ["G0", "G1"]          │     │   Units: ["kV", "A"]    │
└─────────────────────────┘     └─────────────────────────┘

NEW computed channel c1:
├─ User DOESN'T assign to group
│  └─ Default: group="G2" (next unused group ID)
│
RULE CHECK:
├─ Is "G2" in ["G0", "G1"]?
│  NO → c1 is NOT OWNED by analog
│  └─ c1 shows in STANDALONE (kV unit)

THEN user changes c1's group to "G0":
├─ Update: c1.group = "G0"
│
RULE CHECK (AGAIN):
├─ Is "G0" in ["G0", "G1"]?
│  YES → c1 is NOW OWNED by analog G0
│  └─ c1 shows in ANALOG CHART G0
│  └─ c1 removed from STANDALONE
```

---

## 📍 Key Data Structures

### 1. analogGroupIds (The Ownership Check)
```javascript
// In renderComputedChannels():
const analogGroupIds = channelState?.analog?.groups || [];
// Example: ["G0", "G1", "G2", "G3", undefined, undefined, ...]

// What is it?
// An array where index = analog channel index, value = assigned group
// Length = number of analog channels

// Example:
// analogGroupIds[0] = "G0"  (Channel A0 → Group G0)
// analogGroupIds[1] = "G0"  (Channel A1 → Group G0)
// analogGroupIds[2] = "G1"  (Channel A2 → Group G1)
// analogGroupIds[3] = "G2"  (Channel A3 → Group G2)
```

### 2. computedData (In-Memory Mirror)
```javascript
data.computedData = [
  {
    id: "c1",
    name: "Power Loss",
    unit: "kW",
    group: "G0",    ← THIS FIELD is checked by ownership rule
    data: [1.2, 1.5, 1.8, ...],
    color: "#FF0000"
  },
  ...
]
```

### 3. localStorage["computed_channels"] (Persistent)
```javascript
// Same structure as data.computedData but persisted
localStorage["computed_channels"] = JSON.stringify([
  { id: "c1", group: "G0", ... },
  ...
])
```

---

## 🔍 The Flow Diagram (Complete)

```
USER CHANGES GROUP IN TABULATOR (G4 → G0)
            ↓
    [window.postMessage]
            ↓
main.js: callback_computed_group handler
    ├─ Step 1: updateComputedChannelGroupInStorage("c1", "G0")
    │         └─ localStorage["computed_channels"][0].group = "G0"
    │
    ├─ Step 2: Verify data is ready (with retries)
    │
    ├─ Step 3: updateComputedChannelGroupInMemory()
    │         ├─ cfg.computedChannels[0].group = "G0"
    │         └─ computedState.groups[0] = "G0"
    │
    ├─ Step 4: Clear all charts
    │         ├─ globalCharts.forEach(chart => destroy)
    │         └─ chartsContainer.innerHTML = ""
    │
    ├─ Step 5: UPDATE DATA.COMPUTEDDATA ✅ (NEW!)
    │         └─ renderData.computedData[0].group = "G0"
    │            (This is what the ownership rule reads!)
    │
    └─ Step 6: Call renderComtradeCharts()
              ↓
    ┌─────────────────────────────────────┐
    │ renderComtradeCharts() ↓             │
    │                                     │
    │ Phase 1: renderAnalogCharts()       │
    │ ├─ For Group G0:                    │
    │ │  └─ Call prepareChartDataContext()│
    │ │     └─ loadComputedChannelsForGroup("G0")
    │ │        └─ Finds c1 with group="G0" ✓
    │ │        └─ Merges c1 with analog data
    │ │        └─ Creates ONE chart with all
    │ │
    │ Phase 2: renderComputedChannels()   │
    │ ├─ Get allComputedChannels          │
    │ │  from data.computedData           │
    │ │  [c1(G0), c2(G1), c4(G4), ...]    │
    │ │                                   │
    │ ├─ Apply ownership rule filter:     │
    │ │  analogGroupIds = ["G0","G1",...] │
    │ │                                   │
    │ │  c1: group="G0" → in list → SKIP  │
    │ │  c2: group="G1" → in list → SKIP  │
    │ │  c4: group="G4" → NOT in list → OK│
    │ │                                   │
    │ ├─ Result: [c4]                     │
    │ ├─ Create standalone chart for c4   │
    │ │  (c1, c2 NOT shown here!)         │
    └─────────────────────────────────────┘
              ↓
        RESULT DISPLAYED:
        ✓ Analog Chart G0: A0, A1, A3, c1
        ✓ Computed Standalone: c4
        ✗ c1 NOT in standalone (no duplicate!)
```

---

## 💡 Why This Design?

### Problem It Solves
```
WITHOUT ownership rule:
╔══════════════════════════════════════════╗
║  BAD: Computed channel in TWO places!   ║
╠══════════════════════════════════════════╣
║ Analog Chart G0          Standalone      ║
║ ├─ Voltage              ├─ Power Loss   ║
║ ├─ Current              │   (c1)         ║
║ └─ Power Loss (c1) ← SAME CHANNEL HERE! ║
║   (c1)                  └─ Efficiency   ║
╚══════════════════════════════════════════╝
Confusion! User sees data twice, updates get confused.
```

### With Ownership Rule
```
WITH ownership rule:
╔══════════════════════════════════════════╗
║  GOOD: Each channel in ONE place only    ║
╠══════════════════════════════════════════╣
║ Analog Chart G0          Standalone      ║
║ ├─ Voltage              ├─ Efficiency   ║
║ ├─ Current              │   (c3)         ║
║ ├─ Power Loss (c1)      └─ Other Calc   ║
║                             (c4)        ║
╚══════════════════════════════════════════╝
Clean! Each channel renders once. No confusion.
```

---

## 🛠️ How to Debug (When Something Goes Wrong)

### Checklist:

1. **Check localStorage**
   ```javascript
   // In browser console:
   JSON.parse(localStorage["computed_channels"])
   // Look for: Is the group field updated?
   ```

2. **Check in-memory data**
   ```javascript
   // In browser console:
   window.globalData.computedData
   // Look for: Is the group field updated? (must match localStorage)
   ```

3. **Check cfg**
   ```javascript
   // In browser console:
   window.globalCfg.computedChannels
   // Look for: Is the group field updated?
   ```

4. **Trace the ownership rule**
   ```javascript
   // Add console.log in filterUnassignedComputedChannels():
   console.log("Checking channel:", ch.id, "group:", ch.group);
   console.log("Analog groups:", analogGroupIds);
   console.log("Is owned?", analogGroupIds.includes(ch.group));
   ```

5. **Check chart creation**
   ```javascript
   // Open DevTools → Elements
   // Look for: How many times does each channel appear?
   // Should be exactly 1 (not 2)
   ```

---

## 📝 Summary Table

| Component | Purpose | Updated By | Read By |
|-----------|---------|-----------|---------|
| localStorage | Persistent storage | `updateComputedChannelGroupInStorage()` | App startup |
| data.computedData | Fast in-memory copy | Manual update (Step 5) | **Ownership rule filter** |
| cfg.computedChannels | Config metadata | Manual update (Step 3) | Chart creation |
| channelState.computed | Reactive UI state | Via computed state handler | Tabulator display |

---

## 🎓 Learning Path

**Start here → Move down:**

1. ✅ Understand **what** happens (user changes group)
2. ✅ Understand **where** it happens (tabulator → main.js)
3. ✅ Understand **storage** (localStorage, data, cfg)
4. ✅ Understand **ownership rule** (the filter)
5. ✅ Understand **rendering** (analog charts + computed standalone)
6. ✅ Understand **data sync** (why Step 5 is critical)
7. ✅ Understand **the complete flow** (all steps together)

---

## Questions to Test Your Understanding

**Q1:** Why do we update `data.computedData` right before calling `renderComtradeCharts()`?
<details>
<summary>Answer</summary>
Because `renderComputedChannels()` calls `filterUnassignedComputedChannels(data.computedData, analogGroupIds)`. This filter checks the `group` property of each channel. If we don't update `data.computedData` first, the filter will see the OLD group value and won't exclude the channel from standalone charts → duplicate rendering!
</details>

**Q2:** What does "ownership" mean in the context of computed channels?
<details>
<summary>Answer</summary>
A computed channel is "owned" by an analog group if its `group` property matches one of the analog group IDs. If owned, the analog chart takes responsibility for displaying it, and the standalone computed chart excludes it.
</details>

**Q3:** Why do we clear ALL charts and rebuild, instead of just updating the moved channel?
<details>
<summary>Answer</summary>
Because uPlot (the charting library) doesn't like being modified live. Destroying and rebuilding is safer and simpler. Plus, both the source group and destination group need to be updated (old group loses the channel, new group gains it).
</details>

**Q4:** If a computed channel has `group="G5"` and analog groups are `["G0","G1","G2","G3"]`, where does it render?
<details>
<summary>Answer</summary>
It renders in the **standalone computed chart** (grouped by unit like "kV" or "%"), because "G5" is NOT in the analog groups list. The channel is NOT owned by any analog group.
</details>

---

This is how your computed channel grouping system works! 🎉
