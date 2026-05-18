import { useState, useRef, useMemo, useEffect } from "react";

// ============================================================================
// AUDIO ENGINE — color-tuned tones and ambient pad
// ============================================================================

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.padNodes = null;
    this.muted = false;
  }

  ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.28;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.masterGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.setTargetAtTime(m ? 0 : 0.28, t, 0.2);
    }
  }

  // Pentatonic (C major pentatonic) — always consonant
  colorToFreq(color) {
    const notes = [261.63, 293.66, 329.63, 392.00, 440.00]; // C D E G A
    // Map lightness (0..1) across two octaves of pentatonic
    const idx = Math.max(0, Math.min(9, Math.floor(color.l * 10)));
    const note = notes[idx % 5];
    const oct = Math.floor(idx / 5);
    return note * Math.pow(2, oct - 1); // start an octave low
  }

  playTone(color, opts = {}) {
    if (!this.ensureContext()) return;
    if (this.muted) return;
    const duration = opts.duration ?? 2.2;
    const t = this.ctx.currentTime;
    const freq = this.colorToFreq(color);

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const gain = this.ctx.createGain();
    const peak = 0.35;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    // Subtle harmonic at the octave whose level rises with chroma
    if (color.c > 0.02) {
      const harm = this.ctx.createOscillator();
      harm.type = "sine";
      harm.frequency.value = freq * 2;
      const hg = this.ctx.createGain();
      const hPeak = Math.min(0.18, color.c * 0.7);
      hg.gain.setValueAtTime(0.0001, t);
      hg.gain.linearRampToValueAtTime(hPeak, t + 0.18);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + duration * 0.85);
      harm.connect(hg);
      hg.connect(this.masterGain);
      harm.start(t);
      harm.stop(t + duration);
    }

    osc.start(t);
    osc.stop(t + duration);
  }

  startPad(color) {
    if (!this.ensureContext()) return;
    if (this.muted) return;
    this.stopPad();
    const t = this.ctx.currentTime;
    const freq = this.colorToFreq(color) * 0.5; // pad lives an octave down

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const osc3 = this.ctx.createOscillator();
    osc1.type = "sine";
    osc2.type = "sine";
    osc3.type = "sine";
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 1.005; // detune for warmth
    osc3.frequency.value = freq * 1.5;   // fifth above for openness

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.7;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 4); // slow swell

    osc1.connect(filter);
    osc2.connect(filter);

    const osc3Gain = this.ctx.createGain();
    osc3Gain.gain.value = 0.3;
    osc3.connect(osc3Gain);
    osc3Gain.connect(filter);

    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(t);
    osc2.start(t);
    osc3.start(t);

    this.padNodes = { osc1, osc2, osc3, gain, osc3Gain, filter };
  }

  stopPad() {
    if (!this.padNodes || !this.ctx) return;
    const t = this.ctx.currentTime;
    const { osc1, osc2, osc3, gain } = this.padNodes;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 1.6);
    osc1.stop(t + 1.8);
    osc2.stop(t + 1.8);
    osc3.stop(t + 1.8);
    this.padNodes = null;
  }

  // Generate brown noise — softer, lower-spectrum than white noise, like wind or distant water
  createBrownNoise(seconds = 6) {
    const bufferSize = this.ctx.sampleRate * seconds;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  // Abstract nature ambient: filtered brown noise (wind/water) + a slow swelling low tone
  startAmbient() {
    if (!this.ensureContext()) return;
    if (this.ambientNodes) return; // already running
    const t = this.ctx.currentTime;

    // Brown noise base
    const noiseBuffer = this.createBrownNoise(8);
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    noiseSrc.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 380;
    filter.Q.value = 0.5;

    // Very slow filter modulation — the "breathing" of the wind
    const filterLfo = this.ctx.createOscillator();
    filterLfo.type = "sine";
    filterLfo.frequency.value = 0.04; // ~25 second cycle
    const filterLfoGain = this.ctx.createGain();
    filterLfoGain.gain.value = 140;
    filterLfo.connect(filterLfoGain);
    filterLfoGain.connect(filter.frequency);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(0.06, t + 6); // very slow fade in

    noiseSrc.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    // Subtle low drone — distant rumble, like a faraway thing existing
    const sub = this.ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = 98; // low G
    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0, t);

    // LFO that swells the sub in and out over ~50 seconds
    const subLfo = this.ctx.createOscillator();
    subLfo.type = "sine";
    subLfo.frequency.value = 0.02;
    const subLfoGain = this.ctx.createGain();
    subLfoGain.gain.value = 0.032;
    subLfo.connect(subLfoGain);
    subLfoGain.connect(subGain.gain);

    // Base offset for sub so it never fully disappears
    const subOffset = this.ctx.createConstantSource();
    subOffset.offset.setValueAtTime(0, t);
    subOffset.offset.linearRampToValueAtTime(0.042, t + 10);
    subOffset.connect(subGain.gain);

    sub.connect(subGain);
    subGain.connect(this.masterGain);

    noiseSrc.start(t);
    filterLfo.start(t);
    sub.start(t);
    subLfo.start(t);
    subOffset.start(t);

    this.ambientNodes = {
      noiseSrc, filter, filterLfo, filterLfoGain, noiseGain,
      sub, subGain, subLfo, subLfoGain, subOffset,
    };
  }

  stopAmbient() {
    if (!this.ambientNodes || !this.ctx) return;
    const t = this.ctx.currentTime;
    const { noiseSrc, filterLfo, noiseGain, sub, subGain, subLfo, subOffset } = this.ambientNodes;

    noiseGain.gain.cancelScheduledValues(t);
    noiseGain.gain.setValueAtTime(noiseGain.gain.value, t);
    noiseGain.gain.linearRampToValueAtTime(0, t + 3);

    subGain.gain.cancelScheduledValues(t);
    subGain.gain.setTargetAtTime(0, t, 1);

    setTimeout(() => {
      try {
        noiseSrc.stop();
        filterLfo.stop();
        sub.stop();
        subLfo.stop();
        subOffset.stop();
      } catch (e) {}
    }, 3150);

    this.ambientNodes = null;
  }

  // Continuous touch tone — deep ambient pad that follows the candidate color's lightness while finger is down.
  // Mono chorus pad + binaural beats panned hard L/R (~7Hz theta offset) + two LFOs (fast tremolo + 0.1Hz resonant breath).
  touchUpdate(color) {
    if (!this.ensureContext()) return;
    if (this.muted) return;
    const t = this.ctx.currentTime;

    // Deep range — bass to baritone, well below the lock-in tones so they feel distinct
    const minFreq = 90;   // ~F#2
    const maxFreq = 260;  // ~C4
    const targetFreq = minFreq * Math.pow(maxFreq / minFreq, color.l);

    // More chroma → wider detune → more shimmer/chorusing in the sound
    const detune = 0.003 + color.c * 0.018;

    // Binaural beat offset — ~7Hz, in the theta range associated with deep relaxation
    const binauralOffset = 7;

    if (!this.touchNodes) {
      // CENTER PAD: three sines slightly detuned for natural chorus and beating
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const osc3 = this.ctx.createOscillator();
      osc1.type = "sine";
      osc2.type = "sine";
      osc3.type = "sine";
      osc1.frequency.value = targetFreq;
      osc2.frequency.value = targetFreq * (1 + detune);
      osc3.frequency.value = targetFreq * (1 - detune);

      // Sub-octave for warmth — gives the sound floor
      const sub = this.ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = targetFreq * 0.5;
      const subGain = this.ctx.createGain();
      subGain.gain.value = 0.5;
      sub.connect(subGain);

      // Low-pass to remove anything that might creep up
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 600;
      filter.Q.value = 0.5;

      osc1.connect(filter);
      osc2.connect(filter);
      osc3.connect(filter);
      subGain.connect(filter);

      // BINAURAL BEAT LAYER: pure sines panned hard L/R with a small frequency offset.
      // The brain perceives a ~7Hz phantom rhythm (theta range, relaxation-associated).
      // Only effective with headphones — with speakers, the tones mix and the effect is lost.
      const binL = this.ctx.createOscillator();
      const binR = this.ctx.createOscillator();
      binL.type = "sine";
      binR.type = "sine";
      binL.frequency.value = targetFreq;
      binR.frequency.value = targetFreq + binauralOffset;

      const binLGain = this.ctx.createGain();
      const binRGain = this.ctx.createGain();
      binLGain.gain.value = 0.35;
      binRGain.gain.value = 0.35;

      const panL = this.ctx.createStereoPanner();
      const panR = this.ctx.createStereoPanner();
      panL.pan.value = -1;
      panR.pan.value = 1;

      binL.connect(binLGain);
      binR.connect(binRGain);
      binLGain.connect(panL);
      binRGain.connect(panR);

      // Master gain with slow attack
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.060, t + 0.7);

      // Fast tremolo (~3.3s cycle) — surface texture, like a held breath
      const tremLfo = this.ctx.createOscillator();
      tremLfo.type = "sine";
      tremLfo.frequency.value = 0.3;
      const tremLfoGain = this.ctx.createGain();
      tremLfoGain.gain.value = 0.010;
      tremLfo.connect(tremLfoGain);
      tremLfoGain.connect(gain.gain);

      // RESONANT BREATH LFO — exactly 6 breaths per minute (0.1Hz, 10s cycle).
      // 0.1Hz is the "resonant breathing rate" linked in HRV research to maximum vagal tone
      // and parasympathetic activation. Sound subtly swells with each ten-second breath.
      const breathLfo = this.ctx.createOscillator();
      breathLfo.type = "sine";
      breathLfo.frequency.value = 0.1;
      const breathLfoGain = this.ctx.createGain();
      breathLfoGain.gain.value = 0.022;
      breathLfo.connect(breathLfoGain);
      breathLfoGain.connect(gain.gain);

      filter.connect(gain);
      panL.connect(gain);
      panR.connect(gain);
      gain.connect(this.masterGain);

      osc1.start(t);
      osc2.start(t);
      osc3.start(t);
      sub.start(t);
      binL.start(t);
      binR.start(t);
      tremLfo.start(t);
      breathLfo.start(t);

      this.touchNodes = {
        osc1, osc2, osc3, sub, filter,
        binL, binR, panL, panR,
        tremLfo, breathLfo, gain,
      };
    } else {
      // Slow, meditative glide between colors
      const glide = 0.22;
      this.touchNodes.osc1.frequency.setTargetAtTime(targetFreq, t, glide);
      this.touchNodes.osc2.frequency.setTargetAtTime(targetFreq * (1 + detune), t, glide);
      this.touchNodes.osc3.frequency.setTargetAtTime(targetFreq * (1 - detune), t, glide);
      this.touchNodes.sub.frequency.setTargetAtTime(targetFreq * 0.5, t, glide);
      // Keep binaural offset constant (7Hz) across the range — slide both ears together
      this.touchNodes.binL.frequency.setTargetAtTime(targetFreq, t, glide);
      this.touchNodes.binR.frequency.setTargetAtTime(targetFreq + binauralOffset, t, glide);
    }
  }

  touchStop() {
    if (!this.touchNodes || !this.ctx) return;
    const t = this.ctx.currentTime;
    const {
      osc1, osc2, osc3, sub,
      binL, binR,
      tremLfo, breathLfo, gain,
    } = this.touchNodes;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 1.3); // long release — drifts away
    osc1.stop(t + 1.5);
    osc2.stop(t + 1.5);
    osc3.stop(t + 1.5);
    sub.stop(t + 1.5);
    binL.stop(t + 1.5);
    binR.stop(t + 1.5);
    tremLfo.stop(t + 1.5);
    breathLfo.stop(t + 1.5);
    this.touchNodes = null;
  }

  // Button arrival — soft low G3 tone that announces a button has appeared.
  // Pentatonic-aligned with lock/truth tones so it sits in the same musical family.
  buttonArrival() {
    if (!this.ensureContext()) return;
    if (this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 196; // G3
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 0.5); // slow attack — never startles
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 2.0);
  }

  // Button tap — octave above arrival (G4). Quick, bright, brief — the answer.
  buttonTap() {
    if (!this.ensureContext()) return;
    if (this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 392; // G4 — octave above arrival
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.20, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.6);
  }
}

