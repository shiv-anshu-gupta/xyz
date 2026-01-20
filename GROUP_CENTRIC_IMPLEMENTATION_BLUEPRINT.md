# Implementation Blueprint: Group-Centric Rendering

This document provides the exact code structure needed to migrate from type-centric to group-centric chart rendering.

## Current Problem

When you assign:
- Analog A1 → G0
- Digital D3 → G0  
- Computed C1 → G0

**You get**: 3 separate uPlot instances (Analog G0, Digital G0, Computed G0)
**You need**: 1 uPlot instance with 3 series types

## Solution Architecture

### Step 1: Create renderGroupCharts.js

Create a new file: `src/components/renderGroupCharts.js`

```javascript
/**
 * Group-centric chart renderer
 * Creates ONE uPlot per groupId containing analog+digital+computed channels
 */

import { createChartOptions } from "./chartComponent.js";
import { createDragBar } from "./createDragBar.js";
import { createChartContainer, initUPlotChart } from "../utils/chartDomUtils.js";
import { createDigitalFillPlugin } from "../plugins/digitalFillPlugin.js";
import verticalLinePlugin from "../plugins/verticalLinePlugin.js";
import { addChart } from "../utils/chartMetadataStore.js";
import { getMaxYAxes } from "../utils/maxYAxesStore.js";

const DigChannelOffset = 3; // From renderDigitalCharts.js

export function renderGroupCharts(
  cfg,
  data,
  chartsContainer,
  charts,
  verticalLinesX,
  channelState
) {
  const renderStartTime = performance.now();
  console.log("[renderGroupCharts] 🌍 Starting group-centric rendering...");

  // Step 1: Collect all unique group IDs
  const groupIds = new Set();
  
  if (Array.isArray(channelState?.analog?.groups)) {
    channelState.analog.groups.forEach(g => {
      if (g && typeof g === 'string' && /^G\d+$/.test(g)) groupIds.add(g);
    });
  }
  
  if (Array.isArray(channelState?.digital?.groups)) {
    channelState.digital.groups.forEach(g => {
      if (g && typeof g === 'string' && /^G\d+$/.test(g)) groupIds.add(g);
    });
  }
  
  if (Array.isArray(channelState?.computed?.groups)) {
    channelState.computed.groups.forEach(g => {
      if (g && typeof g === 'string' && /^G\d+$/.test(g)) groupIds.add(g);
    });
  }
  
  console.log("[renderGroupCharts] 📊 Unique groups found:", Array.from(groupIds));

  // Step 2: For each group, collect channels and create ONE chart
  groupIds.forEach(groupId => {
    renderSingleGroupChart(
      groupId,
      cfg,
      data,
      chartsContainer,
      charts,
      verticalLinesX,
      channelState
    );
  });

  const totalTime = performance.now() - renderStartTime;
  console.log(`[renderGroupCharts] ✅ Group rendering complete in ${totalTime.toFixed(2)}ms`);
}

function renderSingleGroupChart(
  groupId,
  cfg,
  data,
  chartsContainer,
  charts,
  verticalLinesX,
  channelState
) {
  console.log(`[renderGroupCharts] 🎯 Processing group: ${groupId}`);

  // ===== PHASE 1: COLLECT CHANNELS BY TYPE =====
  
  const analogIndices = [];
  const digitalIndices = [];
  const computedIndices = [];

  // Collect analog channels in this group
  if (Array.isArray(channelState?.analog?.groups)) {
    channelState.analog.groups.forEach((g, idx) => {
      if (g === groupId) analogIndices.push(idx);
    });
  }

  // Collect digital channels in this group
  if (Array.isArray(channelState?.digital?.groups)) {
    channelState.digital.groups.forEach((g, idx) => {
      if (g === groupId) digitalIndices.push(idx);
    });
  }

  // Collect computed channels in this group
  if (Array.isArray(channelState?.computed?.groups)) {
    channelState.computed.groups.forEach((g, idx) => {
      if (g === groupId) computedIndices.push(idx);
    });
  }

  console.log(`[renderGroupCharts] 📦 Group ${groupId} composition:`, {
    analog: analogIndices.length,
    digital: digitalIndices.length,
    computed: computedIndices.length,
  });

  // Skip if group is empty
  if (analogIndices.length === 0 && digitalIndices.length === 0 && computedIndices.length === 0) {
    console.log(`[renderGroupCharts] ⏭️ Group ${groupId} is empty, skipping`);
    return;
  }

  // ===== PHASE 2: PREPARE SERIES AND DATA ARRAYS =====

  const allSeries = [];
  const allData = [data.time]; // Always start with time array
  let currentSeriesIndex = 1;
  
  const colorMaps = {
    analog: [],
    digital: [],
    computed: [],
  };

  // ANALOG SERIES
  analogIndices.forEach((idx, localIdx) => {
    const ch = cfg.analogChannels[idx];
    const color = ch?.color || `hsl(${localIdx * 40}, 70%, 50%)`;
    colorMaps.analog.push(color);

    allSeries.push({
      label: ch?.name || `Analog ${idx}`,
      stroke: color,
      fill: undefined,
      scale: 'y_analog',
    });

    allData.push(data.analogData[idx]);
    currentSeriesIndex++;
  });

  // DIGITAL SERIES (must be converted to 0/1)
  const digitalFillSignals = [];
  digitalIndices.forEach((idx, localIdx) => {
    const ch = cfg.digitalChannels[idx];
    const color = ch?.color || `hsl(${180 + localIdx * 40}, 70%, 50%)`;
    colorMaps.digital.push(color);

    // Convert to 0/1 for digital rendering
    const binaryData = data.digitalData[idx].map(v => v ? 1 : 0);
    allData.push(binaryData);

    // Configure fill signal for this digital channel
    digitalFillSignals.push({
      signalIndex: currentSeriesIndex,
      offset: (digitalIndices.length - 1 - localIdx) * DigChannelOffset,
      color: `rgba(0, 150, 255, 0.3)`, // Will be updated by plugin
      targetVal: 1,
      originalIndex: idx,
    });

    allSeries.push({
      label: ch?.name || `Digital ${idx}`,
      stroke: 'transparent', // Digital fill plugin handles color
      scale: 'y_digital',
    });

    currentSeriesIndex++;
  });

  // COMPUTED SERIES
  computedIndices.forEach((idx, localIdx) => {
    const ch = cfg.computedChannels[idx];
    const color = ch?.color || `hsl(${300 + localIdx * 40}, 70%, 50%)`;
    colorMaps.computed.push(color);

    allSeries.push({
      label: ch?.name || `Computed ${idx}`,
      stroke: color,
      scale: 'y_computed',
    });

    allData.push(data.computedData[idx]);
    currentSeriesIndex++;
  });

  console.log(`[renderGroupCharts] 📐 Series structure for ${groupId}:`, {
    totalSeries: allSeries.length,
    totalDataArrays: allData.length,
    digitalFillSignals: digitalFillSignals.length,
  });

  // ===== PHASE 3: CREATE CHART OPTIONS WITH MULTIPLE Y-AXES =====

  const digitalYMin = -0.5;
  const digitalYMax = (digitalIndices.length - 1) * DigChannelOffset + 2;

  const opts = {
    title: `Group ${groupId} (${analogIndices.length}A + ${digitalIndices.length}D + ${computedIndices.length}C)`,
    width: 1200,
    height: 600,
    
    series: allSeries,
    
    scales: {
      x: { time: false, auto: true },
    },
    
    axes: [
      { label: 'Time' }, // X-axis
    ],
    
    // Add Y-axes based on what's present
    ...(analogIndices.length > 0 && {
      scales: {
        y_analog: { auto: true },
      },
      axes: [
        { label: 'Analog Values', scale: 'y_analog' },
      ],
    }),
    
    ...(digitalIndices.length > 0 && {
      scales: {
        y_digital: { min: digitalYMin, max: digitalYMax, auto: false },
      },
      axes: [
        { label: 'Digital States', scale: 'y_digital' },
      ],
    }),
    
    ...(computedIndices.length > 0 && {
      scales: {
        y_computed: { auto: true },
      },
      axes: [
        { label: 'Computed Values', scale: 'y_computed' },
      ],
    }),
    
    plugins: [],
  };

  // ===== PHASE 4: ADD PLUGINS =====

  if (digitalIndices.length > 0 && digitalFillSignals.length > 0) {
    opts.plugins.push(createDigitalFillPlugin(digitalFillSignals));
  }

  opts.plugins.push(verticalLinePlugin(verticalLinesX, () => charts));

  // ===== PHASE 5: CREATE DOM CONTAINER & CHART =====

  const allLabels = [
    ...analogIndices.map(idx => cfg.analogChannels[idx]?.name || `A${idx}`),
    ...digitalIndices.map(idx => cfg.digitalChannels[idx]?.name || `D${idx}`),
    ...computedIndices.map(idx => cfg.computedChannels[idx]?.name || `C${idx}`),
  ];
  
  const allColors = [
    ...colorMaps.analog,
    ...colorMaps.digital,
    ...colorMaps.computed,
  ];

  const dragBar = createDragBar(
    { indices: Array.from({length: allLabels.length}, (_, i) => i), colors: allColors },
    { analogChannels: [] },
    channelState
  );

  const { parentDiv, chartDiv } = createChartContainer(
    dragBar,
    'chart-container',
    allLabels,
    allColors,
    `Group ${groupId}`,
    groupId,
    'mixed'
  );

  parentDiv.dataset.userGroupId = groupId;
  parentDiv.dataset.chartType = 'mixed';
  chartsContainer.appendChild(parentDiv);

  // ===== PHASE 6: INITIALIZE uPlot CHART =====

  const chart = initUPlotChart(opts, allData, chartDiv, charts);

  // ===== PHASE 7: REGISTER IN METADATA STORE =====

  const metadata = addChart({
    chartType: 'mixed',
    userGroupId: groupId,
    name: `Group ${groupId}`,
    channels: [
      ...analogIndices.map(idx => cfg.analogChannels[idx].id),
      ...digitalIndices.map(idx => cfg.digitalChannels[idx].id),
      ...computedIndices.map(idx => cfg.computedChannels[idx].id),
    ],
    colors: allColors,
  });

  chart._type = 'mixed';
  chart._metadata = metadata;
  chart._userGroupId = groupId;
  charts.push(chart);

  console.log(`[renderGroupCharts] ✅ Created mixed chart for group ${groupId}`, {
    metadata,
    chartInstance: chart,
  });
}
```

