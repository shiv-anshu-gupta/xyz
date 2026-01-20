/**
 * @file computedChannelMetadata.js - Computed Channel Metadata Manager
 * @module utils/computedChannelMetadata
 * @description
 * Stores and manages metadata for all computed channels created from mathematical
 * expressions. This is the central registry for computed channel information.
 * 
 * **Purpose:**
 * When users create computed channels (e.g., RMS current = √(IA² + IB² + IC²)),
 * this module stores all metadata about that channel:
 * - Unique identifier and display name
 * - Original LaTeX and converted math.js expressions
 * - Color, unit, group assignment
 * - Statistics (min, max, mean)
 * - Creation timestamp
 * 
 * **Data Structure:**
 * ```
 * metadataMap (Map):     { channelId → metadata }  → O(1) lookup by ID
 * metadataList (Array):  [metadata, ...]           → Maintains insertion order
 * ```
 * 
 * **Usage Pattern:**
 * ```javascript
 * // Add new computed channel
 * computedChannelMetadata.set("rms_current", {
 *   name: "I_RMS",
 *   equation: "sqrt(IA^2 + IB^2 + IC^2)",
 *   color: "#FF6B6B",
 *   unit: "A"
 * });
 * 
 * // Retrieve metadata
 * const meta = computedChannelMetadata.get("rms_current");
 * 
 * // Get all for display
 * const allChannels = computedChannelMetadata.getAll();
 * ```
 * 
 * @requires None - Self-contained utility class
 * 
 * @see {@link module:services/computedChannels/resultProcessing} - Creates metadata
 * @see {@link module:services/computedChannels/stateUpdate} - Stores to cfg
 * @see {@link module:components/renderComputedChannels} - Uses for rendering
 * 
 * @example
 * import { computedChannelMetadata } from "./computedChannelMetadata.js";
 * 
 * // Store metadata for new computed channel
 * computedChannelMetadata.set("power_calc", {
 *   name: "Active Power",
 *   equation: "VA * IA + VB * IB + VC * IC",
 *   latexEquation: "V_A \\cdot I_A + V_B \\cdot I_B + V_C \\cdot I_C",
 *   color: "#4ECDC4",
 *   unit: "W",
 *   group: "G0"
 * });
 * 
 * // Export for persistence
 * localStorage.setItem("computed_metadata", computedChannelMetadata.toJSON());
 * 
 * @mermaid
 * graph TD
 *     A[User creates equation] --> B[buildChannelData]
 *     B --> C[computedChannelMetadata.set]
 *     C --> D[metadataMap + metadataList]
 *     D --> E[Used by renderComputedChannels]
 *     D --> F[Used by ChannelList Tabulator]
 *     D --> G[Persisted to localStorage]
 */

/**
 * Computed channel metadata object structure
 * 
 * @typedef {Object} ComputedChannelMetadataObject
 * @property {string} id - Unique channel identifier
 * @property {string} name - Display name for the channel
 * @property {string} equation - Original math expression (may be LaTeX)
 * @property {string} latexEquation - Raw LaTeX from MathLive editor
 * @property {string} mathJsExpression - Converted math.js compatible expression
 * @property {string} color - Hex color code for chart display
 * @property {string} type - Always "Computed" for computed channels
 * @property {string} group - Group assignment (e.g., "G0", "G1")
 * @property {string} unit - Unit of measurement (e.g., "A", "V", "W")
 * @property {Object} stats - Statistics object with min, max, mean
 * @property {number} scalingFactor - Multiplier for display scaling
 * @property {string} createdAt - ISO timestamp of creation
 * @property {string} description - Optional description
 */

/**
 * Computed Channel Metadata Manager Class.
 * Provides O(1) lookup by ID and maintains insertion order.
 * 
 * @class ComputedChannelMetadata
 * @example
 * const manager = new ComputedChannelMetadata();
 * manager.set("ch1", { name: "Channel 1", color: "#FF0000" });
 * console.log(manager.get("ch1").name); // "Channel 1"
 */
class ComputedChannelMetadata {
  constructor() {
    // Map to store metadata by channel ID for O(1) lookup
    this.metadataMap = new Map();

    // Array to maintain insertion order
    this.metadataList = [];
  }

