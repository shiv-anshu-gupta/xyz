/**
 * @file SidebarResizer.js
 * @module components/SidebarResizer
 * 
 * @description
 * <h3>Sidebar Resize Handle Component</h3>
 * <p>Provides interactive drag-to-resize functionality for sidebar panels in the COMTRADE viewer.
 * Creates a thin, visually responsive drag handle that allows users to adjust sidebar width
 * within defined constraints, with automatic persistence of user preferences to localStorage.</p>
 * 
 * <h4>Design Philosophy</h4>
 * <table>
 *   <tr><th>Principle</th><th>Description</th></tr>
 *   <tr><td>Progressive Enhancement</td><td>Sidebars work without resizer; resizer adds flexibility</td></tr>
 *   <tr><td>Visual Feedback</td><td>Handle highlights on hover, cursor changes during drag</td></tr>
 *   <tr><td>Constraint-based</td><td>Min/max width prevents unusable or excessive sizes</td></tr>
 *   <tr><td>Persistence</td><td>User's preferred width saved and restored across sessions</td></tr>
 * </table>
 * 
 * <h4>Key Features</h4>
 * <ul>
 *   <li><strong>Drag Handle</strong> — 4px wide bar on sidebar edge, expands to cyan on hover</li>
 *   <li><strong>Width Constraints</strong> — Enforces 280px minimum, 800px maximum width</li>
 *   <li><strong>localStorage Persistence</strong> — Saves width as `{panelId}-width` key</li>
 *   <li><strong>CSS Variable Updates</strong> — Sets `--sidebar-width` for dependent layouts</li>
 *   <li><strong>Cursor Management</strong> — Changes to col-resize during active drag</li>
 *   <li><strong>Selection Prevention</strong> — Disables text selection during drag operation</li>
 *   <li><strong>Panel Detection</strong> — Skips percentage-based panels like analysis sidebar</li>
 * </ul>
 * 
 * <h4>Supported Panels</h4>
 * <table>
 *   <tr><th>Panel ID</th><th>Resize Type</th><th>Notes</th></tr>
 *   <tr><td>delta-drawer-panel</td><td>Pixel-based</td><td>280-800px range</td></tr>
 *   <tr><td>analysis-sidebar-panel</td><td>Skipped</td><td>Uses percentage resizing</td></tr>
 * </table>
 * 
 * @see {@link module:components/AnalysisSidebar} - Uses percentage-based resizing instead
 * @see {@link module:components/DeltaDrawer} - Delta drawer panel that uses this resizer
 * 
 * @example
 * // Add resizer to a sidebar panel
 * import { createSidebarResizer } from './SidebarResizer.js';
 * 
 * // Create resizer on left edge of panel
 * createSidebarResizer('delta-drawer-panel', 'left');
 * 
 * // Create resizer on right edge
 * createSidebarResizer('channel-list-panel', 'right');
 * 
 * // Width is automatically saved to localStorage:
 * // localStorage.getItem('delta-drawer-panel-width') → '450'
 * 
 * @mermaid
 * graph TD
 *     subgraph "createSidebarResizer() - Initialization"
 *         A["createSidebarResizer(panelId, side)"] --> B{"Panel exists?"}
 *         B -->|No| C["Log warning, return"]
 *         B -->|Yes| D{"Is analysis-sidebar?"}
 *         
 *         D -->|Yes| E["Skip - uses % resizing"]
 *         D -->|No| F["Create resizer div"]
 *         
 *         F --> G["Position based on side<br/>left: left=0 / right: right=0"]
 *         G --> H["Restore saved width<br/>from localStorage"]
 *         H --> I["Append resizer to panel"]
 *     end
 *     
 *     subgraph "Drag Interaction Flow"
 *         J["mousedown on resizer"] --> K["Set isResizing = true"]
 *         K --> L["Record startX, startWidth"]
 *         L --> M["Set cursor: col-resize"]
 *         M --> N["Disable text selection"]
 *         
 *         O["mousemove (document)"] --> P{"isResizing?"}
 *         P -->|No| Q["Ignore"]
 *         P -->|Yes| R["Calculate diff from startX"]
 *         R --> S["Compute newWidth<br/>clamp(280, 800)"]
 *         S --> T["Apply to panel.style.width"]
 *         T --> U["Update --sidebar-width CSS var"]
 *         
 *         V["mouseup (document)"] --> W{"Was resizing?"}
 *         W -->|No| X["Ignore"]
 *         W -->|Yes| Y["Set isResizing = false"]
 *         Y --> Z["Restore cursor"]
 *         Z --> AA["Save width to localStorage"]
 *     end
 *     
 *     subgraph "Visual States"
 *         AB["Default"] --> AC["bg-gray-300, w-1"]
 *         AD["Hover"] --> AE["bg-cyan-500"]
 *         AF["Dragging"] --> AG["cursor: col-resize"]
 *     end
 *     
 *     style A fill:#e0f2fe,stroke:#0284c7
 *     style J fill:#fef3c7,stroke:#d97706
 *     style AA fill:#dcfce7,stroke:#16a34a
 */

export function createSidebarResizer(panelId, side = "left") {
  const panel = document.getElementById(panelId);

  if (!panel) {
    console.warn(`[SidebarResizer] Panel with ID "${panelId}" not found`);
    return;
  }

  // Skip resizer creation for analysis sidebar - it uses percentage-based resizing
  if (panelId === "analysis-sidebar-panel") {
    console.log(
      `[SidebarResizer] Skipped resizer for ${panelId} - uses percentage-based resizing`
    );
    return;
  }

  // Create resizer handle
  const resizer = document.createElement("div");
  resizer.className =
    "absolute top-0 bottom-0 w-1 bg-gray-300 hover:bg-cyan-500 cursor-col-resize transition-colors duration-200";

  // Position resizer based on side
  if (side === "left") {
    resizer.style.left = "0";
  } else {
    resizer.style.right = "0";
  }

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  // Mouse down - start resizing
  resizer.addEventListener("mousedown", (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = panel.offsetWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  // Mouse move - update width
  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;

    if (panelId === "delta-drawer-panel") {
      // Delta drawer uses pixel-based resizing
      const diff = side === "left" ? e.clientX - startX : startX - e.clientX;
      const newWidth = Math.max(280, Math.min(800, startWidth + diff));
      panel.style.width = `${newWidth}px`;

      document.documentElement.style.setProperty(
        "--sidebar-width",
        `${newWidth}px`
      );
    }
  });

  // Mouse up - stop resizing and save
  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      // Save to localStorage
      const width = panel.offsetWidth;
      localStorage.setItem(`${panelId}-width`, width);
      console.log(`[SidebarResizer] Saved ${panelId} width: ${width}px`);
    }
  });

  // Restore saved width from localStorage
  const savedWidth = localStorage.getItem(`${panelId}-width`);
  if (savedWidth) {
    const width = Math.max(280, Math.min(800, parseInt(savedWidth, 10)));
    panel.style.width = `${width}px`;
    console.log(`[SidebarResizer] Restored ${panelId} width: ${width}px`);
  }

  // Append resizer to panel
  panel.style.position = "relative";
  panel.appendChild(resizer);

  console.log(`[SidebarResizer] ✅ Resizer created for ${panelId}`);
}
