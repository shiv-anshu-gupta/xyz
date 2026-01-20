/**
 * @file EquationEvaluatorInChannelList.js
 * @module components/EquationEvaluatorInChannelList
 * 
 * @description
 * <h3>Equation Evaluator UI for Channel List</h3>
 * 
 * <p>An integrated equation evaluator UI component embedded within the Channel List popup window.
 * Allows users to create computed channels by entering mathematical expressions that operate
 * on existing analog channel data. Supports LaTeX input via MathLive, real-time preview,
 * and COMTRADE binary export of computed results.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>LaTeX Input</td><td>MathLive provides professional math equation editor</td></tr>
 *   <tr><td>Real-time Preview</td><td>Live evaluation shows computed values as user types</td></tr>
 *   <tr><td>math.js Backend</td><td>Powerful mathematical expression evaluation engine</td></tr>
 *   <tr><td>Binary Export</td><td>Export computed channels to COMTRADE Binary32/64 format</td></tr>
 *   <tr><td>Performance Monitoring</td><td>Shows evaluation time and statistics</td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>MathLive Editor</strong> — LaTeX equation input with autocomplete</li>
 *   <li><strong>Channel Variables</strong> — Reference analog channels by name (IA, IB, VA, etc.)</li>
 *   <li><strong>Built-in Functions</strong> — sin, cos, sqrt, abs, log, exp, and more</li>
 *   <li><strong>Color Palette</strong> — Automatic color assignment from computed palette</li>
 *   <li><strong>Statistics Display</strong> — Min, max, mean, RMS of computed data</li>
 *   <li><strong>Binary Export</strong> — Generate COMTRADE Binary32/64 CFG+DAT files</li>
 *   <li><strong>Undo/Clear</strong> — Reset computation or clear all inputs</li>
 * </ul>
 * 
 * <h4>Expression Syntax</h4>
 * <table>
 *   <tr><th>Expression</th><th>Description</th></tr>
 *   <tr><td>IA + IB + IC</td><td>Sum of three phase currents</td></tr>
 *   <tr><td>sqrt(IA^2 + IB^2)</td><td>Magnitude calculation</td></tr>
 *   <tr><td>VA * cos(30 deg)</td><td>Trigonometric with unit conversion</td></tr>
 *   <tr><td>abs(IA - IB)</td><td>Absolute difference</td></tr>
 * </table>
 * 
 * @see {@link module:utils/computedChannelOptimization} - Expression compilation and evaluation
 * @see {@link module:utils/binaryExportUtils} - COMTRADE binary export utilities
 * @see {@link module:utils/computedChannelMetadata} - Computed channel metadata store
 * 
 * @example
 * // Create evaluator in popup window
 * createEquationEvaluatorInChannelList(
 *   cfg,           // COMTRADE config object
 *   data,          // COMTRADE data arrays
 *   containerEl,   // Container element to attach to
 *   popupWindow    // Popup window reference (optional)
 * );
 * 
 * @example
 * // User workflow:
 * // 1. Enter LaTeX: I_{sum} = I_A + I_B + I_C
 * // 2. Click "Preview" to see computed values
 * // 3. Click "Add Channel" to create computed channel
 * // 4. Export to Binary32 COMTRADE format
 * 
 * @mermaid
 * graph TD
 *     subgraph UI_Creation
 *         A[createEquationEvaluatorInChannelList] --> B[Create Section Container]
 *         B --> C[Create MathLive Input Field]
 *         C --> D[Create Preview Button]
 *         D --> E[Create Add Channel Button]
 *         E --> F[Create Export Button]
 *     end
 *     
 *     subgraph Expression_Evaluation
 *         G[User Enters LaTeX] --> H[Convert LaTeX to math.js]
 *         H --> I[getCompiledExpression]
 *         I --> J[createScopeTemplate<br/>with channel values]
 *         J --> K[evaluateExpression<br/>for each sample]
 *         K --> L[calculateStats<br/>min, max, mean, RMS]
 *         L --> M[Display Preview Results]
 *     end
 *     
 *     subgraph Channel_Creation
 *         N[User Clicks Add Channel] --> O[Assign Color from Palette]
 *         O --> P[Store in computedChannelMetadata]
 *         P --> Q[postMessage to Parent<br/>callback_addChannel]
 *         Q --> R[Parent Updates channelState]
 *         R --> S[Charts Re-render]
 *     end
 *     
 *     subgraph Binary_Export
 *         T[User Clicks Export] --> U[generateCFGContentBinary32]
 *         U --> V[generateDATContentBinary32]
 *         V --> W[createBinaryBlob]
 *         W --> X[Download CFG + DAT Files]
 *     end
 *     
 *     style A fill:#4CAF50,color:white
 *     style M fill:#2196F3,color:white
 *     style S fill:#FF9800,color:white
 */

import {
  generateCFGContentBinary32,
  generateDATContentBinary32,
  generateCFGContentBinary64,
  generateDATContentBinary64,
  generateCFGContentFloat32,
  generateDATContentFloat32,
  generateCFGContentFloat64,
  generateDATContentFloat64,
  createBinaryBlob,
} from "../utils/binaryExportUtils.js";
import {
  getCompiledExpression,
  createScopeTemplate,
  evaluateExpression,
  calculateStats,
  measurePerformance,
} from "../utils/computedChannelOptimization.js";
import { computedChannelMetadata } from "../utils/computedChannelMetadata.js";
import { computedPalette } from "../utils/constants.js";

