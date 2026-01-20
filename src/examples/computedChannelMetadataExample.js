/**
 * Example Usage: Computed Channels Metadata System
 * Demonstrates how to use the metadata manager and sidebar
 */

// ============================================
// 1. IMPORT THE METADATA MANAGER
// ============================================
import { computedChannelMetadata } from "../utils/computedChannelMetadata.js";
import {
  createComputedChannelsSidebar,
  updateComputedChannelsSidebar,
  injectSidebarIntoUplot,
} from "../components/ComputedChannelsSidebar.js";

// ============================================
// 2. CREATE A NEW COMPUTED CHANNEL
// ============================================
function createComputedChannelExample() {
  const channelId = "computed_0";

  // Create metadata
  const metadata = {
    name: "RMS_Voltage_ABC",
    equation: "sqrt(a0^2 + a1^2 + a2^2)",
    color: "#FF6B6B",
    group: "Voltages",
    unit: "V",
    stats: {
      min: 200,
      max: 280,
      mean: 240,
      rms: 245,
      stdDev: 15,
    },
    scalingFactor: 1.0,
    description: "RMS value of three-phase voltages",
  };

  // Save to metadata manager
  computedChannelMetadata.set(channelId, metadata);
  console.log("✅ Channel created:", channelId);
}

// ============================================
// 3. RETRIEVE METADATA
// ============================================
function retrieveMetadataExample() {
  // Get single channel
  const channel = computedChannelMetadata.get("computed_0");
  console.log("Channel:", channel);

  // Get all channels
  const allChannels = computedChannelMetadata.getAll();
  console.log(`Total channels: ${allChannels.length}`);

  // Query by name
  const byName = computedChannelMetadata.getByName("RMS_Voltage_ABC");
  console.log("Found by name:", byName?.id);

  // Query by group
  const voltageChannels = computedChannelMetadata.getByGroup("Voltages");
  console.log(`Voltage channels: ${voltageChannels.length}`);

  // Check existence
  if (computedChannelMetadata.has("computed_0")) {
    console.log("computed_0 exists");
  }
}

// ============================================
// 4. CREATE SIDEBAR IN CHART
// ============================================
function createSidebarExample() {
  // Get the chart container
  const chartContainer = document.querySelector("[data-chart-type='computed']");

  if (!chartContainer) {
    console.warn("Chart container not found");
    return;
  }

  // Create sidebar
  const sidebar = createComputedChannelsSidebar(
    chartContainer,
    null, // cfg not needed for display
    null // data not needed for display
  );

  // Inject into chart (left side)
  injectSidebarIntoUplot(chartContainer, sidebar);

  console.log("✅ Sidebar created and injected");
}

// ============================================
// 5. UPDATE SIDEBAR AFTER CHANGES
// ============================================
function updateSidebarExample() {
  // After adding new computed channels, refresh display
  const listContainer = document.getElementById("computed-channels-list");

  if (listContainer) {
    updateComputedChannelsSidebar(listContainer);
    console.log("✅ Sidebar updated");
  }
}

// ============================================
// 6. EXPORT METADATA
// ============================================
function exportMetadataExample() {
  const json = computedChannelMetadata.toJSON();
  console.log("Exported metadata:", json);

  // Could save to file or localStorage
  localStorage.setItem("computedChannelMetadata", json);
  console.log("✅ Metadata saved to localStorage");
}

// ============================================
// 7. IMPORT METADATA
// ============================================
function importMetadataExample() {
  const json = localStorage.getItem("computedChannelMetadata");

  if (json) {
    computedChannelMetadata.fromJSON(json);
    console.log("✅ Metadata loaded from localStorage");

    // Refresh sidebar to show imported channels
    const listContainer = document.getElementById("computed-channels-list");
    if (listContainer) {
      updateComputedChannelsSidebar(listContainer);
    }
  }
}