// ============================================================================
// DATA — Origin prologue + 12 themed chapters, chronologically ordered
// ============================================================================

const LEVELS = [
  {
    id: 1,
    name: "Origin",
    description: "How colour entered language.",
    prologue: true,
    tutorialHint: true,
    intro: "Languages around the world name colours in roughly the same order. Light and dark come first \u2014 every known language has words for these. Then red. Then green or yellow. Blue comes much later, sometimes thousands of years later. Brown, pink, purple, and grey come last.\n\nThis is how humans learned to name what they saw. Three short challenges follow, in the order colour entered language: a grey, a red, and a blue.",
    bg: { l: 0.08, c: 0.005, h: 80 },
    challenges: [
      { a: { l: 0.15, c: 0.005, h: 80 }, b: { l: 0.92, c: 0.005, h: 80 },
        midpointName: "Grey",
        fact: "Some languages have only two words for colour. The Dani people of Papua New Guinea use just two \u2014 one for cool, dark colours and one for warm, light colours. Every colour is one or the other. It is the smallest colour vocabulary that has been recorded." },
      { a: { l: 0.30, c: 0.20, h: 20 }, b: { l: 0.60, c: 0.20, h: 20 },
        midpointName: "Red",
        fact: "After light and dark, red is the next colour every language names. In a study of nearly a hundred languages from every continent, red was the third basic colour word in almost every one. It seems to be the first colour our eyes need a name for." },
      { a: { l: 0.50, c: 0.15, h: 220 }, b: { l: 0.45, c: 0.17, h: 280 },
        midpointName: "Blue",
        fact: "Blue is usually the last colour to enter a language. Homer never used a word for it \u2014 in the Iliad and Odyssey, the sea is 'wine-dark' and the sky is 'bronze'. The Hebrew Bible has no general word for blue. Egypt was an exception, with a word for blue five thousand years ago and the first man-made blue paint." },
    ],
    bridge: "Words for colour are new in the long history of colour. The pigments of stone were already what they are when humans first arrived.",
  },
  {
    id: 2,
    name: "Stone",
    description: "The colours of stillness. Patience hardened, pressed, and split.",
    intro: "Stone keeps its colour longer than anything. Some of what you'll find here was already this colour when the first humans walked. Some remembers the slow cooling of lava. Some is the bones of ancient seas, pressed together for a hundred million years. Patience, hardened.",
    bg: { l: 0.07, c: 0.01, h: 260 }, // neutral cool
    challenges: [
      { a: { l: 0.45, c: 0.03, h: 260 }, b: { l: 0.65, c: 0.01, h: 280 },
        midpointName: "Granite",
        fact: "Granite cools slowly in the dark, miles below the surface. By the time you see it, it has been a stone for a hundred million years." },
      { a: { l: 0.35, c: 0.05, h: 250 }, b: { l: 0.55, c: 0.01, h: 230 },
        midpointName: "Slate",
        fact: "Slate splits into perfect flat sheets. Children's first chalkboards were made from it — a stone that holds, then releases, what it learns." },
      { a: { l: 0.70, c: 0.03, h: 70 }, b: { l: 0.90, c: 0.01, h: 90 },
        midpointName: "Pumice",
        fact: "The only stone that floats. Born in the throat of a volcano, full of air, light enough to drift across an ocean. The Romans cleaned their skin with it." },
      { a: { l: 0.15, c: 0.03, h: 260 }, b: { l: 0.35, c: 0.01, h: 240 },
        midpointName: "Basalt",
        fact: "Where lava meets the sea, basalt remembers the shape of the cooling. The Giant's Causeway in Ireland is forty thousand hexagons of frozen heat." },
      { a: { l: 0.88, c: 0.02, h: 60 }, b: { l: 0.96, c: 0.00, h: 80 },
        midpointName: "Marble",
        fact: "Michelangelo said every block of marble had a statue inside it, waiting. His job was to set it free. The Pietà was carved from a single piece of Carrara stone." },
    ],
  },
  {
    id: 3,
    name: "Earth",
    description: "What the ground gave us. The oldest pigments, mined and burnt and crushed.",
    intro: "Look down. The first colours we made were beneath us all along — pigments rubbed from soft stone, dust from baked hills, soil roasted dark in clay kilns. Mud was our first paintbox. It still is.",
    bg: { l: 0.08, c: 0.02, h: 50 }, // warm
    challenges: [
      { a: { l: 0.40, c: 0.14, h: 25 }, b: { l: 0.60, c: 0.10, h: 55 },
        midpointName: "Sienna",
        fact: "Named for the city of Siena, where the soil bakes orange in the Tuscan sun. Painters have mined those hills for the pigment since the Renaissance." },
      { a: { l: 0.60, c: 0.13, h: 60 }, b: { l: 0.80, c: 0.09, h: 90 },
        midpointName: "Ochre",
        fact: "The oldest pigment we still use. Ochre painted the Lascaux caves thirty thousand years ago. Every culture, every continent — we have always reached for this color first." },
      { a: { l: 0.25, c: 0.10, h: 30 }, b: { l: 0.45, c: 0.06, h: 70 },
        midpointName: "Umber",
        fact: "Raw umber comes from the soils of Umbria. Roasted in a kiln, it becomes burnt umber — darker, redder. The earth changes as it remembers fire." },
      { a: { l: 0.60, c: 0.07, h: 145 }, b: { l: 0.80, c: 0.03, h: 115 },
        midpointName: "Sage",
        fact: "The plant, the wisdom, the color. The same word for the herb that clears the air and the elder who clarifies the mind." },
      { a: { l: 0.45, c: 0.15, h: 25 }, b: { l: 0.65, c: 0.11, h: 45 },
        midpointName: "Terracotta",
        fact: "Baked earth. The first humans to fire clay discovered that mud could remember its shape. Civilization began the day a pot held water." },
    ],
  },
  {
    id: 4,
    name: "Light",
    description: "Quiet whites. The colours that ask nothing.",
    intro: "Some colours arrive quietly. Built around a grain of sand. Scraped from calfskin until it could hold ink. Carved by oceans into shells, by time into tusks. These are the colours of long looking.",
    bg: { l: 0.10, c: 0.01, h: 80 }, // softest warm
    challenges: [
      { a: { l: 0.88, c: 0.04, h: 70 }, b: { l: 0.98, c: 0.02, h: 90 },
        midpointName: "Ivory",
        fact: "Ivory means the tooth of an elephant, the tusk of a walrus. It also means an old, warm white. The color was named for the thing it took to make it." },
      { a: { l: 0.87, c: 0.04, h: 250 }, b: { l: 0.97, c: 0.02, h: 230 },
        midpointName: "Pearl",
        fact: "A pearl is an oyster's response to pain. A grain of sand enters; the oyster coats it in layers of nacre, year after year, smoothing what hurt. Beauty as patience." },
      { a: { l: 0.80, c: 0.10, h: 75 }, b: { l: 0.96, c: 0.06, h: 95 },
        midpointName: "Champagne",
        fact: "Named for the region in France, not the drink. The chalky soil there reflects sunlight in a way no other earth does." },
      { a: { l: 0.84, c: 0.06, h: 20 }, b: { l: 0.96, c: 0.02, h: 40 },
        midpointName: "Vellum",
        fact: "Vellum is calfskin, scraped and stretched until it could hold ink. Every medieval book was the body of an animal. To read was to touch the skin of a life." },
      { a: { l: 0.86, c: 0.04, h: 65 }, b: { l: 0.98, c: 0.00, h: 85 },
        midpointName: "Bone",
        fact: "Bone white is the color of patience. Carved by oceans into shells, by time into ivory, by memory into the moon." },
    ],
  },
  {
    id: 5,
    name: "Night",
    description: "Where light recedes. The dark we have words for.",
    intro: "When the eye gives up on light, it doesn't give up on colour. The dark has names. Every depth we've known long enough to remember has been given a word for it. Even silence has a sound. Even darkness has a hue.",
    bg: { l: 0.06, c: 0.03, h: 270 }, // deep indigo
    challenges: [
      { a: { l: 0.20, c: 0.06, h: 260 }, b: { l: 0.40, c: 0.02, h: 230 },
        midpointName: "Eigengrau",
        fact: "The dark grey you see when your eyes are closed. The color of your own optic noise. Even silence has a sound. Even darkness has a hue." },
      { a: { l: 0.20, c: 0.12, h: 340 }, b: { l: 0.40, c: 0.08, h: 0 },
        midpointName: "Sloe",
        fact: "The wild plum of British hedgerows. Pickers wait until after the first frost. The fruit sweetens only when the world tries to kill it." },
      { a: { l: 0.10, c: 0.02, h: 20 }, b: { l: 0.26, c: 0.00, h: 40 },
        midpointName: "Lampblack",
        fact: "The soot collected from oil lamps. The pigment of Chinese ink for two thousand years. Calligraphers said the blackest ink came from the slowest flame." },
      { a: { l: 0.08, c: 0.03, h: 40 }, b: { l: 0.16, c: 0.01, h: 60 },
        midpointName: "Pitch",
        fact: "What wooden ships were sealed with — dark, viscous, eternal. Pitch-black is the deepest dark we have a word for." },
      { a: { l: 0.20, c: 0.14, h: 270 }, b: { l: 0.40, c: 0.10, h: 250 },
        midpointName: "Indigo",
        fact: "True indigo comes from a single plant, fermented in vats for weeks. The dye is colorless until the fabric is lifted into air — a reaction with the sky itself." },
    ],
  },
  {
    id: 6,
    name: "Bloom",
    description: "What flowers, fruits, and roots gave us. The dyes of the soft and growing world.",
    intro: "Every flower is a small announcement. Every fruit, a long agreement with the sun. The dyes pulled from these soft things have outlasted the empires that prized them — paid for in fields of crocuses, in vats of crushed roots, in patience.",
    bg: { l: 0.08, c: 0.02, h: 15 }, // warm pink
    challenges: [
      { a: { l: 0.65, c: 0.13, h: 45 }, b: { l: 0.91, c: 0.19, h: 105 },
        midpointName: "Saffron",
        fact: "Each thread is hand-picked from a crocus that blooms for one week each autumn. Seventy-five thousand flowers for a single pound. Buddhist robes are dyed this color to remember the cost of attention." },
      { a: { l: 0.55, c: 0.19, h: 30 }, b: { l: 0.75, c: 0.15, h: 50 },
        midpointName: "Persimmon",
        fact: "Wild persimmons taste like soap until the first frost transforms them. Some things only ripen through cold." },
      { a: { l: 0.45, c: 0.23, h: 15 }, b: { l: 0.65, c: 0.19, h: 35 },
        midpointName: "Cinnabar",
        fact: "Sacred and toxic. Ancient Chinese alchemists believed cinnabar held the secret to immortality and mixed it with gold. They all died young." },
      { a: { l: 0.40, c: 0.20, h: 5 }, b: { l: 0.60, c: 0.16, h: 25 },
        midpointName: "Madder",
        fact: "Rose madder is squeezed from the roots of a humble climbing plant. The Egyptians dyed mummy wrappings with it. The color outlived the kings." },
      { a: { l: 0.25, c: 0.16, h: 300 }, b: { l: 0.45, c: 0.10, h: 340 },
        midpointName: "Tyrian Purple",
        fact: "Ten thousand sea snails were crushed for a single gram. The Phoenicians built an empire on this color. Emperors wore it. Nothing else came close." },
    ],
  },
  {
    id: 7,
    name: "Beast",
    description: "What was taken from living things. The oldest reds and a few darker stories.",
    intro: "Where the flower chapter was plants, this is animals. For most of recorded history, the deepest reds came from crushed insects, the deepest purples from sea snails, the inks from squid and the blacks from charred bone. Every great colour of antiquity has a body behind it.",
    bg: { l: 0.07, c: 0.025, h: 10 }, // bloody warm
    challenges: [
      { a: { l: 0.35, c: 0.20, h: 15 }, b: { l: 0.55, c: 0.24, h: 25 },
        midpointName: "Cochineal",
        fact: "A red made from beetles native to Mexican cacti. Seventy thousand are crushed for a single pound of dye. After the Spanish conquest, it became the second most valuable export from the New World, after silver." },
      { a: { l: 0.25, c: 0.10, h: 30 }, b: { l: 0.45, c: 0.06, h: 50 },
        midpointName: "Sepia",
        fact: "From the ink sac of cuttlefish. The Romans wrote with it. Victorian photographers toned their prints with it. The colour of memory in old photographs is, quite literally, the ink of a frightened mollusc." },
      { a: { l: 0.20, c: 0.05, h: 30 }, b: { l: 0.40, c: 0.02, h: 60 },
        midpointName: "Bone Black",
        fact: "Made by charring animal bones in the absence of oxygen. Used by Velázquez and Rembrandt for the deepest shadows. The blackest of the natural blacks — and the densest, because it carries calcium." },
      { a: { l: 0.40, c: 0.18, h: 0 }, b: { l: 0.60, c: 0.14, h: 20 },
        midpointName: "Kermes",
        fact: "Before cochineal crossed the ocean, Europe got its scarlet from this Mediterranean insect. Cardinals' robes, royal cloaks, illuminated manuscripts — all from kermes. The word 'crimson' comes from its name." },
      { a: { l: 0.30, c: 0.14, h: 20 }, b: { l: 0.50, c: 0.10, h: 40 },
        midpointName: "Mummy Brown",
        fact: "A brown pigment made from ground-up Egyptian mummies — human and feline. It was used by European painters for three hundred years. Production ended in the twentieth century only because the mummies ran out." },
    ],
  },
  {
    id: 8,
    name: "Sea",
    description: "What water and salt make slowly. The patient chemistry of waves.",
    intro: "The sea taught us patience and chemistry. Salt air greens copper over decades. Stones brought across oceans grind down into the rarest blue we knew. Every colour that follows came from water, or from waiting for water to do its slow work.",
    bg: { l: 0.07, c: 0.02, h: 230 }, // cool
    challenges: [
      { a: { l: 0.75, c: 0.08, h: 200 }, b: { l: 0.95, c: 0.02, h: 150 },
        midpointName: "Sea Foam",
        fact: "Old sailors believed sea foam was the souls of dolphins. Every wave breaks into a thousand brief lives, then returns to the sea." },
      { a: { l: 0.50, c: 0.13, h: 200 }, b: { l: 0.80, c: 0.07, h: 150 },
        midpointName: "Verdigris",
        fact: "The Statue of Liberty turned this color over thirty years, breath by breath of salt air. Verdigris is copper's slow farewell to its old self." },
      { a: { l: 0.25, c: 0.18, h: 260 }, b: { l: 0.45, c: 0.14, h: 280 },
        midpointName: "Ultramarine",
        fact: "Made from lapis lazuli, ultramarine was once worth more than gold. Renaissance painters reserved it for the Virgin Mary's robes. The patron paid extra for every drop." },
      { a: { l: 0.62, c: 0.06, h: 250 }, b: { l: 0.82, c: 0.02, h: 230 },
        midpointName: "Glaucous",
        fact: "The dusty bloom on grapes and plums has its own name. From Greek glaukos — the color of olive trees in moonlight." },
      { a: { l: 0.55, c: 0.15, h: 220 }, b: { l: 0.75, c: 0.11, h: 240 },
        midpointName: "Cerulean",
        fact: "From the Latin caeruleum — the color of cloudless sky. The first synthetic cerulean was invented in 1789. Until then, the sky's color could not be captured at all." },
    ],
  },
  {
    id: 9,
    name: "Empire",
    description: "Colours that meant power. Who was allowed to wear them.",
    intro: "For most of history, the brightest colours were reserved by law for the most powerful. Some emperors executed people for wearing the wrong shade. Some colours took whole industries to produce, and only the richest could afford the result. What follows is the colour of permission.",
    bg: { l: 0.08, c: 0.035, h: 50 }, // imperial gold
    challenges: [
      { a: { l: 0.70, c: 0.18, h: 80 }, b: { l: 0.88, c: 0.22, h: 95 },
        midpointName: "Imperial Yellow",
        fact: "The colour of the Chinese imperial family for five centuries. Worn only by the emperor, his eldest son, and their immediate household. Anyone else who wore it could be executed. The yellow came from a dye called gamboge — tree resin from Cambodia." },
      { a: { l: 0.30, c: 0.20, h: 20 }, b: { l: 0.50, c: 0.18, h: 5 },
        midpointName: "Cardinal",
        fact: "The deep red of cardinals in the Catholic Church, deliberately chosen to signal a willingness to die for the faith. The colour was originally made from kermes insects. Cardinals were quite literally dressed in blood." },
      { a: { l: 0.35, c: 0.18, h: 250 }, b: { l: 0.55, c: 0.16, h: 270 },
        midpointName: "Royal Blue",
        fact: "The colour of European monarchs after ultramarine became too expensive. Made from cobalt and prussian blue. The British royal family still uses it in heraldry, as a softer alternative to the older imperial purple." },
      { a: { l: 0.85, c: 0.20, h: 95 }, b: { l: 0.95, c: 0.24, h: 105 },
        midpointName: "Hi-Vis",
        fact: "The modern empire. Engineered to capture human attention more reliably than any natural colour, hi-vis yellow-green is now the official colour of authority — police, construction, emergency. We obey it without noticing." },
      { a: { l: 0.40, c: 0.10, h: 35 }, b: { l: 0.60, c: 0.06, h: 55 },
        midpointName: "Khaki",
        fact: "From the Hindi word for dust. British soldiers in nineteenth-century India dyed their red coats with mud and tea because the red made them too easy to shoot. The colour of empire became, in the end, the colour of trying not to be seen." },
    ],
  },
  {
    id: 10,
    name: "Garden",
    description: "The widest hue family. The one the eye reads least precisely.",
    intro: "Of all the colour families, green is the one the eye distinguishes least well — a quirk of perception known since the 1940s. So this chapter will feel harder than the others, and that is not your fault. It is a hundred-year-old finding of vision science. Take your time.",
    bg: { l: 0.07, c: 0.025, h: 140 }, // deep forest
    challenges: [
      { a: { l: 0.55, c: 0.12, h: 110 }, b: { l: 0.75, c: 0.08, h: 130 },
        midpointName: "Olive",
        fact: "The colour of unripe fruit, of military uniforms, of the trees that fed the Mediterranean. The branch a dove brought back to Noah was olive. Peace, by the oldest metaphor we have, is the colour of a fruit not yet ready." },
      { a: { l: 0.30, c: 0.12, h: 140 }, b: { l: 0.50, c: 0.16, h: 150 },
        midpointName: "Viridian",
        fact: "A chrome-based green, brighter and more stable than anything before it. The painters of the late nineteenth century — Cézanne, Monet, Pissarro — built their gardens out of viridian. It was the first green that stayed green." },
      { a: { l: 0.20, c: 0.10, h: 150 }, b: { l: 0.40, c: 0.14, h: 160 },
        midpointName: "Forest",
        fact: "A name borrowed from the deep parts of the wood, where the canopy filters the light to a single wavelength. The eye reads only one tree, then another, then the dark between." },
      { a: { l: 0.70, c: 0.22, h: 120 }, b: { l: 0.90, c: 0.18, h: 105 },
        midpointName: "Chartreuse",
        fact: "Named after a French liqueur made in secret by Carthusian monks since 1737. The recipe — one hundred and thirty herbs — is known to only two people at any time. The colour exists because of a vow of silence." },
      { a: { l: 0.45, c: 0.10, h: 130 }, b: { l: 0.65, c: 0.06, h: 145 },
        midpointName: "Celadon",
        fact: "A pale green glaze on Chinese pottery, prized for a thousand years because it resembled jade. The Korean and Japanese versions are subtly different shades, each its own discipline. The word comes from a French play, not from any of those countries." },
    ],
  },
  {
    id: 11,
    name: "Dusk",
    description: "The hour between. The colours of becoming.",
    intro: "The hour between. Light is leaving but not yet gone. The colours here are not day, not night — they are becoming. A fly held inside resin for forty million years. A dye found by an eighteen-year-old by accident. The slow blue of unfinished thoughts.",
    bg: { l: 0.08, c: 0.025, h: 320 }, // mauve dusk
    challenges: [
      { a: { l: 0.55, c: 0.19, h: 55 }, b: { l: 0.75, c: 0.15, h: 75 },
        midpointName: "Amber",
        fact: "Fossilized tree resin. Some pieces are forty million years old. Inside, sometimes, an insect — perfectly preserved in the moment it stopped moving." },
      { a: { l: 0.40, c: 0.15, h: 35 }, b: { l: 0.60, c: 0.11, h: 55 },
        midpointName: "Cinnamon",
        fact: "The inner bark of a small tree from Sri Lanka. The Romans paid more for it than for gold. Marco Polo traveled half the world to find where it grew." },
      { a: { l: 0.55, c: 0.12, h: 310 }, b: { l: 0.75, c: 0.08, h: 330 },
        midpointName: "Mauve",
        fact: "The first synthetic dye, discovered by accident by an eighteen-year-old chemist in 1856. He was trying to make malaria medicine. He made a color instead." },
      { a: { l: 0.48, c: 0.18, h: 310 }, b: { l: 0.68, c: 0.14, h: 330 },
        midpointName: "Heliotrope",
        fact: "Heliotrope means turning toward the sun. The flower follows the light across the sky each day. The color is the soft purple of its petals at evening." },
      { a: { l: 0.35, c: 0.08, h: 300 }, b: { l: 0.55, c: 0.04, h: 280 },
        midpointName: "Gloaming",
        fact: "The gloaming is the hour between sunset and dark. In Scotland, they say nothing important should be decided then. The world is not yet what it will become." },
    ],
  },
  {
    id: 12,
    name: "Forbidden",
    description: "Colours that killed, poisoned, or were quietly removed from the shelves.",
    intro: "Some colours are too beautiful to be safe. What follows is the dark side of the pigment cabinet — colours that poisoned the painters who used them, the women who wore them, the children who slept in rooms painted with them. The brighter the green, the more often the arsenic.",
    bg: { l: 0.06, c: 0.04, h: 130 }, // sickly green
    challenges: [
      { a: { l: 0.55, c: 0.22, h: 130 }, b: { l: 0.75, c: 0.18, h: 150 },
        midpointName: "Scheele's Green",
        fact: "An arsenic compound, the most brilliant green of the nineteenth century. It coloured wallpapers, dresses, children's toys, even sweets. Napoleon's bedroom on Saint Helena was papered with it. Some historians believe it killed him." },
      { a: { l: 0.92, c: 0.02, h: 70 }, b: { l: 0.98, c: 0.00, h: 90 },
        midpointName: "Lead White",
        fact: "For two thousand years, the only good white painters had. Made by exposing lead strips to vinegar fumes for months. Vermeer's pearl earring is lead white. So is the makeup that disfigured generations of European women." },
      { a: { l: 0.70, c: 0.20, h: 120 }, b: { l: 0.90, c: 0.16, h: 140 },
        midpointName: "Radium",
        fact: "The pale glow on early twentieth-century watch dials. The young women who painted them licked their brushes to a fine point. Most died of jaw cancers before forty. The dials still glow today." },
      { a: { l: 0.78, c: 0.16, h: 95 }, b: { l: 0.94, c: 0.12, h: 105 },
        midpointName: "Uranium",
        fact: "Uranium glass and ceramics, popular in the 1920s and 30s, fluoresce green under ultraviolet light. The pigment was used in everyday tableware until the Manhattan Project requisitioned the supply, and the FDA quietly banned the rest." },
      { a: { l: 0.45, c: 0.22, h: 25 }, b: { l: 0.65, c: 0.26, h: 35 },
        midpointName: "Realgar",
        fact: "An arsenic-sulphide orange used in medieval manuscripts and Chinese painting. Illuminators handled it with bare hands. The brightest pages of certain Books of Hours still carry, embedded in the parchment, a residue that could kill a museum visitor if eaten." },
    ],
  },
  {
    id: 13,
    name: "Made",
    description: "Colours that did not exist until someone invented them.",
    intro: "For most of human history, colour came from the world. Then it came from us. What follows is a small museum of invention — colours found by accident, made in laboratories, fought over in courtrooms. The first one was discovered by an eighteen-year-old trying to cure malaria.",
    bg: { l: 0.08, c: 0.03, h: 290 }, // synthetic purple-leaning
    challenges: [
      { a: { l: 0.30, c: 0.15, h: 280 }, b: { l: 0.50, c: 0.19, h: 300 },
        midpointName: "Mauveine",
        fact: "The first synthetic dye in history. William Perkin, eighteen years old, was trying to synthesise quinine to treat malaria. He produced a purple sludge instead. By twenty-one he was rich. By thirty-six, retired." },
      { a: { l: 0.20, c: 0.16, h: 260 }, b: { l: 0.40, c: 0.20, h: 280 },
        midpointName: "Klein Blue",
        fact: "Yves Klein patented this exact shade in 1960. He claimed the colour itself as a work of art. International Klein Blue is the only colour ever to be legally owned by an artist." },
      { a: { l: 0.55, c: 0.18, h: 100 }, b: { l: 0.75, c: 0.22, h: 120 },
        midpointName: "Acid Green",
        fact: "Engineered to be the most visible colour to the human eye. Hi-vis vests, tennis balls, traffic cones — all calibrated to a wavelength our cones detect most efficiently. A safety colour, by design." },
      { a: { l: 0.40, c: 0.21, h: 30 }, b: { l: 0.60, c: 0.25, h: 50 },
        midpointName: "Cadmium",
        fact: "A colour that nearly killed its painters. Cadmium sulphide produced the most luminous oranges and yellows of the twentieth century. Modern formulations are safer, but the brilliance has never been bettered." },
      { a: { l: 0.05, c: 0.00, h: 0 }, b: { l: 0.18, c: 0.00, h: 0 },
        midpointName: "Vantablack",
        fact: "A forest of carbon nanotubes that absorbs 99.965 percent of visible light. Objects coated in it appear to have no surface — only an outline around a hole. The artist Anish Kapoor bought the exclusive artistic rights, and the art world has not forgiven him." },
    ],
  },
];

