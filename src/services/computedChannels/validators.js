/**
 * @file validators.js
 * @module Services/ComputedChannels
 *
 * @description
 * <h3>Computed Channel Input Validators</h3>
 * 
 * <p>Validates all inputs before computed channel evaluation begins.
 * Provides early failure with descriptive error messages.</p>
 * 
 * <h4>Validation Chain</h4>
 * <table>
 *   <tr><th>Step</th><th>Function</th><th>Purpose</th></tr>
 *   <tr><td>1</td><td><code>validateExpressionPayload</code></td><td>Check expression exists, extract name</td></tr>
 *   <tr><td>2</td><td><code>validateGlobalData</code></td><td>Ensure cfg/data are available</td></tr>
 *   <tr><td>3</td><td><code>validateSampleData</code></td><td>Verify analog data has samples</td></tr>
 *   <tr><td>4</td><td><code>validateExpressionSyntax</code></td><td>Test math.js can compile</td></tr>
 * </table>
 * 
 * <h4>Name Extraction</h4>
 * <p>Supports named expressions:</p>
 * <ul>
 *   <li>Input: <code>"I_RMS = sqrt(IA^2 + IB^2 + IC^2)"</code></li>
 *   <li>Name: <code>"I_RMS"</code></li>
 *   <li>Expression: <code>"sqrt(IA^2 + IB^2 + IC^2)"</code></li>
 * </ul>
 * 
 * @see {@link module:services/computedChannels} - Main orchestrator
 * 
 * @example
 * import { validateExpressionPayload, validateGlobalData } from "./validators.js";
 * 
 * const result1 = validateExpressionPayload({ expression: "IA + IB" });
 * if (!result1.valid) return console.error(result1.error);
 * 
 * const result2 = validateGlobalData(window.globalCfg, window.globalData);
 * if (!result2.valid) return console.error(result2.error);
 */

import { processEquationInput } from "../../utils/channelNameExtractor.js";

/**
 * Validation result object
 * 
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string} [error] - Error message if validation failed
 * @property {string} [channelName] - Extracted channel name (for expression validation)
 * @property {string} [mathExpression] - Extracted math expression
 * @property {Object} [details] - Additional failure details
 */

/**
 * Validate expression payload from MathLive editor.
 * Also extracts channel name if provided in format: "name = expression".
 * 
 * **Supported Formats:**
 * - Simple: "IA + IB + IC" → name auto-generated
 * - Named: "I_sum = IA + IB + IC" → name = "I_sum"
 * 
 * @function validateExpressionPayload
 * @memberof module:services/computedChannels/validators
 * @param {Object} payload - Request payload from MathLive
 * @param {string} payload.expression - LaTeX or math expression
 * @param {string} [payload.unit] - Optional unit
 * @returns {ValidationResult} Validation result with extracted name/expression
 * 
 * @example
 * // Simple expression
 * validateExpressionPayload({ expression: "IA * 2" });
 * // { valid: true, channelName: null, mathExpression: "IA * 2" }
 * 
 * // Named expression
 * validateExpressionPayload({ expression: "doubled_IA = IA * 2" });
 * // { valid: true, channelName: "doubled_IA", mathExpression: "IA * 2" }
 * 
 * // Invalid
 * validateExpressionPayload({});
 * // { valid: false, error: "No expression provided..." }
 */
export const validateExpressionPayload = (payload) => {
  const { expression, unit } = payload || {};

  if (!expression) {
    return {
      valid: false,
      error: "No expression provided for computed channel",
    };
  }

  // ✅ NEW: Process equation to extract channel name and math expression
  const processed = processEquationInput(expression);

  if (!processed.valid) {
    console.warn("[Validator] ⚠️ Name validation failed:", processed.error);
    return {
      valid: false,
      error: processed.error,
      channelName: null,
      mathExpression: processed.mathExpression,
    };
  }

  return {
    valid: true,
    channelName: processed.channelName,
    mathExpression: processed.mathExpression,
    unit: unit,
  };
};

/**
 * Validate global data availability.
 * Ensures both cfg (configuration) and data (samples) are loaded.
 * 
 * @function validateGlobalData
 * @memberof module:services/computedChannels/validators
 * @param {Object|null} cfgData - COMTRADE configuration (window.globalCfg)
 * @param {Object|null} dataObj - COMTRADE data (window.globalData)
 * @returns {ValidationResult} Validation result with availability details
 * 
 * @example
 * const result = validateGlobalData(window.globalCfg, window.globalData);
 * if (!result.valid) {
 *   console.error(result.error);
 *   console.log("Has cfg:", result.details.hasGlobalCfg);
 *   console.log("Has data:", result.details.hasGlobalData);
 * }
 */
export const validateGlobalData = (cfgData, dataObj) => {
  if (!cfgData || !dataObj) {
    return {
      valid: false,
      error: "Global cfg/data not available",
      details: {
        hasGlobalCfg: !!cfgData,
        hasGlobalData: !!dataObj,
      },
    };
  }

  return { valid: true };
};

/**
 * Validate sample data availability.
 * Checks that analog data exists and has samples to process.
 * 
 * @function validateSampleData
 * @memberof module:services/computedChannels/validators
 * @param {Array<Array<number>>} analogArray - 2D analog data array
 * @returns {ValidationResult} Validation result with sample count
 * 
 * @example
 * const result = validateSampleData(data.analogData);
 * if (result.valid) {
 *   console.log("Processing", result.sampleCount, "samples");
 * }
 */
export const validateSampleData = (analogArray) => {
  const sampleCount = analogArray?.[0]?.length || 0;

  if (!sampleCount) {
    return {
      valid: false,
      error: "No analog samples available",
    };
  }

  return { valid: true, sampleCount };
};

/**
 * Validate expression syntax using math.js compiler.
 * Tests that the expression can be compiled without errors.
 * 
 * @function validateExpressionSyntax
 * @memberof module:services/computedChannels/validators
 * @param {string} mathJsExpr - Math.js compatible expression
 * @returns {ValidationResult} Validation result with compile error if any
 * 
 * @example
 * // Valid
 * validateExpressionSyntax("sqrt(IA^2 + IB^2)");
 * // { valid: true }
 * 
 * // Invalid
 * validateExpressionSyntax("sqrt(IA^2 + ");
 * // { valid: false, error: "Unexpected end of expression" }
 */
export const validateExpressionSyntax = (mathJsExpr) => {
  try {
    math.compile(mathJsExpr);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
    };
  }
};
