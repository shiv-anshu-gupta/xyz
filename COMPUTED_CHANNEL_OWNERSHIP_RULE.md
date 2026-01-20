# Computed Channel Ownership Rule Implementation

**Date:** January 18, 2026  
**Status:** ✅ IMPLEMENTED  
**Pattern:** Option 1 - Ownership Rules (Deterministic, No Flags)

---

## Executive Summary

Computed channels now follow a **single, deterministic ownership rule** that prevents duplicate rendering:

**Rule:** *A computed channel is OWNED by the analog chart if its group ID matches one of the analog group IDs.*

---

## The Ownership Rule

### Simple Decision Tree

```
When rendering computed channels:

For each computed channel:
  ├─ Does it have a group assigned?
  │  └─ Yes: Is that group in analogGroupIds?
  │     ├─ Yes → OWNED by analog chart
  │     │       ├─ renderSingleAnalogChart will include it
  │     │       └─ renderComputedChannels EXCLUDES it ✅
  │     │
  │     └─ No → NOT owned by analog
  │            └─ renderComputedChannels INCLUDES it (standalone) ✅
  │
  └─ No group assigned?
     └─ NOT owned by analog
        └─ renderComputedChannels INCLUDES it (standalone) ✅
```

---

## Implementation Details

### 1. Function: `filterUnassignedComputedChannels()`

**File:** `src/utils/computedChannelDataProcessor.js`

```javascript
/**
 * OWNERSHIP RULE: Filter computed channels
 * Rule: A computed channel is "owned" by analog chart if its group ID matches an analog group
 * 
 * Renders in: analog chart (if group assigned)
 * Renders in: standalone computed chart (if no group or group is unknown)
 * 
 * @param {Array} allComputedChannels - All computed channels from data
 * @param {Array|Set} analogGroupIds - Array or Set of analog group IDs
 * @returns {Array} Filtered computed channels NOT owned by analog groups
 */
export function filterUnassignedComputedChannels(
  allComputedChannels,
  analogGroupIds
) {
  // Convert array to Set for O(1) lookup
  const groupSet =
    analogGroupIds instanceof Set
      ? analogGroupIds
      : new Set(analogGroupIds || []);

  console.log(
    `[OWNERSHIP] Filtering computed channels. Analog groups: [${Array.from(groupSet).join(", ")}]`
  );

  return allComputedChannels.filter((ch) => {
    // Check ownership rule: Does this channel belong to an analog group?
    if (ch && ch.group && groupSet.has(ch.group)) {
      // OWNED by analog chart - exclude from standalone
      console.log(
        `[OWNERSHIP] Channel "${ch.id}": OWNED by analog group "${ch.group}" → Exclude from standalone`
      );
      return false; // Don't include in standalone computed chart
    }

    // NOT owned by analog - include in standalone
    if (ch && ch.group) {
      console.log(
        `[OWNERSHIP] Channel "${ch.id}": Group "${ch.group}" is NOT an analog group → Include in standalone`
      );
    } else if (ch) {
      console.log(
        `[OWNERSHIP] Channel "${ch.id}": No group assigned → Include in standalone`
      );
    }

    return true; // Include in standalone computed chart
  });
}
```

### 2. Usage in `renderComputedChannels()`

**File:** `src/components/renderComputedChannels.js` (lines 56-79)

```javascript
// ✅ OWNERSHIP RULE: Filter computed channels
// Rule: If a computed channel's group matches an analog group, it's OWNED by that analog chart
// Therefore, exclude it from standalone computed charts
// This ensures mutual exclusivity: each channel renders in exactly ONE place
const analogGroupIds = channelState?.analog?.groups || [];

const computedChannels = filterUnassignedComputedChannels(
  allComputedChannels,
  analogGroupIds
);

if (computedChannels.length === 0) {
  console.log(
    "[renderComputedChannels] ℹ️ No standalone computed channels to render " +
    "(all are owned by analog groups or unassigned)"
  );
  return;
}
```

### 3. Auto-Inclusion in `renderSingleAnalogChart()`

**File:** `src/components/renderSingleAnalogChart.js` → `prepareChartDataContext()` → `loadComputedChannelsForGroup()`

