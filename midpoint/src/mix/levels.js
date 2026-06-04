import { mixToRgb } from "./mixing.js";

// Each level hands the player a shelf of pigments (`palette`) and a hidden
// `recipe` — the exact ratio of pigments that produces the target. The target
// swatch is derived from that recipe, so it is always reachable. Difficulty
// climbs from two pigments to four, and from simple ratios to weighted ones.
//
// No level names its answer on screen; the only public hint is how many
// distinct pigments the target is built from.
// Spread across the hue wheel — green, orange, violet, teal, pink, forest,
// slate, aubergine, gold, mauve, olive, indigo — with only two warm targets.
// Later levels add a decoy pigment to the shelf (in `palette` but not in
// `recipe`), so more tubes does not mean more pigments are needed.
const RAW = [
  { name: "Meadow", palette: ["yellow", "blue"], recipe: { yellow: 1, blue: 1 } },
  { name: "Ember", palette: ["red", "yellow"], recipe: { red: 1, yellow: 1 } },
  { name: "Iris", palette: ["crimson", "blue"], recipe: { crimson: 1, blue: 1 } },
  { name: "Lagoon", palette: ["yellow", "blue"], recipe: { yellow: 1, blue: 2 } },
  { name: "Blush", palette: ["crimson", "blue", "white"], recipe: { crimson: 1, white: 3 } },
  { name: "Pine", palette: ["yellow", "blue", "black"], recipe: { yellow: 2, blue: 2, black: 1 } },
  { name: "Slate", palette: ["blue", "white", "black"], recipe: { blue: 2, white: 2, black: 1 } },
  { name: "Plum", palette: ["crimson", "blue", "black"], recipe: { crimson: 3, blue: 1, black: 1 } },
  { name: "Ochre", palette: ["red", "yellow", "blue", "black"], recipe: { red: 1, yellow: 3, black: 1 } },
  { name: "Heath", palette: ["crimson", "blue", "white", "black"], recipe: { crimson: 3, blue: 1, white: 3, black: 1 } },
  { name: "Sage", palette: ["yellow", "blue", "white", "black"], recipe: { yellow: 3, blue: 1, white: 2, black: 1 } },
  { name: "Dusk", palette: ["crimson", "blue", "white", "black"], recipe: { crimson: 1, blue: 2, black: 2, white: 1 } },
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