const HOME_BG = { l: 0.88, c: 0.028, h: 80 }; // warm beige — matches onboarding slide 1

// Tinted darks for use on the cream background — warm, never harsh
const CREAM_TEXT = {
  strong: "oklch(0.15 0.025 80)",   // titles, primary (matches labelOn(bg, true))
  body:   "oklch(0.28 0.020 80)",   // paragraphs
  soft:   "oklch(0.4 0.020 80)",    // small labels, descriptions (matches labelOn(bg))
  hint:   "oklch(0.55 0.014 80)",   // subtle hints
  border: "oklch(0.74 0.014 80)",   // soft dividing lines
  borderStrong: "oklch(0.55 0.018 80)",
};

const ONBOARDING_SLIDES = [
  {
    title: "On colour.",
    body: "Midpoint is a small game about a single act of perception. You will be shown two colours, and asked to find the middle.",
    bg: { l: 0.88, c: 0.028, h: 80 },
  },
  {
    title: "Drag, then lock.",
    body: "Move a band between the two colours until it sits at the perceptual midpoint. Lock in. The screen will answer with the truth.",
    bg: { l: 0.83, c: 0.038, h: 230 },
  },
  {
    title: "Slow looking.",
    body: "Your eye drifts with sleep, with light, with mood. Each chapter trains attention, not competence. There are no wrong answers — only honest ones.",
    bg: { l: 0.84, c: 0.032, h: 150 },
  },
  {
    title: "A history.",
    body: "Twelve chapters trace the story of colour — from pigments older than humans, to the first ones we ever made, to the colours we are still inventing now. Five within each. Every one with a name and a small history that reveals itself only after you have found its middle. They open one at a time.",
    bg: { l: 0.83, c: 0.040, h: 320 },
  },
  {
    title: "Begin.",
    body: "Use headphones if you have them. The sound is part of the design.",
    bg: { l: 0.83, c: 0.045, h: 35 },
  },
];

