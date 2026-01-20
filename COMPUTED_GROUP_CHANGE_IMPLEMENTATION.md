# Computed Channel Group Change Implementation

## Overview

This implementation enables computed channels to be moved to different analog group charts through a reactive group-change workflow that mirrors the existing color-change pattern. When a user changes a computed channel's `group` field in the Tabulator UI, the channel is automatically reorganized to render alongside the matching analog group in the same uPlot instance.

## Key Principles

✅ **Reactive Updates**: Changes fire immediately when user edits the group field
✅ **localStorage Persistence**: Group changes are saved for persistence across page reloads
✅ **Integrated Rendering**: Computed channels render in the same uPlot as their matching analog group
✅ **Minimal Full Rebuilds**: Only affected charts are destroyed and re-rendered
✅ **UI State Sync**: Both in-memory state and localStorage stay in sync

## Implementation Details

### 1. ChannelList.js - Event Generation

**Location**: `src/components/ChannelList.js` (lines 2426+)

When user edits the `group` field in the Tabulator for a computed channel:

```javascript
} else if (field === "group") {
  // ✅ Use separate callback for computed channels (group change)
  if (rowData?.type && rowData.type.toLowerCase() === "computed") {
    messageType = "callback_computed_group";  // New message type
    payload = {
      id: rowData?.id,
      channelID: rowData?.channelID,
      group: newValue,
      oldGroup: rowData?.group,
      value: newValue,
      row: rowData,
    };
  } else {
    // Analog/Digital use regular group callback
    messageType = "callback_group";
    // ...
  }
}
```

**Key Points**:
- Computed channels trigger `callback_computed_group` (not the generic `callback_group`)
- Payload includes: `id`, `group` (new), `oldGroup` (previous), and `row` data
- ID-based lookup pattern (like color changes)

### 2. Storage Layer - New Functions in computedChannelStorage.js

Three new functions added for group management:

#### `updateComputedChannelGroupInStorage(channelId, newGroup)`
```javascript
// Lightweight update - only modifies the group field
// Returns boolean success status
const success = updateComputedChannelGroupInStorage("VAB", "G2");
```

**What it does**:
1. Load computed channels from localStorage
2. Find channel by ID
3. Update its `group` property
4. Save back to localStorage
5. Log the change

#### `getComputedChannelById(channelId)`
```javascript
// Fetch a single computed channel by ID
const computedCh = getComputedChannelById("VAB");
// Returns: { id: "VAB", name: "VAB", group: "G2", color: "#...", data: [...], ... }
```

### 3. Main.js - Group Change Handler

**Location**: `src/main.js` (new case after color handler)

The `callback_computed_group` case implements the complete flow:

```javascript
case "callback_computed_group": {
  // 1. Extract payload
  const channelId = payload?.id;
  const newGroup = payload?.group;
  const oldGroup = payload?.oldGroup;

  // 2. Update storage
  updateComputedChannelGroupInStorage(channelId, newGroup);

  // 3. Update cfg.computedChannels if available
  // 4. Update computed state if available
  // 5. Trigger chart rebuild via renderComtradeCharts()
}
```

**Handler Steps**:

1. **Validate Input**: Ensure `channelId` and `newGroup` are present
2. **Update Storage**: Call `updateComputedChannelGroupInStorage()` to persist change
3. **Update In-Memory State**: 
   - Update `cfg.computedChannels[idx].group` if available
   - Update `computedState.groups[idx]` if available
4. **Show Progress**: Display progress bar for user feedback
5. **Rebuild Charts**: Call `renderComtradeCharts()` to re-render
   - This triggers `renderAnalogCharts()` which now includes computed channels
   - The new group from localStorage is picked up automatically

### 4. renderAnalogCharts.js - Integration Point

**Location**: `src/components/renderAnalogCharts.js`

The most critical change: merging computed channels into analog charts.

#### Import Addition
```javascript
import { loadComputedChannelsFromStorage } from "../utils/computedChannelStorage.js";
```

#### Chart Data Merging
```javascript
// Step 1: Fetch computed channels for this group
const storedComputedChannels = loadComputedChannelsFromStorage();
const computedForGroup = storedComputedChannels.filter(
  (ch) => ch.group === groupId
);

// Step 2: Build combined chart data
const chartData = [
  data.time,
  ...validIndices.map((idx) => data.analogData[idx]),  // Analog series
  ...computedForGroup.map((ch) => ch.data),            // Computed series
];

// Step 3: Merge labels, colors, units
const mergedLabels = [...groupYLabels, ...computedForGroup.map(ch => ch.name)];
const mergedColors = [...groupLineColors, ...computedForGroup.map(ch => ch.color)];
const mergedUnits = [...groupYUnits, ...computedForGroup.map(ch => ch.unit)];
const mergedAxesScales = [...groupAxesScales, ...computedForGroup.map(() => 1)];

// Step 4: Pass merged data to createChartOptions
const opts = createChartOptions({
  yLabels: mergedLabels,
  lineColors: mergedColors,
  yUnits: mergedUnits,
  axesScales: mergedAxesScales,
  // ...
});
```

