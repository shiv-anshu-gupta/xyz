import { SI_UNITS } from "./constants.js";

// ✅ FIX: Implement siFormat function that was missing
function siFormat(value) {
  if (value === null || value === undefined || isNaN(value)) return "";

  const absValue = Math.abs(value);
  let prefix = "";
  let divisor = 1;

  if (absValue >= 1e9) {
    prefix = "G";
    divisor = 1e9;
  } else if (absValue >= 1e6) {
    prefix = "M";
    divisor = 1e6;
  } else if (absValue >= 1e3) {
    prefix = "k";
    divisor = 1e3;
  } else if (absValue >= 1) {
    prefix = "";
    divisor = 1;
  } else if (absValue >= 1e-3) {
    prefix = "m";
    divisor = 1e-3;
  } else if (absValue >= 1e-6) {
    prefix = "μ";
    divisor = 1e-6;
  } else if (absValue >= 1e-9) {
    prefix = "n";
    divisor = 1e-9;
  } else {
    prefix = "p";
    divisor = 1e-12;
  }

  const scaled = value / divisor;
  // Format with appropriate decimal places
  const formatted = scaled < 10 ? scaled.toFixed(2) : scaled.toFixed(1);
  return formatted + prefix;
}

export function getSiPrefix(scale) {
  if (scale === 1e-12) return "p";
  if (scale === 1e-9) return "n";
  if (scale === 1e-6) return "μ";
  if (scale === 1e-3) return "m";
  if (scale === 1) return "";
  if (scale === 1e3) return "k";
  if (scale === 1e6) return "M";
  if (scale === 1e9) return "G";
  if (scale === 1e12) return "T";
  return "";
}

export function makeAxisValueFormatter(unit, initialScale = 1) {
  return (uOrTicks, splits) => {
    // uPlot calls with (u, splits) where u is uPlot instance, splits is the tick values
    let ticks = Array.isArray(uOrTicks)
      ? uOrTicks
      : Array.isArray(splits)
      ? splits
      : [];

    if (!Array.isArray(ticks) || ticks.length === 0) return [];

    // ✅ OPTIMIZATION: Show fewer values to avoid cluttered chart
    // Only show every 3rd tick or when tick count exceeds 5
    let displayTicks = ticks;
    if (ticks.length > 5) {
      const step = Math.ceil(ticks.length / 5); // Show max 5-6 values
      displayTicks = ticks.map((v, i) => (i % step === 0 ? v : null)).filter(v => v !== null);
    }

    return displayTicks.map((v) => {
      // Guard against null, undefined, NaN
      if (v == null || isNaN(v)) return "";

      // Apply scale factor
      const num = Number(v);
      const scaled = num * initialScale;

      // Simple number formatting (no SI prefixes for scale=1)
      if (initialScale === 1) {
        if (Math.abs(scaled) < 10) {
          return scaled.toFixed(2);
        } else if (Math.abs(scaled) < 1000) {
          return scaled.toFixed(1);
        } else {
          return scaled.toFixed(0);
        }
      } else {
        // Use SI formatting for scaled values
        return siFormat(scaled);
      }
    });
  };
}
