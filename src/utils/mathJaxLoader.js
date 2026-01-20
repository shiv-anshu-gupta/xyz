/**
 * Lazy-load MathJax only when needed
 * Improves initial page load performance by not loading MathJax until first use
 */

let mathJaxPromise = null;
let isMathJaxReady = false;

/**
 * Load MathJax on-demand (lazy loading)
 * @returns {Promise} Resolves when MathJax is ready
 */
export function loadMathJax() {
  if (isMathJaxReady) {
    console.log("[MathJax] ✅ Already loaded and ready");
    return Promise.resolve(window.MathJax);
  }

  if (!mathJaxPromise) {
    console.log("[MathJax] 🔍 Checking for MathJax...");

    // ✅ Check if MathJax is already loaded on the page (from index.html)
    if (window.MathJax && window.MathJax.startup) {
      console.log(
        "[MathJax] 📌 MathJax already on page, waiting for initialization..."
      );
      mathJaxPromise = window.MathJax.startup.promise.then(() => {
        console.log("[MathJax] ✅ Page MathJax initialization complete");
        isMathJaxReady = true;
        return window.MathJax;
      });
    } else {
      console.log("[MathJax] 📥 Loading MathJax from CDN...");

      // ✅ Load from CDN dynamically if not already on page
      mathJaxPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.id = "mathjax-script";
        script.async = true;
        script.src =
          "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";

        script.onload = () => {
          console.log("[MathJax] ✅ CDN script loaded");

          // MathJax needs time to initialize
          if (window.MathJax?.startup) {
            window.MathJax.startup.promise.then(() => {
              console.log("[MathJax] ✅ CDN initialization complete");
              isMathJaxReady = true;
              resolve(window.MathJax);
            });
          } else {
            isMathJaxReady = true;
            resolve(window.MathJax);
          }
        };

        script.onerror = () => {
          console.error("[MathJax] ❌ Failed to load from CDN");
          reject(new Error("Failed to load MathJax"));
        };

        document.head.appendChild(script);
      });
    }
  }

  return mathJaxPromise;
}

/**
 * Render LaTeX equations after MathJax is loaded
 * @param {HTMLElement} element - Element containing LaTeX
 * @returns {Promise} Resolves when rendering is complete
 */
export async function renderLatex(element) {
  try {
    console.log(
      "[MathJax] 📦 renderLatex called with element:",
      element?.className || element?.tagName
    );

    // ✅ Load MathJax if not already loaded
    await loadMathJax();

    // ✅ Double-check MathJax is ready with additional timeout
    let attempts = 0;
    while (!window.MathJax?.typesetPromise && attempts < 50) {
      console.log(
        "[MathJax] ⏳ Waiting for MathJax.typesetPromise...",
        attempts
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    if (window.MathJax?.typesetPromise) {
      console.log("[MathJax] 🔄 Rendering LaTeX in element...");
      const startTime = performance.now();

      await window.MathJax.typesetPromise([element]);

      const elapsed = performance.now() - startTime;
      console.log(`[MathJax] ✅ Rendering complete in ${elapsed.toFixed(2)}ms`);
      console.log(
        "[MathJax] Element content after render:",
        element?.innerHTML?.substring(0, 100)
      );
    } else {
      console.error(
        "[MathJax] ❌ MathJax.typesetPromise not available after load"
      );
    }
  } catch (error) {
    console.error("[MathJax] ❌ Rendering failed:", error);
    throw error;
  }
}

/**
 * Check if MathJax is already loaded
 * @returns {boolean} True if MathJax is loaded and ready
 */
export function isMathJaxLoaded() {
  return isMathJaxReady && window.MathJax?.typesetPromise;
}