const CALMING_MESSAGES = [
  "Color perception varies — with sleep, with light, with the hour. Your eye today is not your eye yesterday.",
  "Now look up. Find the farthest thing you can see. Hold it for the count of three. The eye rests when the world is far.",
  "You spent a few minutes really looking. Most people don't. The eye that pays attention sees more of everything.",
  "If today was a hard day, the score is just today's. Your eye keeps its memory longer than the day does.",
  "Blink. Look away. Let what you just saw soften. The afterimage knows things the score doesn't.",
  "The light in your room is shaping what you see right now. So is the time. So is your tiredness. Be gentle with the result.",
];

// ============================================================================
// HELPERS
// ============================================================================

function lerpOklch(c1, c2, t) {
  let dh = c2.h - c1.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return {
    l: c1.l + (c2.l - c1.l) * t,
    c: c1.c + (c2.c - c1.c) * t,
    h: (c1.h + dh * t + 360) % 360,
  };
}

function oklchStr(c) {
  return `oklch(${c.l} ${c.c} ${c.h})`;
}

function labelOn(c, strong = false) {
  if (c.l > 0.62) {
    // Dark text tinted with the bg hue — should read as deep [color], not black
    const l = strong ? 0.20 : 0.38;
    const chr = strong ? Math.max(0.08, c.c * 1.0) : Math.max(0.06, c.c * 0.75);
    return `oklch(${l} ${chr} ${c.h})`;
  }
  // Light text tinted with the bg hue — should read as pale [color], not white
  const l = strong ? 0.94 : 0.78;
  const chr = strong ? Math.max(0.05, c.c * 0.5) : Math.max(0.04, c.c * 0.35);
  return `oklch(${l} ${chr} ${c.h})`;
}

// Hue-rich dark for chrome — visibly tinted, not near-black
function chromeBg(c) {
  return `oklch(0.13 ${Math.max(0.05, c.c * 0.55)} ${c.h})`;
}

// The single representative colour for a round — average of all five midpoints.
// Used as the tile colour on the home grid.
function roundColor(level) {
  const mids = level.challenges.map((c) => lerpOklch(c.a, c.b, 0.5));
  return {
    l: mids.reduce((s, m) => s + m.l, 0) / mids.length,
    c: mids.reduce((s, m) => s + m.c, 0) / mids.length,
    h: mids.reduce((s, m) => s + m.h, 0) / mids.length,
  };
}

