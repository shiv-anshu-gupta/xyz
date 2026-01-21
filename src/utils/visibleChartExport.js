/**
 * @module Utils/Data
 * @description visibleChartExport module
 */

const DEFAULT_FILENAME_PREFIX = "visible_charts";
const DEFAULT_ANALOG_PHASE = "";
const DEFAULT_ANALOG_COMPONENT = "";
const DEFAULT_DIGITAL_COMPONENT = "";
const DEFAULT_PS = "P";
const DEFAULT_PRIMARY = 1;
const DEFAULT_SECONDARY = 1;
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;
const TIME_UNIT_MICROSECONDS = 1e6;

const FORMAT_OPTIONS = [
  { value: "ascii", label: "ASCII Format" },
  { value: "binary32", label: "Binary 32-bit" },
  { value: "binary64", label: "Binary 64-bit" },
  { value: "float32", label: "Float 32-bit" },
  { value: "float64", label: "Float 64-bit" },
];

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeString(value, fallback = "") {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

function coerceArray(source) {
  if (!source) return [];
  if (Array.isArray(source)) return source;
  if (ArrayBuffer.isView(source)) return Array.from(source);
  return [];
}

function getSeriesLength(series) {
  if (!series) return 0;
  if (typeof series.length === "number") return series.length;
  if (Array.isArray(series.data) && typeof series.data.length === "number") {
    return series.data.length;
  }
  return 0;
}

function computeSeriesStats(values) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const raw of values) {
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    if (value === 99999 || value === -99999) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === Number.POSITIVE_INFINITY || max === Number.NEGATIVE_INFINITY) {
    return { min: 0, max: 0 };
  }
  return { min, max };
}

function deriveScalingFromStats(stats) {
  const range = stats.max - stats.min;
  if (!Number.isFinite(range) || range === 0) {
    return { multiplier: 1, offset: 0 };
  }
  const multiplier = range / (INT32_MAX - INT32_MIN);
  if (!Number.isFinite(multiplier) || multiplier === 0) {
    return { multiplier: 1, offset: stats.min };
  }
  const offset = stats.min - INT32_MIN * multiplier;
  return { multiplier, offset };
}

function getSamplingRates(cfg) {
  if (Array.isArray(cfg?.samplingRates) && cfg.samplingRates.length > 0) {
    return cfg.samplingRates;
  }
  const fallbackRate = Number(cfg?.sampleRate);
  if (Number.isFinite(fallbackRate) && fallbackRate > 0) {
    return [{ rate: fallbackRate, endSample: 0 }];
  }
  return [];
}

function resolveLineFrequency(cfg, samplingRates) {
  const candidates = [
    cfg?.lineFrequency,
    cfg?.linefrequency,
    cfg?.lineFreq,
    cfg?.linefreq,
    cfg?.frequency,
    cfg?.freq,
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }

  if (Array.isArray(samplingRates)) {
    for (const entry of samplingRates) {
      const rate = Number(entry?.rate);
      if (Number.isFinite(rate) && rate > 0 && rate <= 400) {
        return rate;
      }
    }
  }

  return 60;
}

