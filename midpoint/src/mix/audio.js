// Tiny Web Audio engine: a wet "plip" when a drop lands, a soft pentatonic
// chime on a match. Lazily created so it only spins up after a user gesture.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  setMuted(m) {
    this.muted = m;
  }

  // A droplet hitting liquid: a quick pitched blip with a watery pitch-drop.
  drop(n = 0) {
    const ctx = this._ensure();
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const base = 760 + (n % 5) * 70 + Math.random() * 40;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(base * 1.6, t);
    osc.frequency.exponentialRampToValueAtTime(base, t + 0.06);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  // Soft tap when a pigment tube is picked up.
  tap() {
    const ctx = this._ensure();
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(330, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  // Rising pentatonic chime on a solved level.
  success() {
    const ctx = this._ensure();
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, i) => {
      const t = t0 + i * 0.13;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.95);
    });
  }
}
