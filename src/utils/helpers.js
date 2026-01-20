/**
 * @file helpers.js
 * @module utils/helpers
 * 
 * @description
 * <h3>General-Purpose Utility Functions</h3>
 * 
 * <p>A collection of commonly used utility functions for DOM manipulation,
 * value extraction, and array operations used throughout the COMTRADE viewer.</p>
 * 
 * <h4>Key Functions</h4>
 * <ul>
 *   <li><strong>extractUnit</strong> — Extracts unit string from label like "Voltage (V)" → "V"</li>
 *   <li><strong>nearestIndex</strong> — Finds array index of value closest to target</li>
 *   <li><strong>getNearestIndex</strong> — Same as nearestIndex (alternate implementation)</li>
 *   <li><strong>createCustomElement</strong> — Factory for creating DOM elements with attributes</li>
 * </ul>
 * 
 * @example
 * import { extractUnit, getNearestIndex, createCustomElement } from './helpers.js';
 * 
 * extractUnit("Current (A)");  // Returns: "A"
 * 
 * const times = [0, 0.1, 0.2, 0.3];
 * getNearestIndex(times, 0.15);  // Returns: 1 (closest to 0.1)
 * 
 * const div = createCustomElement('div', 'chart-container', 'chart-1', 
 *   { 'data-index': '0' }, 'Loading...');
 * 
 * @mermaid
 * graph LR
 *     A[extractUnit] --> B[Regex Match Parentheses]
 *     B --> C[Return Unit String]
 *     
 *     D[getNearestIndex] --> E[Reduce Array]
 *     E --> F[Compare Absolute Differences]
 *     F --> G[Return Closest Index]
 *     
 *     H[createCustomElement] --> I[document.createElement]
 *     I --> J[Set className, id, attributes]
 *     J --> K[Return Element]
 *     
 *     style A fill:#4CAF50,color:white
 *     style D fill:#2196F3,color:white
 *     style H fill:#FF9800,color:white
 */

export function extractUnit(label) {
  const match = label && label.match(/\(([^)]+)\)/);
  return match ? match[1] : '';
}

export const nearestIndex = (arr, val) =>
  arr.reduce((prev, curr, idx) => Math.abs(curr - val) < Math.abs(arr[prev] - val) ? idx : prev, 0);

export function getNearestIndex(array, value) {
  return array.reduce(
    (prev, curr, idx) =>
      Math.abs(curr - value) < Math.abs(array[prev] - value) ? idx : prev,
    0
  );
}


export function createCustomElement(tag, className, id="",attributes = {}, textContent = '') {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  Object.keys(attributes).forEach(key => {
    element.setAttribute(key, attributes[key]);
  });
  if (textContent) {
    element.textContent = textContent;
  }
  if (id) {
    element.id = id;
  }
  return element;
}