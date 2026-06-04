import { useEffect, useMemo, useRef, useState } from "react";
import { PIGMENTS, mixToRgb, rgbStr, shade, deltaE, MATCH_THRESHOLD, hintFor } from "./mixing.js";
import { LEVELS } from "./levels.js";
import { AudioEngine } from "./audio.js";

const STORE_SOLVED = "tincture:solved";
const STORE_MUTED = "tincture:muted";

// Pre-rendered swatch for each pigment tube on the shelf.
const PIGMENT_RGB = Object.fromEntries(
  Object.keys(PIGMENTS).map((id) => [id, mixToRgb({ [id]: 1 })])
);

// ── A single skeuomorphic glass test tube ───────────────────────────────────
function TestTube({ rgb, fill = 0, w = 66, h = 220, cork = false, drip = null }) {
  const liquidH = Math.max(0, Math.min(1, fill)) * 100;
  const empty = !rgb || fill <= 0.001;
  const base = rgb || [120, 120, 120];

  return (
    <div style={{ position: "relative", width: w, height: h + (cork ? 18 : 0) }}>
      {cork && (
        <div
          style={{
            position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
            width: w * 0.62, height: 22, zIndex: 4,
            borderRadius: "5px 5px 3px 3px",
            background: "linear-gradient(180deg,#c9a06a,#9c7038 55%,#7c531f)",
            boxShadow: "inset 0 2px 2px rgba(255,255,255,.35), inset 0 -3px 4px rgba(0,0,0,.35)",
          }}
        />
      )}
      <div
        style={{
          position: "absolute", bottom: 0, left: 0, width: w, height: h, overflow: "hidden",
          borderRadius: `${w * 0.16}px ${w * 0.16}px ${w * 0.5}px ${w * 0.5}px`,
          background:
            "linear-gradient(100deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.02) 14%, rgba(255,255,255,0) 38%, rgba(255,255,255,0) 70%, rgba(255,255,255,.05) 90%, rgba(255,255,255,.13) 100%), rgba(228,236,240,.045)",
          border: "1px solid rgba(255,255,255,.16)",
          boxShadow:
            "inset 0 1px 1px rgba(255,255,255,.30), inset -3px 0 8px rgba(0,0,0,.30), inset 3px 0 8px rgba(0,0,0,.18), 0 14px 26px rgba(0,0,0,.40)",
        }}
      >
        {/* falling drop */}
        {drip && (
          <div
            key={drip.key}
            style={{
              position: "absolute", left: "50%", top: 8, width: 11, height: 14,
              marginLeft: -5.5, borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
              background: rgbStr(drip.color),
              boxShadow: "inset 0 -2px 2px rgba(0,0,0,.2), inset 0 2px 2px rgba(255,255,255,.4)",
              animation: "tincture-drip 420ms cubic-bezier(0.5,0,0.75,0) forwards",
              zIndex: 3,
            }}
          />
        )}
        {/* liquid */}
        <div
          style={{
            position: "absolute", left: 3, right: 3, bottom: 0, height: `${liquidH}%`,
            borderRadius: `2px 2px ${w * 0.46}px ${w * 0.46}px`,
            transition: "height 640ms cubic-bezier(0.22,1,0.36,1)",
            background: empty
              ? "transparent"
              : `linear-gradient(90deg, ${shade(base, -0.32)} 0%, ${shade(base, 0.16)} 42%, ${shade(base, -0.06)} 60%, ${shade(base, -0.36)} 100%)`,
            boxShadow: empty ? "none" : `inset 0 -10px 18px ${shade(base, -0.4)}`,
          }}
        >
          {/* meniscus / surface */}
          {!empty && (
            <>
              <div
                style={{
                  position: "absolute", top: -5, left: 0, right: 0, height: 11,
                  borderRadius: "50%",
                  background: `linear-gradient(180deg, ${shade(base, 0.28)}, ${shade(base, -0.12)})`,
                  boxShadow: `inset 0 1px 2px ${shade(base, 0.45)}`,
                }}
              />
              <div
                style={{
                  position: "absolute", top: -2, left: "26%", width: "30%", height: 4,
                  borderRadius: "50%", background: "rgba(255,255,255,.55)", filter: "blur(1px)",
                }}
              />
            </>
          )}
        </div>
        {/* glass specular highlight */}
        <div
          style={{
            position: "absolute", top: 10, bottom: 14, left: "16%", width: "9%",
            borderRadius: 20, background: "rgba(255,255,255,.34)", filter: "blur(2px)",
          }}
        />
        <div
          style={{
            position: "absolute", top: 14, bottom: 30, right: "13%", width: "4%",
            borderRadius: 20, background: "rgba(255,255,255,.14)", filter: "blur(1.5px)",
          }}
        />
      </div>
      {/* rim */}
      <div
        style={{
          position: "absolute", top: cork ? 18 : 0, left: -1, width: w + 2, height: 9,
          borderRadius: "50%", border: "1px solid rgba(255,255,255,.22)",
          background: "linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,0))",
        }}
      />
    </div>
  );
}

