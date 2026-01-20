/**
 * @file renderComputedChart.js
 * @module components/renderComputedChart
 * 
 * @description
 * <h3>Computed Channel Chart Renderer</h3>
 * 
 * <p>Orchestrates rendering of computed channels by delegating to shared renderers.</p>
 * 
 * <h4>What This Module Does</h4>
 * <table>
 *   <tr><th>Step</th><th>Action</th></tr>
 *   <tr><td>1</td><td>Reads computed channels from <code>cfg.computedChannels</code> + <code>data.computedData</code></td></tr>
 *   <tr><td>2</td><td>Separates analog vs digital via <code>madeFrom</code> field</td></tr>
 *   <tr><td>3</td><td>Groups channels by their <code>group</code> field</td></tr>
 *   <tr><td>4</td><td>Calls <code>renderSingleAnalogChart()</code> for analog types</td></tr>
 *   <tr><td>5</td><td>Calls <code>renderSingleDigitalChart()</code> for digital types</td></tr>
 * </table>
 * 
 * <h4>Design Philosophy</h4>
 * <ul>
 *   <li><strong>Unified Rendering</strong> — Uses same renderers as COMTRADE data</li>
 *   <li><strong>Computed-Only Mode</strong> — Passes <code>channelIndices=[]</code> to signal computed-only</li>
 *   <li><strong>Group-Based</strong> — Each channel's <code>group</code> field determines chart ownership</li>
 *   <li><strong>Type-Aware</strong> — Routes to correct renderer based on <code>madeFrom</code></li>
 * </ul>
 * 
 * <h4>Ownership Rule</h4>
 * <blockquote>
 *   Computed channels with <code>group</code> matching an existing analog/digital group
 *   are rendered <strong>in that group's chart</strong>. Unmatched groups get standalone charts.
 * </blockquote>
 * 
 * <h4>Data Flow</h4>
 * <ol>
 *   <li><code>cfg.computedChannels[i]</code> + <code>data.computedData[i]</code></li>
 *   <li>↓ <code>buildComputedChannelObjects()</code></li>
 *   <li>↓ <code>separateByType()</code> + <code>groupByGroup()</code></li>
 *   <li>↓ analogGroups / digitalGroups</li>
 *   <li>↓ <code>renderSingleAnalogChart()</code> / <code>renderSingleDigitalChart()</code></li>
 *   <li>Charts with computed channels only</li>
 * </ol>
 * 
 * @see {@link module:components/renderSingleAnalogChart}
 * @see {@link module:components/renderSingleDigitalChart}
 * @see {@link module:services/computedChannels/resultProcessing} - Sets <code>madeFrom</code>
 * 
 * @example
 * import { renderComputedChart } from "./renderComputedChart.js";
 * 
 * renderComputedChart(
 *   cfg,              // Has computedChannels metadata
 *   data,             // Has computedData values
 *   chartsContainer,  // DOM container
 *   charts,           // Charts array
 *   verticalLinesX,   // Vertical lines state
 *   channelState      // Channel customizations
 * );
 * 
 * @mermaid
 * graph TD
 *     A[cfg.computedChannels + data.computedData] --> B[buildComputedChannelObjects]
 *     B --> C[Combined channel objects]
 *     C --> D{madeFrom field}
 *     D -->|analog| E[groupByGroup - analog]
 *     D -->|digital| F[groupByGroup - digital]
 *     D -->|null/unknown| G[Determine from formula]
 *     E --> H[renderSingleAnalogChart per group]
 *     F --> I[renderSingleDigitalChart per group]
 *     H --> J[Analog charts]
 *     I --> K[Digital charts]
 */

import { renderSingleAnalogChart } from "./renderSingleAnalogChart.js";
import { renderSingleDigitalChart } from "./renderSingleDigitalChart.js";
import { getMaxYAxes } from "../utils/maxYAxesStore.js";
import { cleanupOldComputedCharts, resolveTimeArray } from "../utils/computedChannelDataProcessor.js";
import { buildChannelGroups } from "../utils/autoGroupChannels.js";

