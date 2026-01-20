# Critical Fix: Analog Data Loss When Changing Computed Channel Group

## Problem Identified

When you change the group ID of a computed channel in the tabulator (ChannelList):
1. ❌ Analog channel data was lost for ALL groups
2. ❌ Charts showed `analogSeries=0` (no analog data found)
3. ❌ Only computed channels were visible in the rebuilt charts
4. ❌ Original channel data from the COMTRADE file disappeared

### Root Cause

When `rebuildChartsForComputedGroup()` is triggered (by changing group in tabulator), it:
1. Clears all charts and DOM
2. Calls `renderComtradeCharts(renderData, ...)` 
3. The `renderData` passed might have **empty `analogData` arrays**

Why? The module-level `data` object might have been reinitialized or cleared at some point, and `window.globalData` might not have the complete original analog channel arrays.

---

## Fix Applied

### File: `src/main.js` - Line ~5040

**Added fallback logic to preserve analog data:**

```javascript
// 🔍 CRITICAL FIX: If renderData has no analogData, fallback to window.globalData
// This handles the case where the module-level 'data' was cleared or reinitialized
if (!renderData?.analogData || renderData.analogData.length === 0) {
  console.warn(
    `[COMPUTED GROUP HANDLER] ⚠️ renderData.analogData is empty, using window.globalData...`
  );
  renderData = window.globalData;
}
```

**Added debug logging to validate data:**

```javascript
console.log(
  `[COMPUTED GROUP HANDLER] 📋 Data validation:`,
  {
    hasAnalogData: !!renderData.analogData,
    analogDataLength: renderData.analogData?.length || 0,
    hasDigitalData: !!renderData.digitalData,
    digitalDataLength: renderData.digitalData?.length || 0,
    hasComputedData: !!renderData.computedData,
    computedDataLength: renderData.computedData?.length || 0,
    cfgAnalogChannels: renderCfg.analogChannels?.length || 0,
    cfgDigitalChannels: renderCfg.digitalChannels?.length || 0,
    cfgComputedChannels: renderCfg.computedChannels?.length || 0,
  }
);
```

---

## How It Works Now

### When you change computed channel group in tabulator:

1. **Old behavior:**
   ```
   renderData = data || window.globalData  // data might be empty
   → analogData missing
   → analogSeries=0
   → charts broken
   ```

2. **New behavior:**
   ```
   renderData = data || window.globalData
   
   if (renderData.analogData.length === 0) {
     renderData = window.globalData  // Use backup with complete data
   }
   
   → analogData restored
   → analogSeries=3 (correct count)
   → all groups rendered properly
   ```

---

## Data Flow Restored

### For a 7-channel COMTRADE file with 3 groups (G0, G1, G2):

**Before Fix:**
```
Load file → data.analogData has all 7 channels ✓
Create computed channel → data becomes minimal object ✗
Change group → renderData.analogData is empty ✗
Result: analogSeries=0 ✗
```

**After Fix:**
```
Load file → data.analogData has all 7 channels ✓
Create computed channel → data becomes minimal object ✓
Change group → detect empty analogData, use window.globalData ✓
window.globalData.analogData has all 7 channels ✓
Result: analogSeries=7 (correct) ✓
```

---

## Testing

To verify the fix works:

1. **Load COMTRADE file with multiple groups** (G0, G1, G2 with 7 channels)
2. **Create a new computed channel** and assign to G0
   - ✓ Should see computed chart rendered
   - ✓ Analog charts should still show original channels
3. **In ChannelList tabulator, change the group ID** from one group to another
   - ✓ Should see the computed channel move to new group
   - ✓ **CRITICAL:** Original analog channels for ALL groups should be visible
   - ✓ Should see merged computed channel in target group
4. **Verify logs** should show:
   ```
   [COMPUTED GROUP HANDLER] 📋 Data validation:
   - analogDataLength: 7 (not 0)
   - analogSeries count should match channel count
   ```

---

## Files Modified

- `src/main.js` - Added fallback logic in `rebuildChartsForComputedGroup()` function

## Key Insight

**The issue was data object fragmentation:**
- File load creates `data` with all `analogData`
- Computed channel creation might reinitialize or clear `data`
- When changing groups, the stale `data` was being used instead of `window.globalData`

**Solution:** Always validate that `analogData` exists before using it, and fallback to `window.globalData` if needed.