### Step 2: Update renderComtradeCharts.js

Replace the calls to type-specific renderers:

**BEFORE**:
```javascript
renderAnalogCharts(cfg, data, chartsContainer, charts, verticalLinesX, channelState, autoGroupChannels);
renderDigitalCharts(cfg, data, chartsContainer, charts, verticalLinesX, channelState);
renderComputedChannels(cfg, data, chartsContainer, charts, verticalLinesX, channelState);
```

**AFTER**:
```javascript
// Use group-centric rendering instead
import { renderGroupCharts } from "./renderGroupCharts.js";

// ... in renderComtradeCharts function:
renderGroupCharts(cfg, data, chartsContainer, charts, verticalLinesX, channelState);
```

### Step 3: Keep Type-Specific Renderers As Fallback

Keep the old files but comment them out for now:
- `renderAnalogCharts.js` → Disable
- `renderDigitalCharts.js` → Disable  
- `renderComputedChannels.js` → Disable

If you need to revert, just switch back.

## Testing Checklist

After implementation:

- [ ] Load COMTRADE file → Should render group-centric charts
- [ ] Set Analog A1 to G2, Digital D3 to G2 → Should create ONE G2 chart with 2 series
- [ ] Set Computed C1 to G2 → Should add to existing G2 chart
- [ ] Edit group in Channel List → Should reflect in same chart immediately
- [ ] Multiple groups → Should create multiple merged charts
- [ ] Digital fills → Should show with colors
- [ ] Vertical lines → Should work across all types in same chart
- [ ] Axis alignment → Analog and computed should auto-scale; digital should be fixed range

## Migration Path

**Phase 1** (Current):
- Fix digital colors
- Test per-type grouping works correctly
- Verify state flows work

**Phase 2** (Next):
- Implement renderGroupCharts.js as copy-paste above
- Update renderComtradeCharts.js to call it
- Test with small COMTRADE file

**Phase 3** (Validation):
- Test with large/complex files
- Fix any edge cases
- Remove old renderer code once confident

## Expected Outcome

**Before**: 
```
Group G0:
  - Analog G0 chart (separate)
  - Digital G0 chart (separate)
  - Computed G0 chart (separate)
Total: 3 canvases
```

**After**:
```
Group G0:
  - ONE mixed chart with:
    - Analog series (2)
    - Digital series (1)
    - Computed series (3)
Total: 1 canvas with 6 series
```

---

## Questions to Ask Yourself

1. **Do you have axis alignment logic already?**
   - Yes? Use getMaxYAxes() and existing patterns
   - No? Start with fixed scales per type (analog: auto, digital: 0-X, computed: auto)

2. **How should tooltips work?**
   - Show all series in group?
   - Only hovered series?
   - Separate by type?

3. **How should legend work?**
   - Group legend by type?
   - Flat list?
   - Color-coded by type?

Answer these, and the implementation becomes much clearer.

