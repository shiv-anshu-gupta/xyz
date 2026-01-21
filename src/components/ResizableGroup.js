/**
 * @file ResizableGroup.js
 * @module Components/UI
 *
 * @description
 * <h3>Synchronized Resizable Element Group</h3>
 * 
 * <p>A utility class that synchronizes width resizing across multiple DOM elements.
 * When any element in the group is dragged to resize, all other elements automatically
 * adjust to match the new width, keeping them visually aligned.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>Synchronized Resize</td><td>All elements in group maintain same width</td></tr>
 *   <tr><td>Prevent Loops</td><td>isSyncing flag prevents infinite resize loops</td></tr>
 *   <tr><td>Native Events</td><td>Uses standard mousedown/mousemove/mouseup</td></tr>
 *   <tr><td>Minimum Width</td><td>Enforces 30px minimum to prevent collapse</td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>Group Selection</strong> — Query selector finds all matching elements</li>
 *   <li><strong>Drag Resize</strong> — Click and drag to resize all elements</li>
 *   <li><strong>Cursor Feedback</strong> — Changes to ew-resize during drag</li>
 *   <li><strong>Width Sync</strong> — All elements updated simultaneously</li>
 *   <li><strong>Cleanup</strong> — disconnect() method for removing listeners</li>
 * </ul>
 * 
 * @example
 * // Create resizable group for chart Y-axis columns
 * const group = new ResizableGroup('.y-axis-column');
 * 
 * // All .y-axis-column elements will now resize together
 * 
 * // Cleanup when done
 * group.disconnect();
 * 
 * @mermaid
 * graph TD
 *     A[new ResizableGroup<br/>selector] --> B[Query All Matching Elements]
 *     B --> C[setupDragSync]
 *     C --> D[For Each Element]
 *     D --> E[Add mousedown Listener]
 *     
 *     F[User mousedown] --> G[Record startX, startWidth]
 *     G --> H[Set cursor = ew-resize]
 *     H --> I[Add mousemove Listener]
 *     
 *     J[User mousemove] --> K{isSyncing?}
 *     K -->|Yes| L[Skip]
 *     K -->|No| M[Set isSyncing = true]
 *     M --> N[Calculate Delta X]
 *     N --> O[newWidth = startWidth + dx]
 *     O --> P[Apply to ALL Elements]
 *     P --> Q[Set isSyncing = false]
 *     
 *     R[User mouseup] --> S[Remove Listeners]
 *     S --> T[Reset Cursor]
 *     
 *     style A fill:#4CAF50,color:white
 *     style P fill:#2196F3,color:white
 *     style T fill:#FF9800,color:white
 */

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