// ── Home / shelf of levels ──────────────────────────────────────────────────
function Home({ onPlay, solved }) {
  return (
    <div className="min-h-screen w-full px-8 py-14 flex flex-col" style={{ color: "#e9e1d4" }}>
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <h1 className="font-display italic" style={{ fontSize: "clamp(56px,18vw,84px)", lineHeight: 0.92 }}>
          tincture<span style={{ opacity: 0.5 }}>.</span>
        </h1>
        <p className="font-sans mt-5" style={{ fontSize: 15, lineHeight: 1.6, color: "#b3a892", maxWidth: 320 }}>
          A paint table. Mix from the tubes on the shelf until your glass matches
          the one you're given. Some colours take two pigments. The deepest take four.
        </p>

        <div className="grid grid-cols-4 gap-3 mt-12">
          {LEVELS.map((lvl, i) => {
            const isSolved = solved.has(i);
            const unlocked = i === 0 || solved.has(i - 1);
            return (
              <button
                key={i}
                disabled={!unlocked}
                onClick={() => onPlay(i)}
                className="relative aspect-square rounded-2xl font-sans"
                style={{
                  background: unlocked ? rgbStr(lvl.target) : "rgba(255,255,255,.04)",
                  border: "1px solid rgba(255,255,255,.10)",
                  opacity: unlocked ? 1 : 0.5,
                  boxShadow: unlocked ? "inset 0 1px 2px rgba(255,255,255,.25), 0 6px 14px rgba(0,0,0,.3)" : "none",
                  cursor: unlocked ? "pointer" : "default",
                  transition: "transform 300ms cubic-bezier(0.22,1,0.36,1)",
                }}
              >
                <span
                  className="absolute bottom-1.5 right-2"
                  style={{ fontSize: 11, color: "rgba(0,0,0,.4)", fontWeight: 500 }}
                >
                  {i + 1}
                </span>
                {isSolved && (
                  <span
                    className="absolute top-2 left-2 rounded-full"
                    style={{ width: 7, height: 7, background: "rgba(255,255,255,.85)" }}
                  />
                )}
                {!unlocked && (
                  <span className="absolute inset-0 flex items-center justify-center" style={{ fontSize: 13, color: "#8a8170" }}>
                    ·
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── A level / the mixing table ──────────────────────────────────────────────
function Level({ index, onBack, onNext, onSolved, audio }) {
  const lvl = LEVELS[index];
  const [drops, setDrops] = useState([]); // ordered pigment ids
  const [drip, setDrip] = useState(null);
  const [solved, setSolved] = useState(false);

  const counts = useMemo(() => {
    const c = {};
    for (const id of drops) c[id] = (c[id] || 0) + 1;
    return c;
  }, [drops]);

  const mix = useMemo(() => mixToRgb(counts), [counts]);
  const dE = mix ? deltaE(mix, lvl.target) : Infinity;
  const closeness = mix ? Math.max(0, Math.min(100, Math.round(100 * (1 - dE / 45)))) : 0;
  const capacity = 11;
  const fill = Math.min(0.92, 0.12 + (drops.length / capacity) * 0.8);

  useEffect(() => {
    if (!solved && mix && dE <= MATCH_THRESHOLD && drops.length > 0) {
      setSolved(true);
      audio.success();
      onSolved(index);
    }
  }, [dE, mix, solved, drops.length, index, audio, onSolved]);

  const addDrop = (id) => {
    if (solved) return;
    audio.drop(drops.length);
    setDrip({ key: Date.now(), color: PIGMENT_RGB[id] });
    setDrops((d) => [...d, id]);
  };
  const undo = () => {
    if (solved) return;
    audio.tap();
    setDrops((d) => d.slice(0, -1));
  };
  const empty = () => {
    if (solved) return;
    audio.tap();
    setDrops([]);
  };

  return (
    <div className="min-h-screen w-full px-7 pt-12 pb-8 flex flex-col" style={{ color: "#e9e1d4" }}>
      {/* header */}
      <div className="flex items-center justify-between max-w-md mx-auto w-full">
        <button onClick={onBack} className="font-sans" style={{ fontSize: 11, letterSpacing: "0.28em", color: "#9b917d" }}>
          ← SHELF
        </button>
        <span className="font-sans" style={{ fontSize: 11, letterSpacing: "0.28em", color: "#9b917d" }}>
          {lvl.hint.toUpperCase()}
        </span>
      </div>

      {/* tubes: target vs mix */}
      <div className="flex-1 flex items-center justify-center gap-10 max-w-md mx-auto w-full">
        <div className="flex flex-col items-center gap-3">
          <TestTube rgb={lvl.target} fill={0.74} cork w={62} h={196} />
          <span className="font-sans" style={{ fontSize: 10, letterSpacing: "0.3em", color: "#8f8672" }}>MATCH</span>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div style={{ filter: solved ? "drop-shadow(0 0 18px rgba(255,250,235,.55))" : "none", transition: "filter 700ms" }}>
            <TestTube rgb={mix} fill={fill} drip={drip} w={72} h={232} />
          </div>
          <span className="font-sans" style={{ fontSize: 10, letterSpacing: "0.3em", color: "#8f8672" }}>
            {solved ? "MATCHED" : `${drops.length} DROP${drops.length === 1 ? "" : "S"}`}
          </span>
        </div>
      </div>

      {/* feedback */}
      <div className="max-w-md mx-auto w-full" style={{ minHeight: 56 }}>
        <div
          style={{
            height: 3, borderRadius: 3, background: "rgba(255,255,255,.08)", overflow: "hidden",
            opacity: drops.length ? 1 : 0.4,
          }}
        >
          <div
            style={{
              height: "100%", width: `${closeness}%`,
              background: solved ? "#e9e1d4" : rgbStr(lvl.target),
              transition: "width 500ms cubic-bezier(0.22,1,0.36,1)",
            }}
          />
        </div>
        <p className="font-display italic text-center mt-3" style={{ fontSize: 19, color: solved ? "#f3ecdd" : "#c5bba4" }}>
          {solved ? "Matched." : hintFor(mix, lvl.target)}
        </p>
      </div>

      {/* shelf of pigment tubes */}
      <div className="max-w-md mx-auto w-full">
        <div className="flex items-end justify-center gap-5">
          {lvl.palette.map((id) => (
            <button
              key={id}
              onClick={() => addDrop(id)}
              disabled={solved}
              className="flex flex-col items-center gap-2 active:scale-95"
              style={{ transition: "transform 160ms cubic-bezier(0.22,1,0.36,1)", opacity: solved ? 0.5 : 1 }}
            >
              <TestTube rgb={PIGMENT_RGB[id]} fill={0.6} w={40} h={120} />
              <span className="font-sans" style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "#9b917d" }}>
                {PIGMENTS[id].name}
              </span>
            </button>
          ))}
        </div>

        {/* controls / next */}
        <div className="flex items-center justify-center gap-8 mt-7" style={{ height: 28 }}>
          {!solved ? (
            <>
              <button
                onClick={undo}
                disabled={!drops.length}
                className="font-sans"
                style={{ fontSize: 11, letterSpacing: "0.26em", color: drops.length ? "#9b917d" : "#5b5446" }}
              >
                UNDO
              </button>
              <button
                onClick={empty}
                disabled={!drops.length}
                className="font-sans"
                style={{ fontSize: 11, letterSpacing: "0.26em", color: drops.length ? "#9b917d" : "#5b5446" }}
              >
                EMPTY
              </button>
            </>
          ) : (
            <button
              onClick={onNext}
              className="font-sans"
              style={{
                fontSize: 11, letterSpacing: "0.3em", color: "#0e0c0b",
                background: "#e9e1d4", padding: "12px 30px", borderRadius: 999,
              }}
            >
              {index < LEVELS.length - 1 ? "NEXT →" : "RETURN TO SHELF"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Root ────────────────────────────────────────────────────────────────────
export default function MixApp() {
  const [screen, setScreen] = useState({ name: "home" });
  const [solved, setSolved] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORE_SOLVED) || "[]"));
    } catch {
      return new Set();
    }
  });
  const [muted, setMuted] = useState(() => localStorage.getItem(STORE_MUTED) === "1");
  const audio = useRef(new AudioEngine()).current;

  useEffect(() => {
    audio.setMuted(muted);
    localStorage.setItem(STORE_MUTED, muted ? "1" : "0");
  }, [muted, audio]);

  const markSolved = (i) => {
    setSolved((prev) => {
      const next = new Set(prev);
      next.add(i);
      localStorage.setItem(STORE_SOLVED, JSON.stringify([...next]));
      return next;
    });
  };

  const goNext = (fromIndex) => {
    const next = fromIndex + 1;
    if (next < LEVELS.length) setScreen({ name: "level", index: next });
    else setScreen({ name: "home" });
  };

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background:
          "radial-gradient(120% 80% at 50% -10%, #29231d 0%, #171310 55%, #0c0a08 100%)",
      }}
    >
      <FontInjector />
      <MuteToggle muted={muted} onToggle={() => setMuted((m) => !m)} />

      {screen.name === "home" && (
        <Home solved={solved} onPlay={(i) => setScreen({ name: "level", index: i })} />
      )}
      {screen.name === "level" && (
        <Level
          key={screen.index}
          index={screen.index}
          audio={audio}
          onBack={() => setScreen({ name: "home" })}
          onNext={() => goNext(screen.index)}
          onSolved={markSolved}
        />
      )}
    </div>
  );
}

function MuteToggle({ muted, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="fixed top-5 right-5 z-50"
      style={{ width: 28, height: 28, opacity: 0.55 }}
      aria-label={muted ? "Unmute" : "Mute"}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#e9e1d4" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9v6h4l5 4V5L8 9H4z" />
        {muted ? <path d="M17 9l4 6M21 9l-4 6" /> : <path d="M16 9a4 4 0 0 1 0 6" />}
      </svg>
    </button>
  );
}

function FontInjector() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;1,6..72,300;1,6..72,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap');
      .font-display { font-family: 'Newsreader', serif; font-optical-sizing: auto; }
      .font-sans { font-family: 'DM Sans', sans-serif; font-optical-sizing: auto; }
      @keyframes tincture-drip {
        0%   { transform: translateY(0) scaleY(0.7); opacity: 0; }
        15%  { opacity: 1; }
        80%  { transform: translateY(120px) scaleY(1.1); opacity: 1; }
        100% { transform: translateY(150px) scaleY(0.4); opacity: 0; }
      }
    `}</style>
  );
}