function formatDateTime(cfg) {
  if (
    !Number.isFinite(cfg?.startDay) ||
    !Number.isFinite(cfg?.startMonth) ||
    !Number.isFinite(cfg?.startYear) ||
    !Number.isFinite(cfg?.startHour) ||
    !Number.isFinite(cfg?.startMinute) ||
    !Number.isFinite(cfg?.startSecond)
  ) {
    const now = new Date();
    const micro = Math.floor((now.getMilliseconds() || 0) * 1000);
    return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()},${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}.${String(micro).padStart(6, "0")}`;
  }
  const micro = Number.isFinite(cfg?.startMicrosecond) ? cfg.startMicrosecond : 0;
  return `${String(cfg.startDay).padStart(2, "0")}/${String(cfg.startMonth).padStart(2, "0")}/${String(cfg.startYear).padStart(4, "0")},${String(cfg.startHour).padStart(2, "0")}:${String(cfg.startMinute).padStart(2, "0")}:${String(cfg.startSecond).padStart(2, "0")}.${String(micro).padStart(6, "0")}`;
}

function normalizeTimeArray(timeArray, totalSamples, sampleRate) {
  if (Array.isArray(timeArray) || ArrayBuffer.isView(timeArray)) {
    if (timeArray.length >= totalSamples) {
      return Array.from({ length: totalSamples }, (_, idx) => Number(timeArray[idx]));
    }
  }
  const rate = Number(sampleRate) > 0 ? Number(sampleRate) : 1;
  const delta = TIME_UNIT_MICROSECONDS / rate;
  return Array.from({ length: totalSamples }, (_, idx) => idx * delta);
}

function calculateTimestampValue({
  timeArray,
  sampleIdx,
  startMicro,
  timemult,
  sampleRate,
}) {
  const timemultValue = isFiniteNumber(timemult) && timemult !== 0 ? timemult : 1;
  let deltaMicroseconds = 0;
  if (Array.isArray(timeArray) && timeArray.length > sampleIdx) {
    const current = Number(timeArray[sampleIdx]);
    deltaMicroseconds = Number.isFinite(current) ? current - startMicro : 0;
  }

  if (!Number.isFinite(deltaMicroseconds) || deltaMicroseconds < 0) {
    const rate = Number(sampleRate) > 0 ? Number(sampleRate) : 1;
    deltaMicroseconds = sampleIdx * (TIME_UNIT_MICROSECONDS / rate);
  }

  if (!Number.isFinite(deltaMicroseconds)) {
    deltaMicroseconds = 0;
  }

  return clampInt32(Math.round(deltaMicroseconds / timemultValue));
}

function extractTimeSeriesFromCharts(charts, totalSamples) {
  if (!Array.isArray(charts)) return null;
  for (const chart of charts) {
    if (!chart) continue;
    const candidateData = chart.data ?? chart._data;
    if (!candidateData || typeof candidateData.length !== "number" || candidateData.length === 0) {
      continue;
    }
    const series = candidateData[0];
    if (
      (Array.isArray(series) || ArrayBuffer.isView(series)) &&
      getSeriesLength(series) >= totalSamples
    ) {
      return Array.from({ length: totalSamples }, (_, idx) => Number(series[idx]));
    }
  }
  return null;
}

function clampInt32(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < INT32_MIN) return INT32_MIN;
  if (value > INT32_MAX) return INT32_MAX;
  return value;
}

function resolveAnalogSeries({ cfg, channelState, analogIndex, values }) {
  const analogCfg = Array.isArray(cfg?.analogChannels)
    ? cfg.analogChannels[analogIndex]
    : null;
  const labels = channelState?.analog?.yLabels || [];
  const units = channelState?.analog?.yUnits || [];
  const channelId = sanitizeString(
    analogCfg?.id || labels[analogIndex],
    `A${analogIndex + 1}`
  );
  const stats = computeSeriesStats(values);
  const scaling = deriveScalingFromStats(stats);
  return {
    id: channelId,
    label: sanitizeString(labels[analogIndex], channelId),
    unit: sanitizeString(analogCfg?.unit, units[analogIndex] || ""),
    phase: sanitizeString(analogCfg?.phase, DEFAULT_ANALOG_PHASE),
    component: sanitizeString(analogCfg?.component, DEFAULT_ANALOG_COMPONENT),
    primary: isFiniteNumber(analogCfg?.primary) ? analogCfg.primary : DEFAULT_PRIMARY,
    secondary: isFiniteNumber(analogCfg?.secondary) ? analogCfg.secondary : DEFAULT_SECONDARY,
    ps: sanitizeString(analogCfg?.reference, DEFAULT_PS),
    skew: isFiniteNumber(analogCfg?.skew) ? analogCfg.skew : 0,
    multiplier: isFiniteNumber(analogCfg?.multiplier) && analogCfg.multiplier !== 0
      ? analogCfg.multiplier
      : scaling.multiplier,
    offset: isFiniteNumber(analogCfg?.offset)
      ? analogCfg.offset
      : scaling.offset,
    min: isFiniteNumber(analogCfg?.min) ? analogCfg.min : stats.min,
    max: isFiniteNumber(analogCfg?.max) ? analogCfg.max : stats.max,
    values,
    sourceType: "analog",
    valuesAreRaw: true,
  };
}

function resolveComputedSeries({ computedEntry, channelState }) {
  const ids = channelState?.computed?.channelIDs || [];
  const labels = channelState?.computed?.yLabels || [];
  const units = channelState?.computed?.yUnits || [];
  const idx = ids.findIndex((candidate) => candidate === computedEntry.id);
  const fallbackLabel = computedEntry.name || computedEntry.id;
  const stats = computeSeriesStats(computedEntry.values);
  const scaling = deriveScalingFromStats(stats);
  return {
    id: computedEntry.id,
    label: sanitizeString(idx >= 0 ? labels[idx] : fallbackLabel, fallbackLabel || computedEntry.id),
    unit: sanitizeString(idx >= 0 ? units[idx] : computedEntry.unit, computedEntry.unit || ""),
    phase: DEFAULT_ANALOG_PHASE,
    component: "Computed",
    primary: DEFAULT_PRIMARY,
    secondary: DEFAULT_SECONDARY,
    ps: DEFAULT_PS,
    skew: 0,
    multiplier: scaling.multiplier,
    offset: scaling.offset,
    min: stats.min,
    max: stats.max,
    values: computedEntry.values,
    sourceType: "computed",
    valuesAreRaw: false,
  };
}

function resolveDigitalSeries({ cfg, channelState, digitalIndex, values }) {
  const digitalCfg = Array.isArray(cfg?.digitalChannels)
    ? cfg.digitalChannels[digitalIndex]
    : null;
  const labels = channelState?.digital?.yLabels || [];
  return {
    id: sanitizeString(digitalCfg?.id || labels[digitalIndex], `D${digitalIndex + 1}`),
    label: sanitizeString(labels[digitalIndex], digitalCfg?.id || `D${digitalIndex + 1}`),
    phase: sanitizeString(digitalCfg?.phase, DEFAULT_ANALOG_PHASE),
    component: sanitizeString(digitalCfg?.component, DEFAULT_DIGITAL_COMPONENT),
    normalState: digitalCfg?.normalState ? 1 : 0,
    values,
  };
}

function buildCfgContent({
  stationName,
  deviceId,
  analogSeries,
  digitalSeries,
  lineFrequency,
  samplingRates,
  startTimestamp,
  triggerTimestamp,
  fileType,
  timemult,
  timeCode,
  localCode,
  tmqCode,
  leapSeconds,
}) {
  const lines = [];
  lines.push(`${stationName},${deviceId},2013`);
  lines.push(`${analogSeries.length + digitalSeries.length},${analogSeries.length}A,${digitalSeries.length}D`);

  analogSeries.forEach((series, idx) => {
    lines.push(
      `${idx + 1},${series.id},${series.phase},${series.component},${series.unit},${series.multiplier},${series.offset},${series.skew},${series.min},${series.max},${series.primary},${series.secondary},${series.ps}`
    );
  });

  digitalSeries.forEach((series, idx) => {
    lines.push(`${idx + 1},${series.id},${series.phase},${series.component},${series.normalState}`);
  });

  const frequencyValue = Number(lineFrequency);
  lines.push(String(Number.isFinite(frequencyValue) && frequencyValue > 0 ? frequencyValue : 60));

  const rateEntries = Array.isArray(samplingRates) ? samplingRates : [];
  if (rateEntries.length > 0) {
    lines.push(String(rateEntries.length));
    rateEntries.forEach((entry) => {
      const rate = Number(entry.rate) || 0;
      const endSample = Number(entry.endSample) || 0;
      lines.push(`${rate},${endSample}`);
    });
  } else {
    lines.push("1");
    lines.push(`1,${analogSeries[0]?.values?.length || 0}`);
  }

  lines.push(startTimestamp);
  lines.push(triggerTimestamp);
  lines.push(fileType);
  lines.push(String(timemult));
  lines.push(`${timeCode},${localCode}`);
  lines.push(`${tmqCode},${leapSeconds}`);

  return `${lines.join("\n")}\n`;
}

function computeRawAnalogValue(series, sampleIdx) {
  const values = series.values;
  if (!values) return 0;
  const rawValue = Number(values[sampleIdx]);

  if (!Number.isFinite(rawValue)) return 0;

  if (series.valuesAreRaw || series.sourceType === "analog") {
    return clampInt32(Math.round(rawValue));
  }

  const multiplier = isFiniteNumber(series.multiplier) && series.multiplier !== 0
    ? series.multiplier
    : 1;
  const offset = isFiniteNumber(series.offset) ? series.offset : 0;
  return clampInt32(Math.round((rawValue - offset) / multiplier));
}

function buildDatContentAscii({
  timeArray,
  analogSeries,
  digitalSeries,
  timemult,
  sampleRate,
}) {
  const totalSamples = analogSeries[0]?.values?.length
    || digitalSeries[0]?.values?.length
    || 0;
  if (!totalSamples) return "";

  const normalizedTime = normalizeTimeArray(timeArray, totalSamples, sampleRate);
  const startMicro = normalizedTime.length > 0 ? normalizedTime[0] : 0;
  const lines = [];

  for (let sampleIdx = 0; sampleIdx < totalSamples; sampleIdx += 1) {
    const sampleNumber = sampleIdx + 1;
    const timestamp = calculateTimestampValue({
      timeArray: normalizedTime,
      sampleIdx,
      startMicro,
      timemult,
      sampleRate,
    });

    const columns = [String(sampleNumber), String(timestamp)];

    analogSeries.forEach((series) => {
      const rawValue = computeRawAnalogValue(series, sampleIdx);
      columns.push(String(rawValue));
    });

    digitalSeries.forEach((series) => {
      const values = series.values;
      const raw = Number(values[sampleIdx]) === 1 ? 1 : 0;
      columns.push(String(raw));
    });

    lines.push(columns.join(","));
  }

  return `${lines.join("\n")}\n`;
}

function packDigitalWords(digitalSeries, sampleIdx) {
  if (digitalSeries.length === 0) return [];
  const wordCount = Math.ceil(digitalSeries.length / 16);
  const words = new Array(wordCount).fill(0);

  digitalSeries.forEach((series, idx) => {
    const wordIndex = Math.floor(idx / 16);
    const bitIndex = idx % 16;
    const raw = Number(series.values[sampleIdx]) === 1 ? 1 : 0;
    if (raw) {
      words[wordIndex] |= 1 << bitIndex;
    }
  });

  return words;
}

function buildDatContentBinary32({
  timeArray,
  analogSeries,
  digitalSeries,
  timemult,
  sampleRate,
}) {
  const totalSamples = analogSeries[0]?.values?.length
    || digitalSeries[0]?.values?.length
    || 0;
  if (!totalSamples) return new Uint8Array();

  const normalizedTime = normalizeTimeArray(timeArray, totalSamples, sampleRate);
  const startMicro = normalizedTime.length > 0 ? normalizedTime[0] : 0;

  const digitalWordCount = Math.ceil(digitalSeries.length / 16);
  const bytesPerSample = 4 + 4 + analogSeries.length * 4 + digitalWordCount * 2;
  const buffer = new ArrayBuffer(bytesPerSample * totalSamples);
  const view = new DataView(buffer);
  let offset = 0;

  for (let sampleIdx = 0; sampleIdx < totalSamples; sampleIdx += 1) {
    const sampleNumber = sampleIdx + 1;
    const timestamp = calculateTimestampValue({
      timeArray: normalizedTime,
      sampleIdx,
      startMicro,
      timemult,
      sampleRate,
    });

    view.setInt32(offset, sampleNumber, true);
    offset += 4;
    view.setInt32(offset, timestamp, true);
    offset += 4;

    analogSeries.forEach((series) => {
      const rawValue = computeRawAnalogValue(series, sampleIdx);
      view.setInt32(offset, rawValue, true);
      offset += 4;
    });

    const words = packDigitalWords(digitalSeries, sampleIdx);
    words.forEach((word) => {
      view.setUint16(offset, word, true);
      offset += 2;
    });
  }

  return new Uint8Array(buffer);
}

function buildDatContentFloat({
  timeArray,
  analogSeries,
  digitalSeries,
  timemult,
  sampleRate,
  precision,
}) {
  const totalSamples = analogSeries[0]?.values?.length
    || digitalSeries[0]?.values?.length
    || 0;
  if (!totalSamples) return new Uint8Array();

  const normalizedTime = normalizeTimeArray(timeArray, totalSamples, sampleRate);
  const startMicro = normalizedTime.length > 0 ? normalizedTime[0] : 0;

  const digitalWordCount = Math.ceil(digitalSeries.length / 16);
  const valueSize = precision === 32 ? 4 : 8;
  const bytesPerSample = 4 + 8 + analogSeries.length * valueSize + digitalWordCount * 2;
  const buffer = new ArrayBuffer(bytesPerSample * totalSamples);
  const view = new DataView(buffer);
  let offset = 0;

  for (let sampleIdx = 0; sampleIdx < totalSamples; sampleIdx += 1) {
    const sampleNumber = sampleIdx + 1;
    const timestamp = calculateTimestampValue({
      timeArray: normalizedTime,
      sampleIdx,
      startMicro,
      timemult,
      sampleRate,
    });

    view.setInt32(offset, sampleNumber, true);
    offset += 4;
    view.setFloat64(offset, timestamp, true);
    offset += 8;

    analogSeries.forEach((series) => {
      const values = series.values;
      const value = Number(values[sampleIdx]);
      if (precision === 32) {
        view.setFloat32(offset, Number.isFinite(value) ? value : 0, true);
      } else {
        view.setFloat64(offset, Number.isFinite(value) ? value : 0, true);
      }
      offset += valueSize;
    });

    const words = packDigitalWords(digitalSeries, sampleIdx);
    words.forEach((word) => {
      view.setUint16(offset, word, true);
      offset += 2;
    });
  }

  return new Uint8Array(buffer);
}

function requestExportFormat() {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;

    const dialog = document.createElement("div");
    dialog.style.cssText = `
      background: #fff;
      border-radius: 8px;
      padding: 24px;
      min-width: 380px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.25);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;

    const title = document.createElement("h2");
    title.textContent = "Export Format";
    title.style.margin = "0 0 16px";
    title.style.fontSize = "18px";
    dialog.appendChild(title);

    FORMAT_OPTIONS.forEach((option, idx) => {
      const label = document.createElement("label");
      label.style.cssText = "display:flex;align-items:center;margin-bottom:10px;gap:8px;cursor:pointer;";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "visible-export-format";
      input.value = option.value;
      input.checked = idx === 0;
      label.appendChild(input);

      const span = document.createElement("span");
      span.textContent = option.label;
      label.appendChild(span);

      dialog.appendChild(label);
    });

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:12px;margin-top:20px;";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = "padding:8px 16px;border:1px solid #cbd5f5;border-radius:4px;background:#fff;cursor:pointer;";

    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = "Export";
    confirmBtn.style.cssText = "padding:8px 16px;border:none;border-radius:4px;background:#6366f1;color:#fff;font-weight:600;cursor:pointer;";

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    dialog.appendChild(actions);
    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const close = (value) => {
      document.body.removeChild(modal);
      resolve(value);
    };

    cancelBtn.addEventListener("click", () => close(null));
    confirmBtn.addEventListener("click", () => {
      const selected = dialog.querySelector("input[name='visible-export-format']:checked");
      close(selected ? selected.value : "ascii");
    });
  });
}