  /**
   * Add or update computed channel metadata.
   * If channelId already exists, updates the entry; otherwise creates new.
   * 
   * @method set
   * @memberof ComputedChannelMetadata
   * @param {string} channelId - Unique channel identifier (e.g., "rms_current")
   * @param {Object} metadata - Partial metadata object (missing fields get defaults)
   * @param {string} [metadata.name] - Display name (defaults to channelId)
   * @param {string} [metadata.equation] - Math expression
   * @param {string} [metadata.latexEquation] - Raw LaTeX from editor
   * @param {string} [metadata.mathJsExpression] - Converted expression
   * @param {string} [metadata.color="#999"] - Hex color code
   * @param {string} [metadata.type="Computed"] - Channel type
   * @param {string} [metadata.group="Computed"] - Group assignment
   * @param {string} [metadata.unit=""] - Unit of measurement
   * @returns {ComputedChannelMetadataObject} The complete stored metadata with defaults
   * 
   * @example
   * // Minimal - uses defaults
   * metadata.set("ch1", { name: "My Channel" });
   * 
   * // Complete
   * metadata.set("ch1", {
   *   name: "RMS Current",
   *   equation: "sqrt(IA^2+IB^2+IC^2)",
   *   color: "#FF6B6B",
   *   unit: "A",
   *   group: "G0"
   * });
   */
  set(channelId, metadata) {
    const fullMetadata = {
      id: channelId,
      name: metadata.name || channelId,
      equation: metadata.equation || "",
      latexEquation: metadata.latexEquation || "", // Raw LaTeX from MathLive
      mathJsExpression: metadata.mathJsExpression || "",
      color: metadata.color || "#999",
      type: metadata.type || "Computed",
      group: metadata.group || "Computed",
      unit: metadata.unit || "",
      stats: metadata.stats || {},
      scalingFactor: metadata.scalingFactor || 1,
      createdAt: metadata.createdAt || new Date().toISOString(),
      description: metadata.description || "",
    };

    this.metadataMap.set(channelId, fullMetadata);

    // Update in array or add if new
    const existingIdx = this.metadataList.findIndex((m) => m.id === channelId);
    if (existingIdx >= 0) {
      this.metadataList[existingIdx] = fullMetadata;
    } else {
      this.metadataList.push(fullMetadata);
    }

    return fullMetadata;
  }

  /**
   * Get metadata for a specific channel
   * @param {string} channelId - Channel identifier
   * @returns {Object|null} Channel metadata or null if not found
   */
  get(channelId) {
    return this.metadataMap.get(channelId) || null;
  }

  /**
   * Get all metadata as array
   * @returns {Array} All channel metadata in insertion order
   */
  getAll() {
    return [...this.metadataList];
  }

  /**
   * Get metadata by name (case-insensitive)
   * @param {string} name - Channel name
   * @returns {Object|null} Channel metadata or null
   */
  getByName(name) {
    return (
      this.metadataList.find(
        (m) => m.name.toLowerCase() === name.toLowerCase()
      ) || null
    );
  }

  /**
   * Get all channels in a specific group
   * @param {string} group - Group name
   * @returns {Array} Channels in that group
   */
  getByGroup(group) {
    return this.metadataList.filter((m) => m.group === group);
  }

  /**
   * Delete metadata for a channel
   * @param {string} channelId - Channel identifier
   * @returns {boolean} True if deleted, false if not found
   */
  delete(channelId) {
    const existed = this.metadataMap.delete(channelId);
    if (existed) {
      this.metadataList = this.metadataList.filter((m) => m.id !== channelId);
    }
    return existed;
  }

  /**
   * Check if channel exists
   * @param {string} channelId - Channel identifier
   * @returns {boolean} True if channel exists
   */
  has(channelId) {
    return this.metadataMap.has(channelId);
  }

  /**
   * Get count of all computed channels
   * @returns {number} Total number of channels
   */
  count() {
    return this.metadataMap.size;
  }

  /**
   * Clear all metadata
   */
  clear() {
    this.metadataMap.clear();
    this.metadataList = [];
  }

  /**
   * Export all metadata as JSON
   * @returns {string} JSON string of all metadata
   */
  toJSON() {
    return JSON.stringify(this.metadataList);
  }

  /**
   * Import metadata from JSON
   * @param {string} jsonString - JSON string of metadata
   */
  fromJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (Array.isArray(data)) {
        this.clear();
        data.forEach((item) => this.set(item.id, item));
      }
    } catch (e) {
      console.error("[ComputedChannelMetadata] Import error:", e.message);
    }
  }
}

// Global instance
export const computedChannelMetadata = new ComputedChannelMetadata();

// Also export the class for testing
export { ComputedChannelMetadata };