#### Chart Metadata Attachment
```javascript
// Attach computed channel info to chart for reference
chart._computedChannels = computedForGroup.map((ch) => ({
  id: ch.id, name: ch.name, color: ch.color, group: ch.group
}));
chart._computedChannelIds = computedForGroup.map((ch) => ch.id);
chart._analogSeriesCount = validIndices.length;
chart._computedSeriesCount = computedForGroup.length;
```

## Data Flow

### Complete Group Change Flow

```
User edits "group" field in ChannelList Tabulator
         ↓
cellEdited event fires in ChannelList.js
         ↓
Determine field === "group" and type === "computed"
         ↓
Fire callback_computed_group with:
  - id: "VAB"
  - oldGroup: "G1"
  - newGroup: "G2"
         ↓
main.js case "callback_computed_group" handler:

  STEP 1: Validate
    - Check id and newGroup exist
    
  STEP 2: Persist to localStorage
    - updateComputedChannelGroupInStorage("VAB", "G2")
    - Saves: { id: "VAB", group: "G2", ... }
    
  STEP 3: Update in-memory state
    - cfg.computedChannels[idx].group = "G2"
    - computedState.groups[idx] = "G2"
    
  STEP 4: Show progress
    - showProgress("Reorganizing...")
    
  STEP 5: Rebuild charts
    - Call renderComtradeCharts()
         ↓
renderAnalogCharts() is called for each group:

  For group "G1":
    - Load computed channels from localStorage
    - Filter: group === "G1"
    - Result: VAB is NO LONGER in G1 (removed from merged data)
    - Render G1 chart without VAB
    
  For group "G2":
    - Load computed channels from localStorage
    - Filter: group === "G2"
    - Result: VAB IS NOW in G2 (added to merged data)
    - Render G2 chart WITH VAB (merged with analog channels)
    
         ↓
Charts complete rendering
         ↓
Hide progress, complete
         ↓
User sees VAB now in G2 chart with correct colors/labels
```

## localStorage Schema

### Computed Channel Object
```json
{
  "id": "VAB",
  "name": "VAB (Phase-to-Phase)",
  "type": "Computed",
  "unit": "V",
  "color": "#dc2626",
  "group": "G2",              // KEY: Updated when user changes group
  "expression": "VAB=sqrt((VA-VB)^2)",
  "mathJsExpression": "VAB=sqrt((VA-VB)^2)",
  "data": [... numeric array ...],
  "samples": 62464
}
```

**Change**: `group` field is updated from "G1" to "G2"

## Chart Structure After Group Change

### Before (Separate computed chart)
```
G1 Chart:
  - Series 0: time
  - Series 1-5: Analog channels (A0-A4)
  - Series 6-8: (VAB not here)

Computed Chart:
  - Series 0: time
  - Series 1: VAB
  - Series 2: (other computed)

G2 Chart:
  - Series 0: time
  - Series 1-4: Analog channels (A5-A8)
```

### After Group Change (G1 → G2)
```
G1 Chart:
  - Series 0: time
  - Series 1-5: Analog channels (A0-A4)
  - (VAB removed)

G2 Chart:
  - Series 0: time
  - Series 1-4: Analog channels (A5-A8)
  - Series 5: VAB (merged - computed channel now here!)
  - (Computed chart becomes empty or is hidden)

Chart metadata:
  chart._computedChannels = [{ id: "VAB", name: "VAB", ... }]
  chart._computedChannelIds = ["VAB"]
  chart._analogSeriesCount = 4
  chart._computedSeriesCount = 1
```

## Key Design Decisions

### 1. Why Load from localStorage in renderAnalogCharts?
- **Reason**: The group change is persisted to localStorage before rendering
- **Benefit**: No need to pass state through multiple function layers
- **Trade-off**: Requires small I/O to fetch stored channels (negligible for typical datasets)

### 2. Why Full Chart Rebuild vs. In-Place Merge?
- **Reason**: uPlot doesn't support dynamic series addition/removal cleanly
- **Benefit**: Ensures consistency - new series have correct indices, axes align properly
- **Alternative Considered**: In-place series manipulation (rejected as error-prone)

### 3. Why Separate callback_computed_group?
- **Reason**: Uses ID-based lookup (like color changes), not index-based
- **Benefit**: Consistent pattern with color changes, easier to trace
- **Alternative**: Generic callback_group (but harder to distinguish at handler level)

