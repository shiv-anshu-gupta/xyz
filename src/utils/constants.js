import { tailwindColors } from "./tailwindColors.js";

export const crosshairColors = [
  "red",
  "blue",
  "green",
  "magenta",
  "purple",
  "orange",
  "brown",
  "black",
  "pink",
  "yellow",
];

export const SI_UNITS = [
  { value: 1e-12, symbol: "p" },
  { value: 1e-9, symbol: "n" },
  { value: 1e-6, symbol: "µ" },
  { value: 1e-3, symbol: "m" },
  { value: 1, symbol: "" },
  { value: 1e3, symbol: "k" },
  { value: 1e6, symbol: "M" },
  { value: 1e9, symbol: "G" },
  { value: 1e12, symbol: "T" },
];

export const analogPalette = [
  // [0]: For white background (darker shades)
  [
    tailwindColors["red-600"],
    tailwindColors["blue-600"],
    tailwindColors["green-600"],
    tailwindColors["purple-700"],
    tailwindColors["orange-600"],
    tailwindColors["teal-600"],
    tailwindColors["amber-700"],
    tailwindColors["pink-600"],
    tailwindColors["slate-600"],
    tailwindColors["black"],
  ],
  // [1]: For dark background (lighter shades)
  [
    tailwindColors["red-300"],
    tailwindColors["blue-300"],
    tailwindColors["green-300"],
    tailwindColors["purple-300"],
    tailwindColors["orange-300"],
    tailwindColors["teal-300"],
    tailwindColors["amber-200"],
    tailwindColors["pink-300"],
    tailwindColors["slate-300"],
    tailwindColors["white"],
  ],
];

export const digitalPalette = [
  // [0]: For white background (darker shades)
  [
    tailwindColors["red-700"],
    tailwindColors["blue-700"],
    tailwindColors["green-700"],
    tailwindColors["purple-800"],
    tailwindColors["orange-700"],
    tailwindColors["amber-800"],
    tailwindColors["teal-700"],
    tailwindColors["pink-700"],
    tailwindColors["slate-700"],
    tailwindColors["black"],
  ],
  // [1]: For dark background (lighter shades)
  [
    tailwindColors["red-200"],
    tailwindColors["blue-200"],
    tailwindColors["green-200"],
    tailwindColors["purple-200"],
    tailwindColors["orange-200"],
    tailwindColors["amber-100"],
    tailwindColors["teal-200"],
    tailwindColors["pink-200"],
    tailwindColors["slate-200"],
    tailwindColors["white"],
  ],
];

// Computed Channels Palette - consistent across creation, storage, and rendering
export const computedPalette = [
  [
    tailwindColors["red-600"],
    tailwindColors["blue-600"],
    tailwindColors["green-600"],
    tailwindColors["purple-700"],
    tailwindColors["orange-600"],
    tailwindColors["teal-600"],
    tailwindColors["amber-700"],
    tailwindColors["pink-600"],
    tailwindColors["slate-600"],
    tailwindColors["black"],
  ],
  // [1]: For dark background (lighter shades)
  [
    tailwindColors["red-300"],
    tailwindColors["blue-300"],
    tailwindColors["green-300"],
    tailwindColors["purple-300"],
    tailwindColors["orange-300"],
    tailwindColors["teal-300"],
    tailwindColors["amber-200"],
    tailwindColors["pink-300"],
    tailwindColors["slate-300"],
    tailwindColors["white"],
  ],
];
