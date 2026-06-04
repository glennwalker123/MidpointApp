import { mixToRgb } from "./mixing.js";

// Each level hands the player a shelf of pigments (`palette`) and a hidden
// `recipe` — the exact ratio of pigments that produces the target. The target
// swatch is derived from that recipe, so it is always reachable. Difficulty
// climbs from two pigments to four, and from simple ratios to weighted ones.
//
// No level names its answer on screen; the only public hint is how many
// distinct pigments the target is built from.
const RAW = [
  { name: "Ember", palette: ["red", "yellow"], recipe: { red: 1, yellow: 1 } },
  { name: "Meadow", palette: ["yellow", "blue"], recipe: { yellow: 1, blue: 1 } },
  { name: "Heather", palette: ["red", "blue"], recipe: { red: 1, blue: 1 } },
  { name: "Rust", palette: ["red", "yellow"], recipe: { red: 2, yellow: 1 } },
  { name: "Moss", palette: ["red", "yellow", "blue"], recipe: { yellow: 2, blue: 1 } },
  { name: "Blush", palette: ["red", "yellow", "white"], recipe: { red: 1, yellow: 1, white: 1 } },
  { name: "Lagoon", palette: ["yellow", "blue", "white"], recipe: { yellow: 1, blue: 2 } },
  { name: "Loam", palette: ["red", "yellow", "blue"], recipe: { red: 1, yellow: 1, blue: 1 } },
  { name: "Rose Dust", palette: ["red", "yellow", "blue", "white"], recipe: { red: 2, yellow: 1, white: 2 } },
  { name: "Sage", palette: ["red", "yellow", "blue", "white"], recipe: { yellow: 2, blue: 1, white: 1 } },
  { name: "Taupe", palette: ["red", "yellow", "blue", "white"], recipe: { red: 1, yellow: 1, blue: 1, white: 1 } },
  { name: "Greige", palette: ["red", "yellow", "blue", "white"], recipe: { red: 1, yellow: 2, blue: 1, white: 2 } },
];

const COUNT_WORD = ["", "One", "Two", "Three", "Four"];

export const LEVELS = RAW.map((lvl) => {
  const distinct = Object.values(lvl.recipe).filter((c) => c > 0).length;
  return {
    ...lvl,
    target: mixToRgb(lvl.recipe),
    pigmentCount: distinct,
    hint: `${COUNT_WORD[distinct]} pigment${distinct > 1 ? "s" : ""}`,
  };
});
