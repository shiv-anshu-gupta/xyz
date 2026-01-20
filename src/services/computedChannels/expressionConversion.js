/**
 * @file expressionConversion.js
 * @module services/computedChannels/expressionConversion
 * 
 * @description
 * <h3>LaTeX to Math.js Converter</h3>
 * 
 * <p>Converts LaTeX expressions from MathLive editor to math.js compatible format.</p>
 * 
 * <h4>Why Conversion is Needed</h4>
 * <table>
 *   <tr><th>MathLive (LaTeX)</th><th>Math.js (JavaScript)</th></tr>
 *   <tr><td><code>\sqrt{x}</code></td><td><code>sqrt(x)</code></td></tr>
 *   <tr><td><code>I_{A}</code></td><td><code>IA</code></td></tr>
 *   <tr><td><code>\frac{a}{b}</code></td><td><code>(a)/(b)</code></td></tr>
 *   <tr><td><code>x^{2}</code></td><td><code>x^(2)</code></td></tr>
 *   <tr><td><code>\cdot</code></td><td><code>*</code></td></tr>
 * </table>
 * 
 * <h4>Supported LaTeX Constructs</h4>
 * <table>
 *   <tr><th>LaTeX</th><th>Converted To</th></tr>
 *   <tr><td><code>I_{A}</code> (subscript)</td><td><code>IA</code></td></tr>
 *   <tr><td><code>\sqrt{x}</code></td><td><code>sqrt(x)</code></td></tr>
 *   <tr><td><code>\frac{a}{b}</code></td><td><code>(a)/(b)</code></td></tr>
 *   <tr><td><code>\operatorname{RMS}(x)</code></td><td><code>sqrt(mean((x)^2))</code></td></tr>
 *   <tr><td><code>\cdot</code>, <code>\times</code></td><td><code>*</code></td></tr>
 *   <tr><td><code>\left\lvert x \right\rvert</code></td><td><code>abs(x)</code></td></tr>
 *   <tr><td><code>x^{2}</code></td><td><code>x^(2)</code></td></tr>
 *   <tr><td><code>\left(</code> <code>\right)</code></td><td><code>(</code> <code>)</code></td></tr>
 * </table>
 * 
 * @see {@link module:services/computedChannels} - Uses this converter
 * @see {@link module:components/EquationEvaluatorInChannelList} - MathLive source
 * 
 * @example
 * import { convertLatexToMathJs } from "./expressionConversion.js";
 * 
 * convertLatexToMathJs("\\sqrt{I_{A}^2+I_{B}^2+I_{C}^2}");
 * // Returns: "sqrt(IA^(2)+IB^(2)+IC^(2))"
 * 
 * convertLatexToMathJs("\\frac{V_{A}}{I_{A}}");
 * // Returns: "(VA)/(IA)"
 */

/**
 * Convert LaTeX expression to math.js compatible format.
 * Handles all common LaTeX constructs from MathLive editor.
 * 
 * **Conversion Steps:**
 * 1. Convert subscripts: `X_{sub}` → `Xsub`
 * 2. Convert sqrt: `\sqrt{x}` → `sqrt(x)`
 * 3. Convert fractions: `\frac{a}{b}` → `(a)/(b)`
 * 4. Convert special functions (RMS, AVG)
 * 5. Convert operators (\cdot, \times)
 * 6. Convert absolute value notation
 * 7. Convert parentheses notation
 * 8. Convert power notation: `^{n}` → `^(n)`
 * 9. Clean remaining LaTeX artifacts
 * 
 * @function convertLatexToMathJs
 * @memberof module:services/computedChannels/expressionConversion
 * @param {string} latex - LaTeX expression from MathLive editor
 * @returns {string} Math.js compatible expression
 * 
 * @example
 * // Simple expression
 * convertLatexToMathJs("I_{A} + I_{B}");
 * // "IA + IB"
 * 
 * // RMS calculation
 * convertLatexToMathJs("\\operatorname{RMS}\\left(I_{A}\\right)");
 * // "sqrt(mean((IA)^2))"
 * 
 * // Complex expression
 * convertLatexToMathJs("\\sqrt{\\frac{V_{A}^2 + V_{B}^2}{2}}");
 * // "sqrt((VA^(2) + VB^(2))/(2))"
 */
export function convertLatexToMathJs(latex) {
  if (!latex) return "";

  let expr = latex.trim();

  // Convert subscripts: I_{A} → IA, I_{B} → IB, etc.
  expr = expr.replace(/([A-Za-z])_\{([A-Za-z0-9]+)\}/g, "$1$2");

  // Convert sqrt: \sqrt{x} → sqrt(x)
  expr = expr.replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)");

  // Convert fractions: \frac{a}{b} → (a)/(b)
  expr = expr.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)");

  // Convert functions: \operatorname{func} → func
  expr = expr.replace(
    /\\operatorname\{RMS\}\s*\\left\(\s*([^)]+)\s*\\right\)/gi,
    "sqrt(mean(($1)^2))"
  );
  expr = expr.replace(
    /\\operatorname\{AVG\}\s*\\left\(\s*([^)]+)\s*\\right\)/gi,
    "mean($1)"
  );
  expr = expr.replace(/\\operatorname\{([^}]+)\}/g, "$1");

  // Convert operators
  expr = expr.replace(/\\cdot/g, "*");
  expr = expr.replace(/\\times/g, "*");

  // Convert absolute value: \left\lvert a \right\rvert → abs(a)
  expr = expr.replace(/\\left\\lvert\s*([^\\]*)\s*\\right\\rvert/g, "abs($1)");

  // Convert parentheses
  expr = expr.replace(/\\left\(/g, "(");
  expr = expr.replace(/\\right\)/g, ")");

  // Convert power: ^{n} → ^(n) for math.js compatibility
  expr = expr.replace(/\^\{([^}]+)\}/g, "^($1)");

  // Remove remaining LaTeX artifacts
  expr = expr.replace(/\\[a-zA-Z]+/g, ""); // Remove remaining commands
  expr = expr.replace(/[\{\}]/g, ""); // Remove braces

  return expr.trim();
}
