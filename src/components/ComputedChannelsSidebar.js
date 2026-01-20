/**
 * ComputedChannelsSidebar.js
 * Display computed channels with LaTeX equations in uPlot sidebar
 * Shows channel name, color indicator, and equation in LaTeX format
 */

import { computedChannelMetadata } from "../utils/computedChannelMetadata.js";

/**
 * Create and inject computed channels sidebar into uPlot container
 * @param {HTMLElement} containerEl - uPlot container element
 * @param {Object} cfg - COMTRADE config object
 * @param {Object} data - COMTRADE data object
 * @returns {HTMLElement} The sidebar element
 */
export function createComputedChannelsSidebar(containerEl, cfg, data) {
  if (!containerEl) {
    console.warn("[ComputedChannelsSidebar] Container not provided");
    return null;
  }

  // Create sidebar container
  const sidebar = document.createElement("div");
  sidebar.id = "computed-channels-sidebar";
  sidebar.style.cssText = `
    padding: 12px;
    border-right: 1px solid #ddd;
    background: #f9f9f9;
    overflow-y: auto;
    max-height: 100%;
    min-width: 300px;
    font-size: 12px;
  `;

  // Create header
  const header = document.createElement("div");
  header.style.cssText = `
    font-weight: 600;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 2px solid #667eea;
    color: #333;
    display: flex;
    align-items: center;
    gap: 6px;
  `;
  header.innerHTML = `<span>📊</span> <span>Computed Channels</span>`;
  sidebar.appendChild(header);

  // Create channels list container
  const channelsList = document.createElement("div");
  channelsList.id = "computed-channels-list";
  channelsList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;

  sidebar.appendChild(channelsList);

  // Store data reference for updates
  sidebar._data = data;

  // Initial render
  updateComputedChannelsSidebar(channelsList, data);

  // Wait for MathJax and render immediately if available
  const renderMathJax = () => {
    if (window.MathJax) {
      setTimeout(() => {
        try {
          if (window.MathJax?.typesetPromise) {
            window.MathJax.typesetPromise([sidebar]).catch(() => {});
          }
        } catch (e) {
          console.warn("[ComputedChannelsSidebar] MathJax init error:", e);
        }
      }, 150);
    }
  };

  renderMathJax();

  return sidebar;
}

/**
 * Update the sidebar with current computed channels
 * @param {HTMLElement} listContainer - The list container element
 * @param {Object} data - COMTRADE data object containing computedData
 */
export function updateComputedChannelsSidebar(listContainer, data) {
  if (!listContainer) return;

  // Get all computed channels from data.computedData
  const allChannels =
    data?.computedData && Array.isArray(data.computedData)
      ? data.computedData
      : [];

  // Clear existing items
  listContainer.innerHTML = "";

  if (allChannels.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.style.cssText = `
      text-align: center;
      color: #999;
      padding: 20px 10px;
      font-style: italic;
    `;
    emptyMsg.textContent = "No computed channels yet";
    listContainer.appendChild(emptyMsg);
    return;
  }

  // Render each channel
  allChannels.forEach((channel) => {
    const channelItem = createChannelItem(channel);
    listContainer.appendChild(channelItem);
  });

  // Trigger MathJax typesetting for new equations
  if (window.MathJax) {
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      try {
        if (window.MathJax?.typesetPromise) {
          window.MathJax.typesetPromise([listContainer]).catch((e) => {
            console.warn("[ComputedChannelsSidebar] MathJax typeset error:", e);
          });
        } else if (
          window.MathJax?.typesetClear &&
          window.MathJax?.typesetPromise
        ) {
          window.MathJax.typesetClear([listContainer]);
          window.MathJax.typesetPromise([listContainer]).catch((e) => {
            console.warn("[ComputedChannelsSidebar] MathJax error:", e);
          });
        }
      } catch (e) {
        console.error("[ComputedChannelsSidebar] MathJax trigger error:", e);
      }
    }, 100);
  }
}

/**
 * Create a single channel item element
 * @param {Object} channel - Channel metadata
 * @returns {HTMLElement} Channel item element
 */