export function createEquationEvaluatorInChannelList(
  cfg,
  data,
  containerEl,
  popupWindow
) {
  if (!containerEl) {
    console.warn(
      "createEquationEvaluatorInChannelList: containerEl not provided"
    );
    return;
  }

  const doc = popupWindow?.document || document;
  let computedChannelsCounter = 0;
  let currentComputation = null;

  // Create main container
  const section = doc.createElement("div");
  section.id = "equation-evaluator-popup";
  section.style.cssText = `
    padding: 16px;
    background: var(--bg-secondary, #ffffff);
    border-radius: 8px;
    color: var(--text-primary, #1e293b);
    margin-bottom: 12px;
    border: 1px solid var(--border-color, rgba(102, 126, 234, 0.4));
    box-shadow: var(--shadow-sm, 0 2px 8px rgba(15, 23, 42, 0.18));
  `;

  section.innerHTML = `
    <h3 style="margin: 0 0 12px 0; font-size: 18px; display: flex; align-items: center; gap: 8px; color: var(--text-primary, #1e293b);">
      <span>🧮</span> Equation Evaluator
    </h3>
    
    <div style="display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; align-items: flex-end;">
      <div style="flex: 1; min-width: 200px;">
        <label style="display: block; font-weight: 600; margin-bottom: 6px; font-size: 12px; color: var(--text-primary, #1e293b);">Equation:</label>
        <input 
          type="text" 
          id="equation-input-popup" 
          placeholder="e.g., sqrt(a0^2 + a1^2)" 
          style="width: 100%; padding: 8px 10px; border: 1px solid var(--border-color, rgba(148, 163, 184, 0.45)); border-radius: 4px; box-sizing: border-box; font-family: 'Fira Code', 'Consolas', monospace; font-size: 13px; background: var(--bg-tertiary, #f1f5f9); color: var(--text-primary, #1e293b);"
        >
      </div>
      <button 
        id="execute-btn-popup" 
        style="padding: 8px 16px; background: var(--accent-cyan, #0ea5e9); color: var(--bg-primary, #f8fafc); border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 13px; white-space: nowrap;"
      >
        ▶️ Execute
      </button>
      <button 
        id="channels-btn-popup" 
        style="padding: 8px 16px; background: transparent; color: var(--accent-cyan, #0ea5e9); border: 1px solid var(--accent-cyan, #0ea5e9); border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 13px; white-space: nowrap;"
      >
        📋 Channels
      </button>
    </div>

    <div id="results-popup" style="background: var(--bg-tertiary, #f1f5f9); border-radius: 6px; color: var(--text-primary, #1e293b); padding: 12px; font-size: 13px; border: 1px solid var(--border-color, rgba(148, 163, 184, 0.45));">
      <div style="text-align: center; color: var(--text-muted, #94a3b8);">Enter an equation and click Execute</div>
    </div>
  `;

  containerEl.appendChild(section);

  const equationInput = section.querySelector("#equation-input-popup");
  const executeBtn = section.querySelector("#execute-btn-popup");
  const channelsBtn = section.querySelector("#channels-btn-popup");
  const resultsDiv = section.querySelector("#results-popup");

  executeBtn.onclick = () => {
    const equation = equationInput.value.trim();
    if (!equation) {
      resultsDiv.innerHTML =
        '<div style="color: var(--accent-red, #ef4444); text-align: center; font-weight: 600;">Please enter an equation</div>';
      return;
    }
    executeEquation(equation, resultsDiv, doc);
  };

  channelsBtn.onclick = () => showAllChannelsDialogPopup(cfg, data, doc);

  equationInput.onkeypress = (e) => {
    if (e.key === "Enter") executeBtn.click();
  };

  // ✅ HELPER: Generate unique group ID for computed channels (popup version)
  function generateUniqueComputedGroupPopup() {
    const existingGroups = new Set();

    // Get channelState - could be in popup window or opener (parent) window
    let channelState =
      window.channelState || (window.opener && window.opener.channelState);

    // Extract group numbers from channelState (source of truth)
    if (channelState) {
      // Get all group IDs from analog channels
      const analogGroups = channelState.analog?.groups || [];
      analogGroups.forEach((groupId) => {
        if (typeof groupId === "string" && groupId.startsWith("G")) {
          const groupNum = parseInt(groupId.substring(1), 10);
          if (!isNaN(groupNum)) {
            existingGroups.add(groupNum);
          }
        }
      });

      // Get all group IDs from digital channels
      const digitalGroups = channelState.digital?.groups || [];
      digitalGroups.forEach((groupId) => {
        if (typeof groupId === "string" && groupId.startsWith("G")) {
          const groupNum = parseInt(groupId.substring(1), 10);
          if (!isNaN(groupNum)) {
            existingGroups.add(groupNum);
          }
        }
      });
    }

    // Also check already-created computed channels
    if (cfg?.computedChannels) {
      cfg.computedChannels.forEach((ch) => {
        if (
          ch.group &&
          typeof ch.group === "string" &&
          ch.group.startsWith("G")
        ) {
          const groupNum = parseInt(ch.group.substring(1), 10);
          if (!isNaN(groupNum)) {
            existingGroups.add(groupNum);
          }
        }
      });
    }

    let nextGroupNum = 0;
    while (existingGroups.has(nextGroupNum)) {
      nextGroupNum++;
    }

    console.log(
      "[generateUniqueComputedGroupPopup] 🔍 channelState found:",
      !!channelState,
      "existing groups:",
      Array.from(existingGroups),
      "→ assigning G" + nextGroupNum
    );
    return `G${nextGroupNum}`;
  }

  // ✅ HELPER: Extract group from channels used in equation
  // Falls back to unique group generation if no channels found
  function extractGroupFromEquation(equation) {
    const usedGroups = [];

    // Extract channel IDs from equation (matches a0, a1, d0, d1, and full IDs)
    const channelRefPattern = /([ad]\d+|[a-zA-Z_]\w*)/g;
    const matches = equation.match(channelRefPattern) || [];
    const uniqueRefs = [...new Set(matches)];

    console.log(
      "[extractGroupFromEquation] 🔎 Equation:",
      equation,
      "→ Found refs:",
      uniqueRefs
    );

    // Find which channels are used
    uniqueRefs.forEach((ref) => {
      // Check analog channels
      cfg?.analogChannels?.forEach((chCfg) => {
        if (
          chCfg.id === ref ||
          ref === `a${cfg.analogChannels.indexOf(chCfg)}`
        ) {
          if (chCfg.group) {
            console.log(
              `[extractGroupFromEquation]   ✓ Ref "${ref}" found in group "${chCfg.group}"`
            );
            usedGroups.push(chCfg.group);
          }
        }
      });

      // Check digital channels
      cfg?.digitalChannels?.forEach((chCfg) => {
        if (
          chCfg.id === ref ||
          ref === `d${cfg.digitalChannels.indexOf(chCfg)}`
        ) {
          if (chCfg.group) {
            console.log(
              `[extractGroupFromEquation]   ✓ Ref "${ref}" found in group "${chCfg.group}"`
            );
            usedGroups.push(chCfg.group);
          }
        }
      });
    });

    // ✅ FIX: Generate unique group if no channels found instead of empty string
    if (usedGroups.length === 0) {
      console.log(
        "[extractGroupFromEquation] ⚠️ No groups found for references, generating unique group"
      );
      return generateUniqueComputedGroupPopup();
    }

    const groupCounts = {};
    usedGroups.forEach((g) => {
      groupCounts[g] = (groupCounts[g] || 0) + 1;
    });

    // Return the group with highest count
    const result = Object.keys(groupCounts).reduce((a, b) =>
      groupCounts[a] > groupCounts[b] ? a : b
    );

    console.log(
      "[extractGroupFromEquation] ✅ Assigning group:",
      result,
      "from counts:",
      groupCounts
    );
    return result;
  }

  // Execute equation logic
  function executeEquation(equation, resultsDivEl, ownerDoc) {
    try {
      const mathLib = popupWindow?.math || window.math;
      if (!mathLib) {
        throw new Error("Math.js not available. Please include mathjs CDN.");
      }

      // Prefer analogData/digitalData when present, else analog/digital
      const analogArray = Array.isArray(data?.analogData)
        ? data.analogData
        : Array.isArray(data?.analog)
        ? data.analog
        : [];
      const digitalArray = Array.isArray(data?.digitalData)
        ? data.digitalData
        : Array.isArray(data?.digital)
        ? data.digital
        : [];

      const sampleCount = analogArray?.[0]?.length || 0;
      if (!sampleCount) {
        resultsDivEl.innerHTML =
          '<div style="color: var(--accent-red, #ef4444); padding: 10px; background: rgba(239, 68, 68, 0.12); border-radius: 4px; border: 1px solid rgba(239, 68, 68, 0.35); font-size: 12px;">No analog samples available in popup (analog/analogData empty). Ensure cfg/data are bound.</div>';
        return;
      }

      // ✅ OPTIMIZATION: Compile once with cache
      const compiled = measurePerformance("Compile expression", () =>
        getCompiledExpression(equation, mathLib)
      );

      // ✅ OPTIMIZATION: Pre-allocate scope object to reduce GC
      const scope = createScopeTemplate(
        analogArray.length,
        digitalArray.length
      );

      // ✅ OPTIMIZATION: High-performance evaluation loop
      const results = measurePerformance("Evaluate samples", () =>
        evaluateExpression(
          compiled,
          analogArray,
          digitalArray,
          cfg?.analogChannels,
          cfg?.digitalChannels,
          scope
        )
      );

      // ✅ OPTIMIZATION: Single-pass stats calculation
      const stats = calculateStats(results);

      // Auto-detect scaling
      const firstChannelData = analogArray?.[0] || [];
      const maxRaw = Math.max(...firstChannelData.map((v) => Math.abs(v)));
      const scalingFactor = maxRaw / 2;

      const scaledStats = {
        min: stats.min / scalingFactor,
        max: stats.max / scalingFactor,
        avg: stats.avg / scalingFactor,
      };

      // ✅ Convert Float64Array to regular array for better serialization
      const resultsArray = Array.from(results);

      currentComputation = {
        equation,
        results: resultsArray,
        stats,
        scaledStats,
        scalingFactor,
      };

      // ✅ FIX: Save to parent window, not popup window
      if (window.opener && window.opener !== window) {
        window.opener.__currentComputedChannelData = currentComputation;
      } else {
        window.__currentComputedChannelData = currentComputation;
      }

      // ✅ OPTIMIZATION: Minimal HTML for instant display
      let html = `<div style="background: var(--accent-green, #27AE60); color: var(--bg-primary, #f8fafc); padding: 10px; border-radius: 4px; margin-bottom: 10px;"><strong>✓ Ready</strong>: ${
        resultsArray.length
      } samples | Min: ${stats.min.toFixed(2)} | Max: ${stats.max.toFixed(
        2
      )}</div>`;

      // ✅ Add LaTeX equation display with MathJax rendering
      html += `<div style="background: var(--bg-tertiary, #f1f5f9); padding: 10px; border-radius: 4px; margin-bottom: 10px; border-left: 3px solid var(--accent-cyan, #667eea);"><strong style="color: var(--accent-cyan, #667eea); font-size: 13px;">Equation (LaTeX):</strong><div style="margin-top: 8px; padding: 8px; background: var(--bg-secondary, #ffffff); border-radius: 3px; font-size: 14px; color: var(--text-primary, #1e293b);">$$${equation}$$</div></div>`;

      html += `<div style="display: flex; gap: 8px; flex-wrap: wrap;"><button id="save-computed-btn-popup" style="flex: 1; padding: 10px; background: var(--accent-green, #27AE60); color: var(--bg-primary, #f8fafc); border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px;">💾 Save</button><button id="clear-results-btn-popup" style="flex: 1; padding: 10px; background: var(--accent-red, #ef4444); color: var(--bg-primary, #f8fafc); border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px;">🗑️ Clear</button></div>`;

      resultsDivEl.innerHTML = html;

      // ✅ Trigger MathJax to render LaTeX equations beautifully
      setTimeout(() => {
        if (ownerDoc.defaultView && ownerDoc.defaultView.MathJax) {
          ownerDoc.defaultView.MathJax.typesetPromise &&
            ownerDoc.defaultView.MathJax.typesetPromise().catch((e) => {
              console.log("[MathJax] Rendering equations...");
            });
        }
      }, 100);

      const saveBtn = resultsDivEl.querySelector("#save-computed-btn-popup");
      const clearBtn = resultsDivEl.querySelector("#clear-results-btn-popup");

      saveBtn.onclick = () =>
        saveComputedChannelPopup(currentComputation, resultsDivEl, ownerDoc);
      clearBtn.onclick = () => {
        resultsDivEl.innerHTML =
          '<div style="text-align: center; color: var(--text-muted, #94a3b8);">Enter an equation and click Execute</div>';
        currentComputation = null;
      };
    } catch (error) {
      resultsDivEl.innerHTML = `
        <div style="color: var(--accent-red, #ef4444); padding: 10px; background: rgba(239, 68, 68, 0.12); border-radius: 4px; font-size: 12px; border: 1px solid rgba(239, 68, 68, 0.35);">
          <strong>Error:</strong> ${error.message}
        </div>
      `;
    }
  }

  function saveComputedChannelPopup(computation, resultsDivEl, ownerDoc) {
    const channelName = `computed_${computedChannelsCounter}`;
    computedChannelsCounter++;

    // Extract the group from channels used in the equation
    const usedGroup = extractGroupFromEquation(computation.equation);

    // ✅ ASSIGN COLOR FROM PALETTE (index-based at creation time)
    const computedIndex = data.computedData.length;
    const assignedColor =
      computedPalette[computedIndex % computedPalette.length];

    // Store in data - with complete metadata similar to analog/digital channels
    if (!data.computedData) data.computedData = [];
    if (!cfg.computedChannels) cfg.computedChannels = [];

    // ✅ OPTIMIZATION: Pre-scale data during save to avoid runtime scaling
    const scaledData =
      computation.scalingFactor !== 1
        ? computation.results.map((v) => v / computation.scalingFactor)
        : computation.results;

    // Calculate stats for scaled data to display correctly in sidebar
    const scaledDataStats =
      computation.scalingFactor !== 1
        ? {
            min: computation.stats.min / computation.scalingFactor,
            max: computation.stats.max / computation.scalingFactor,
            avg: computation.stats.avg / computation.scalingFactor,
            mean: computation.stats.mean / computation.scalingFactor,
            rms: computation.stats.rms
              ? computation.stats.rms / computation.scalingFactor
              : undefined,
            stdDev: computation.stats.stdDev
              ? computation.stats.stdDev / computation.scalingFactor
              : undefined,
            count: computation.stats.count,
            validCount: computation.stats.validCount,
          }
        : computation.stats;

    // ✅ REFACTORED: Store ONLY the values array in data.computedData
    // Metadata goes to cfg.computedChannels (below)
    // This matches the new format: cfg = metadata, data = values only
    data.computedData.push(scaledData);

    // Register in cfg with complete metadata (NO data values here!)
    cfg.computedChannels.push({
      id: channelName,
      channelID: channelName,  // ✅ FIX: Include channelID for consistency with analog/digital
      name: channelName,
      equation: computation.equation,
      unit: "Computed",
      group: usedGroup,
      color: assignedColor, // ✅ CHANGED: Use palette color instead of random
      type: "Computed",
      index: data.computedData.length - 1,
      stats: scaledDataStats,
      scaledStats: computation.scaledStats,
      scalingFactor: computation.scalingFactor,
      sampleCount: scaledData?.length || 0,
      createdAt: Date.now(),
    });

    // 🎯 CRITICAL: Broadcast new computed channel to Channel List popup if open
    if (window.__channelListWindow && !window.__channelListWindow.closed) {
      try {
        const computedChannelsList = (window.globalCfg && window.globalCfg.computedChannels) || cfg.computedChannels || [];
        console.log("[EquationEvaluatorInChannelList] 📢 Broadcasting computed channels to popup after creation:", {
          count: computedChannelsList.length,
          newChannelId: channelName,
          ids: computedChannelsList.map((ch) => ch.id),
        });

        window.__channelListWindow.postMessage(
          {
            source: "MainApp",
            type: "computed_channels_updated",
            payload: {
              computedChannels: computedChannelsList,
            },
          },
          "*"
        );
      } catch (err) {
        console.warn(
          "[EquationEvaluatorInChannelList] Failed to broadcast computed channels to popup:",
          err
        );
      }
    }

    // 📊 Store metadata in centralized metadata manager
    computedChannelMetadata.set(channelName, {
      name: channelName,
      equation: computation.equation,
      latexEquation: computation.equation, // Will be formatted for LaTeX display
      mathJsExpression: computation.equation,
      color: assignedColor, // ✅ USE PALETTE COLOR, not randomColor
      group: usedGroup || "Computed",
      unit: "Computed",
      type: "Computed",
      stats: computation.stats,
      scalingFactor: computation.scalingFactor,
      description: `Auto-computed channel from equation`,
    });

    // Show success
    const successMsg = ownerDoc.createElement("div");
    successMsg.style.cssText = `
      color: white; 
      background: #27AE60; 
      padding: 10px; 
      border-radius: 4px; 
      margin-top: 8px; 
      text-align: center; 
      font-weight: 600;
      font-size: 12px;
      animation: fadeOut 3s ease-in-out forwards;
    `;
    successMsg.textContent = `✅ Saved "${channelName}" (${computation.results.length} samples)`;

    // Add animation if not present
    const existingStyle = ownerDoc.head.querySelector(
      "style[data-animation-popup]"
    );
    if (!existingStyle) {
      const style = ownerDoc.createElement("style");
      style.setAttribute("data-animation-popup", "true");
      style.textContent = `
        @keyframes fadeOut {
          0% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }
      `;
      ownerDoc.head.appendChild(style);
    }

    resultsDivEl.parentElement.insertBefore(
      successMsg,
      resultsDivEl.nextSibling
    );
    setTimeout(() => successMsg.remove(), 3000);

    console.log("[EquationEvaluatorPopup] Saved:", channelName);

    // Dispatch custom event to parent window with complete channel data
    if (window.opener) {
      console.log(
        "[EquationEvaluatorPopup] Dispatching event to parent window"
      );
      const computedChannelData = {
        id: channelName,
        name: channelName,
        equation: computation.equation,
        data: scaledData,
        stats: computation.stats,
        scaledStats: computation.scaledStats,
        scalingFactor: computation.scalingFactor,
        color: assignedColor,
        type: "Computed",
        unit: "Computed",
        group: usedGroup,
      };
      window.opener.dispatchEvent(
        new CustomEvent("computedChannelSaved", {
          detail: {
            channelId: channelName,
            channelName: channelName,
            equation: computation.equation,
            samples: computation.results.length,
            color: assignedColor,
            type: "Computed",
            group: usedGroup,
            fullData: computedChannelData,
          },
        })
      );
    } else {
      console.warn("[EquationEvaluatorPopup] No opener window found");
    }
  }

  function showAllChannelsDialogPopup(cfgData, dataData, ownerDoc) {
    const modal = ownerDoc.createElement("div");
    modal.style.cssText = `
      position: fixed; 
      top: 0; 
      left: 0; 
      width: 100%; 
      height: 100%; 
      background: rgba(0,0,0,0.5); 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      z-index: 10001;
    `;

    const dialog = ownerDoc.createElement("div");
    dialog.style.cssText = `
      background: white; 
      border-radius: 8px; 
      padding: 20px; 
      max-width: 700px; 
      max-height: 70vh; 
      overflow: auto; 
      box-shadow: 0 4px 20px rgba(0,0,0,0.3); 
      color: #333;
      font-size: 13px;
    `;

    let html = `<h3 style="margin-top: 0; color: #667eea; font-size: 16px;">Available Channels</h3>`;

    const totalSamples =
      dataData?.analog?.[0]?.length || dataData?.analogData?.[0]?.length || 0;
    html += `<p style="font-size: 12px; color: #666;"><strong>Total Samples:</strong> ${totalSamples}</p>`;

    // Analog
    if (cfgData.analogChannels?.length > 0) {
      html += `<h4 style="color: #667eea; margin-top: 12px; margin-bottom: 8px;">Analog Channels (${cfgData.analogChannels.length})</h4>`;
      html += '<ul style="list-style: none; padding: 0; margin: 0;">';
      cfgData.analogChannels.forEach((ch, i) => {
        html += `<li style="padding: 6px; background: #f5f5f5; margin-bottom: 4px; border-radius: 3px; border-left: 3px solid #667eea; font-size: 12px;">
          <strong>a${i}: ${ch.id || "Analog " + i}</strong> - ${
          ch.unit || "N/A"
        }
        </li>`;
      });
      html += "</ul>";
    }

    // Digital
    if (cfgData.digitalChannels?.length > 0) {
      html += `<h4 style="color: #667eea; margin-top: 12px; margin-bottom: 8px;">Digital Channels (${cfgData.digitalChannels.length})</h4>`;
      html += '<ul style="list-style: none; padding: 0; margin: 0;">';
      cfgData.digitalChannels.forEach((ch, i) => {
        html += `<li style="padding: 6px; background: #f5f5f5; margin-bottom: 4px; border-radius: 3px; border-left: 3px solid #667eea; font-size: 12px;">
          <strong>d${i}: ${ch.id || "Digital " + i}</strong>
        </li>`;
      });
      html += "</ul>";
    }

    // Computed
    if (dataData.computedData?.length > 0) {
      html += `<h4 style="color: #27AE60; margin-top: 12px; margin-bottom: 8px;">🧮 Computed Channels (${dataData.computedData.length})</h4>`;
      html += '<ul style="list-style: none; padding: 0; margin: 0;">';
      dataData.computedData.forEach((ch, i) => {
        html += `<li style="padding: 8px; background: #D5F4E6; margin-bottom: 4px; border-radius: 3px; border-left: 3px solid #27AE60; font-size: 12px;">
          <div><strong>c${i}: ${ch.id}</strong></div>
          <div style="color: #555; margin-top: 3px; font-family: monospace; font-size: 11px;">${ch.equation}</div>
        </li>`;
      });
      html += "</ul>";
    }

    dialog.innerHTML = html;

    const closeBtn = ownerDoc.createElement("button");
    closeBtn.textContent = "✕ Close";
    closeBtn.style.cssText = `
      width: 100%; 
      padding: 10px; 
      background: #667eea; 
      color: white; 
      border: none; 
      border-radius: 4px; 
      cursor: pointer; 
      margin-top: 16px; 
      font-weight: 600; 
      font-size: 13px;
    `;
    closeBtn.onclick = () => modal.remove();
    dialog.appendChild(closeBtn);

    modal.appendChild(dialog);
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
    ownerDoc.body.appendChild(modal);
  }
}

