# Architecture Diagram: Group-Centric Rendering

## Visual Flow

### User Action Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  User: Moves digital SV03 from group G3 → G0                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────┐
        │  ChannelList.js                  │
        │  (cellEdited handler)            │
        │  Posts: callback_group message   │
        └────────────┬─────────────────────┘
                     │
                     ▼
        ┌──────────────────────────────────┐
        │  main.js                         │
        │  (GROUP message handler)         │
        │  Updates channelState            │
        │  channelState.digital.groups[3]  │
        │  = "G0"                          │
        └────────────┬─────────────────────┘
                     │
                     ▼
        ┌──────────────────────────────────┐
        │  renderComtradeCharts.js         │
        │  (calls renderGroupCharts())     │
        └────────────┬─────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  GROUP-CENTRIC RENDERING PIPELINE                               │
└─────────────────────────────────────────────────────────────────┘
                     │
                     ▼
```

---

## Data Structure Transformation

### Input: Channel State (After Update)

```javascript
channelState = {
  analog: {
    groups: ["G0", "G0", "G0", "G1", "G1"],  // 5 analog channels
    // ...
  },
  digital: {
    groups: ["G0", "G1", "G3"],  // 3 digital channels (SV03 now in G0!)
    // ...
  },
  computed: {
    groups: ["G0", "G1", "G1"],  // 3 computed channels
    // ...
  }
}
```

### Processing Step 1: Build Groups Map

```javascript
// renderGroupCharts() builds this map:

groupsMap = new Map([
  ["G0", {
    analog: [0, 1, 2],           // indices of analog channels in G0
    digital: [0],                // index 0 (SV03) now in G0!
    computed: [0]                // index 0 in G0
  }],
  ["G1", {
    analog: [3, 4],
    digital: [1],
    computed: [1, 2]
  }],
  ["G3", {
    analog: [],
    digital: [2],
    computed: []
  }]
])
```

### Processing Step 2: Collect Channels per Group

```javascript
// For group G0:

analogChannels_G0 = [
  {name: "IA", globalIndex: 0, type: "analog", displayedColor: "#FF0000"},
  {name: "IB", globalIndex: 1, type: "analog", displayedColor: "#00FF00"},
  {name: "IC", globalIndex: 2, type: "analog", displayedColor: "#0000FF"}
]

digitalChannels_G0 = [
  {name: "SV03", globalIndex: 0, type: "digital", displayedColor: "#FFFF00"}
]

computedChannels_G0 = [
  {name: "P_avg", globalIndex: 0, type: "computed", displayedColor: "#FF00FF"}
]
```

### Processing Step 3: Build Chart Data Array

```javascript
// For group G0 chart:

chartData = [
  // [0] Time axis (shared by all)
  [0, 0.01, 0.02, 0.03, ...],
  
  // [1-3] Analog series
  [100, 101, 99, 102, ...],   // IA
  [98, 99, 101, 100, ...],    // IB
  [101, 100, 98, 99, ...],    // IC
  
  // [4] Digital series
  [0, 0, 1, 1, 0, ...],       // SV03
  
  // [5] Computed series
  [9876, 9800, 9750, 9900, ...] // P_avg
]
```

### Processing Step 4: Build Series Configuration

```javascript
// uPlot series array for G0:

series = [
  // Time axis
  {
    label: "Time",
    // ... time config
  },
  
  // Analog series (y-axis: 0-150 A)
  {
    label: "IA",
    stroke: "#FF0000",
    scale: "y_analog",
    // ...
  },
  {
    label: "IB",
    stroke: "#00FF00",
    scale: "y_analog",
  },
  {
    label: "IC",
    stroke: "#0000FF",
    scale: "y_analog",
  },
  
  // Digital series (y-axis: 0-1)
  {
    label: "SV03",
    stroke: "#FFFF00",
    scale: "y_digital",
    fill: "rgba(255, 255, 0, 0.3)",  // For fill plugin
  },
  
  // Computed series (y-axis: 0-12000)
  {
    label: "P_avg",
    stroke: "#FF00FF",
    scale: "y_computed",
  }
]
```

### Processing Step 5: Create Axes Configuration

```javascript
// uPlot axes for G0:

axes = [
  // X-axis
  {
    side: 3,  // Bottom
    label: "Time (s)",
    // ...
  },
  
  // Y-axis for analog (left)
  {
    side: 3,
    scale: "y_analog",
    label: "Current (A)",
    min: 0,
    max: 150,
  },
  
  // Y-axis for digital (right 1)
  {
    side: 1,
    scale: "y_digital",
    label: "Digital",
    min: 0,
    max: 1,
  },
  
  // Y-axis for computed (right 2)
  {
    side: 1,
    scale: "y_computed",
    label: "Power (W)",
    min: 0,
    max: 12000,
  }
]
```

---

## Chart Rendering Process

```
┌─────────────────────────────────────────────────────────────┐
│ renderGroupCharts()                                         │
│ ├─ For each group (G0, G1, G3):                            │
│ │  └─ createMergedGroupChart(groupId)                      │
│ │     ├─ Collect channels by type                          │
│ │     ├─ Prepare labels, colors, data                      │
│ │     ├─ Create container (parentDiv, chartDiv)            │
│ │     ├─ Build chart options (axes, scales, series)        │
│ │     ├─ Create digital fill plugin (if digital present)   │
│ │     ├─ Initialize uPlot instance                         │
│ │     ├─ Register in metadata store                        │
│ │     └─ Push chart to charts array                        │
│ └─ Return (all charts rendered)                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Visual Output

### BEFORE (Type-Centric) - 3 Separate Charts

