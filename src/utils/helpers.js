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