/**
 * Export computed channel data as JSON format (importable)
 * @param {Object} computation - Computation object with results, stats, equation, etc
 */
export function exportComputedChannelAsASCII(computation) {
  try {
    if (
      !computation ||
      !computation.results ||
      !Array.isArray(computation.results)
    ) {
      alert("❌ No data to export. Please execute an equation first.");
      return;
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, -5);
    const fileName = `computed_channel_${timestamp}.json`;

    // Create JSON export with all metadata and data
    const exportData = {
      format: "COMTRADE_COMPUTED_CHANNEL_v1",
      exportedAt: new Date().toISOString(),
      channel: {
        id: `computed_${Date.now()}`,
        equation: computation.equation,
        scalingFactor: computation.scalingFactor,
        stats: {
          count: computation.stats.count,
          validCount: computation.stats.validCount,
          min: computation.stats.min,
          max: computation.stats.max,
          avg: computation.stats.avg,
        },
        scaledStats: {
          min: computation.scaledStats.min,
          max: computation.scaledStats.max,
          avg: computation.scaledStats.avg,
        },
      },
      data: computation.results, // Array of raw values
    };

    // Create blob and trigger download
    const jsonContent = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonContent], {
      type: "application/json;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", fileName);
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Show success notification
    console.log(
      `[ExportJSON] ✅ Exported ${computation.results.length} samples to ${fileName}`
    );
    alert(
      `✅ Successfully exported!\n\nFile: ${fileName}\nSamples: ${computation.results.length}\nEquation: ${computation.equation}\n\nYou can import this file later to reuse the channel.`
    );
  } catch (error) {
    console.error("[ExportJSON] Error:", error);
    alert(`❌ Export failed: ${error.message}`);
  }
}

