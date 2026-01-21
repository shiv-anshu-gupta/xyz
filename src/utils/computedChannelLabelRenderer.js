/**
 * @module Utils/ComputedChannels
 * @description computedChannelLabelRenderer module
 */

/**
 * Format an equation string for LaTeX rendering
 * Handles special characters, operators, and formatting
 * @param {string} eq - Raw equation string
 * @returns {string} LaTeX-formatted equation
 */
export function formatEquationForLatex(eq) {
  if (!eq || typeof eq !== "string") return "";

  let result = eq
    // Remove leading/trailing whitespace
    .trim()
    // Escape special LaTeX characters
    .replace(/\\/g, "\\backslash ")
    .replace(/#/g, "\\#")
    .replace(/\$/g, "\\$")
    .replace(/%/g, "\\%")
    .replace(/&/g, "\\&")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\^/g, "\\wedge ")
    // Math operators and symbols
    .replace(/\*\*/g, "^")
    .replace(/sqrt\(/g, "\\sqrt{")
    .replace(/\)(?=\s*[+\-*/^]|$)/g, "}")
    .replace(/abs\(/g, "|")
    .replace(/\)(?=[^+\-*/^])/g, "|")
    // Fractions
    .replace(/(\w+)\s*\/\s*(\w+)/g, "\\frac{$1}{$2}")
    // Greek letters and constants
    .replace(/pi/g, "\\pi")
    .replace(/theta/g, "\\theta")
    .replace(/phi/g, "\\phi")
    .replace(/psi/g, "\\psi")
    .replace(/omega/g, "\\omega")
    .replace(/alpha/g, "\\alpha")
    .replace(/beta/g, "\\beta")
    .replace(/gamma/g, "\\gamma")
    .replace(/delta/g, "\\delta")
    .replace(/epsilon/g, "\\epsilon")
    // Units and subscripts
    .replace(/(_[a-zA-Z0-9]+)/g, "_{$1}")
    .trim();

  return result;
}

/**
 * Build array of y-axis labels for computed channels
 * @param {Array} channels - Computed channel array
 * @param {Array} groupIndices - Indices of channels in this group
 * @returns {Array} Labels with equations
 */
export function buildComputedChannelLabels(channels, groupIndices) {
  return groupIndices
    .map((idx) => {
      const ch = channels[idx];
      if (!ch || !ch.name) return "Unknown";

      const eqStr = ch.equation || "";
      const eqLabel = eqStr
        ? ` = ${formatEquationForLatex(eqStr)}`
        : "";
      return `${ch.name}${eqLabel}`;
    })
    .filter((label) => label && label.trim().length > 0);
}

/**
 * Render channel labels container with equations
 * Inserts label DOM into the container alongside the chart
 * @param {HTMLElement} container - Parent container element
 * @param {Array} labels - Channel labels with equations
 * @param {Array} colors - Channel colors
 * @returns {HTMLElement} Label container element
 */
export function renderChannelLabelContainer(container, labels, colors) {
  const labelContainer = document.createElement("div");
  labelContainer.style.cssText =
    "padding:8px; background:#f9f9f9; border-radius:4px; border-left:3px solid #ddd; margin-top:8px;";

  const labelTitle = document.createElement("div");
  labelTitle.style.cssText =
    "font-weight:bold; font-size:12px; color:#333; margin-bottom:4px;";
  labelTitle.textContent = "Channels:";
  labelContainer.appendChild(labelTitle);

  labels.forEach((label, i) => {
    const labelDiv = document.createElement("div");
    labelDiv.style.cssText =
      "font-size:11px; color:#555; margin:2px 0; padding-left:4px;";

    if (colors && colors[i]) {
      labelDiv.style.borderLeft = `4px solid ${colors[i]}`;
      labelDiv.style.paddingLeft = "8px";
    }

    // Try rendering LaTeX if available
    if (window.MathJax && window.MathJax.typesetPromise) {
      labelDiv.innerHTML = label;
      window.MathJax.typesetPromise?.([labelDiv]).catch((err) => {
        console.warn("[renderChannelLabelContainer] MathJax error:", err);
      });
    } else {
      labelDiv.textContent = label;
    }

    labelContainer.appendChild(labelDiv);
  });

  container.appendChild(labelContainer);
  return labelContainer;
}