// ============================================
// 8. DELETE CHANNEL
// ============================================
function deleteChannelExample() {
  const channelId = "computed_0";

  if (computedChannelMetadata.delete(channelId)) {
    console.log(`✅ ${channelId} deleted`);

    // Refresh sidebar
    const listContainer = document.getElementById("computed-channels-list");
    if (listContainer) {
      updateComputedChannelsSidebar(listContainer);
    }
  }
}

// ============================================
// 9. UPDATE CHANNEL METADATA
// ============================================
function updateChannelMetadataExample() {
  const channelId = "computed_0";
  const currentMetadata = computedChannelMetadata.get(channelId);

  if (currentMetadata) {
    // Update specific fields
    const updated = {
      ...currentMetadata,
      color: "#4ECDC4", // Change color
      group: "Updated Group", // Change group
      stats: {
        ...currentMetadata.stats,
        mean: 250, // Update mean
      },
    };

    computedChannelMetadata.set(channelId, updated);
    console.log("✅ Metadata updated");

    // Refresh sidebar
    const listContainer = document.getElementById("computed-channels-list");
    if (listContainer) {
      updateComputedChannelsSidebar(listContainer);
    }
  }
}

// ============================================
// 10. BATCH OPERATIONS
// ============================================
function batchCreateChannelsExample() {
  const equations = [
    {
      id: "rms_voltages",
      name: "RMS Voltages",
      eq: "sqrt(a0^2 + a1^2 + a2^2)",
    },
    {
      id: "rms_currents",
      name: "RMS Currents",
      eq: "sqrt(a3^2 + a4^2 + a5^2)",
    },
    { id: "power_p", name: "Power P", eq: "a0*a3 + a1*a4 + a2*a5" },
  ];

  equations.forEach((item, idx) => {
    const color = ["#FF6B6B", "#4ECDC4", "#45B7D1"][idx];
    computedChannelMetadata.set(item.id, {
      name: item.name,
      equation: item.eq,
      color: color,
      group: "System Computations",
      unit: item.id.includes("current")
        ? "A"
        : item.id.includes("power")
        ? "W"
        : "V",
    });
  });

  console.log(`✅ Created ${equations.length} channels`);
}

// ============================================
// 11. FILTER CHANNELS BY CRITERIA
// ============================================
function filterChannelsExample() {
  const allChannels = computedChannelMetadata.getAll();

  // Filter by group
  const voltageChannels = allChannels.filter((ch) =>
    ch.group.includes("Voltage")
  );
  console.log(`Voltage channels: ${voltageChannels.length}`);

  // Filter by stats
  const highVarianceChannels = allChannels.filter(
    (ch) => ch.stats?.stdDev > 10
  );
  console.log(`High variance channels: ${highVarianceChannels.length}`);

  // Filter by name pattern
  const rmsChannels = allChannels.filter((ch) => ch.name.includes("RMS"));
  console.log(`RMS channels: ${rmsChannels.length}`);
}

// ============================================
// 12. CLEAR ALL METADATA
// ============================================
function clearAllMetadataExample() {
  computedChannelMetadata.clear();
  console.log("✅ All metadata cleared");

  // Refresh sidebar
  const listContainer = document.getElementById("computed-channels-list");
  if (listContainer) {
    updateComputedChannelsSidebar(listContainer);
  }
}

// ============================================
// USAGE IN YOUR CODE
// ============================================

// When equation is evaluated and saved:
// createComputedChannelExample();

// When displaying computed channels chart:
// createSidebarExample();

// When adding new channels:
// updateSidebarExample();

// When user wants to export:
// exportMetadataExample();

// When loading previously saved data:
// importMetadataExample();

// Export functions for use in other modules
export {
  createComputedChannelExample,
  retrieveMetadataExample,
  createSidebarExample,
  updateSidebarExample,
  exportMetadataExample,
  importMetadataExample,
  deleteChannelExample,
  updateChannelMetadataExample,
  batchCreateChannelsExample,
  filterChannelsExample,
  clearAllMetadataExample,
};