/**
 * Export computed channel as CFG file (COMTRADE 2013 format)
 * @param {Object} computation - Computation object
 * @param {number} sampleRate - Sample rate from original COMTRADE
 * @returns {string} CFG file content
 */
export function generateCFGContent(computation, sampleRate = 4800) {
  // Calculate multiplier and offset for proper scaling
  // Format: raw_value * multiplier + offset = display_value
  // We store raw values, so multiplier converts to display
  const min = computation.stats.min;
  const max = computation.stats.max;
  const range = max - min;

  // COMTRADE uses 32-bit signed integer range: -2147483648 to 2147483647
  const intMin = -2147483648;
  const intMax = 2147483647;
  const intRange = intMax - intMin;

  // Multiplier: how much each raw unit represents in real values
  const multiplier = range / intRange;
  const offset = min - intMin * multiplier;

  let cfg = "";

  // Line 1: Station,Device,COMTRADE version
  cfg += `MID=COMPUTED_CHANNEL,EQUATION_${Date.now()},2013\n`;

  // Line 2: Total channels, Analog channels, Digital channels
  cfg += `1,1A,0D\n`;

  // Analog channel definition
  // Index,Id,Phase,Component,Unit,Multiplier,Offset,Skew,Min,Max,Primary,Secondary,PS
  cfg += `1,COMPUTED,,,V,${multiplier.toExponential(15)},${offset.toExponential(
    15
  )},0,${intMin},${intMax},${sampleRate},1,P\n`;

  // Digital channels count line
  cfg += `0\n`;

  // Sampling rates: N, rate1, endSample1, [rate2, endSample2, ...]
  const totalSamples = computation.results.length;
  cfg += `0\n`;
  cfg += `${sampleRate},${totalSamples}\n`;

  // Time format: DD/MM/YYYY,HH:MM:SS.mmmmmm
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const microseconds = String(now.getMilliseconds() * 1000).padStart(6, "0");

  const timeStr = `${day}/${month}/${year},${hours}:${minutes}:${seconds}.${microseconds}`;

  // Start time (same as trigger time for computed channels)
  cfg += `${timeStr}\n`;
  // Trigger time (same as start time)
  cfg += `${timeStr}\n`;

  // File type
  cfg += `ASCII\n`;

  // Time multiplier (1.0 means use sample rate timing)
  cfg += `1.0\n`;

  // Time offset (COMTRADE 2013 specific)
  cfg += `0\n`;
  cfg += `0\n`;

  return cfg;
}