```
┌──────────────────────────────────────────────────────────┐
│  Page: COMTRADE Viewer                                   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─ Analog G0 ────────────────────────────────────────┐ │
│  │                                                    │ │
│  │  IA (red)  ┌─╮    ┌─╮                            │ │
│  │  IB (grn)  │ ╰─╮  │ ╰─╮   ┌─╮                   │ │
│  │  IC (blu)  │   ╰──┘   ╰───┘ ╰─╮                 │ │
│  │            │                  ╰───────          │ │
│  │  Y: 0-150A │                    Time →          │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ Digital G0 ───────────────────────────────────────┐ │
│  │                                                    │ │
│  │  SV03 ┌──────┐         ┌─────────┐   ┌────┐      │ │  ← SEPARATE
│  │  (yel)│      │         │         │   │    │      │ │
│  │       │      │         │         │   │    │      │ │
│  │  Y: 0-1│ Time →                           │      │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ Computed G0 ──────────────────────────────────────┐ │
│  │                                                    │ │
│  │  P_avg   ╱╲     ╱╲    ╱╲       ╱╲                │ │  ← SEPARATE
│  │  (mag)  ╱  ╲   ╱  ╲  ╱  ╲     ╱  ╲               │ │
│  │  Y: 0-12000│ Time →                              │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### AFTER (Group-Centric) - 1 Merged Chart

```
┌──────────────────────────────────────────────────────────┐
│  Page: COMTRADE Viewer                                   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─ Group G0 (3 analog, 1 digital, 1 computed) ──────┐ │
│  │                                                    │ │
│  │  IA (red)  ┌─╮    ┌─╮                  ╱╲  P_avg │ │
│  │  IB (grn)  │ ╰─╮  │ ╰─╮   ┌─╮        ╱  ╲       │ │
│  │  IC (blu)  │   ╰──┘   ╰───┘ ╰─╮     ╱    ╲      │ │  ← MERGED
│  │            │                  ╰───╱      ╲     │ │     IN ONE
│  │  SV03 ┌──────┐         ┌─────────┐   ┌────┐      │ │     CHART!
│  │  (yel)│      │         │         │   │    │      │ │
│  │       │      │         │         │   │    │      │ │
│  │       │ Time →                           │      │ │
│  │                                                    │ │
│  │  Y₁: 0-150A  │  Y₂: 0-1 (digital) │  Y₃: 0-12000│ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ Group G1 (2 analog, 0 digital, 2 computed) ──────┐ │
│  │                                                    │ │
│  │  ... (another merged chart with different types)  │ │
│  │                                                    │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Key Differences Highlighted

| Aspect | Type-Centric (Old) | Group-Centric (New) |
|--------|-------------------|-------------------|
| **Charts Per Group** | 3 (A, D, C) | 1 (Mixed) |
| **Canvas Elements** | Multiple per group | 1 per group |
| **Memory Usage** | ~3x | ~1x |
| **Cross-Type Merge** | ❌ Separate | ✅ Same chart |
| **Metadata Entry** | Per (type, group) | Per group |
| **User Experience** | Disjointed | Unified |
| **Code Simplicity** | 3 renderers | 1 renderer |

---

## Message Flow Diagram

```
┌──────────────┐
│ User         │
│ Edit Group   │
│ SV03: G3→G0  │
└──────┬───────┘
       │
       │ postMessage
       ▼
┌──────────────────────────────────┐
│ main.js                          │
│ GROUP handler                    │
│                                  │
│ Update state:                    │
│ channelState.digital.groups[0]   │
│  = "G0"                          │
└──────┬───────────────────────────┘
       │
       │ Trigger
       ▼
┌──────────────────────────────────┐
│ renderComtradeCharts()           │
│                                  │
│ 1. Destroy old charts            │
│ 2. Clear container               │
│ 3. Call renderGroupCharts()      │
└──────┬───────────────────────────┘
       │
       │
       ▼
┌─────────────────────────────────────────────────────┐
│ renderGroupCharts()                                 │
│                                                     │
│ 1. Build groupsMap from state                       │
│ 2. For each group:                                  │
│    └─ createMergedGroupChart()                      │
│       ├─ Collect channels                           │
│       ├─ Prepare data                               │
│       ├─ Create uPlot                               │
│       ├─ Register metadata                          │
│       └─ Add to charts[]                            │
└──────┬───────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│ DOM Update                                          │
│                                                     │
│ New Chart Visible:                                  │
│ "Group G0 (3 analog, 1 digital, 1 computed)"       │
│                                                     │
│ With:                                               │
│ • All types visible together                        │
│ • Multiple Y-axes                                   │
│ • Digital fill rectangles with colors              │
└─────────────────────────────────────────────────────┘
```

---

## State Management Diagram

```
Before Change:
┌─────────────────────────────────────┐
│ channelState.digital.groups         │
│                                     │
│ Index:  0      1      2      3      │
│ Value: "G0"   "G1"   "G3"   "G3"    │
│        SV01   SV02   SV03   SV04    │
└─────────────────────────────────────┘

User Action: Change SV03 (index 2) from G3 → G0
                           ↓
After Change:
┌─────────────────────────────────────┐
│ channelState.digital.groups         │
│                                     │
│ Index:  0      1      2      3      │
│ Value: "G0"   "G1"   "G0"   "G3"    │ ← Changed!
│        SV01   SV02   SV03   SV04    │
└─────────────────────────────────────┘

Result: Now G0 contains both analog (from .analog.groups) and SV03
        → Single merged chart created instead of 2 separate
```

---

This visual representation shows how the group-centric approach fundamentally changes the architecture to create one unified chart per group rather than separate charts per type per group.

