# What is `cfg` in the Project?

## Overview
`cfg` is the **COMTRADE Configuration Object** - it contains metadata parsed from the `.CFG` (configuration) file of a COMTRADE recording. It's passed to `renderAnalogCharts()` and other rendering functions to provide channel definitions, sampling rates, timing information, and other recording metadata.

---

## Where `cfg` Comes From

### Source Chain:
```
COMTRADE .CFG File
    ↓
parseCFG() function (src/components/comtradeUtils.js)
    ↓
cfg object
    ↓
renderComtradeCharts() 
    ↓
renderAnalogCharts(cfg, data, ...)
```

### Creation:
The `cfg` object is created by the `parseCFG(cfgText, timeUnit)` function which parses the raw text content of a COMTRADE configuration file.

---

## `cfg` Object Structure

```javascript
{
  // Header Information
  stationName: string           // e.g., "Station A", "Substation X"
  deviceID: string             // Device/Relay identifier
  COMTRADE_rev: string         // "1999" or "2013"

  // Channel Definitions
  analogChannels: Array[{       // Analog channel metadata
    index: number              // 1-based index in CFG
    id: string                 // Channel name (e.g., "VA", "IA", "VB")
    phase: string              // Phase identifier
    component: string          // Component type
    unit: string               // Unit (e.g., "kV", "A", "W")
    multiplier: number         // Scaling multiplier
    offset: number             // Offset to apply
    skew: number               // Skew value
    min: number                // Min value
    max: number                // Max value
    primary: number            // Primary winding
    secondary: number          // Secondary winding
    reference: string          // Reference type
  }]

  digitalChannels: Array[{      // Digital channel metadata
    index: number              // 1-based index in CFG
    id: string                 // Channel name
    phase: string              // Phase identifier
    component: string          // Component type
    normalState: boolean       // Normal state (0 or 1)
  }]

  // Sampling Configuration
  samplingRates: Array[{        // Can have multiple rates (e.g., high rate during event, lower after)
    rate: number               // Samples per second (e.g., 4000)
    endSample: number          // Sample number where this rate ends
  }]
  lineFrequency: number         // Power line frequency (50 or 60 Hz)

  // Timing Information
  baseMicroseconds: number      // Start time in microseconds since midnight
  startDay: number             // Day (1-31)
  startMonth: number           // Month (1-12)
  startYear: number            // Year (e.g., 2026)
  startHour: number            // Hour (0-23)
  startMinute: number          // Minute (0-59)
  startSecond: number          // Second (0-59)
  startMicrosecond: number     // Microsecond (0-999999)
  timemult: number             // Time multiplier (usually 1.0)
  timeUnit: string             // "microseconds", "milliseconds", or "seconds"

  // File Information
  ft: string                   // File type (e.g., "ASCII")
  
  // 2013 Extensions
  timeCode: string | null      // Time code (2013 revision only)
  localCode: string | null     // Local code (2013 revision only)
  tmqCode: string | null       // TMQ code (2013 revision only)
  leapSec: string | null       // Leap second (2013 revision only)
}
```

---

## How `cfg` is Used in `renderAnalogCharts()`

### In `renderAnalogCharts()`:

```javascript
export function renderAnalogCharts(
  cfg,              // ← COMTRADE config object
  data,
  chartsContainer,
  charts,
  verticalLinesX,
  channelState,
  autoGroupChannels
) {
  // Get list of all analog channels from cfg
  const totalAnalog = Array.isArray(cfg.analogChannels)
    ? cfg.analogChannels
    : [];
  
  // Access channel metadata
  console.log("Total analog channels:", cfg.analogChannels?.length);
  
  // Use in grouping logic
  // See: groupingUtils.js for channel extraction
}
```

### Typical Access Patterns:

1. **Getting channel count**: `cfg.analogChannels.length`
2. **Getting channel metadata**: `cfg.analogChannels[i]` → access unit, name, multiplier, etc.
3. **Sampling information**: `cfg.samplingRates` → used for time array generation
4. **Station/device info**: `cfg.stationName`, `cfg.deviceID`
5. **File type**: `cfg.ft` → "ASCII" or "BINARY"

---

## Real-World Example

**COMTRADE CFG File excerpt:**
```
Substation X,Relay_A,1999
4A,2D
1,VA,A,V,kV,1.0,0.0,0.0,-200.0,200.0,69000.0,120.0,P
2,IA,A,A,A,100.0,0.0,0.0,-1000.0,1000.0,400.0,1.0,S
3,VB,B,V,kV,1.0,0.0,0.0,-200.0,200.0,69000.0,120.0,P
4,IB,B,A,A,100.0,0.0,0.0,-1000.0,1000.0,400.0,1.0,S
1,CB1,A,ST,1
2,CB2,B,ST,1
60.0
1,4000,
01/15/2026,14:30:00.000000
01/15/2026,14:30:01.000000
1.0
ASCII
```

**Parsed `cfg` object:**
```javascript
{
  stationName: "Substation X",
  deviceID: "Relay_A",
  analogChannels: [
    { index: 1, id: "VA", unit: "kV", ... },
    { index: 2, id: "IA", unit: "A", ... },
    { index: 3, id: "VB", unit: "kV", ... },
    { index: 4, id: "IB", unit: "A", ... }
  ],
  digitalChannels: [
    { index: 1, id: "CB1", ... },
    { index: 2, id: "CB2", ... }
  ],
  samplingRates: [{ rate: 4000, endSample: 0 }],
  lineFrequency: 60.0,
  startDay: 15,
  startMonth: 1,
  startYear: 2026,
  startHour: 14,
  startMinute: 30,
  startSecond: 0,
  // ... and more
}
```

---

## Where `cfg` is Passed

1. **renderComtradeCharts()** → calls `renderAnalogCharts(cfg, ...)`
2. **renderAnalogCharts()** → uses for channel metadata
3. **Other utilities**: `visibleChartExport.js`, `chartDataProcessor.js` → access sampling rates and channel info

---

## Key Points

- ✅ `cfg` = **parsed COMTRADE configuration metadata**
- ✅ Contains **channel definitions** (analog and digital)
- ✅ Contains **sampling rates** and **timing information**
- ✅ Contains **file metadata** (station name, device ID, COMTRADE version)
- ✅ Parsed once when file is loaded, reused across all rendering functions
- ⚠️ Note: `cfg` contains **static channel definitions** from the CFG file; actual **channel assignments to groups** come from `channelState` (reactive state)