/**
 * Export computed channel as DAT file (ASCII format, COMTRADE 2013 compatible)
 * COMTRADE ASCII Format: sample#,milliseconds,value1[,value2...]
 * @param {Object} computation - Computation object
 * @param {number} sampleRate - Sample rate from original COMTRADE
 * @returns {string} DAT file content (ASCII COMTRADE format)
 */
export function generateDATContent(computation, sampleRate = 4800) {
  // Calculate multiplier for converting display values to raw integer values
  const min = computation.stats.min;
  const max = computation.stats.max;
  const range = max - min;
  const intMin = -2147483648;
  const intMax = 2147483647;
  const intRange = intMax - intMin;
  const multiplier = range / intRange;
  const offset = min - intMin * multiplier;

  let dat = "";

  // COMTRADE ASCII format: sample_number,timestamp_milliseconds,channel_value
  // timestamp is in milliseconds from start
  computation.results.forEach((value, idx) => {
    // Sample number (1-based)
    const sampleNum = idx + 1;

    // Timestamp in milliseconds
    const timestampMs = Math.round((idx / sampleRate) * 1000);

    // Convert display value to raw integer value using the multiplier/offset
    // display_value = raw_value * multiplier + offset
    // raw_value = (display_value - offset) / multiplier
    const rawValue = Math.round((value - offset) / multiplier);

    // Format: sample#,time_ms,value
    dat += `${sampleNum},${timestampMs},${rawValue}\n`;
  });

  return dat;
}

