/**
 * @file DeltaTable.js
 * @description Functional HTML table builder for Delta Drawer
 * Builds table structure from delta data without any DOM manipulation
 */

/**
 * Build table header row with dynamic columns
 * @param {number} verticalLinesCount - Number of vertical lines
 * @param {string[]} verticalLineTimes - Time values for each line
 * @param {string[]} crosshairColors - Array of colors for lines
 * @returns {string} HTML string for <thead>
 */
export function buildTableHeader(
  verticalLinesCount,
  verticalLineTimes,
  crosshairColors
) {
  const columns = [];

  // Column 1: Channel name (first column styling)
  columns.push(`<th scope="col" class="py-6 pl-4 pr-3 text-center text-sm font-semibold text-gray-900 sm:pl-6 dark:text-gray-200" style="color: var(--text-primary, #111827);">Channel</th>`);

  // Value columns (one per vertical line)
  for (let i = 0; i < verticalLinesCount; i++) {
    const color = getColorHex(crosshairColors[i % crosshairColors.length]);

    columns.push(`
      <th scope="col" class="px-3 py-8 text-center text-sm font-semibold text-gray-900 dark:text-gray-200">
        <span style="color: ${color}">${
      crosshairColors[i % crosshairColors.length].charAt(0).toUpperCase() +
      crosshairColors[i % crosshairColors.length].slice(1)
    }</span>
      </th>
    `);
  }

  // Delta columns (one pair per consecutive lines)
  for (let i = 0; i < verticalLinesCount - 1; i++) {
    const color1 = getColorHex(crosshairColors[i % crosshairColors.length]);
    const color2 = getColorHex(
      crosshairColors[(i + 1) % crosshairColors.length]
    );

    // Delta value column
    columns.push(`
      <th scope="col" class="px-3 py-8 text-center text-sm font-semibold text-gray-900 dark:text-gray-200" style="color: var(--text-primary, #111827);">
        <span style="background-color: ${color1}; width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 4px;"></span>
        <span style="display: inline-block; margin: 0 2px;">→</span>
        <span style="background-color: ${color2}; width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-left: 4px; margin-right: 4px;"></span>
        <span>Δ</span>
      </th>
    `);

    // Percentage column
    columns.push(`
      <th scope="col" class="px-3 py-8 text-center text-sm font-semibold text-gray-900 dark:text-gray-200" style="color: var(--text-primary, #111827);">
        <span style="background-color: ${color1}; width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 4px;"></span>
        <span style="display: inline-block; margin: 0 2px;">→</span>
        <span style="background-color: ${color2}; width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-left: 4px; margin-right: 4px;"></span>
        <span>%</span>
      </th>
    `);
  }

  return `<thead style="background-color: var(--bg-tertiary, #f9fafb); color: var(--text-primary, #111827);"><tr>${columns.join("")}</tr></thead>`;
}

/**
 * Build table body rows from delta data
 * @param {Object[]} tableData - Formatted table data
 * @param {number} verticalLinesCount - Number of vertical lines
 * @returns {string} HTML string for <tbody>
 */
