export const debugLite = {
  _inited: false,
  // ⚡ PERFORMANCE FIX: Disable debugLite in production to prevent UI freezes
  // Set to false to skip ALL DOM operations (fixes 500ms+ color update lag)
  _enabled: false, // Change to true to enable debug panel (WARNING: causes freezes!)

  // filtering: if non-empty array, only tags that start with one of these prefixes will be shown
  _importantPrefixes: null,
  // throttle in ms to avoid spamming identical tags
  _throttleMs: 300,
  _lastTagTs: {},

  /**
   * Safe wrapper that returns early if disabled
   * When _enabled = false, returns immediately without any DOM operations
   * This fixes 500ms+ freezes caused by debugLite DOM thrashing
   */
  log(tag, obj = {}) {
    if (!this._enabled) return; // ⏱️ INSTANT return, no DOM work - PERFORMANCE CRITICAL
    return this._logImpl(tag, obj);
  },

  /**
   * Internal log implementation
   * Only called if _enabled = true
   */
  _logImpl(tag, obj = {}) {
    try {
      if (!this._inited) this.init(document.body);
      // If importantPrefixes is set, filter logs that do not match any prefix
      if (
        Array.isArray(this._importantPrefixes) &&
        this._importantPrefixes.length
      ) {
        const allowed = this._importantPrefixes.some((p) =>
          String(tag).startsWith(String(p))
        );
        if (!allowed && !obj._force) return; // skip non-important logs unless explicitly forced
      }
      // Throttle repeated tags to avoid UI/CPU spam
      try {
        const now = Date.now();
        const last = this._lastTagTs[tag] || 0;
        if (now - last < this._throttleMs && !obj._force) return;
        this._lastTagTs[tag] = now;
      } catch (e) {}
      const ts = new Date().toLocaleTimeString();
      const entry = document.createElement("div");
      entry.style.cssText =
        "margin-bottom:6px;padding-bottom:4px;border-left:3px solid rgba(255,255,255,0.06);padding-left:8px;font-size:11px;line-height:1.1";
      const header = document.createElement("div");
      header.style.cssText = "opacity:0.95;font-weight:600";
      header.textContent = `${ts} — ${tag}`;
      entry.appendChild(header);

      // Build a short summary only (avoid large arrays)
      const parts = [];
      if (obj.type) parts.push(`type:${obj.type}`);
      if (obj.channelID) parts.push(`id:${obj.channelID}`);
      if (obj.field) parts.push(`field:${obj.field}`);
      if (obj.newValue !== undefined) parts.push(`new:${String(obj.newValue)}`);
      if (obj.rowId) parts.push(`row:${obj.rowId}`);
      if (obj.note) parts.push(String(obj.note));
      if (obj.path) parts.push(`path:${obj.path.join(".")}`);

      const body = document.createElement("div");
      body.style.cssText =
        "color:#cfefff;opacity:0.95;font-size:11px;margin-top:3px;";
      body.textContent = parts.join(" | ");
      entry.appendChild(body);
      this.content.appendChild(entry);
      // prune
      while (this.content.children.length > this._max)
        this.content.removeChild(this.content.firstChild);
      this.content.scrollTop = this.content.scrollHeight;
    } catch (e) {
      console.warn("debugLite.log failed", e);
    }
  },

  init(root = document.body) {
    if (this._inited) return;
    if (!this._enabled) return; // Don't initialize DOM if disabled
    try {
      this.root = root || document.body;
      this.panel = document.createElement("div");
      this.panel.id = "debug-panel-lite";
      this.panel.style.cssText = [
        "position:fixed",
        "right:12px",
        "bottom:12px",
        "width:360px",
        "max-height:40vh",
        "background:rgba(0,0,0,0.75)",
        "color:#e6f2ff",
        "font-family:monospace",
        "font-size:12px",
        "z-index:999999",
        "border-radius:6px",
        "overflow:hidden",
        "display:flex",
        "flex-direction:column",
      ].join(";");

      const header = document.createElement("div");
      header.style.cssText =
        "display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:rgba(255,255,255,0.04);border-bottom:1px solid rgba(255,255,255,0.03)";
      header.innerHTML = `<strong style="font-size:12px;">Flow Debug</strong>`;

      const ctrl = document.createElement("div");
      ctrl.style.cssText = "display:flex;gap:6px;align-items:center";

      const clearBtn = document.createElement("button");
      clearBtn.textContent = "Clear";
      clearBtn.title = "Clear logs";
      clearBtn.style.cssText =
        "background:transparent;color:inherit;border:1px solid rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;cursor:pointer;font-size:11px";
      clearBtn.onclick = () => this.clear();

      const toggleBtn = document.createElement("button");
      toggleBtn.textContent = "Hide";
      toggleBtn.title = "Toggle panel";
      toggleBtn.style.cssText =
        "background:transparent;color:inherit;border:1px solid rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;cursor:pointer;font-size:11px";
      toggleBtn.onclick = () => {
        if (this.content.style.display === "none") {
          this.content.style.display = "block";
          toggleBtn.textContent = "Hide";
        } else {
          this.content.style.display = "none";
          toggleBtn.textContent = "Show";
        }
      };

      ctrl.appendChild(clearBtn);
      ctrl.appendChild(toggleBtn);
      header.appendChild(ctrl);

      this.content = document.createElement("div");
      this.content.style.cssText =
        "padding:6px 8px;overflow:auto;flex:1;white-space:nowrap;";

      this.panel.appendChild(header);
      this.panel.appendChild(this.content);
      this.root.appendChild(this.panel);

      // limit number of entries
      this._max = 120;
      // mark successful init
      this._inited = true;
    } catch (e) {
      console.warn("debugLite.init failed", e);
    }
  },
  // Set array of string prefixes. When set, only logs whose tag startsWith any prefix will be shown.
  setImportantPrefixes(prefixes) {
    try {
      if (!prefixes) this._importantPrefixes = null;
      else if (Array.isArray(prefixes)) this._importantPrefixes = prefixes;
      else this._importantPrefixes = [String(prefixes)];
    } catch (e) {}
  },
  clearImportantPrefixes() {
    try {
      this._importantPrefixes = null;
    } catch (e) {}
  },
  // Force a log to bypass filtering/throttling
  force(tag, obj = {}) {
    try {
      obj._force = true;
      this.log(tag, obj);
    } catch (e) {}
  },
  clear() {
    try {
      if (this.content) this.content.innerHTML = "";
    } catch (e) {}
  },
};

// expose globally for convenience
// Convenience helpers to control the panel if init failed earlier
debugLite.show = function () {
  try {
    if (!this._inited) this.init(document.body);
    if (this.panel) this.panel.style.display = "flex";
  } catch (e) {}
};
debugLite.hide = function () {
  try {
    if (this.panel) this.panel.style.display = "none";
  } catch (e) {}
};
debugLite.toggle = function () {
  try {
    if (!this._inited) this.init(document.body);
    if (this.panel)
      this.panel.style.display =
        this.panel.style.display === "none" ? "flex" : "none";
  } catch (e) {}
};
debugLite.forceInit = function () {
  try {
    this._inited = false;
    this.init(document.body);
  } catch (e) {}
};
try {
  window.debugLite = debugLite;
} catch (e) {}