/**
 * Export computed channel as CFG + DAT files (compatible with load functionality)
 * @param {Object} computation - Computation object
 * @param {number} sampleRate - Sample rate from original COMTRADE
 */
export function exportComputedChannelAsCFGDAT(computation, sampleRate = 4800) {
  try {
    if (
      !computation ||
      !computation.results ||
      !Array.isArray(computation.results)
    ) {
      alert("❌ No data to export. Please execute an equation first.");
      return;
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, -5);
    const baseName = `computed_channel_${timestamp}`;

    // Generate CFG content
    const cfgContent = generateCFGContent(computation, sampleRate);
    const cfgFileName = `${baseName}.cfg`;

    // Generate DAT content
    const datContent = generateDATContent(computation, sampleRate);
    const datFileName = `${baseName}.dat`;

    // Download CFG
    const cfgBlob = new Blob([cfgContent], {
      type: "text/plain;charset=utf-8;",
    });
    const cfgLink = document.createElement("a");
    cfgLink.setAttribute("href", URL.createObjectURL(cfgBlob));
    cfgLink.setAttribute("download", cfgFileName);
    cfgLink.style.visibility = "hidden";
    document.body.appendChild(cfgLink);
    cfgLink.click();
    document.body.removeChild(cfgLink);

    // Download DAT (after small delay so browser doesn't block)
    setTimeout(() => {
      const datBlob = new Blob([datContent], {
        type: "text/plain;charset=utf-8;",
      });
      const datLink = document.createElement("a");
      datLink.setAttribute("href", URL.createObjectURL(datBlob));
      datLink.setAttribute("download", datFileName);
      datLink.style.visibility = "hidden";
      document.body.appendChild(datLink);
      datLink.click();
      document.body.removeChild(datLink);
    }, 500);

    console.log(
      `[ExportCFGDAT] ✅ Exported as ${cfgFileName} and ${datFileName}`
    );
    alert(
      `✅ Successfully exported!\n\nFiles:\n  • ${cfgFileName}\n  • ${datFileName}\n\nDownload both files together.\nThen use "Select and Load Files" to import them!`
    );
  } catch (error) {
    console.error("[ExportCFGDAT] Error:", error);
    alert(`❌ Export failed: ${error.message}`);
  }
}

/**
 * Import computed channel from JSON file
 * @param {File} file - JSON file to import
 */
export function importComputedChannelFromJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);

        // Validate format
        if (data.format !== "COMTRADE_COMPUTED_CHANNEL_v1") {
          throw new Error(
            "Invalid format. Please use a file exported from this application."
          );
        }

        if (!data.channel || !data.data || !Array.isArray(data.data)) {
          throw new Error("Invalid file structure.");
        }

        console.log("[ImportJSON] ✅ File imported successfully");
        resolve({
          equation: data.channel.equation,
          results: data.data,
          stats: data.channel.stats,
          scaledStats: data.channel.scaledStats,
          scalingFactor: data.channel.scalingFactor,
        });
      } catch (error) {
        console.error("[ImportJSON] Error parsing:", error);
        reject(error);
      }
    };

    reader.onerror = (error) => {
      reject(new Error("Failed to read file: " + error));
    };

    reader.readAsText(file);
  });
}

/**
 * Generate CFG content for multiple computed channels (COMTRADE 2013)
 * @param {Array} computedChannels - Array of computed channel objects
 * @param {number} sampleRate - Sample rate
 * @returns {string} CFG content
 */