export function buildTableBody(tableData, verticalLinesCount) {
  if (!tableData || tableData.length === 0) {
    return `<tbody><tr><td colspan="100" style="padding: 40px 16px; text-align: center; color: var(--text-muted, #9ca3af);">No data available</td></tr></tbody>`;
  }

  console.log("[DeltaTable] First row structure:", tableData[0]);
  console.log("[DeltaTable] Total rows:", tableData.length);
  console.log("[DeltaTable] VerticalLinesCount:", verticalLinesCount);

  const rows = tableData.map((row, rowIndex) => {
    const cells = [];
    const isTimeRow = row.channel === "__TIME_ROW__";

    if (rowIndex === 1 || (rowIndex === 0 && !isTimeRow)) {
      console.log(`[DeltaTable] Row ${rowIndex} values:`, {
        channel: row.channel,
        v0: row.v0,
        v1: row.v1,
        delta0: row.delta0,
        percentage0: row.percentage0,
      });
    }

    // Channel name cell (first column)
    if (isTimeRow) {
      cells.push(
        `<td style="padding: 10px 12px; text-align: center; white-space: nowrap; color: var(--text-primary, #111827); font-weight: 500; border-right: 1px solid var(--border-color, #e5e7eb);">Time (T)</td>`
      );
    } else {
      cells.push(`
        <td style="padding: 10px 12px; text-align: center; white-space: nowrap; color: var(--text-primary, #111827); font-weight: 500; border-right: 1px solid var(--border-color, #e5e7eb);">
          <span style="background-color: ${row.color}; width: 12px; height: 12px; border-radius: 2px; display: inline-block; margin-right: 8px; vertical-align: middle;"></span>
          ${row.channel}
        </td>
      `);
    }

    // Value cells
    for (let i = 0; i < verticalLinesCount; i++) {
      const value = row[`v${i}`] || "N/A";
      cells.push(`<td style="padding: 10px 12px; text-align: center; white-space: nowrap; color: var(--text-primary, #111827); border-right: 1px solid var(--border-color, #e5e7eb);">${value}</td>`);
    }

    // Delta and percentage cells
    for (let i = 0; i < verticalLinesCount - 1; i++) {
      const deltaValue = row[`delta${i}`] || "N/A";
      let percentage =
        row[`percentage${i}`] != null ? row[`percentage${i}`] : 0;

      if (typeof percentage === "string") {
        percentage = parseFloat(percentage) || 0;
      } else if (typeof percentage !== "number") {
        percentage = 0;
      }

      // Delta cell
      cells.push(`<td style="padding: 10px 12px; text-align: center; white-space: nowrap; color: var(--text-primary, #111827); border-right: 1px solid var(--border-color, #e5e7eb);">${deltaValue}</td>`);

      // Percentage cell
      if (isTimeRow) {
        cells.push(
          `<td style="padding: 10px 12px; text-align: center; white-space: nowrap; color: var(--text-muted, #9ca3af); border-right: 1px solid var(--border-color, #e5e7eb);">—</td>`
        );
      } else {
        const percentColor =
          percentage < 0 ? "#dc2626" : percentage > 0 ? "#16a34a" : "var(--text-muted, #9ca3af)";
        cells.push(`
          <td style="padding: 10px 12px; text-align: center; white-space: nowrap; color: ${percentColor}; font-weight: 600; border-right: 1px solid var(--border-color, #e5e7eb);">
            ${percentage.toFixed(1)}%
          </td>
        `);
      }
    }

    return `<tr style="border-bottom: 1px solid var(--border-color, #e5e7eb);">${cells.join("")}</tr>`;
  });

  return `<tbody style="background-color: var(--bg-secondary, #ffffff); color: var(--text-primary, #111827);">${rows.join("")}</tbody>`;
}

/**
 * Build complete table HTML
 * @param {Object[]} tableData - Formatted table data
 * @param {number} verticalLinesCount - Number of vertical lines
 * @param {string[]} verticalLineTimes - Time values
 * @param {string[]} crosshairColors - Colors array
 * @returns {string} Complete table HTML
 */
export function buildTableHTML(
  tableData,
  verticalLinesCount,
  verticalLineTimes,
  crosshairColors
) {
  const header = buildTableHeader(
    verticalLinesCount,
    verticalLineTimes,
    crosshairColors
  );
  const body = buildTableBody(tableData, verticalLinesCount);

  return `
    <div class="mt-4 flow-root">
      <div class="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div class="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
          <div class="overflow-hidden shadow outline outline-1 outline-black/5 sm:rounded-lg dark:shadow-none dark:-outline-offset-1 dark:outline-white/10">
            <table class="relative min-w-full divide-y divide-gray-300 dark:divide-white/15">           
              ${header}
              ${body}
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Convert color name to hex
 * @param {string} colorName - Color from crosshairColors
 * @returns {string} Hex color code
 */
function getColorHex(colorName) {
  const colorMap = {
    red: "#ef4444",
    blue: "#3b82f6",
    green: "#22c55e",
    magenta: "#d946ef",
    purple: "#a855f7",
    orange: "#f97316",
    brown: "#92400e",
    black: "#000000",
    pink: "#ec4899",
    yellow: "#eab308",
  };
  return colorMap[colorName] || "#6b7280";
}

/**
 * Filter table rows based on search query
 * @param {Object[]} tableData - Table data to filter
 * @param {string} searchQuery - Search text
 * @returns {Object[]} Filtered table data
 */
export function filterTableRows(tableData, searchQuery) {
  if (!searchQuery || searchQuery.trim() === "") {
    return tableData;
  }

  const query = searchQuery.toLowerCase();
  return tableData.filter((row) => {
    if (row.channel === "__TIME_ROW__") return true;
    return row.channel.toLowerCase().includes(query);
  });
}