/**
 * Render computed channels using the shared single-chart renderers.
 * 
 * **Execution Flow:**
 * 1. Build combined channel objects from cfg + data
 * 2. Clean up any old computed charts
 * 3. Separate channels by type (madeFrom: "analog" vs "digital")
 * 4. Group each type by their `group` field
 * 5. Call appropriate renderer for each group
 * 
 * @function renderComputedChart
 * @memberof module:components/renderComputedChart
 * @param {Object} cfg - Configuration with computedChannels metadata array
 * @param {Object[]} cfg.computedChannels - Computed channel definitions
 * @param {string} cfg.computedChannels[].id - Channel identifier
 * @param {string} cfg.computedChannels[].name - Display name
 * @param {string} cfg.computedChannels[].group - Target group ID
 * @param {string} cfg.computedChannels[].madeFrom - Source type ("analog"|"digital"|null)
 * @param {string} cfg.computedChannels[].color - Hex color
 * @param {string} cfg.computedChannels[].unit - Unit string
 * @param {Object} data - Data object with computedData values array
 * @param {Array[]} data.computedData - 2D array of computed values
 * @param {number[]} data.time - Time array (used for X-axis)
 * @param {HTMLElement} chartsContainer - Container for chart elements
 * @param {uPlot[]} charts - Array storing all chart instances
 * @param {Object} verticalLinesX - Reactive array of vertical line positions
 * @param {Object} channelState - Reactive state for channel customizations
 * @returns {void}
 * 
 * @example
 * // Render computed channels with mixed types
 * renderComputedChart(
 *   {
 *     computedChannels: [
 *       { id: "rms_I", group: "G0", madeFrom: "analog", unit: "A", color: "#4ECDC4" },
 *       { id: "fault_detect", group: "DigitalComputed", madeFrom: "digital", color: "#FF6B6B" }
 *     ]
 *   },
 *   {
 *     computedData: [[1.2, 1.3, 1.4], [0, 1, 1]],
 *     time: [0, 0.01, 0.02]
 *   },
 *   container,
 *   charts,
 *   verticalLinesX,
 *   channelState
 * );
 */
