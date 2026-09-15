export const PALETTE = [
  { name: "Rust Red", hex: "#b0413e" },
  { name: "Amber", hex: "#c0762c" },
  { name: "Mustard", hex: "#c19b2c" },
  { name: "Emerald", hex: "#4a8c52" },
  { name: "Teal", hex: "#2f8f83" },
  { name: "Royal Blue", hex: "#38699f" },
  { name: "Indigo", hex: "#52589f" },
  { name: "Royal Purple", hex: "#7b4b94" },
  { name: "Rose", hex: "#b85c79" },
  { name: "Coffee", hex: "#7a5230" },
  { name: "Olive", hex: "#6f7a2e" },
  { name: "Charcoal", hex: "#3a3733" },
];

export const CHIP_AMOUNTS = [32, 60, 50, 75, 90];

export const firstFreeColor = (takenHexes) => {
  const available = PALETTE.filter((c) => !takenHexes.includes(c.hex));
  if (available.length === 0) return PALETTE[Math.floor(Math.random() * PALETTE.length)].hex;
  return available[Math.floor(Math.random() * available.length)].hex;
};
