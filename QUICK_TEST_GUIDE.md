# Quick Start: Test Group-Centric Merged Charts

## What's New

✨ **ONE CHART PER GROUP** containing all channel types (analog + digital + computed) instead of three separate charts.

## Immediate Action Items

### 1️⃣ Load Your Application

```bash
# In your project directory
npm run dev
# or
yarn dev
```

### 2️⃣ Load a COMTRADE File

1. Open the application in your browser
2. Load your test COMTRADE file (one with analog, digital, and computed channels)
3. **Observe the console** (F12 → Console tab) for:

```
✅ SUCCESS LOGS:
[renderGroupCharts] 🎯 Starting GROUP-CENTRIC rendering...
[renderGroupCharts] 📋 Built groups map: [...]
[renderGroupCharts] ✨ Chart instance created for group G0
[renderGroupCharts] ✅ Group-centric rendering complete: X chart(s) created
```

### 3️⃣ Check Chart Layout

**Expected behavior**:
- Instead of 3 separate charts (Analog G0, Digital G0, Computed G0)
- You should see **1 merged chart** with title like: `Group G0 (3 analog, 1 digital, 0 computed)`

### 4️⃣ Test Cross-Type Grouping

**This is the big test**:

1. Open **Channel List** (right-click on chart or menu button)
2. Find a digital channel (e.g., `SV03`)
3. Change its group from `G3` to `G0` (where analog currents are)
4. ✅ **EXPECTED**: The digital channel should now appear **IN THE SAME CHART** as analog, not in a separate chart
5. ❌ **PROBLEM**: If it still creates a separate chart, check console logs

### 5️⃣ Visual Check

**You should see**:
- Analog channels as **lines** (e.g., IA, IB, IC in red/blue/green)
- Digital channel as **filled rectangles** (if you moved one to analog group)
- Multiple **Y-axes** on the right (one for analog, one for digital)
- **Tooltip** showing correct values when hovering

---

## Console Debugging

### If everything works:
```
✅ [renderGroupCharts] 📋 Built groups map: [['G0', {analog: 3, digital: 1, computed: 0}]]
✅ [renderGroupCharts] ✨ Chart instance created for group G0
✅ Charts show with merged data
```

### If digital colors aren't showing:
```
⚠️ Check: [renderGroupCharts] 📐 Group G0 series setup colors array
   → All colors should be valid (hex, rgb, or rgba)
   → Look for invalid/transparent colors
```

### If cross-type grouping didn't work:
```
⚠️ Check: Does channelState.digital.groups[index] get updated?
   → Open Channel List, change group
   → Look for console output confirming the state change
   → If not updating, issue is in ChannelList → main.js flow
```

### If no charts appear at all:
```
❌ [renderGroupCharts] ❌ Error creating chart for group G0: ...
   → Full error shown below in console
   → Check browser console for stack trace
```

---

## Quick Test Script

Run this in browser console to check if the new system is active:

```javascript
// This should return a function (the new group-centric renderer)
console.log("renderGroupCharts available:", typeof window.renderGroupCharts);

// This should show channel state with groups for all types
console.log("channelState:", window.channelState);

// After file loads, check created charts
console.log("Charts created:", window.charts.length);
window.charts.forEach((c, i) => {
  console.log(`Chart ${i}:`, {
    group: c._userGroupId,
    type: c._chartType,
    analog: c._analogCount,
    digital: c._digitalCount,
    computed: c._computedCount
  });
});
```

---

## What to Report If Issues Found

If something doesn't work, collect this information:

```
1. Console output:
   - Screenshot or copy of [renderGroupCharts] logs
   - Any error messages

2. Expected vs actual:
   - How many charts you expected
   - How many charts actually appeared

3. Test case:
   - Number of analog/digital/computed channels
   - Which groups they're assigned to
   - What action caused the issue (loading file, changing group, etc.)

4. Browser info:
   - Browser name and version
   - Does it work in a different browser?
```

---

## Files Changed

| File | Change | Why |
|------|--------|-----|
| `renderGroupCharts.js` | **NEW** | Group-centric rendering engine |
| `renderComtradeCharts.js` | Updated | Now calls renderGroupCharts instead of type renderers |

---

## Quick Fallback (if needed)

If the new system has issues and you need to revert to type-centric:

Edit `renderComtradeCharts.js` around line 50:

```javascript
// CHANGE FROM:
renderGroupCharts(cfg, data, chartsContainer, charts, verticalLinesX, channelState);

// CHANGE TO (old system):
renderAnalogCharts(cfg, data, chartsContainer, charts, verticalLinesX, channelState, autoGroupChannels);
if (cfg.digitalChannels && cfg.digitalChannels.length > 0) {
  renderDigitalCharts(cfg, data, chartsContainer, charts, verticalLinesX, channelState);
}
renderComputedChannels(data, chartsContainer, charts, verticalLinesX, channelState);
```

Then reload the page.

---

## Next: Full Testing Plan

Once basic functionality works, test:

- [ ] Load file with all types → charts render
- [ ] Move digital channel to analog group → appears in same chart
- [ ] Move computed channel to same group → also in same chart
- [ ] Create a group with ONLY digital channels → still works
- [ ] Multiple groups (G0, G1, G2) with mixed types → each gets one chart
- [ ] Change group of channel → chart updates correctly
- [ ] Check console for any warnings/errors
- [ ] Verify colors are visible (not transparent/black)

---

## Need Help?

Check these in order:

1. **[GROUP_CENTRIC_IMPLEMENTATION_COMPLETE.md](GROUP_CENTRIC_IMPLEMENTATION_COMPLETE.md)** - Full implementation details
2. **[ARCHITECTURE_ANALYSIS_3RD_UPDATE.md](ARCHITECTURE_ANALYSIS_3RD_UPDATE.md)** - Why it was needed
3. **Browser console** - Always check for error messages
4. **Network tab** - Verify files are loaded (F12 → Network)

---

## Success Criteria

✅ You've succeeded when:

1. Load COMTRADE file → see charts with group labels
2. Console shows `[renderGroupCharts]` messages (no errors)
3. Move digital channel to analog group → **same chart**, not separate
4. Charts show analog lines + digital rectangles together
5. Multiple Y-axes visible and properly scaled

**Most Important**: Point 3 above. That's the whole point of the refactor. 🎯