function randomStart() {
  const left = Math.random() < 0.5;
  return left ? 0.12 + Math.random() * 0.18 : 0.70 + Math.random() * 0.18;
}

function rate(score) {
  if (score >= 96) return "Perfect";
  if (score >= 88) return "Sharp";
  if (score >= 72) return "Close";
  if (score >= 50) return "Okay";
  return "Off";
}

// ============================================================================
// APP
// ============================================================================

const ONBOARDED_KEY = "midpoint:onboarded";

function readOnboarded() {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return false;
  }
}

// Visiting `?reset=1` (or `?reset`) clears the onboarding flag so the
// onboarding flow shows again — handy for sharing the app fresh.
function consumeResetParam() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (!params.has("reset")) return false;
  try {
    localStorage.removeItem(ONBOARDED_KEY);
  } catch {
    // ignore
  }
  params.delete("reset");
  const qs = params.toString();
  window.history.replaceState(
    {},
    "",
    window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash
  );
  return true;
}

export default function App() {
  const [screen, setScreen] = useState(() => {
    const wasReset = consumeResetParam();
    if (wasReset) return { name: "onboarding" };
    return readOnboarded() ? { name: "home" } : { name: "onboarding" };
  });
  const [completed, setCompleted] = useState(new Set());
  const [muted, setMuted] = useState(false);
  const [hasEverInteracted, setHasEverInteracted] = useState(false);
  const [unlocking, setUnlocking] = useState(null);
  const audioRef = useRef(null);

  if (!audioRef.current) {
    audioRef.current = new AudioEngine();
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    audioRef.current.setMuted(next);
  }

  function finishOnboarding() {
    try {
      localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      // ignore — onboarding will simply re-show on next visit
    }
    // First arrival on Home: animate chapter 1's colour sweeping over the grey.
    setUnlocking(1);
    setScreen({ name: "home" });
  }

  // Every screen change starts at the top of the page — previously a deep
  // scroll on the home tile list carried over into About / Settings.
  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, [screen.name]);

  function enterLevel(id) {
    audioRef.current.ensureContext(); // unlock on user gesture
    audioRef.current.startAmbient(); // start (or continue) the nature ambient
    setScreen({ name: "level", levelId: id });
  }

  // Bridge: mark current chapter complete, then jump straight into the next
  // chapter's IntroScreen — used by Origin's bridge screen. No return to home.
  function bridgeToNext(currentId) {
    audioRef.current.stopPad();
    setCompleted((prev) => {
      const next = new Set(prev);
      next.add(currentId);
      return next;
    });
    setScreen({ name: "level", levelId: currentId + 1 });
  }

  function exitLevel(wasCompleted, id) {
    audioRef.current.stopPad();
    if (wasCompleted) {
      setCompleted((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      // If a next chapter exists, animate its colour over the grey on return.
      const nextLevel = LEVELS.find((l) => l.id === id + 1);
      if (nextLevel) setUnlocking(nextLevel.id);
    }
    setScreen({ name: "home" });
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,300;1,6..72,400;1,6..72,500&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap');
        body { background: ${oklchStr(HOME_BG)}; }
        .font-display { font-family: 'Newsreader', serif; font-optical-sizing: auto; }
        .font-sans { font-family: 'DM Sans', sans-serif; font-optical-sizing: auto; letter-spacing: 0.005em; }

        @keyframes pushYours {
          from { width: 100%; }
          to   { width: 50%; }
        }
        @keyframes pushTruth {
          from { width: 0%; }
          to   { width: 50%; }
        }
        .push-yours { animation: pushYours 1.17s cubic-bezier(0.65, 0, 0.35, 1) both; }
        .push-truth { animation: pushTruth 1.17s cubic-bezier(0.65, 0, 0.35, 1) both; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 1.26s cubic-bezier(0.22, 1, 0.36, 1) both; }

        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .fade-in { animation: fadeIn 0.9s ease both; }

        @keyframes screenIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .screen-in { animation: screenIn 0.81s ease both; }

        @keyframes hintPulse {
          0%, 100% { opacity: 0.3; }
          50%      { opacity: 0.8; }
        }
        .hint-pulse { animation: hintPulse 2.88s ease-in-out infinite; }

        @keyframes drift {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }
        .drift { animation: drift 5.4s ease-in-out infinite; }

        /* Colour-sweeping-over-grey for newly unlocked chapters */
        @keyframes unlockSweep {
          from { clip-path: inset(0 0 0 0%); }
          to   { clip-path: inset(0 0 0 100%); }
        }
        .unlock-sweep {
          animation: unlockSweep 1.8s cubic-bezier(0.22, 1, 0.36, 1) 0.6s forwards;
        }


        /* Breath cycle: 4s inhale → 4s hold → 4s exhale */
        /* removed */

        .candidate-drag {
          touch-action: none;
          user-select: none;
          -webkit-user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
      `}</style>

      <div className="font-sans min-h-screen">
        {screen.name === "onboarding" && (
          <Onboarding onDone={finishOnboarding} audio={audioRef.current} />
        )}
        {screen.name === "home" && (
          <Home
            onSelect={enterLevel}
            onOpenAbout={() => setScreen({ name: "about" })}
            onOpenSettings={() => setScreen({ name: "settings" })}
            completed={completed}
            audio={audioRef.current}
            unlocking={unlocking}
            onUnlockingDone={() => setUnlocking(null)}
          />
        )}
        {screen.name === "about" && (
          <About
            onBack={() => setScreen({ name: "home" })}
            onOpenSources={() => setScreen({ name: "sources" })}
            audio={audioRef.current}
          />
        )}
        {screen.name === "sources" && (
          <Sources
            onBack={() => setScreen({ name: "about" })}
            audio={audioRef.current}
          />
        )}
        {screen.name === "settings" && (
          <Settings
            onBack={() => setScreen({ name: "home" })}
            audio={audioRef.current}
            muted={muted}
            onToggleMute={toggleMute}
          />
        )}
        {screen.name === "level" && (
          <Level
            level={LEVELS.find((l) => l.id === screen.levelId)}
            audio={audioRef.current}
            hasEverInteracted={hasEverInteracted}
            onFirstInteract={() => setHasEverInteracted(true)}
            onExit={(wasCompleted) => exitLevel(wasCompleted, screen.levelId)}
            onBridge={() => bridgeToNext(screen.levelId)}
            nextLevel={LEVELS.find((l) => l.id === screen.levelId + 1)}
          />
        )}
      </div>
    </>
  );
}

// ============================================================================
// MUTE TOGGLE
// ============================================================================

function MuteToggle({ muted, onToggle, light = false }) {
  const color = light ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)";
  return (
    <button
      onClick={onToggle}
      aria-label={muted ? "Unmute" : "Mute"}
      className="w-6 h-6 flex items-center justify-center"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M3 6h2l3-2.5v9L5 10H3V6z"
          stroke={color}
          strokeWidth="1"
          strokeLinejoin="round"
          fill="none"
        />
        {!muted && (
          <>
            <path d="M10 5.5c1 0.8 1 4.2 0 5" stroke={color} strokeWidth="1" strokeLinecap="round" fill="none" />
            <path d="M12 4c2 1.5 2 6.5 0 8" stroke={color} strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.6" />
          </>
        )}
        {muted && (
          <path d="M10.5 6l3 3M13.5 6l-3 3" stroke={color} strokeWidth="1" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}

// ============================================================================
// ACTION BUTTON — standardised full-width primary button
// Used at the bottom of Intro, Reflection, Complete, About, and as Lock In.
// Plays buttonArrival when first visible, buttonTap on press.
// ============================================================================

function ActionButton({
  children,
  onClick,
  audio,
  textColor,
  borderColor,
  delay = 0,
  disabled = false,
}) {
  // Arrival sound timed to the visual fade-in
  useEffect(() => {
    if (!audio) return;
    const t = setTimeout(() => audio.buttonArrival(), delay * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClick() {
    if (disabled) return;
    if (audio) audio.buttonTap();
    onClick();
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className="w-full h-14 text-[11px] tracking-[0.3em] uppercase border transition-all duration-500 active:scale-[0.98]"
      style={{
        color: textColor,
        borderColor: borderColor,
        animation: `fadeUp 1.26s cubic-bezier(0.22, 1, 0.36, 1) both`,
        animationDelay: `${delay}s`,
      }}
    >
      {children}
    </button>
  );
}

// ============================================================================
// ONBOARDING — 3–4 calm slides shown on first visit
// ============================================================================

function Onboarding({ onDone, audio }) {
  const [i, setI] = useState(0);
  const slide = ONBOARDING_SLIDES[i];
  const isFirst = i === 0;
  const isLast = i === ONBOARDING_SLIDES.length - 1;
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  const strong = labelOn(slide.bg, true);
  const soft = labelOn(slide.bg);

  // The brown-noise bed fades in when the user reaches the final "Begin."
  // slide so the room is already breathing when they tap Play now.
  // startAmbient() is idempotent, so the later call in enterLevel is a no-op.
  useEffect(() => {
    if (isLast && audio) audio.startAmbient();
  }, [isLast, audio]);

  function next() {
    if (audio) audio.buttonTap();
    if (isLast) onDone();
    else setI(i + 1);
  }
  function prev() {
    if (isFirst) return;
    if (audio) audio.buttonTap();
    setI(i - 1);
  }
  function skip() {
    if (audio) audio.buttonTap();
    onDone();
  }

  function handleTouchStart(e) {
    const t = e.touches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
  }
  function handleTouchEnd(e) {
    if (touchStartX.current == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    // Require a clearly horizontal swipe; ignore mostly-vertical motion
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) next();
    else prev();
  }

  return (
    <div
      className="min-h-screen flex justify-center screen-in"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        background: oklchStr(slide.bg),
        transition: "background 1.26s cubic-bezier(0.22, 1, 0.36, 1)",
        touchAction: "pan-y",
      }}
    >
      <div className="w-full max-w-md px-8 py-14 flex flex-col">
        <div className="flex justify-between items-center">
          <div
            className="font-display italic leading-none"
            style={{ color: strong, fontSize: "22px" }}
          >
            midpoint<span style={{ color: soft }}>.</span>
          </div>
          <button
            onClick={skip}
            className="text-[11px] tracking-[0.35em] uppercase pb-1 border-b transition-colors duration-500"
            style={{ color: soft, borderColor: soft }}
          >
            Skip
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <h1
            key={`title-${i}`}
            className="font-display italic leading-[0.95] mb-8 fade-up"
            style={{
              color: strong,
              fontSize: "clamp(2.8rem, 11vw, 4rem)",
              animationDuration: "1.08s",
            }}
          >
            {slide.title}
          </h1>
          <p
            key={`body-${i}`}
            className="font-display leading-relaxed fade-up max-w-sm"
            style={{
              color: strong,
              fontSize: "clamp(1rem, 4vw, 1.12rem)",
              animationDelay: "0.27s",
              animationDuration: "1.26s",
            }}
          >
            {slide.body}
          </p>
        </div>

        <div className="pt-8">
          {isLast ? (
            <ActionButton
              audio={audio}
              onClick={next}
              textColor={strong}
              borderColor={strong}
              delay={0.36}
            >
              Play now
            </ActionButton>
          ) : (
            <div className="flex justify-between items-center">
              <button
                onClick={prev}
                disabled={isFirst}
                aria-label="Previous"
                className="w-12 h-12 flex items-center justify-center"
                style={{ opacity: isFirst ? 0.2 : 1 }}
              >
                <svg width="22" height="14" viewBox="0 0 22 14" fill="none">
                  <path
                    d="M7 1L1 7l6 6M1 7h20"
                    stroke={strong}
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <div className="flex gap-2">
                {ONBOARDING_SLIDES.map((_, j) => (
                  <span
                    key={j}
                    className="block w-1.5 h-1.5 rounded-full transition-opacity duration-500"
                    style={{
                      background: strong,
                      opacity: j === i ? 1 : 0.22,
                    }}
                  />
                ))}
              </div>
              <button
                onClick={next}
                aria-label="Next"
                className="w-12 h-12 flex items-center justify-center"
              >
                <svg width="22" height="14" viewBox="0 0 22 14" fill="none">
                  <path
                    d="M15 1l6 6-6 6M21 7H1"
                    stroke={strong}
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HOME
// ============================================================================

function Home({ onSelect, onOpenAbout, onOpenSettings, completed, audio, unlocking, onUnlockingDone }) {
  function openAbout() {
    if (audio) audio.buttonTap();
    onOpenAbout();
  }
  function openSettings() {
    if (audio) audio.buttonTap();
    onOpenSettings();
  }

  // Clear the unlocking flag after the sweep finishes (delay 0.6s + 1.8s anim + small buffer)
  useEffect(() => {
    if (unlocking == null || !onUnlockingDone) return;
    const t = setTimeout(() => onUnlockingDone(), 2700);
    return () => clearTimeout(t);
  }, [unlocking, onUnlockingDone]);

  return (
    <div
      className="min-h-screen flex justify-center screen-in"
      style={{ background: oklchStr(HOME_BG) }}
    >
      <div className="w-full max-w-md px-8 py-14 flex flex-col">
        <div className="mb-12">
          <div className="fade-up">
            <div
              className="font-display italic leading-none"
              style={{ color: CREAM_TEXT.strong, fontSize: "22px" }}
            >
              midpoint<span style={{ color: CREAM_TEXT.hint }}>.</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 flex-1 content-start">
          {LEVELS.map((level, i) => {
            const isDone = completed.has(level.id);
            const isLocked = i > 0 && !completed.has(LEVELS[i - 1].id);
            const isUnlocking = unlocking === level.id;
            const tileCol = roundColor(level);
            const tileText = labelOn(tileCol, true);
            const tileTextSoft = labelOn(tileCol);
            // The prologue (Origin) doesn't carry a chapter number; chapters
            // begin at Stone, which sits at index 1 and displays as "01".
            const tileNumber = level.prologue ? null : String(i).padStart(2, "0");
            // Locked tiles sit a little darker than the cream bg but in the
            // same hue family — feels like a quiet absence rather than a
            // contrasting blue-grey.
            const lockedBg = "oklch(0.82 0.014 80)";
            const lockedTextSoft = "oklch(0.46 0.014 80)";
            const lockedIconStroke = "oklch(0.55 0.014 80)";
            return (
              <button
                key={level.id}
                disabled={isLocked && !isUnlocking}
                aria-label={isLocked ? `${level.name}, locked` : level.name}
                onClick={() => {
                  if (isLocked) return;
                  if (audio) audio.buttonTap();
                  onSelect(level.id);
                }}
                className={`relative w-full overflow-hidden fade-up transition-transform ${
                  isLocked && !isUnlocking ? "cursor-not-allowed" : "active:scale-[0.99]"
                }`}
                style={{
                  height: "108px",
                  background: oklchStr(tileCol),
                  animationDelay: `${0.18 + i * 0.11}s`,
                }}
              >
                {tileNumber && (
                  <span
                    className="absolute top-4 left-5 text-[10px] tracking-[0.32em] uppercase"
                    style={{ color: tileTextSoft }}
                  >
                    {tileNumber}
                  </span>
                )}
                {isDone && (
                  <span
                    className="absolute top-4 right-5 block w-1.5 h-1.5 rounded-full"
                    style={{ background: tileText }}
                    aria-label="completed"
                  />
                )}
                <span
                  className="absolute bottom-4 left-5 right-5 text-left font-display italic leading-none"
                  style={{ color: tileText, fontSize: "28px" }}
                >
                  {level.name}
                </span>

                {(isLocked || isUnlocking) && (
                  <div
                    className={`absolute inset-0 ${isUnlocking ? "unlock-sweep" : ""}`}
                    style={{ background: lockedBg }}
                    aria-hidden="true"
                  >
                    {tileNumber && (
                      <span
                        className="absolute top-4 left-5 text-[10px] tracking-[0.32em] uppercase"
                        style={{ color: lockedTextSoft }}
                      >
                        {tileNumber}
                      </span>
                    )}
                    {isLocked && !isUnlocking && (
                      <span className="absolute bottom-4 right-5">
                        <svg width="14" height="18" viewBox="0 0 14 18" fill="none">
                          <rect
                            x="2"
                            y="8"
                            width="10"
                            height="8"
                            rx="0.5"
                            stroke={lockedIconStroke}
                            strokeWidth="1"
                            fill="none"
                          />
                          <path
                            d="M4 8V5a3 3 0 0 1 6 0v3"
                            stroke={lockedIconStroke}
                            strokeWidth="1"
                            fill="none"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div
          className="pt-10 flex justify-between items-end fade-up"
          style={{ animationDelay: `${0.18 + LEVELS.length * 0.11 + 0.3}s` }}
        >
          <button
            onClick={openAbout}
            className="text-[11px] tracking-[0.35em] uppercase pb-1 border-b transition-colors duration-500"
            style={{
              color: CREAM_TEXT.soft,
              borderColor: CREAM_TEXT.border,
            }}
          >
            About this game
          </button>
          <button
            onClick={openSettings}
            className="text-[11px] tracking-[0.35em] uppercase pb-1 border-b transition-colors duration-500"
            style={{
              color: CREAM_TEXT.soft,
              borderColor: CREAM_TEXT.border,
            }}
          >
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ABOUT — a quiet page about what Two actually is
// ============================================================================

function About({ onBack, audio, onOpenSources }) {
  function openSources() {
    if (audio) audio.buttonTap();
    onOpenSources();
  }
  return (
    <div
      className="min-h-screen flex justify-center screen-in"
      style={{ background: oklchStr(HOME_BG) }}
    >
      <div className="w-full max-w-md px-8 py-14 flex flex-col">
        <div className="flex-1">
          <div
            className="text-[11px] tracking-[0.4em] uppercase mb-6 fade-up"
            style={{
              color: CREAM_TEXT.soft,
              animationDelay: "0.27s",
              animationDuration: "1.08s",
            }}
          >
            About
          </div>

          <h1
            className="font-display italic leading-[0.95] mb-10 fade-up"
            style={{
              color: CREAM_TEXT.strong,
              animationDelay: "0.72s",
              animationDuration: "1.44s",
              fontSize: "clamp(2.6rem, 10vw, 3.6rem)",
            }}
          >
            On colour, and looking.
          </h1>

          <div
            className="font-display leading-relaxed space-y-5 max-w-sm fade-up"
            style={{
              color: CREAM_TEXT.body,
              animationDelay: "1.26s",
              animationDuration: "1.62s",
              fontSize: "clamp(0.94rem, 3.9vw, 1.06rem)",
            }}
          >
            <p>
              Midpoint is a game about a single act of perception. You drag
              a band between two shades until it sits at the middle, lock
              in, and the screen answers with the truth.
            </p>

            <p>
              The eye that plays today is not the same eye that played
              yesterday. Colour sense drifts with sleep, with light, with
              mood. Two people looking at the same screen can see the
              midpoint in different places, both honestly. Some hues are
              harder than others &mdash; a fact of the cortex, not of you.
            </p>

            <p>
              Practice helps. The brain learns to listen to the eye more
              carefully. The reflection screens are not decoration: learning
              the names of colours quietly changes how you see them over
              time.
            </p>

            <p>
              The journey is shaped as twelve chapters that follow the history
              of colour — from the pigments that existed before us, to the
              first ones we ever made, to the colours we are still inventing
              today. Five within each. Some are older than language; some are
              mistakes that became famous. The names reveal themselves only
              after you have found their middle, and the chapters open one at
              a time.
            </p>

            <p>
              The sound under your finger pulses at six breaths per minute,
              the rate at which heart-rate variability peaks. Use headphones
              and you will also hear a small offset between your ears, in a
              frequency range associated with deep calm.
            </p>

            <p>
              Midpoint is not a diagnostic. It does not measure your sight
              or your wellness. It is a small room in which to look slowly,
              learn a few names, and notice your own variability &mdash;
              without judgement.
            </p>
          </div>

          <div
            className="pt-8 fade-up"
            style={{ animationDelay: "1.8s", animationDuration: "1.26s" }}
          >
            <button
              onClick={openSources}
              className="text-[11px] tracking-[0.35em] uppercase pb-1 border-b transition-colors duration-500"
              style={{ color: CREAM_TEXT.soft, borderColor: CREAM_TEXT.border }}
            >
              Sources
            </button>
          </div>
        </div>

        <div className="pt-12">
          <ActionButton
            audio={audio}
            onClick={onBack}
            textColor={CREAM_TEXT.strong}
            borderColor={CREAM_TEXT.borderStrong}
            delay={2.16}
          >
            Return
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SOURCES — attribution page linked from About
// ============================================================================

function Sources({ onBack, audio }) {
  return (
    <div
      className="min-h-screen flex justify-center screen-in"
      style={{ background: oklchStr(HOME_BG) }}
    >
      <div className="w-full max-w-md px-8 py-14 flex flex-col">
        <div className="flex-1">
          <div
            className="text-[11px] tracking-[0.4em] uppercase mb-6 fade-up"
            style={{
              color: CREAM_TEXT.soft,
              animationDelay: "0.27s",
              animationDuration: "1.08s",
            }}
          >
            Sources
          </div>

          <h1
            className="font-display italic leading-[0.95] mb-10 fade-up"
            style={{
              color: CREAM_TEXT.strong,
              animationDelay: "0.72s",
              animationDuration: "1.44s",
              fontSize: "clamp(2.6rem, 10vw, 3.6rem)",
            }}
          >
            With thanks.
          </h1>

          <div
            className="font-display leading-relaxed space-y-5 max-w-sm fade-up"
            style={{
              color: CREAM_TEXT.body,
              animationDelay: "1.26s",
              animationDuration: "1.62s",
              fontSize: "clamp(0.94rem, 3.9vw, 1.06rem)",
            }}
          >
            <p>
              Many of the colour histories in this app owe a debt to two
              books, both still in print:
            </p>
            <p>
              Kassia St Clair, <em>The Secret Lives of Colour</em> (John
              Murray, 2016).
              <br />
              Victoria Finlay, <em>Color: A Natural History of the Palette</em>
              {" "}(Random House, 2002).
            </p>
            <p>
              The claim that languages name colours in a near-universal
              order is from Brent Berlin and Paul Kay,{" "}
              <em>Basic Color Terms: Their Universality and Evolution</em>
              {" "}(University of California Press, 1969). The Dani two-term
              system was documented by Eleanor Rosch, &lsquo;Universals in
              colour naming and memory&rsquo; (1972).
            </p>
            <p>
              The sound design draws on findings about resonant breathing
              (~0.1 Hz, where heart-rate variability peaks) and binaural
              beats in the theta range &mdash; both well-attested in the
              human-perception literature.
            </p>
            <p>
              Errors of fact, framing, or feel are mine.
            </p>
          </div>
        </div>

        <div className="pt-12">
          <ActionButton
            audio={audio}
            onClick={onBack}
            textColor={CREAM_TEXT.strong}
            borderColor={CREAM_TEXT.borderStrong}
            delay={2.7}
          >
            Return
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SETTINGS
// ============================================================================

function Settings({ onBack, audio, muted, onToggleMute }) {
  function handleToggle() {
    if (audio) audio.buttonTap();
    onToggleMute();
  }
  return (
    <div
      className="min-h-screen flex justify-center screen-in"
      style={{ background: oklchStr(HOME_BG) }}
    >
      <div className="w-full max-w-md px-8 py-14 flex flex-col">
        <div className="flex-1">
          <div
            className="text-[11px] tracking-[0.4em] uppercase mb-6 fade-up"
            style={{
              color: CREAM_TEXT.soft,
              animationDelay: "0.27s",
              animationDuration: "1.08s",
            }}
          >
            Settings
          </div>
          <h1
            className="font-display italic leading-[0.95] mb-12 fade-up"
            style={{
              color: CREAM_TEXT.strong,
              animationDelay: "0.72s",
              animationDuration: "1.44s",
              fontSize: "clamp(2.6rem, 10vw, 3.6rem)",
            }}
          >
            Quiet, or not.
          </h1>
          <button
            onClick={handleToggle}
            aria-pressed={!muted}
            className="w-full flex items-center justify-between py-5 border-b fade-up"
            style={{
              color: CREAM_TEXT.body,
              borderColor: CREAM_TEXT.border,
              animationDelay: "1.26s",
              animationDuration: "1.44s",
            }}
          >
            <span className="text-[11px] tracking-[0.3em] uppercase">
              Sound
            </span>
            <span className="font-display italic text-lg">
              {muted ? "off" : "on"}
            </span>
          </button>
        </div>
        <div className="pt-12">
          <ActionButton
            audio={audio}
            onClick={onBack}
            textColor={CREAM_TEXT.strong}
            borderColor={CREAM_TEXT.borderStrong}
            delay={1.8}
          >
            Return
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LEVEL
// ============================================================================

function Level({ level, audio, hasEverInteracted, onFirstInteract, onExit, onBridge, nextLevel }) {
  const [challengeIdx, setChallengeIdx] = useState(0);
  const [phase, setPhase] = useState("intro");
  const [position, setPosition] = useState(randomStart);
  const [results, setResults] = useState([]);
  const [hasReleased, setHasReleased] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [expansion, setExpansion] = useState(null);
  // Per-challenge interaction tracking, used only for tutorial chapters
  // (level.tutorialHint = true). For non-tutorial chapters the hint follows
  // the global hasEverInteracted, which only ever flips once.
  const [chHasInteracted, setChHasInteracted] = useState(false);

  useEffect(() => {
    setChHasInteracted(false);
  }, [challengeIdx]);

  const challenge = level.challenges[challengeIdx];
  const total = level.challenges.length;
  const bgColor = oklchStr(level.bg);

  const truth = 0.5;
  const distance = Math.abs(position - truth);
  const score = Math.round(Math.max(0, 100 - distance * 200));

  const candidateCol = useMemo(
    () => lerpOklch(challenge.a, challenge.b, position),
    [challenge, position]
  );
  const truthCol = useMemo(
    () => lerpOklch(challenge.a, challenge.b, truth),
    [challenge]
  );

  const drag = useRef({ active: false, startX: 0, startPos: 0 });
  const rightHalfRef = useRef(null);

  function onPointerDown(e) {
    if (phase !== "play") return;
    if (!hasEverInteracted) onFirstInteract();
    if (!chHasInteracted) setChHasInteracted(true);
    drag.current = { active: true, startX: e.clientX, startPos: position };
    setIsDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  }

  function onPointerMove(e) {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    let newPos = drag.current.startPos + dx / 320;
    newPos = Math.max(0, Math.min(1, newPos));
    setPosition(newPos);
    if (newPos === 0 || newPos === 1) {
      drag.current.startX = e.clientX;
      drag.current.startPos = newPos;
    }
  }

  function onPointerUp(e) {
    drag.current.active = false;
    setIsDragging(false);
    if (!hasReleased) setHasReleased(true);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  }

  function lock() {
    audio.playTone(candidateCol, { duration: 1.6 });
    setResults((prev) => [...prev, { score, midpointCol: truthCol }]);
    setPhase("reveal");
    // truth tone arrives shortly after, like a gentle reply
    setTimeout(() => audio.playTone(truthCol, { duration: 2.4 }), 700);
  }

  function continueFromReveal() {
    if (!rightHalfRef.current) {
      setPhase("reflection");
      return;
    }
    const rect = rightHalfRef.current.getBoundingClientRect();
    setExpansion({
      box: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      fullscreen: false,
      color: truthCol,
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setExpansion((s) => (s ? { ...s, fullscreen: true } : s));
      });
    });
    // start ambient pad when expansion begins
    audio.startPad(truthCol);
    setTimeout(() => {
      setPhase("reflection");
      setExpansion(null);
    }, 1350);
  }

  function continueFromReflection() {
    audio.stopPad();
    if (challengeIdx < total - 1) {
      setChallengeIdx(challengeIdx + 1);
      setPosition(randomStart());
      setPhase("play");
      setHasReleased(false);
      setExpansion(null);
    } else if (level.prologue && onBridge) {
      // Prologue chapters skip the Rest screen and jump straight into the
      // next chapter — Origin → Stone.
      setExpansion(null);
      onBridge();
    } else {
      setPhase("complete");
      setExpansion(null);
    }
  }

  function exitLevel() {
    audio.stopPad();
    onExit(false);
  }

  // safety: stop pad and touch tone on unmount
  useEffect(() => {
    return () => {
      audio.stopPad();
      audio.touchStop();
    };
  }, [audio]);

  // Touch tone — plays while finger is on the candidate band, glides with the color
  useEffect(() => {
    if (phase !== "play") {
      audio.touchStop();
      return;
    }
    if (isDragging) {
      audio.touchUpdate(candidateCol);
    } else {
      audio.touchStop();
    }
  }, [isDragging, candidateCol, phase, audio]);

  // Auto-transition from reveal to reflection — no button required
  useEffect(() => {
    if (phase !== "reveal") return;
    const t = setTimeout(() => {
      continueFromReveal();
    }, 3600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <>
      {phase === "intro" && (
        <IntroScreen
          level={level}
          audio={audio}
          onBegin={() => setPhase("play")}
          onExit={() => onExit(false)}
        />
      )}

      {(phase === "play" || phase === "reveal") && (
        <ChallengeView
          level={level}
          challenge={challenge}
          challengeIdx={challengeIdx}
          total={total}
          phase={phase}
          position={position}
          candidateCol={candidateCol}
          truthCol={truthCol}
          score={score}
          distance={distance}
          hasInteracted={level.tutorialHint ? chHasInteracted : hasEverInteracted}
          hasReleased={hasReleased}
          isDragging={isDragging}
          rightHalfRef={rightHalfRef}
          bgColor={bgColor}
          audio={audio}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onLock={lock}
          onContinue={continueFromReveal}
        />
      )}

      {phase === "reflection" && (
        <Reflection
          color={truthCol}
          name={challenge.midpointName}
          fact={challenge.fact}
          audio={audio}
          onContinue={continueFromReflection}
          isLast={challengeIdx === total - 1}
          buttonText={
            challengeIdx === total - 1
              ? (level.prologue && nextLevel ? `Begin ${nextLevel.name}` : "Rest")
              : "Continue"
          }
        />
      )}

      {phase === "complete" && (
        <LevelComplete
          level={level}
          results={results}
          bgColor={bgColor}
          audio={audio}
          onHome={() => onExit(true)}
        />
      )}

      {expansion && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            top: expansion.fullscreen ? "0px" : `${expansion.box.top}px`,
            left: expansion.fullscreen ? "0px" : `${expansion.box.left}px`,
            width: expansion.fullscreen ? "100vw" : `${expansion.box.width}px`,
            height: expansion.fullscreen ? "100vh" : `${expansion.box.height}px`,
            background: oklchStr(expansion.color),
            transition: expansion.fullscreen
              ? "top 1.26s cubic-bezier(0.65, 0, 0.35, 1), left 1.26s cubic-bezier(0.65, 0, 0.35, 1), width 1.26s cubic-bezier(0.65, 0, 0.35, 1), height 1.26s cubic-bezier(0.65, 0, 0.35, 1)"
              : "none",
          }}
        />
      )}
    </>
  );
}

// ============================================================================
// INTRO SCREEN — appears once at the start of each level
// ============================================================================

function IntroScreen({ level, audio, onBegin, onExit }) {
  const [canBegin, setCanBegin] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setCanBegin(true), 4050);
    return () => clearTimeout(t);
  }, []);

  const bg = roundColor(level);
  const bgStr = oklchStr(bg);
  const textStrong = labelOn(bg, true);
  const textBorder = labelOn(bg);

  function handleExit() {
    if (audio) audio.buttonTap();
    onExit();
  }

  return (
    <div
      className="min-h-screen flex justify-center screen-in"
      style={{ background: bgStr }}
    >
      <div className="w-full max-w-md flex flex-col px-8 py-14">
        <div className="flex-1 flex flex-col justify-center">
          {!level.prologue && (
            <div
              className="text-[11px] tracking-[0.4em] uppercase mb-8 fade-up"
              style={{
                color: textBorder,
                animationDelay: "0.36s",
                animationDuration: "1.26s",
              }}
            >
              Chapter {String(LEVELS.findIndex((l) => l.id === level.id)).padStart(2, "0")}
            </div>
          )}

          <h1
            className="font-display italic leading-none mb-12 fade-up"
            style={{
              color: textStrong,
              animationDelay: "1.08s",
              animationDuration: "1.62s",
              fontSize: "clamp(3.4rem, 14vw, 5.2rem)",
            }}
          >
            {level.name}.
          </h1>

          <div
            className="font-display italic leading-relaxed max-w-sm fade-up space-y-4"
            style={{
              color: textBorder,
              animationDelay: "2.34s",
              animationDuration: "1.62s",
              fontSize: "clamp(0.94rem, 3.9vw, 1.08rem)",
            }}
          >
            {level.intro.split("\n\n").map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>

        <div className="pt-12 flex items-stretch gap-3">
          <button
            onClick={handleExit}
            aria-label="Exit chapter"
            className="h-14 w-14 flex items-center justify-center border transition-all duration-500 active:scale-[0.98] fade-up flex-shrink-0"
            style={{
              borderColor: textBorder,
              animationDelay: "4.05s",
              animationDuration: "1.26s",
            }}
          >
            <svg width="22" height="14" viewBox="0 0 22 14" fill="none">
              <path
                d="M7 1L1 7l6 6M1 7h20"
                stroke={textBorder}
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="flex-1">
            <ActionButton
              audio={audio}
              onClick={onBegin}
              textColor={textStrong}
              borderColor={textBorder}
              delay={4.05}
              disabled={!canBegin}
            >
              Begin
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CHALLENGE VIEW
// ============================================================================

function ChallengeView({
  level, challenge, challengeIdx, total, phase, position,
  candidateCol, truthCol, score, distance, hasInteracted, hasReleased, isDragging,
  rightHalfRef, bgColor, audio,
  onPointerDown, onPointerMove, onPointerUp, onLock, onContinue,
}) {
  const showBar = phase === "reveal" || hasReleased;

  // Fire buttonArrival when the Lock In bar first appears
  const barAnnounced = useRef(false);
  useEffect(() => {
    if (showBar && phase === "play" && !barAnnounced.current && audio) {
      barAnnounced.current = true;
      audio.buttonArrival();
    }
    if (!showBar) barAnnounced.current = false;
  }, [showBar, phase, audio]);

  function lockWithSound() {
    if (audio) audio.buttonTap();
    onLock();
  }

  return (
    <div
      className="min-h-screen flex justify-center screen-in"
      key={challengeIdx}
      style={{
        background: chromeBg(lerpOklch(challenge.a, challenge.b, 0.5)),
        transition: "background 1.44s ease",
      }}
    >
      <div className="relative w-full max-w-md text-white select-none" style={{ minHeight: "100vh" }}>
        <div
          className="grid w-full"
          style={{
            gridTemplateRows: "1fr 1fr 1fr",
            height: "100vh",
          }}
        >
          <div
            className="w-full"
            style={{ background: oklchStr(challenge.a), transition: "background 1.44s ease" }}
          />

          <div className="relative w-full overflow-hidden">
            {phase === "play" ? (
              <div
                className="w-full h-full candidate-drag cursor-grab active:cursor-grabbing relative overflow-hidden"
                style={{
                  background: oklchStr(candidateCol),
                  transition: isDragging ? "none" : "background 0.54s ease",
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {!hasInteracted && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                      className="hint-pulse text-[10px] tracking-[0.4em] uppercase font-medium"
                      style={{ color: labelOn(candidateCol) }}
                    >
                      ← drag to find the midpoint →
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative w-full h-full">
                <div className="flex w-full h-full">
                  <div
                    className="push-yours h-full flex-shrink-0 relative"
                    style={{ background: oklchStr(candidateCol) }}
                  >
                    {/* hairline at the moving boundary */}
                    <div className="absolute top-0 bottom-0 right-0 w-px bg-white/25 pointer-events-none" />
                  </div>
                  <div
                    ref={rightHalfRef}
                    className="push-truth h-full flex-shrink-0"
                    style={{ background: oklchStr(truthCol) }}
                  />
                </div>
                <div
                  className="absolute inset-x-0 bottom-3 flex justify-around fade-up pointer-events-none"
                  style={{ animationDelay: "1.26s" }}
                >
                  <div className="text-[10px] tracking-[0.35em] uppercase" style={{ color: labelOn(candidateCol) }}>
                    Yours
                  </div>
                  <div className="text-[10px] tracking-[0.35em] uppercase" style={{ color: labelOn(truthCol) }}>
                    True
                  </div>
                </div>
              </div>
            )}
          </div>

          <div
            className="w-full"
            style={{ background: oklchStr(challenge.b), transition: "background 1.44s ease" }}
          />
        </div>

        {/* Floating bar — slides up from below on first release. Transparent, sits over band B. */}
        <div
          className="absolute bottom-0 left-0 right-0 px-8 py-8"
          style={{
            background: "transparent",
            transform: showBar ? "translateY(0)" : "translateY(100%)",
            transition: "transform 0.81s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {phase === "play" ? (
            <button
              onClick={lockWithSound}
              className="w-full h-14 text-[11px] tracking-[0.3em] uppercase border transition-all duration-700 active:scale-[0.98]"
              style={{
                color: labelOn(challenge.b, true),
                borderColor: labelOn(challenge.b),
              }}
            >
              Lock in
            </button>
          ) : (
            <div className="w-full fade-up" style={{ animationDelay: "0.99s" }}>
              <div className="flex items-baseline justify-between mb-4">
                <div className="flex items-baseline gap-2">
                  <span
                    className="font-display italic leading-none"
                    style={{
                      color: labelOn(challenge.b, true),
                      fontSize: "clamp(3.8rem, 16vw, 5.2rem)",
                    }}
                  >
                    {score}
                  </span>
                  <span
                    className="text-base"
                    style={{ color: labelOn(challenge.b) }}
                  >
                    / 100
                  </span>
                </div>
                <div
                  className="font-display italic"
                  style={{
                    color: labelOn(challenge.b, true),
                    fontSize: "clamp(1.5rem, 6vw, 1.9rem)",
                  }}
                >
                  {rate(score)}.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// REFLECTION
// ============================================================================

function Reflection({ color, name, fact, audio, onContinue, isLast, buttonText }) {
  const [canContinue, setCanContinue] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setCanContinue(true), 5850);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="min-h-screen flex justify-center relative"
      style={{ background: oklchStr(color), zIndex: 60 }}
    >
      <div className="w-full max-w-md flex flex-col px-8 py-14 relative">
        <div className="flex-1 flex flex-col justify-center">
          <div
            className="fade-up mb-6"
            style={{ animationDelay: "0.36s", animationDuration: "1.26s" }}
          >
            <span
              className="text-[11px] tracking-[0.4em] uppercase"
              style={{ color: labelOn(color) }}
            >
              The midpoint was
            </span>
          </div>

          <h1
            className="font-display italic leading-[0.95] mb-12 fade-up"
            style={{
              color: labelOn(color, true),
              animationDelay: "1.26s",
              animationDuration: "1.62s",
              fontSize: "clamp(3rem, 12vw, 4.6rem)",
            }}
          >
            {name}.
          </h1>

          <p
            className="font-display italic leading-relaxed fade-up max-w-sm"
            style={{
              color: labelOn(color, true),
              opacity: 0.86,
              animationDelay: "2.88s",
              animationDuration: "1.62s",
              fontSize: "clamp(0.94rem, 4vw, 1.13rem)",
            }}
          >
            {fact}
          </p>
        </div>

        <div className="pt-12">
          <ActionButton
            audio={audio}
            onClick={onContinue}
            textColor={labelOn(color, true)}
            borderColor={labelOn(color)}
            delay={5.85}
            disabled={!canContinue}
          >
            {buttonText || (isLast ? "Rest" : "Continue")}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LEVEL COMPLETE
// ============================================================================

function LevelComplete({ level, results, bgColor, audio, onHome }) {
  const avg = Math.round(
    results.reduce((a, b) => a + b.score, 0) / results.length
  );
  const [message] = useState(
    () => CALMING_MESSAGES[Math.floor(Math.random() * CALMING_MESSAGES.length)]
  );

  // Soft pastel wash derived from the round's hue — calmer than pure cream,
  // and carries the round's identity into its resting space.
  const round = roundColor(level);
  const restBg = { l: 0.86, c: 0.04, h: round.h };
  const restStrong = labelOn(restBg, true);
  const restSoft = labelOn(restBg);

  return (
    <div
      className="min-h-screen flex justify-center screen-in"
      style={{ background: oklchStr(restBg) }}
    >
      <div className="w-full max-w-md flex flex-col px-8 py-14">
        <div className="flex-1 flex flex-col justify-center items-start">
          <div
            className="text-[11px] tracking-[0.4em] uppercase mb-6 fade-up"
            style={{ color: restSoft, animationDelay: "0.36s" }}
          >
            {level.name} · complete
          </div>

          <h1
            className="font-display italic mb-12 fade-up leading-none"
            style={{
              color: restStrong,
              animationDelay: "1.08s",
              animationDuration: "1.62s",
              fontSize: "clamp(4.2rem, 16vw, 6rem)",
            }}
          >
            Rest.
          </h1>

          <div
            className="flex gap-2 mb-12 fade-up"
            style={{ animationDelay: "2.16s", animationDuration: "1.62s" }}
          >
            {results.map((r, i) => (
              <div
                key={i}
                className="drift"
                style={{
                  background: oklchStr(r.midpointCol),
                  width: "56px",
                  height: "56px",
                  animationDelay: `${i * 0.5}s`,
                }}
              />
            ))}
          </div>

          <div
            className="font-display italic fade-up"
            style={{
              color: restSoft,
              animationDelay: "3.06s",
              fontSize: "1.18rem",
            }}
          >
            Your eye averaged{" "}
            <span style={{ color: restStrong }}>{avg}%</span>.
          </div>

          <div
            className="font-display italic fade-up leading-relaxed mt-8 max-w-sm"
            style={{
              color: restSoft,
              animationDelay: "4.14s",
              animationDuration: "1.62s",
              fontSize: "clamp(0.94rem, 3.9vw, 1.06rem)",
            }}
          >
            {message}
          </div>
        </div>

        <div className="pt-12">
          <ActionButton
            audio={audio}
            onClick={onHome}
            textColor={restStrong}
            borderColor={restStrong}
            delay={5.4}
          >
            Home
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