function generateCFGContentBatch(computedChannels, sampleRate = 4800) {
  const numAnalog = computedChannels.length;

  let cfg = "";

  // Line 1: Station,Device,COMTRADE version
  cfg += `MID=COMPUTED_CHANNELS,BATCH_${Date.now()},2013\n`;

  // Line 2: Total channels, Analog channels, Digital channels
  cfg += `${numAnalog},${numAnalog}A,0D\n`;

  // Analog channel definitions - one per computed channel
  computedChannels.forEach((ch, idx) => {
    const min = ch.stats?.min || 0;
    const max = ch.stats?.max || 1;
    const range = max - min;

    const intMin = -2147483648;
    const intMax = 2147483647;
    const intRange = intMax - intMin;

    const multiplier = range / intRange;
    const offset = min - intMin * multiplier;

    const chNum = idx + 1;
    const chId = ch.id || `computed_${idx}`;

    // Index,Id,Phase,Component,Unit,Multiplier,Offset,Skew,Min,Max,Primary,Secondary,PS
    cfg += `${chNum},${chId},,,${ch.unit || "V"},${multiplier.toExponential(
      15
    )},${offset.toExponential(15)},0,${intMin},${intMax},${sampleRate},1,P\n`;
  });

  // Digital channels count line
  cfg += `0\n`;

  // Sampling rates
  const totalSamples = computedChannels[0]?.data?.length || 0;
  cfg += `0\n`;
  cfg += `${sampleRate},${totalSamples}\n`;

  // Time format
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const microseconds = String(now.getMilliseconds() * 1000).padStart(6, "0");

  const timeStr = `${day}/${month}/${year},${hours}:${minutes}:${seconds}.${microseconds}`;

  cfg += `${timeStr}\n`;
  cfg += `${timeStr}\n`;

  cfg += `ASCII\n`;
  cfg += `1.0\n`;
  cfg += `0\n`;
  cfg += `0\n`;

  return cfg;
}

/**
 * Generate DAT content for multiple computed channels (COMTRADE 2013)
 * @param {Array} computedChannels - Array of computed channel objects
 * @param {number} sampleRate - Sample rate
 * @returns {string} DAT content
 */
function generateDATContentBatch(computedChannels, sampleRate = 4800) {
  let dat = "";

  // Assuming all channels have same number of samples
  const totalSamples = computedChannels[0]?.data?.length || 0;

  for (let idx = 0; idx < totalSamples; idx++) {
    const sampleNum = idx + 1;
    const timestampMs = Math.round((idx / sampleRate) * 1000);

    dat += `${sampleNum},${timestampMs}`;

    // Add value for each channel
    computedChannels.forEach((ch) => {
      const value = ch.data?.[idx] || 0;
      const min = ch.stats?.min || 0;
      const max = ch.stats?.max || 1;
      const range = max - min;

      const intMin = -2147483648;
      const intMax = 2147483647;
      const intRange = intMax - intMin;

      const multiplier = range / intRange;
      const offset = min - intMin * multiplier;

      // Convert display value to raw integer
      const rawValue = Math.round((value - offset) / multiplier);
      dat += `,${rawValue}`;
    });

    dat += "\n";
  }

  return dat;
}

/**
 * Show export format selection dialog
 * @param {Object} data - Data object containing computedData array
 * @param {number} sampleRate - Sample rate from original COMTRADE
 * @returns {void}
 */
function showExportFormatDialog(data, sampleRate) {
  return new Promise((resolve) => {
    // Create modal dialog
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;

    const dialogBox = document.createElement("div");
    dialogBox.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      min-width: 400px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    dialogBox.innerHTML = `
      <h2 style="margin: 0 0 20px 0; color: #333; font-size: 20px;">📥 Export Format Selection</h2>
      
      <div style="margin-bottom: 20px; max-height: 400px; overflow-y: auto;">
        <label style="display: flex; align-items: center; margin-bottom: 12px; cursor: pointer;">
          <input type="radio" name="export-format" value="ascii" checked style="margin-right: 10px; cursor: pointer;">
          <span style="font-weight: 500; color: #333;">ASCII Format</span>
          <span style="color: #999; font-size: 12px; margin-left: 8px;">(Text, human-readable, larger file)</span>
        </label>
        
        <label style="display: flex; align-items: center; margin-bottom: 12px; cursor: pointer;">
          <input type="radio" name="export-format" value="binary32" style="margin-right: 10px; cursor: pointer;">
          <span style="font-weight: 500; color: #333;">Binary 32-bit Format</span>
          <span style="color: #999; font-size: 12px; margin-left: 8px;">(32-bit signed integers, compact)</span>
        </label>
        
        <label style="display: flex; align-items: center; margin-bottom: 12px; cursor: pointer;">
          <input type="radio" name="export-format" value="binary64" style="margin-right: 10px; cursor: pointer;">
          <span style="font-weight: 500; color: #333;">Binary 64-bit Format</span>
          <span style="color: #999; font-size: 12px; margin-left: 8px;">(64-bit signed integers, maximum range)</span>
        </label>

        <label style="display: flex; align-items: center; margin-bottom: 12px; cursor: pointer;">
          <input type="radio" name="export-format" value="float32" style="margin-right: 10px; cursor: pointer;">
          <span style="font-weight: 500; color: #333;">Float 32-bit Format</span>
          <span style="color: #999; font-size: 12px; margin-left: 8px;">(IEEE 754 32-bit floats, ~7 decimals)</span>
        </label>
        
        <label style="display: flex; align-items: center; cursor: pointer;">
          <input type="radio" name="export-format" value="float64" style="margin-right: 10px; cursor: pointer;">
          <span style="font-weight: 500; color: #333;">Float 64-bit Format</span>
          <span style="color: #999; font-size: 12px; margin-left: 8px;">(IEEE 754 64-bit doubles, ~15 decimals)</span>
        </label>
      </div>

      <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 24px;">
        <button id="cancel-export-btn" style="padding: 8px 16px; border: 1px solid #ccc; border-radius: 4px; background: white; color: #333; cursor: pointer; font-weight: 500;">
          Cancel
        </button>
        <button id="confirm-export-btn" style="padding: 8px 16px; border: none; border-radius: 4px; background: #667eea; color: white; cursor: pointer; font-weight: 500;">
          Export ✅
        </button>
      </div>
    `;

    modal.appendChild(dialogBox);
    document.body.appendChild(modal);

    const cancelBtn = dialogBox.querySelector("#cancel-export-btn");
    const confirmBtn = dialogBox.querySelector("#confirm-export-btn");
    const formatRadios = dialogBox.querySelectorAll(
      "input[name='export-format']"
    );

    let selectedFormat = "ascii";

    formatRadios.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        selectedFormat = e.target.value;
      });
    });

    cancelBtn.addEventListener("click", () => {
      document.body.removeChild(modal);
      resolve(null);
    });

    confirmBtn.addEventListener("click", () => {
      document.body.removeChild(modal);
      resolve(selectedFormat);
    });

    // Allow Enter to confirm
    confirmBtn.focus();
  });
}