### 4. Why Update Both cfg and State?
- **Reason**: Different parts of app consume from different sources
- **Benefit**: Ensures synchronization across multiple state management layers
- **Safety**: If one source fails, the other might still work

## Error Handling

### Graceful Degradation

```javascript
// 1. Storage update fails
//    → Handler logs warning, continues (at least in-memory is updated)

// 2. In-memory update fails (cfg/state not available)
//    → Handler logs warning, continues (storage is already updated)

// 3. Chart rebuild fails (renderComtradeCharts not available)
//    → Handler logs warning, hides progress
//    → User might need to reload page

// 4. Computed channel missing data array
//    → renderAnalogCharts logs warning, skips that channel
//    → Other channels still render correctly
```

## Console Logging

### What You'll See
```javascript
// User changes VAB group from G1 to G2

[COMPUTED GROUP HANDLER] 📢 Computed channel group change received: {...}
[COMPUTED GROUP HANDLER] 🏷️ Moving "VAB" from group "G1" to "G2"
[Storage] ✅ Updated group for "VAB": "G1" → "G2"
[COMPUTED GROUP HANDLER] ✅ Updated group in storage
[COMPUTED GROUP HANDLER] ✅ Updated cfg.computedChannels[0].group = "G2"
[COMPUTED GROUP HANDLER] ✅ Updated computedState.groups[2] = "G2"
[COMPUTED GROUP HANDLER] 🔄 Triggering chart rebuild...

// Chart rendering begins
[renderAnalogCharts] 🟪 Group "G1": Found 0 computed channels to merge
[renderAnalogCharts] 🟪 Group "G2": Found 1 computed channels to merge
[renderAnalogCharts] 📈 Added computed channel "VAB" (VAB) to group "G2"
[renderAnalogCharts] 📊 Group "G2": analog=4, computed=1, total series=5
[renderAnalogCharts] ✅ Chart config: group="G2", ...

[COMPUTED GROUP HANDLER] ✅ Chart rebuild triggered
```

## Usage Pattern

### For Users
1. Open ChannelList (right panel)
2. Find a computed channel row
3. Click on the "group" cell
4. Select new group from dropdown (or type)
5. Press Enter / click outside
6. Wait for progress bar to complete
7. See computed channel moved to new group chart

### For Developers
```javascript
// Manually trigger group change (if needed)
const payload = {
  id: "VAB",
  group: "G2",
  oldGroup: "G1",
  row: { id: "VAB", group: "G1" }
};
handleCallback("callback_computed_group", payload);
```

## Testing Checklist

- [ ] Change computed channel group → see it move to new chart
- [ ] Change group → reload page → group persists in localStorage
- [ ] Change color of moved channel → color updates in new chart
- [ ] Multiple computed channels in same group → all move together
- [ ] Tooltip shows correct values for all series in merged chart
- [ ] Vertical line overlays work with merged series
- [ ] Delta calculations include merged computed channels
- [ ] Console shows appropriate log messages
- [ ] Progress bar appears and disappears correctly
- [ ] No JavaScript errors

## Related Features

### Color Changes (Existing)
- `callback_computed_color` in ChannelList.js
- Color handler in main.js
- Reflected in chart legend and series

### Analog Group Changes (Existing)
- `callback_group` for analog/digital channels
- Different handler in main.js
- Handled through channelState subscription

## Future Enhancements

1. **UI Improvements**:
   - Highlight moved channel in progress bar
   - Show "moved from G1 to G2" message

2. **Performance**:
   - Cache computed channels fetch
   - Only rebuild affected groups (not full renderComtradeCharts)

3. **Validation**:
   - Prevent invalid group assignments
   - Show validation errors in UI

4. **Undo/Redo**:
   - Track group change history
   - Allow reverting changes

## Dependencies

- `loadComputedChannelsFromStorage`: Fetch stored computed channels
- `updateComputedChannelGroupInStorage`: Persist group changes
- `getComputedChannelById`: Get channel details
- `getComputedChannelsState`: Access computed state
- `renderComtradeCharts`: Full chart rebuild
- `renderAnalogCharts`: Analog chart rendering (now includes computed)

## Architecture Notes

### Why This Approach?

**Current Architecture**:
- Analog charts: Built from `cfg.analogChannels` + `channelState`
- Computed charts: Built from `data.computedData` + localStorage
- They were separate and unconnected

**Challenge**:
- Integrate computed channels into analog charts without breaking either system
- Maintain backward compatibility

**Solution**:
- Keep both systems independent
- In `renderAnalogCharts`, check localStorage for matching computed channels
- Merge them into the chart data/metadata on-the-fly
- When group changes, trigger full rebuild to re-evaluate

**Benefit**:
- Minimal changes to core systems
- Easy to test (isolated handler logic)
- Backward compatible (if computed data missing, analog still works)
- Extensible (can add more conditions later)

