// File: src/utils/channelNameExtractor.js
// Single Responsibility: Extract channel name from equations using regex

/**
 * Extract channel name from equation
 *
 * Examples:
 * "ch1 = sqrt(IA^2 + IB^2 + IC^2)" → "ch1"
 * "magnitude = sqrt(IA^2 + IB^2)" → "magnitude"
 * "RMS_3Phase = sqrt(IA^2 + IB^2 + IC^2)" → "RMS_3Phase"
 * "sqrt(IA^2 + IB^2)" → null (no channel name)
 *
 * @param {string} equation - The full equation string
 * @returns {string|null} - The channel name if found, null otherwise
 */
export const extractChannelNameFromEquation = (equation) => {
  if (!equation || typeof equation !== "string") {
    console.log(
      "[channelNameExtractor] ⚠️ Invalid input to extractChannelNameFromEquation:",
      { equation, type: typeof equation }
    );
    return null;
  }

  // Regex to match: optional whitespace + valid identifier + optional whitespace + = sign
  // Valid identifier: starts with letter or underscore, followed by letters, numbers, or underscores
  const match = equation.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);

  if (match && match[1]) {
    const name = match[1].trim();
    return name;
  }

  return null;
};

/**
 * Validate if a channel name is valid
 *
 * Requirements:
 * - Must start with letter or underscore
 * - Can contain letters, numbers, underscores
 * - 1-50 characters
 * - Cannot be reserved keywords
 *
 * @param {string} name - The channel name to validate
 * @returns {Object} - { valid: boolean, error?: string }
 */
export const validateChannelName = (name) => {
  const RESERVED_KEYWORDS = [
    "computed",
    "data",
    "results",
    "stats",
    "unit",
    "equation",
    "mathJsExpression",
    "sampleCount",
    "index",
    "createdAt",
    "id",
    "name",
    "time",
    "analogData",
    "digitalData",
  ];

  if (!name || typeof name !== "string") {
    return { valid: false, error: "Channel name must be a non-empty string" };
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    return {
      valid: false,
      error:
        "Channel name must start with letter or underscore, and contain only letters, numbers, and underscores",
    };
  }

  if (name.length > 50) {
    return {
      valid: false,
      error: "Channel name must be 50 characters or less",
    };
  }

  if (RESERVED_KEYWORDS.includes(name.toLowerCase())) {
    return { valid: false, error: `"${name}" is a reserved keyword` };
  }

  return { valid: true };
};

/**
 * Remove the channel name and = sign from equation
 * Extracts just the math expression part
 *
 * @param {string} equation - Full equation with or without channel name
 * @returns {string} - Just the math expression part
 */
export const extractMathExpression = (equation) => {
  if (!equation || typeof equation !== "string") {
    return equation;
  }

  // If equation starts with "name = expression", remove the "name = " part
  if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*=/.test(equation)) {
    return equation.replace(/^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*/, "").trim();
  }

  // Otherwise return the whole equation (user didn't provide a name)
  return equation.trim();
};

/**
 * Process equation to extract channel name and math expression
 *
 * @param {string} equation - Full equation from user
 * @returns {Object} - { channelName: string|null, mathExpression: string, valid: boolean, error?: string }
 */
export const processEquationInput = (equation) => {
  const channelName = extractChannelNameFromEquation(equation);
  const mathExpression = extractMathExpression(equation);

  // If channel name was provided, validate it
  if (channelName) {
    const nameValidation = validateChannelName(channelName);
    if (!nameValidation.valid) {
      return {
        channelName: null,
        mathExpression,
        valid: false,
        error: nameValidation.error,
      };
    }
  }

  return {
    channelName: channelName,
    mathExpression: mathExpression,
    valid: true,
  };
};