function triggerDownload({ cfgContent, datContent, baseName }) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const safeBase = `${baseName}_${timestamp}`;
  const cfgFileName = `${safeBase}.cfg`;
  const datFileName = `${safeBase}.dat`;

  const cfgBlob = new Blob([cfgContent], { type: "text/plain;charset=utf-8" });
  const datBlob =
    typeof datContent === "string"
      ? new Blob([datContent], { type: "text/plain;charset=utf-8" })
      : new Blob([datContent], { type: "application/octet-stream" });

  const cfgLink = document.createElement("a");
  cfgLink.href = URL.createObjectURL(cfgBlob);
  cfgLink.download = cfgFileName;
  cfgLink.style.display = "none";
  document.body.appendChild(cfgLink);
  cfgLink.click();
  document.body.removeChild(cfgLink);

  setTimeout(() => {
    const datLink = document.createElement("a");
    datLink.href = URL.createObjectURL(datBlob);
    datLink.download = datFileName;
    datLink.style.display = "none";
    document.body.appendChild(datLink);
    datLink.click();
    document.body.removeChild(datLink);
  }, 300);

  if (typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(
      `✅ COMTRADE export complete!\n\nFiles:\n • ${cfgFileName}\n • ${datFileName}`
    );
  }
}

export async function exportVisibleChartsAsComtrade({
  cfg,
  data,
  charts,
  channelState,
  filenamePrefix = DEFAULT_FILENAME_PREFIX,
} = {}) {
  if (!cfg || !data || !Array.isArray(charts)) {
    throw new Error("Missing cfg, data, or charts for COMTRADE export");
  }
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("COMTRADE export requires a browser environment");
  }

  const analogIndices = [];
  const seenAnalog = new Set();
  charts.forEach((chart) => {
    if (!chart || chart._chartType !== "analog") return;
    if (!Array.isArray(chart._channelIndices)) return;
    chart._channelIndices.forEach((idx) => {
      if (typeof idx !== "number" || idx < 0) return;
      if (seenAnalog.has(idx)) return;
      seenAnalog.add(idx);
      analogIndices.push(idx);
    });
  });

  const digitalIndices = [];
  const seenDigital = new Set();
  charts.forEach((chart) => {
    if (!chart || chart._chartType !== "digital") return;
    if (!Array.isArray(chart._channelIndices)) return;
    chart._channelIndices.forEach((idx) => {
      if (typeof idx !== "number" || idx < 0) return;
      if (seenDigital.has(idx)) return;
      seenDigital.add(idx);
      digitalIndices.push(idx);
    });
  });

  const computedIds = [];
  const seenComputed = new Set();
  charts.forEach((chart) => {
    if (!chart || chart._chartType !== "computed") return;
    if (!Array.isArray(chart._channelIndices)) return;
    chart._channelIndices.forEach((entry) => {
      const id = typeof entry === "object" && entry !== null ? entry.id : entry;
      if (!id) return;
      const normalized = String(id);
      if (seenComputed.has(normalized)) return;
      seenComputed.add(normalized);
      computedIds.push(normalized);
    });
  });

  const analogSeries = [];
  analogIndices.forEach((analogIndex) => {
    const values = coerceArray(data?.analogData?.[analogIndex]);
    if (!values.length) return;
    analogSeries.push(
      resolveAnalogSeries({ cfg, channelState, analogIndex, values })
    );
  });

  // ✅ REFACTORED: Handle both new (2D array) and legacy (object array) formats
  if (Array.isArray(data?.computedData) && Array.isArray(cfg?.computedChannels)) {
    computedIds.forEach((computedId) => {
      // Find index in cfg.computedChannels by ID
      const channelIndex = cfg.computedChannels.findIndex((ch) => ch && ch.id === computedId);
      if (channelIndex < 0) return;
      
      const metadata = cfg.computedChannels[channelIndex];
      let values;
      
      // Check data format: new (2D array) vs legacy (object array)
      const dataEntry = data.computedData[channelIndex];
      if (Array.isArray(dataEntry) && (dataEntry.length === 0 || typeof dataEntry[0] === 'number')) {
        // New format: data.computedData[i] = [val1, val2, ...]
        values = coerceArray(dataEntry);
      } else if (dataEntry && typeof dataEntry === 'object' && 'data' in dataEntry) {
        // Legacy format: data.computedData[i] = { id, data: [...], ... }
        values = coerceArray(dataEntry.data);
      } else {
        return;
      }
      
      if (!values.length) return;
      analogSeries.push(
        resolveComputedSeries({
          computedEntry: { id: computedId, name: metadata.name, unit: metadata.unit, values },
          channelState,
        })
      );
    });
  }

  const digitalSeries = [];
  digitalIndices.forEach((digitalIndex) => {
    const values = coerceArray(data?.digitalData?.[digitalIndex]).map((value) => (value === 1 ? 1 : 0));
    if (!values.length) return;
    digitalSeries.push(
      resolveDigitalSeries({ cfg, channelState, digitalIndex, values })
    );
  });

  if (analogSeries.length === 0 && digitalSeries.length === 0) {
    throw new Error("No visible chart data to export");
  }

  const analogueLength = analogSeries[0]?.values?.length || 0;
  const digitalLength = digitalSeries[0]?.values?.length || 0;
  const totalSamples = Math.max(analogueLength, digitalLength);
  if (!totalSamples) {
    throw new Error("No samples available for export");
  }

  const sampleRate = Number(cfg?.samplingRates?.[0]?.rate)
    || Number(cfg?.sampleRate)
    || 1;

  const selectedFormat = await requestExportFormat();
  if (!selectedFormat) {
    return;
  }

  const stationName = sanitizeString(cfg?.stationName, "VISIBLE_CHART_EXPORT");
  const deviceId = sanitizeString(cfg?.deviceID, "EXPORT_DEVICE");
  const samplingRates = getSamplingRates(cfg);
  const lineFrequency = resolveLineFrequency(cfg, samplingRates);
  const startTimestamp = formatDateTime(cfg);
  const triggerTimestamp = startTimestamp;
  const timemult = isFiniteNumber(cfg?.timemult) && cfg.timemult !== 0 ? cfg.timemult : 1;
  const timeCode = sanitizeString(cfg?.timeCode, "0");
  const localCode = sanitizeString(cfg?.localCode, "0");
  const tmqCode = sanitizeString(cfg?.tmqCode, "0");
  const leapSeconds = sanitizeString(cfg?.leapSec, "0");

  let cfgContent = "";
  let datContent;
  let fileType = "ASCII";

  let timeArray = null;
  const rawTime = data?.time;
  if (
    (Array.isArray(rawTime) || ArrayBuffer.isView(rawTime))
    && rawTime.length >= totalSamples
  ) {
    timeArray = Array.from({ length: totalSamples }, (_, idx) => Number(rawTime[idx]));
  }

  if (!timeArray || timeArray.length === 0) {
    const chartTime = extractTimeSeriesFromCharts(charts, totalSamples);
    if (chartTime && chartTime.length) {
      timeArray = chartTime;
    }
  }

  if (!timeArray) {
    timeArray = [];
  }

  if (selectedFormat === "ascii") {
    fileType = "ASCII";
    datContent = buildDatContentAscii({
      timeArray,
      analogSeries,
      digitalSeries,
      timemult,
      sampleRate,
    });
  } else if (selectedFormat === "binary32") {
    fileType = "BINARY";
    datContent = buildDatContentBinary32({
      timeArray,
      analogSeries,
      digitalSeries,
      timemult,
      sampleRate,
    });
  } else if (selectedFormat === "binary64") {
    fileType = "BINARY";
    datContent = buildDatContentFloat({
      timeArray,
      analogSeries,
      digitalSeries,
      timemult,
      sampleRate,
      precision: 64,
    });
  } else if (selectedFormat === "float32") {
    fileType = "BINARY";
    datContent = buildDatContentFloat({
      timeArray,
      analogSeries,
      digitalSeries,
      timemult,
      sampleRate,
      precision: 32,
    });
  } else if (selectedFormat === "float64") {
    fileType = "BINARY";
    datContent = buildDatContentFloat({
      timeArray,
      analogSeries,
      digitalSeries,
      timemult,
      sampleRate,
      precision: 64,
    });
  } else {
    throw new Error(`Unsupported export format: ${selectedFormat}`);
  }

  cfgContent = buildCfgContent({
    stationName,
    deviceId,
    analogSeries,
    digitalSeries,
    lineFrequency,
    samplingRates,
    startTimestamp,
    triggerTimestamp,
    fileType,
    timemult,
    timeCode,
    localCode,
    tmqCode,
    leapSeconds,
  });

  triggerDownload({
    cfgContent,
    datContent,
    baseName: filenamePrefix,
  });
}