Analog charts automatically load computed channels that match their group ID:

```javascript
// In chartDataProcessor.js
const computedForGroup = loadComputedChannelsForGroup(groupId);
// This loads from localStorage filtered by groupId
```

---

## Data Flow: Complete Lifecycle

### Scenario 1: Create Computed Channel (No Group)

```
1. User creates V_avg in MathLive
   channel = {
     id: "comp_001",
     name: "V_avg",
     group: undefined  // No group assigned yet
   }

2. renderComputedChannels() called:
   filterUnassignedComputedChannels([V_avg], analogGroupIds)
   ├─ ch.group is undefined
   └─ return true → INCLUDE in standalone ✅
   
3. Result:
   ├─ Standalone computed chart: Shows V_avg
   └─ Analog charts: Don't have V_avg (no group match)
```

### Scenario 2: Change Group to Analog Group

```
1. User changes group: V_avg.group = "Phase_A"
   (Phase_A is an analog group)

2. rebuildChartsForComputedGroup() called:
   ├─ Update localStorage with new group
   ├─ renderAnalogCharts() called
   │  └─ renderSingleAnalogChart("Phase_A")
   │     └─ prepareChartDataContext()
   │        └─ loadComputedChannelsForGroup("Phase_A")
   │           └─ Finds V_avg (group === "Phase_A") ✅
   │
   └─ renderComputedChannels() called:
      filterUnassignedComputedChannels([V_avg], ["Phase_A", ...])
      ├─ ch.group === "Phase_A"
      ├─ groupSet.has("Phase_A") = true
      └─ return false → EXCLUDE from standalone ✅

3. Result:
   ├─ Analog chart Phase_A: Shows V_avg (merged with analog channels)
   └─ Standalone computed chart: Does NOT show V_avg ✅ MUTUAL EXCLUSIVITY
```

### Scenario 3: Change Group Back to Unassigned

```
1. User removes group: V_avg.group = undefined
   (Or changes to unknown group)

2. rebuildChartsForComputedGroup() called:
   ├─ renderAnalogCharts() called
   │  └─ renderSingleAnalogChart() for each group
   │     └─ loadComputedChannelsForGroup() finds nothing (no group match)
   │
   └─ renderComputedChannels() called:
      filterUnassignedComputedChannels([V_avg], ["Phase_A", ...])
      ├─ ch.group is undefined
      └─ return true → INCLUDE in standalone ✅

3. Result:
   ├─ Analog charts: Don't have V_avg
   └─ Standalone computed chart: Shows V_avg again ✅
```

---

## Why This Works

### ✅ Advantages

1. **Deterministic**: Same input always produces same output
   ```javascript
   // This always gives the same answer:
   shouldRenderAsStandalone(channel, analogGroupIds)
   // Independent of rendering order, render cycles, or history
   ```

2. **No State Mutation**: Uses only immutable data (group IDs)
   ```javascript
   // We only read from:
   // - channel.group (never changed by filter)
   // - analogGroupIds (constant during render)
   // No flags, no cleanup
   ```

3. **No Order Dependency**: Works regardless of render sequence
   ```javascript
   // Doesn't matter if analog renders first or computed renders first
   // Each independently makes same decision
   ```

4. **Self-Cleaning**: No flags to forget to reset
   ```javascript
   // Next render cycle: Rule is re-evaluated from scratch
   // No stale state from previous cycle
   ```

5. **Clear Intent**: Code reads like business logic
   ```javascript
   // "If group matches analog group → not standalone"
   // vs. "Check if flag is set"
   ```

---

## Testing Scenarios

### Test 1: Create Channel Without Group

```
Steps:
1. Load COMTRADE file (groups: Phase_A, Phase_B, Phase_C)
2. Create computed channel, DON'T assign group
3. Verify:
   ✅ Channel appears in standalone computed chart
   ❌ Channel does NOT appear in any analog chart
```

### Test 2: Create and Assign to Analog Group

```
Steps:
1. Load COMTRADE file (groups: Phase_A, Phase_B, Phase_C)
2. Create computed channel
3. In tabulator, change group from "undefined" → "Phase_A"
4. Verify:
   ❌ Channel does NOT appear in standalone computed chart
   ✅ Channel appears ONLY in Phase_A analog chart (merged with analog channels)
```

