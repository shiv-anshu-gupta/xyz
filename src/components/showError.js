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
