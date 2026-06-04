// ── Subtractive paint mixing ───────────────────────────────────────────────
// Pigments carry a coarse 6-band reflectance spectrum
//   [Blue, Cyan, Green, Yellow, Orange, Red].
// Mixing is a weighted geometric mean of reflectances (Beer–Lambert-ish), so it
// behaves like real pigment: blue + yellow → green, and the ratio shifts the hue.
// The result is a believable, slightly muted mix — not an additive RGB average.

export const PIGMENTS = {
  red: { name: "Vermilion", refl: [0.06, 0.05, 0.06, 0.3, 0.88, 0.95] },
  yellow: { name: "Cadmium Yellow", refl: [0.04, 0.08, 0.62, 0.97, 0.97, 0.88] },
  blue: { name: "Ultramarine", refl: [0.92, 0.82, 0.42, 0.06, 0.05, 0.07] },
  white: { name: "Titanium White", refl: [0.95, 0.95, 0.95, 0.95, 0.95, 0.95] },
};

// Band → linear-RGB response (tuned so an all-1 spectrum reads as white).
const WR = [0, 0, 0.05, 0.25, 0.65, 0.95];
const WG = [0.05, 0.35, 0.95, 0.8, 0.3, 0.1];
const WB = [0.95, 0.7, 0.2, 0.03, 0, 0];
const SR = WR.reduce((a, b) => a + b);
const SG = WG.reduce((a, b) => a + b);
const SB = WB.reduce((a, b) => a + b);

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

// drops: { pigmentId: count }. Returns [r,g,b] 0–255, or null when empty.
export function mixToRgb(drops) {
  const entries = Object.entries(drops).filter(([, c]) => c > 0);
  const total = entries.reduce((a, [, c]) => a + c, 0);
  if (total === 0) return null;

  const refl = new Array(6).fill(1);
  for (let i = 0; i < 6; i++) {
    for (const [id, c] of entries) refl[i] *= Math.pow(PIGMENTS[id].refl[i], c / total);
  }

  let r = 0, g = 0, b = 0;
  for (let i = 0; i < 6; i++) {
    r += WR[i] * refl[i];
    g += WG[i] * refl[i];
    b += WB[i] * refl[i];
  }
  const enc = (v) => Math.round(255 * clamp(Math.pow(clamp(v), 1 / 1.6)));
  return [enc(r / SR), enc(g / SG), enc(b / SB)];
}

// ── sRGB helpers ────────────────────────────────────────────────────────────
export const rgbStr = (c) => (c ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : "transparent");

export const shade = (c, amt) => {
  // amt > 0 lightens toward white, amt < 0 darkens toward black.
  const t = (x) => (amt >= 0 ? x + (255 - x) * amt : x * (1 + amt));
  return `rgb(${Math.round(t(c[0]))}, ${Math.round(t(c[1]))}, ${Math.round(t(c[2]))})`;
};

// ── CIELAB + ΔE for matching / feedback ─────────────────────────────────────
const lin = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

export function rgb2lab([r, g, b]) {
  r = lin(r); g = lin(g); b = lin(b);
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export const deltaE = (a, b) => {
  const A = rgb2lab(a), B = rgb2lab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};

// A match is when the mix lands inside this perceptual radius of the target.
export const MATCH_THRESHOLD = 3.5;

// A single, gentle directional nudge toward the target — the "colour coach".
export function hintFor(mix, target) {
  if (!mix) return "Add a drop to begin.";
  const m = rgb2lab(mix), t = rgb2lab(target);
  const dL = t[0] - m[0]; // + → target is lighter
  const da = t[1] - m[1]; // + → target leans red
  const db = t[2] - m[2]; // + → target leans yellow (warm)
  const dC = Math.hypot(t[1], t[2]) - Math.hypot(m[1], m[2]); // + → target richer

  const axes = [
    { k: Math.abs(dL) / 6, msg: dL > 0 ? "A shade too dark." : "A shade too pale." },
    { k: Math.abs(dC) / 7, msg: dC > 0 ? "A little muted — needs life." : "A touch too vivid." },
    { k: Math.abs(db) / 8, msg: db > 0 ? "Wants more warmth." : "Pull it cooler." },
    { k: Math.abs(da) / 8, msg: da > 0 ? "Leans a hair too green." : "Leans a hair too red." },
  ].sort((x, y) => y.k - x.k);

  return axes[0].k < 0.5 ? "So close — nearly there." : axes[0].msg;
}
