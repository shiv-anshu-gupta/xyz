/**
 * @file childThemeManager.js
 * @description Theme management for child/popup windows (ChannelListWindow, COMTRADE_Merger, etc.)
 * Sets up theme CSS and listens for theme changes from parent window
 * ✅ Single responsibility: child window theme synchronization
 */

/**
 * Initialize theme management for child windows
 * Call this once in each child window to set up theme CSS and event listeners
 */
export function initChildThemeManager() {
  console.log(
    "[childThemeManager] Initializing child window theme management..."
  );

  // Load theme CSS from parent
  try {
    const themeCssUrl = new URL("/styles/theme.css", window.location.origin)
      .href;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = themeCssUrl;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
    console.log("[childThemeManager] ✅ Theme CSS loaded:", themeCssUrl);
  } catch (e) {
    console.warn("[childThemeManager] Failed to load theme CSS:", e.message);
  }

  // Apply saved theme from localStorage
  const savedTheme = localStorage.getItem("comtrade-theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  console.log(
    "[childThemeManager] Theme applied from localStorage:",
    savedTheme
  );

  // Listen for theme changes from parent window (via postMessage)
  window.addEventListener("message", (ev) => {
    if (ev.data && ev.data.theme) {
      console.log(
        "[childThemeManager] Received theme update from parent:",
        ev.data.theme
      );
      document.documentElement.setAttribute("data-theme", ev.data.theme);
      localStorage.setItem("comtrade-theme", ev.data.theme);
    }
  });

  console.log(
    "[childThemeManager] ✅ Child window theme synchronization ready"
  );
}

/**
 * Get current theme from localStorage or DOM
 * @returns {string} 'light' or 'dark'
 */
export function getChildTheme() {
  return (
    document.documentElement.getAttribute("data-theme") ||
    localStorage.getItem("comtrade-theme") ||
    "dark"
  );
}

/**
 * Check if dark theme is active in child window
 * @returns {boolean}
 */
export function isChildDarkTheme() {
  return getChildTheme() === "dark";
}

export default {
  initChildThemeManager,
  getChildTheme,
  isChildDarkTheme,
};
