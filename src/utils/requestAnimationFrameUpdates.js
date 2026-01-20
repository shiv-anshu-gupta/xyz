/* let rafId = null;
const updates = new Map();

function flush() {
  for (const [u, { scaleKey, range }] of updates) {
    u.setScale(scaleKey, range);
    u.redraw(true);
  }
  updates.clear();
  rafId = null;
}

export function requestScaleSync(u, scaleKey, range) {
  updates.set(u, { scaleKey, range });
  if (!rafId)
    rafId = requestAnimationFrame(flush);
}

// New: batch setScale + redraw for multiple charts
export function requestScaleSyncAndRedraw(charts, scaleKey, range) {
  charts.forEach(u => {
    updates.set(u, { scaleKey, range });
  });
  if (!rafId)
    rafId = requestAnimationFrame(flush);
} */