function createChannelItem(channel) {
  const item = document.createElement("div");
  item.className = "computed-channel-item";
  item.setAttribute("data-channel-id", channel.id);
  item.style.cssText = `
    padding: 12px;
    background: white;
    border-left: 4px solid ${channel.color || "#999"};
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    transition: all 0.3s ease;
    cursor: pointer;
    margin-bottom: 8px;
  `;

  // Add hover effect
  item.onmouseover = () => {
    item.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
    item.style.transform = "translateX(2px)";
  };
  item.onmouseout = () => {
    item.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
    item.style.transform = "translateX(0)";
  };

  // Channel name with color indicator
  const nameContainer = document.createElement("div");
  nameContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    font-weight: 600;
    color: #333;
    font-size: 13px;
  `;

  const colorDot = document.createElement("span");
  colorDot.style.cssText = `
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: ${channel.color || "#999"};
    display: inline-block;
    flex-shrink: 0;
  `;
  nameContainer.appendChild(colorDot);

  const channelName = document.createElement("span");
  channelName.textContent = channel.name || channel.id;
  channelName.style.wordBreak = "break-word";
  nameContainer.appendChild(channelName);

  item.appendChild(nameContainer);

  // Equation in LaTeX form - ONLY THE EQUATION, NO LABELS OR STATS
  if (channel.equation) {
    const equationContainer = document.createElement("div");
    equationContainer.style.cssText = `
      background: var(--bg-tertiary, #f5f5f5);
      color: var(--chart-text, #333);
      padding: 12px;
      border-radius: 3px;
      border: 1px solid var(--border-color, #e0e0e0);
      overflow-x: auto;
      font-size: 14px;
      line-height: 1.6;
      text-align: center;
      min-height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
    `;

    // Extract just the formula part (after the '=' sign) using regex for cleaner display
    const formulaMatch = channel.equation.match(/=\s*(.+)$/);
    const formulaOnly = formulaMatch
      ? formulaMatch[1].trim()
      : channel.equation;

    // Format equation for LaTeX display
    const latexEquation = formatEquationForLatex(formulaOnly);
    equationContainer.innerHTML = `$$${latexEquation}$$`;

    item.appendChild(equationContainer);
  }

  return item;
}

/**
 * Format equation string for LaTeX display
 * Converts math.js notation to LaTeX notation
 * @param {string} equation - Math.js format equation
 * @returns {string} LaTeX formatted equation
 */
function formatEquationForLatex(equation) {
  if (!equation) return "";

  let latex = equation;

  // Step 1: Handle sqrt(expr) -> \sqrt{expr}
  // Use a simple approach: find sqrt( and match the closing )
  while (latex.includes("sqrt(")) {
    let startIdx = latex.indexOf("sqrt(");
    let openCount = 1;
    let endIdx = startIdx + 5;

    while (endIdx < latex.length && openCount > 0) {
      if (latex[endIdx] === "(") openCount++;
      else if (latex[endIdx] === ")") openCount--;
      endIdx++;
    }

    const inner = latex.substring(startIdx + 5, endIdx - 1);
    latex =
      latex.substring(0, startIdx) +
      "\\sqrt{" +
      inner +
      "}" +
      latex.substring(endIdx);
  }

  // Step 2: Replace other functions with LaTeX equivalents
  latex = latex.replace(/\babs\(/g, "\\left|");
  latex = latex.replace(/\bsin\(/g, "\\sin(");
  latex = latex.replace(/\bcos\(/g, "\\cos(");
  latex = latex.replace(/\btan\(/g, "\\tan(");
  latex = latex.replace(/\blog\(/g, "\\log(");
  latex = latex.replace(/\bln\(/g, "\\ln(");
  latex = latex.replace(/\blog10\(/g, "\\log_{10}(");

  // Step 3: Convert channel references (a0, a1, etc) to subscripts
  latex = latex.replace(/([ad])(\d+)/g, "$1_{$2}");

  // Step 4: Replace mathematical constants
  latex = latex.replace(/\bpi\b/gi, "\\pi");
  latex = latex.replace(/\be\b/gi, "e");

  // Step 5: Replace common operators
  latex = latex.replace(/\s\*\s/g, " \\times "); // * to ×
  latex = latex.replace(/\s\/\s/g, " \\div "); // / to ÷
  latex = latex.replace(/\s\+\s/g, " + "); // normalize +
  latex = latex.replace(/\s-\s/g, " - "); // normalize -

  return latex;
}

/**
 * Inject sidebar into uPlot container (left side)
 * Rearranges DOM structure to include sidebar
 * @param {HTMLElement} uplotContainer - Main uPlot chart container
 * @param {HTMLElement} sidebarEl - Sidebar element to inject
 */
export function injectSidebarIntoUplot(uplotContainer, sidebarEl) {
  if (!uplotContainer || !sidebarEl) return;

  // Create wrapper if it doesn't exist
  let wrapper = uplotContainer.querySelector(".uplot-with-sidebar");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "uplot-with-sidebar";
    wrapper.style.cssText = `
      display: flex;
      width: 100%;
      height: 100%;
      gap: 0;
    `;

    // Move all children to wrapper
    while (uplotContainer.firstChild) {
      wrapper.appendChild(uplotContainer.firstChild);
    }

    uplotContainer.appendChild(wrapper);
  }

  // Prepare sidebar container
  sidebarEl.style.cssText = `
    ${sidebarEl.style.cssText};
    flex: 0 0 300px;
    height: 100%;
    overflow-y: auto;
    border-right: 1px solid #ddd;
  `;

  // Adjust main chart container
  const mainContent =
    wrapper.querySelector(".uplot-main") || wrapper.lastElementChild;
  if (mainContent && mainContent !== sidebarEl) {
    mainContent.style.cssText = `
      ${mainContent.style.cssText};
      flex: 1;
      min-width: 0;
      overflow: auto;
    `;
  }

  // Insert sidebar at the beginning
  wrapper.insertBefore(sidebarEl, wrapper.firstChild);
}
