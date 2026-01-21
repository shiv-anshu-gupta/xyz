/**
 * @file showError.js
 * @module Components/UI
 *
 * @description
 * <h3>Error Display Utility</h3>
 * 
 * <p>A simple error notification utility that displays error messages to users
 * via browser alert and updates a designated results element with the error text.</p>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>Alert Dialog</strong> — Shows browser alert for immediate attention</li>
 *   <li><strong>Element Update</strong> — Updates fixedResultsEl with error message</li>
 *   <li><strong>Simple API</strong> — Single function with message and element params</li>
 * </ul>
 * 
 * @example
 * import { showError } from './showError.js';
 * 
 * try {
 *   // Some operation that might fail
 *   parseComtradeFile(file);
 * } catch (err) {
 *   showError('Failed to parse file: ' + err.message, resultsElement);
 * }
 * 
 * @mermaid
 * graph LR
 *     A[showError called] --> B[Display Alert]
 *     A --> C[Update Results Element]
 *     
 *     style A fill:#4CAF50,color:white
 *     style B fill:#FF9800,color:white
 */

// src/components/showError.js
/**
 * Show an error message to the user and update the results element.
 * @param {string} message - The error message to display.
 * @param {HTMLElement} fixedResultsEl - The element to display the error message.
 */
export function showError(message, fixedResultsEl) {
  alert(message);
  fixedResultsEl.textContent = message;
}
