export class ResizableGroup {
  constructor(selector) {
    this.elements = Array.from(document.querySelectorAll(selector));
    this.isSyncing = false;
    this.setupDragSync();
  }

  setupDragSync() {
    this.elements.forEach(el => {
      let startX, startWidth;
      el.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        startX = e.clientX;
        startWidth = el.offsetWidth;
        document.body.style.cursor = 'ew-resize';
        const onMouseMove = (moveEvt) => {
          if (this.isSyncing) return;
          this.isSyncing = true;
          const dx = moveEvt.clientX - startX;
          const newWidth = Math.max(30, startWidth + dx);
          this.elements.forEach(otherEl => {
            otherEl.style.width = newWidth + 'px';
          });
          this.isSyncing = false;
        };
        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          document.body.style.cursor = '';
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    });
  }

  // Optional: to disconnect all listeners if needed
  disconnect() {
    // No-op for now, could add logic to remove event listeners if needed
  }
}