### Test 3: Move Between Groups

```
Steps:
1. Load COMTRADE file (groups: Phase_A, Phase_B, Phase_C)
2. Create channel, assign to Phase_A
3. In tabulator, change group: Phase_A → Phase_B
4. Verify after each change:
   ❌ Channel does NOT appear in standalone chart
   ✅ Channel appears in old group's chart? NO
   ✅ Channel appears in new group's chart? YES
```

### Test 4: Unassign from Group

```
Steps:
1. Load COMTRADE file (groups: Phase_A, Phase_B, Phase_C)
2. Create channel, assign to Phase_A
3. In tabulator, change group: Phase_A → (clear/undefined)
4. Verify:
   ✅ Channel reappears in standalone computed chart
   ❌ Channel does NOT appear in any analog chart
```

---

## Debug Logging

When you open browser console, you'll see:

```
[OWNERSHIP] Filtering computed channels. Analog groups: [Phase_A, Phase_B, Phase_C]
[OWNERSHIP] Channel "V_avg": OWNED by analog group "Phase_A" → Exclude from standalone
[OWNERSHIP] Channel "I_total": Group "undefined" is NOT an analog group → Include in standalone
```

This tells you exactly which channels are owned by which renderer.

---

## Edge Cases Handled

### Edge Case 1: No Analog Groups

```javascript
analogGroupIds = [] or undefined

filterUnassignedComputedChannels([all channels], [])
// All channels: groupSet.has(ch.group) = false for all
// Result: All computed channels included in standalone ✅
```

### Edge Case 2: Channel with Invalid Group

```javascript
analogGroupIds = ["Phase_A", "Phase_B"]
channel = { group: "Unknown_Group" }

groupSet.has("Unknown_Group") = false
// Result: Channel included in standalone ✅
// (Not owned by any analog group)
```

### Edge Case 3: Mixed Scenario

```javascript
analogGroupIds = ["Phase_A", "Phase_B"]
channels = [
  { id: "ch1", group: "Phase_A" },        // OWNED by Phase_A
  { id: "ch2", group: undefined },        // NOT owned (standalone)
  { id: "ch3", group: "Phase_C" },        // NOT owned (invalid group)
  { id: "ch4", group: "Phase_B" },        // OWNED by Phase_B
]

Result:
├─ renderComputedChannels renders: [ch2, ch3]
├─ renderSingleAnalogChart("Phase_A") includes: ch1
└─ renderSingleAnalogChart("Phase_B") includes: ch4
```

---

## No Changes to Other Functions

These functions **already work correctly** with the ownership rule:

- ✅ `renderAnalogCharts()` - Loops and calls renderSingleAnalogChart
- ✅ `renderSingleAnalogChart()` - Loads computed channels for its group
- ✅ `loadComputedChannelsForGroup()` - Filters localStorage by group
- ✅ `prepareChartDataContext()` - Merges analog + computed data

No modifications needed!

---

## Summary

| Aspect | Implementation |
|--------|----------------|
| **Pattern** | Option 1 - Ownership Rules |
| **Owner Determination** | `channel.group ∈ analogGroupIds` |
| **State Mutation** | None |
| **Order Dependent** | No |
| **Cleanup Required** | No |
| **Deterministic** | Yes |
| **Self-Documenting** | Yes |

The ownership rule is now the **single source of truth** for determining which renderer owns each computed channel. 🎯

---

## Files Modified

- `src/utils/computedChannelDataProcessor.js` - Enhanced `filterUnassignedComputedChannels()` with ownership rule explanation
- `src/components/renderComputedChannels.js` - Added ownership rule documentation and logging

---

## Next Steps

1. ✅ Test all scenarios above
2. ✅ Verify console logs show correct ownership decisions
3. ✅ Ensure no duplicate rendering occurs
4. ✅ If issues arise, ownership rule makes debugging easy:
   - Check if `channel.group` is correct
   - Check if `analogGroupIds` includes the group
   - Rule evaluation is pure function with no side effects