/**
 * Export computed channels in specified format
 * @param {string} format - Export format: 'ascii', 'binary32', or 'binary64'
 * @param {Object} data - Data object containing computedData array
 * @param {number} sampleRate - Sample rate from original COMTRADE
 * @returns {void}
 */
function performExport(format, data, sampleRate) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);

  let cfgContent, datContent, cfgFileName, datFileName, cfgBlob, datBlob;
  const formatLabels = {
    ascii: "ASCII",
    binary32: "Binary 32-bit",
    binary64: "Binary 64-bit",
    float32: "Float 32-bit",
    float64: "Float 64-bit",
  };
  const formatLabel = formatLabels[format] || "Unknown";

  try {
    if (format === "ascii") {
      // ASCII export
      const baseName = `computed_channels_batch_${timestamp}`;
      cfgContent = generateCFGContentBatch(data.computedData, sampleRate);
      cfgFileName = `${baseName}_ASCII.cfg`;
      datContent = generateDATContentBatch(data.computedData, sampleRate);
      datFileName = `${baseName}_ASCII.dat`;

      cfgBlob = new Blob([cfgContent], { type: "text/plain;charset=utf-8;" });
      datBlob = new Blob([datContent], { type: "text/plain;charset=utf-8;" });
    } else if (format === "binary32") {
      // Binary 32-bit export
      const baseName = `computed_channels_batch_${timestamp}`;
      cfgContent = generateCFGContentBinary32(data.computedData, sampleRate);
      cfgFileName = `${baseName}_BINARY32.cfg`;
      datContent = generateDATContentBinary32(data.computedData, sampleRate);
      datFileName = `${baseName}_BINARY32.dat`;

      cfgBlob = new Blob([cfgContent], { type: "text/plain;charset=utf-8;" });
      datBlob = createBinaryBlob(datContent);
    } else if (format === "binary64") {
      // Binary 64-bit export
      const baseName = `computed_channels_batch_${timestamp}`;
      cfgContent = generateCFGContentBinary64(data.computedData, sampleRate);
      cfgFileName = `${baseName}_BINARY64.cfg`;
      datContent = generateDATContentBinary64(data.computedData, sampleRate);
      datFileName = `${baseName}_BINARY64.dat`;

      cfgBlob = new Blob([cfgContent], { type: "text/plain;charset=utf-8;" });
      datBlob = createBinaryBlob(datContent);
    } else if (format === "float32") {
      // Float 32-bit export
      const baseName = `computed_channels_batch_${timestamp}`;
      cfgContent = generateCFGContentFloat32(data.computedData, sampleRate);
      cfgFileName = `${baseName}_FLOAT32.cfg`;
      datContent = generateDATContentFloat32(data.computedData, sampleRate);
      datFileName = `${baseName}_FLOAT32.dat`;

      cfgBlob = new Blob([cfgContent], { type: "text/plain;charset=utf-8;" });
      datBlob = createBinaryBlob(datContent);
    } else if (format === "float64") {
      // Float 64-bit export
      const baseName = `computed_channels_batch_${timestamp}`;
      cfgContent = generateCFGContentFloat64(data.computedData, sampleRate);
      cfgFileName = `${baseName}_FLOAT64.cfg`;
      datContent = generateDATContentFloat64(data.computedData, sampleRate);
      datFileName = `${baseName}_FLOAT64.dat`;

      cfgBlob = new Blob([cfgContent], { type: "text/plain;charset=utf-8;" });
      datBlob = createBinaryBlob(datContent);
    } else {
      throw new Error("Invalid format selected");
    }

    // Download CFG
    const cfgLink = document.createElement("a");
    cfgLink.setAttribute("href", URL.createObjectURL(cfgBlob));
    cfgLink.setAttribute("download", cfgFileName);
    cfgLink.style.visibility = "hidden";
    document.body.appendChild(cfgLink);
    cfgLink.click();
    document.body.removeChild(cfgLink);

    // Download DAT (after delay)
    setTimeout(() => {
      const datLink = document.createElement("a");
      datLink.setAttribute("href", URL.createObjectURL(datBlob));
      datLink.setAttribute("download", datFileName);
      datLink.style.visibility = "hidden";
      document.body.appendChild(datLink);
      datLink.click();
      document.body.removeChild(datLink);
    }, 500);

    console.log(
      `[ExportBatch] ✅ Exported ${data.computedData.length} channels as ${cfgFileName} and ${datFileName} (${formatLabel})`
    );
    alert(
      `✅ Successfully exported ${data.computedData.length} computed channel(s) in ${formatLabel} format!\n\nFiles:\n  • ${cfgFileName}\n  • ${datFileName}\n\nDownload both files together.\nThen use "Select and Load Files" to import them!`
    );
  } catch (error) {
    console.error("[ExportBatch] Error:", error);
    alert(`❌ Export failed: ${error.message}`);
  }
}

/**
 * Export all computed channels as CFG + DAT (COMTRADE 2013 format)
 * Supports ASCII, Binary 32-bit, and Binary 64-bit formats
 * @param {Object} data - Data object containing computedData array
 * @param {number} sampleRate - Sample rate from original COMTRADE
 * @returns {void}
 */
export async function exportAllComputedChannels(data, sampleRate = 4800) {
  try {
    if (
      !data?.computedData ||
      !Array.isArray(data.computedData) ||
      data.computedData.length === 0
    ) {
      alert("❌ No computed channels to export.");
      return;
    }

    // Show format selection dialog
    const selectedFormat = await showExportFormatDialog(data, sampleRate);

    if (selectedFormat === null) {
      console.log("[ExportBatch] Export cancelled by user");
      return;
    }

    // Perform export in selected format
    performExport(selectedFormat, data, sampleRate);
  } catch (error) {
    console.error("[ExportBatch] Error:", error);
    alert(`❌ Export failed: ${error.message}`);
  }
}
