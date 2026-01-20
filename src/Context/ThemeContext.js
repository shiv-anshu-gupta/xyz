class ThemeContext {
  constructor() {
    this.THEMES = {
      light: {
        "--bg-primary": "#f5f5f5",
        "--bg-secondary": "#ffffff",
        "--bg-tertiary": "#f0f0f0",
        "--bg-sidebar": "#ffffff",
        "--text-primary": "#1a1a1a",
        "--text-secondary": "#666666",
        "--text-muted": "#999999",
        "--border-color": "#e0e0e0",
        "--chart-bg": "#ffffff",
        "--chart-text": "#1a1a1a",
        "--chart-grid": "#e0e0e0",
        "--chart-axis": "#666666",
      },
      dark: {
        "--bg-primary": "#1a1a1a",
        "--bg-secondary": "#2d2d2d",
        "--bg-tertiary": "#3a3a3a",
        "--bg-sidebar": "#2d2d2d",
        "--text-primary": "#ffffff",
        "--text-secondary": "#cccccc",
        "--text-muted": "#888888",
        "--border-color": "#404040",
        "--chart-bg": "#252525",
        "--chart-text": "#ffffff",
        "--chart-grid": "#404040",
        "--chart-axis": "#cccccc",
      },
    };

    this._currentTheme = null;
    this._subscribers = new Set();
    this._broadcastChannel = null;
    this._isInitialized = false;

    this._init();
  }

  _init() {
    if (this._isInitialized) {
      console.warn("[ThemeContext] Already initialized");
      return;
    }
    console.log("[ThemeContext] Initializing...");

    // 1. Load initial theme
    this._currentTheme = this._loadInitialTheme();

    // 2. Apply theme immediately (prevents FOUC - Flash of Unstyled Content)
    this._applyThemeToDom(this._currentTheme);

    // 3. Setup cross-window synchronization
    this._setupBroadcastChannel();

    // 4. Listen for storage changes (cross-tab sync)
    this._setupStorageListener();

    // 5. Listen for system theme changes
    this._setupSystemThemeListener();

    this._isInitialized = true;
    console.log(
      `[ThemeContext] ✅ Initialized with theme: ${this._currentTheme}`
    );
  }
  /**
   * Load initial theme from localStorage or system preference
   * Priority: localStorage > system preference > default (dark)
   * @private
   * @returns {string} Theme name ('light' or 'dark')
   */
  _loadInitialTheme() {
    // Check localStorage first (user's explicit choice)
    const saved = localStorage.getItem("comtrade-theme");
    if (saved && this.THEMES[saved]) {
      console.log(`[ThemeContext] Loaded theme from localStorage: ${saved}`);
      return saved;
    }

    // Fallback to system preference
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme:  dark)"
    ).matches;
    const systemTheme = prefersDark ? "dark" : "light";
    console.log(`[ThemeContext] Using system preference: ${systemTheme}`);
    return systemTheme;
  }

  /**
   * Setup BroadcastChannel for cross-window/tab synchronization
   * Uses the Broadcast Channel API to sync theme across all app instances
   * @private
   */
  _setupBroadcastChannel() {
    // Check if BroadcastChannel is supported
    if (typeof BroadcastChannel === "undefined") {
      console.warn(
        "[ThemeContext] BroadcastChannel not supported in this browser"
      );
      return;
    }

    try {
      this._broadcastChannel = new BroadcastChannel("comtrade-theme-sync");

      this._broadcastChannel.onmessage = (event) => {
        const { theme, source } = event.data;

        // Avoid infinite loops - don't apply if we sent it
        if (source === this._getWindowId()) {
          return;
        }

        console.log(
          `[ThemeContext] Received theme from another window: ${theme}`
        );
        this._applyTheme(theme, false); // Don't re-broadcast
      };

      console.log("[ThemeContext] BroadcastChannel setup complete");
    } catch (err) {
      console.error("[ThemeContext] Failed to setup BroadcastChannel:", err);
    }
  }

  /**
   * Setup storage event listener for cross-tab synchronization
   * The 'storage' event fires when localStorage changes in another tab
   * @private
   */
  _setupStorageListener() {
    window.addEventListener("storage", (event) => {
      // Only react to our theme key
      if (event.key === "comtrade-theme" && event.newValue) {
        console.log(
          `[ThemeContext] Storage changed in another tab: ${event.newValue}`
        );
        this._applyTheme(event.newValue, false); // Don't re-broadcast
      }
    });

    console.log("[ThemeContext] Storage listener setup complete");
  }

  /**
   * Listen for system theme preference changes
   * Automatically updates theme when user changes OS theme (if no manual override)
   * @private
   */
  _setupSystemThemeListener() {
    const mediaQuery = window.matchMedia("(prefers-color-scheme:  dark)");

    const handleSystemThemeChange = (event) => {
      // Only apply if user hasn't set a manual preference
      const hasManualPreference = localStorage.getItem("comtrade-theme");
      if (!hasManualPreference) {
        const newTheme = event.matches ? "dark" : "light";
        console.log(`[ThemeContext] System theme changed:  ${newTheme}`);
        this.setTheme(newTheme);
      }
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleSystemThemeChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleSystemThemeChange);
    }

    console.log("[ThemeContext] System theme listener setup complete");
  }

  /**
   * Get unique identifier for this window instance
   * Used to prevent infinite broadcast loops
   * @private
   * @returns {string} Unique window ID
   */
  _getWindowId() {
    if (!window.__themeContextId) {
      window.__themeContextId = `window-${Date.now()}-${Math.random()}`;
    }
    return window.__themeContextId;
  }

  /**
   * Apply theme (internal method with broadcast control)
   * @private
   * @param {string} themeName - Theme name ('light' or 'dark')
   * @param {boolean} broadcast - Whether to broadcast to other windows/tabs
   */
  _applyTheme(themeName, broadcast = true) {
    const colors = this.THEMES[themeName];

    if (!colors) {
      console.error(`[ThemeContext] Unknown theme: ${themeName}`);
      return;
    }

    // Update internal state
    const previousTheme = this._currentTheme;
    this._currentTheme = themeName;

    // Apply to DOM
    this._applyThemeToDom(themeName);

    // Save to localStorage
    localStorage.setItem("comtrade-theme", themeName);

    // Notify all subscribers
    this._notifySubscribers(themeName, colors);

    // Broadcast to other windows/tabs
    if (broadcast && this._broadcastChannel) {
      try {
        this._broadcastChannel.postMessage({
          theme: themeName,
          source: this._getWindowId(),
        });
        console.log(`[ThemeContext] Broadcasted theme change:  ${themeName}`);
      } catch (err) {
        console.error("[ThemeContext] Failed to broadcast theme:", err);
      }
    }

    console.log(
      `[ThemeContext] Theme applied: ${previousTheme} → ${themeName}`
    );
  }

  /**
   * Apply theme CSS variables to DOM
   * @private
   * @param {string} themeName - Theme name
   */
  _applyThemeToDom(themeName) {
    const colors = this.THEMES[themeName];

    // Apply CSS variables to document root
    const root = document.documentElement.style;
    Object.entries(colors).forEach(([key, value]) => {
      root.setProperty(key, value);
    });

    // Set data attribute for CSS hooks (optional, for additional styling)
    document.documentElement.setAttribute("data-theme", themeName);

    // Dispatch native event for compatibility with existing code
    window.dispatchEvent(
      new CustomEvent("themeChanged", {
        detail: { theme: themeName, colors },
      })
    );
  }

  /**
   * Notify all subscribers of theme change
   * @private
   * @param {string} themeName - Theme name
   * @param {object} colors - Theme colors
   */
  _notifySubscribers(themeName, colors) {
    const themeData = {
      theme: themeName,
      colors: colors,
      isDark: themeName === "dark",
    };

    this._subscribers.forEach((callback) => {
      try {
        callback(themeData);
      } catch (err) {
        console.error("[ThemeContext] Subscriber error:", err);
      }
    });
  }

  // ========================================
  // PUBLIC API
  // ========================================

  /**
   * Get current theme name
   * @returns {string} Current theme name ('light' or 'dark')
   * @example
   * const theme = themeContext.getCurrentTheme(); // 'dark'
   */
  getCurrentTheme() {
    return this._currentTheme;
  }

  /**
   * Get current theme colors
   * @returns {object} Current theme color object with CSS variables
   * @example
   * const colors = themeContext. getCurrentColors();
   * // { '--bg-primary': '#1a1a1a', ...  }
   */
  getCurrentColors() {
    return this.THEMES[this._currentTheme];
  }

  /**
   * Check if current theme is dark
   * @returns {boolean} True if dark theme is active
   * @example
   * if (themeContext.isDark()) {
   *   // Apply dark-specific logic
   * }
   */
  isDark() {
    return this._currentTheme === "dark";
  }

  /**
   * Set theme explicitly
   * @param {string} themeName - Theme name ('light' or 'dark')
   * @example
   * themeContext.setTheme('dark');
   */
  setTheme(themeName) {
    if (!this.THEMES[themeName]) {
      console.error(`[ThemeContext] Unknown theme: ${themeName}`);
      return;
    }

    this._applyTheme(themeName, true);
  }

  /**
   * Toggle between light and dark theme
   * @returns {string} New theme name
   * @example
   * const newTheme = themeContext. toggle(); // 'dark' or 'light'
   */
  toggle() {
    const newTheme = this._currentTheme === "light" ? "dark" : "light";
    this.setTheme(newTheme);
    return newTheme;
  }

  /**
   * Subscribe to theme changes
   * Callback receives { theme, colors, isDark }
   * Returns an unsubscribe function
   *
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   * @example
   * const unsubscribe = themeContext.subscribe(({ theme, isDark }) => {
   *   console.log('Theme changed to:', theme);
   * });
   *
   * // Later, cleanup
   * unsubscribe();
   */
  subscribe(callback) {
    if (typeof callback !== "function") {
      console.error("[ThemeContext] Subscribe callback must be a function");
      return () => {};
    }

    // Add subscriber
    this._subscribers.add(callback);

    // Immediately call with current theme
    try {
      callback({
        theme: this._currentTheme,
        colors: this.THEMES[this._currentTheme],
        isDark: this._currentTheme === "dark",
      });
    } catch (err) {
      console.error("[ThemeContext] Initial callback error:", err);
    }

    // Return unsubscribe function
    return () => {
      this._subscribers.delete(callback);
      console.log("[ThemeContext] Subscriber removed");
    };
  }

  /**
   * Get specific color value from current theme
   * @param {string} colorKey - CSS variable name (e.g., '--bg-primary')
   * @returns {string|null} Color value or null if not found
   * @example
   * const bgColor = themeContext.getColor('--bg-primary');
   * canvas.style.backgroundColor = bgColor;
   */
  getColor(colorKey) {
    return this.THEMES[this._currentTheme][colorKey] || null;
  }

  /**
   * Get all available theme names
   * @returns {string[]} Array of theme names
   * @example
   * const themes = themeContext.getAvailableThemes(); // ['light', 'dark']
   */
  getAvailableThemes() {
    return Object.keys(this.THEMES);
  }

  /**
   * Add a custom theme (advanced usage)
   * @param {string} themeName - Theme name
   * @param {object} colors - Color object with CSS variables
   * @example
   * themeContext.addTheme('sunset', {
   *   '--bg-primary': '#ff6b6b',
   *   '--text-primary': '#ffe66d',
   *   // ... more colors
   * });
   */
  addTheme(themeName, colors) {
    if (this.THEMES[themeName]) {
      console.warn(
        `[ThemeContext] Theme '${themeName}' already exists, overwriting`
      );
    }

    this.THEMES[themeName] = colors;
    console.log(`[ThemeContext] Added custom theme: ${themeName}`);
  }

  /**
   * Cleanup and destroy context (call when app is destroyed)
   * Closes broadcast channel and removes listeners
   */
  destroy() {
    if (this._broadcastChannel) {
      this._broadcastChannel.close();
      this._broadcastChannel = null;
    }

    this._subscribers.clear();
    this._isInitialized = false;

    console.log("[ThemeContext] Destroyed");
  }
}

// ========================================
// SINGLETON EXPORT
// ========================================

/**
 * Singleton instance of ThemeContext
 * Auto-initializes on first import
 * @type {ThemeContext}
 */
export const themeContext = new ThemeContext();

/**
 * Export class for testing purposes
 * Allows creating isolated instances in tests
 */
export { ThemeContext };

/**
 * Default export (singleton)
 */
export default themeContext;