export function renderComputedChart(
  cfg,
  data,
  chartsContainer,
  charts,
  verticalLinesX,
  channelState
) {
  console.log(`[renderComputedChart] 🟪 Starting: ${cfg?.computedChannels?.length || 0} computed channels`);

  // Build combined channel objects from separate cfg + data
  const allComputedChannels = buildComputedChannelObjects(cfg, data);

  if (allComputedChannels.length === 0) {
    console.log(`[renderComputedChart] ⏭️ No computed channels to render`);
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FILTER OUT COMPUTED CHANNELS ALREADY MERGED WITH ANALOG/DIGITAL GROUPS
  // ═══════════════════════════════════════════════════════════════════════════
  // Computed channels whose group matches an existing analog or digital group
  // are already rendered in Phase 1/2 of renderComtradeCharts - skip them here
  
  const analogChannelsCfg = cfg?.analogChannels || [];
  const digitalChannelsCfg = cfg?.digitalChannels || [];
  const userAnalogGroups = channelState?.analog?.groups || [];
  const userDigitalGroups = channelState?.digital?.groups || [];
  
  // Get existing analog and digital group IDs
  const analogGroups = buildChannelGroups(userAnalogGroups, analogChannelsCfg);
  const digitalGroups = buildChannelGroups(userDigitalGroups, digitalChannelsCfg);
  const existingGroupIds = new Set([
    ...Object.keys(analogGroups),
    ...Object.keys(digitalGroups)
  ]);
  
  // Filter to only standalone computed channels (not already merged)
  const standaloneComputedChannels = allComputedChannels.filter(ch => {
    const isAlreadyMerged = existingGroupIds.has(ch.group);
    if (isAlreadyMerged) {
      console.log(`[renderComputedChart] ⏭️ Skipping "${ch.id}" - already merged with group "${ch.group}"`);
    }
    return !isAlreadyMerged;
  });
  
  if (standaloneComputedChannels.length === 0) {
    console.log(`[renderComputedChart] ⏭️ All computed channels merged with existing groups - no standalone charts needed`);
    return;
  }
  
  console.log(`[renderComputedChart] 📊 Rendering ${standaloneComputedChannels.length} standalone computed channel(s) (${allComputedChannels.length - standaloneComputedChannels.length} merged with existing groups)`);

  // Clean up old computed charts before rendering new ones
  cleanupOldComputedCharts(charts, chartsContainer);

  // Resolve time array from data or computed channels
  const timeArray = resolveTimeArray(data, standaloneComputedChannels);
  if (!timeArray?.length) {
    console.warn(`[renderComputedChart] ⚠️ No time array available`);
    return;
  }

  // Separate standalone channels by type (madeFrom field)
  const { analogChannels: analogStandalone, digitalChannels: digitalStandalone, unknownChannels: unknownStandalone } = separateByType(standaloneComputedChannels);

  console.log(`[renderComputedChart] 📊 Type separation: ${analogStandalone.length} analog, ${digitalStandalone.length} digital, ${unknownStandalone.length} unknown`);

  // Get max Y axes for alignment
  const maxYAxes = getMaxYAxes() || 1;

  // Track chart index for ordering
  let chartIndex = 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER ANALOG COMPUTED CHANNELS
  // ═══════════════════════════════════════════════════════════════════════════
  if (analogStandalone.length > 0) {
    const analogComputedGroups = groupByGroup(analogStandalone);
    
    for (const [groupId, groupChannels] of analogComputedGroups.entries()) {
      console.log(`[renderComputedChart] 📈 Rendering analog group "${groupId}" with ${groupChannels.length} computed channel(s)`);
      
      const chart = renderSingleAnalogChart(
        groupId,
        [],  // Empty channelIndices = computed-only mode
        chartIndex++,
        cfg,
        { time: timeArray },  // Minimal data object with time
        chartsContainer,
        charts,
        verticalLinesX,
        {
          channelState,
          maxYAxes,
          computedChannels: groupChannels,  // Pass computed channels here
        }
      );

      if (chart) {
        // Tag as computed chart
        chart._computed = true;
        chart._computedOnly = true;
        console.log(`[renderComputedChart] ✅ Created analog computed chart for "${groupId}"`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER DIGITAL COMPUTED CHANNELS
  // ═══════════════════════════════════════════════════════════════════════════
  if (digitalStandalone.length > 0) {
    const digitalComputedGroups = groupByGroup(digitalStandalone);
    
    for (const [groupId, groupChannels] of digitalComputedGroups.entries()) {
      console.log(`[renderComputedChart] 📊 Rendering digital group "${groupId}" with ${groupChannels.length} computed channel(s)`);
      
      const chart = renderSingleDigitalChart(
        groupId,
        [],  // Empty channelIndices = computed-only mode
        chartIndex++,
        cfg,
        { time: timeArray },  // Minimal data object with time
        chartsContainer,
        charts,
        verticalLinesX,
        {
          channelState,
          computedChannels: groupChannels,  // Pass computed channels here
        }
      );

      if (chart) {
        // Tag as computed chart
        chart._computed = true;
        chart._computedOnly = true;
        console.log(`[renderComputedChart] ✅ Created digital computed chart for "${groupId}"`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER UNKNOWN-TYPE COMPUTED CHANNELS (default to analog)
  // ═══════════════════════════════════════════════════════════════════════════
  if (unknownStandalone.length > 0) {
    console.log(`[renderComputedChart] ⚠️ ${unknownStandalone.length} channel(s) have unknown type, defaulting to analog`);
    
    const unknownGroups = groupByGroup(unknownStandalone);
    
    for (const [groupId, groupChannels] of unknownGroups.entries()) {
      const chart = renderSingleAnalogChart(
        groupId,
        [],  // Empty channelIndices = computed-only mode
        chartIndex++,
        cfg,
        { time: timeArray },
        chartsContainer,
        charts,
        verticalLinesX,
        {
          channelState,
          maxYAxes,
          computedChannels: groupChannels,
        }
      );

      if (chart) {
        chart._computed = true;
        chart._computedOnly = true;
        console.log(`[renderComputedChart] ✅ Created unknown-type chart for "${groupId}" (defaulted to analog)`);
      }
    }
  }

  console.log(`[renderComputedChart] ✅ Rendering complete: ${chartIndex} chart(s) created`);
}

/**
 * Build combined channel objects from separate cfg and data arrays.
 * Merges metadata from cfg.computedChannels with values from data.computedData.
 * 
 * @function buildComputedChannelObjects
 * @private
 * @param {Object} cfg - Configuration with computedChannels array
 * @param {Object} data - Data object with computedData array
 * @returns {Object[]} Combined channel objects with metadata and data
 * 
 * @example
 * const channels = buildComputedChannelObjects(
 *   { computedChannels: [{ id: "rms", madeFrom: "analog" }] },
 *   { computedData: [[1.2, 1.3, 1.4]] }
 * );
 * // [{ id: "rms", madeFrom: "analog", data: [1.2, 1.3, 1.4] }]
 */
function buildComputedChannelObjects(cfg, data) {
  const cfgChannels = cfg?.computedChannels || [];
  const dataValues = data?.computedData || [];

  if (cfgChannels.length === 0) {
    return [];
  }

  console.log(`[buildComputedChannelObjects] Building ${cfgChannels.length} channel objects`);

  return cfgChannels.map((channelMeta, index) => {
    // Extract values from data (supports multiple formats)
    let values = [];
    if (index < dataValues.length) {
      if (Array.isArray(dataValues[index])) {
        // New format: data.computedData[i] is values array
        values = dataValues[index];
      } else if (dataValues[index]?.data && Array.isArray(dataValues[index].data)) {
        // Legacy format: .data property
        values = dataValues[index].data;
      } else if (dataValues[index]?.results && Array.isArray(dataValues[index].results)) {
        // Legacy format: .results property
        values = dataValues[index].results;
      }
    }

    const combined = {
      ...channelMeta,  // Use cfg as source of truth for metadata
      data: values,    // Attach computed values
    };

    console.log(`  [${index}] id="${combined.id}", group="${combined.group}", madeFrom="${combined.madeFrom}", values=${values.length}`);

    return combined;
  });
}

/**
 * Separate computed channels by their madeFrom type.
 * Also validates that "digital" channels have binary data.
 * 
 * @function separateByType
 * @private
 * @param {Object[]} channels - Combined channel objects
 * @returns {Object} Object with analogChannels, digitalChannels, unknownChannels arrays
 * 
 * @example
 * const { analogChannels, digitalChannels, unknownChannels } = separateByType(channels);
 */
function separateByType(channels) {
  const analogChannels = [];
  const digitalChannels = [];
  const unknownChannels = [];

  for (const ch of channels) {
    let type = ch.madeFrom?.toLowerCase();
    
    // ✅ VALIDATION: If marked as "digital" but data has non-binary values,
    // override to "analog" to prevent rendering errors
    if (type === "digital" && ch.data?.length > 0) {
      const sampleValues = ch.data.slice(0, 100);
      const isBinary = sampleValues.every(v => v === 0 || v === 1);
      if (!isBinary) {
        console.log(`[separateByType] ⚠️ Channel "${ch.id}" has madeFrom="digital" but non-binary values. Routing to analog.`);
        console.log(`[separateByType]   Sample values: ${sampleValues.slice(0, 10).join(", ")}`);
        type = "analog";  // Override for routing
      }
    }
    
    if (type === "analog") {
      analogChannels.push(ch);
    } else if (type === "digital") {
      digitalChannels.push(ch);
    } else {
      // Unknown type - will default to analog
      unknownChannels.push(ch);
    }
  }

  return { analogChannels, digitalChannels, unknownChannels };
}

/**
 * Group channels by their group field.
 * 
 * @function groupByGroup
 * @private
 * @param {Object[]} channels - Channel objects with group field
 * @returns {Map<string, Object[]>} Map of groupId → channels array
 * 
 * @example
 * const groups = groupByGroup(channels);
 * // Map { "G0" => [ch1, ch2], "Computed" => [ch3] }
 */
function groupByGroup(channels) {
  const groups = new Map();

  for (const ch of channels) {
    const groupId = ch.group || "Computed";  // Default group if none specified
    
    if (!groups.has(groupId)) {
      groups.set(groupId, []);
    }
    groups.get(groupId).push(ch);
  }

  return groups;
}

// Re-export for backward compatibility during transition
export { renderComputedChart as renderComputedChannels };
