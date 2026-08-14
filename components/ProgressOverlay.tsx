"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------
   The stages the pipeline moves through. These mirror the shape
   of the n8n workflow: gather → analyze → draft → render docs.
   They are ESTIMATED client-side (n8n's default webhook only
   returns once at the end), so we animate an honest-feeling
   survey rather than faking exact percentages.
------------------------------------------------------------ */
const STAGES = [
  { key: "brief", label: "Reading the brief", detail: "Parsing topic, rules & scope" },
  { key: "survey", label: "Surveying the field", detail: "Canonical facts pool" },
  { key: "triangulate", label: "Triangulating signals", detail: "Cross-referencing sources" },
  { key: "draft", label: "Drafting the report", detail: "Composing sections" },
  { key: "action", label: "Building action plan", detail: "Company-specific moves" },
  { key: "render", label: "Rendering documents", detail: "Two PDFs + one deck" },
];

// rough weight (seconds) each stage tends to occupy — purely for pacing
const WEIGHTS = [7, 16, 20, 26, 18, 22];

export default function ProgressOverlay({
  active,
  done,
  onClose,
}: {
  active: boolean;
  done: boolean;
  onClose: () => void;
}) {
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0); // 0..1 of the ambient survey
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  // total estimated duration
  const total = WEIGHTS.reduce((a, b) => a + b, 0);

  useEffect(() => {
    if (!active) return;
    startRef.current = performance.now();
    setStage(0);
    setProgress(0);
    setElapsed(0);

    const tick = () => {
      const now = performance.now();
      const secs = (now - startRef.current) / 1000;
      setElapsed(secs);

      // ease toward — but never quite reach — 92% until real completion
      const target = 0.92;
      const eased = target * (1 - Math.exp(-secs / (total * 0.55)));
      setProgress(eased);

      // derive the stage from cumulative weights * eased fraction of plan
      const planned = eased / target; // 0..1 across planned stages
      let acc = 0;
      let s = 0;
      for (let i = 0; i < WEIGHTS.length; i++) {
        acc += WEIGHTS[i] / total;
        if (planned <= acc) { s = i; break; }
        s = i;
      }
      setStage(s);

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, total]);

  // when the real request resolves, snap to complete
  useEffect(() => {
    if (done) {
      cancelAnimationFrame(rafRef.current);
      setProgress(1);
      setStage(STAGES.length - 1);
    }
  }, [done]);

  if (!active && !done) return null;

  const pct = Math.round(progress * 100);
  const circumference = 2 * Math.PI * 132;
  const dash = circumference * progress;

  return (
    <div className="ov-root" role="dialog" aria-modal="true" aria-label="Generating report">
      <div className="ov-scrim" />
      <div className="ov-card">
        {/* LEFT — the instrument */}
        <div className="ov-instrument">
          <svg viewBox="0 0 300 300" className="ov-dial" aria-hidden="true">
            {/* concentric survey rings */}
            <circle cx="150" cy="150" r="132" className="ring-track" />
            <circle
              cx="150" cy="150" r="132"
              className="ring-progress"
              strokeDasharray={`${dash} ${circumference}`}
              transform="rotate(-90 150 150)"
            />
            {/* tick marks around the dial */}
            {Array.from({ length: 60 }).map((_, i) => {
              const a = (i / 60) * Math.PI * 2;
              const r1 = i % 5 === 0 ? 108 : 114;
              const r2 = 120;
              return (
                <line
                  key={i}
                  x1={150 + Math.cos(a) * r1}
                  y1={150 + Math.sin(a) * r1}
                  x2={150 + Math.cos(a) * r2}
                  y2={150 + Math.sin(a) * r2}
                  className={i % 5 === 0 ? "tick-major" : "tick-minor"}
                />
              );
            })}
            {/* sweeping needle */}
            <g
              className="needle"
              style={{ transform: `rotate(${progress * 320 - 90}deg)`, transformOrigin: "150px 150px" }}
            >
              <line x1="150" y1="150" x2="150" y2="42" className="needle-line" />
              <circle cx="150" cy="42" r="5" className="needle-tip" />
            </g>
            <circle cx="150" cy="150" r="8" className="hub" />

            {/* readout */}
            <text x="150" y="200" textAnchor="middle" className="dial-pct">{done ? 100 : pct}</text>
            <text x="150" y="222" textAnchor="middle" className="dial-unit">PERCENT SURVEYED</text>
          </svg>
        </div>

        {/* RIGHT — the log of stages */}
        <div className="ov-log">
          <div className="ov-log-head">
            <span className="ov-eyebrow">Field Report · Live</span>
            <h3>{done ? "Survey complete" : "Charting your market"}</h3>
            <p>
              {done
                ? "Your documents are ready below."
                : "Hold tight — an analyst pipeline is running end to end. This usually takes a minute or two."}
            </p>
          </div>

          <ol className="ov-stages">
            {STAGES.map((st, i) => {
              const state = done || i < stage ? "done" : i === stage ? "active" : "todo";
              return (
                <li key={st.key} className={`ov-stage ${state}`}>
                  <span className="ov-node">
                    {state === "done" ? (
                      <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6.2l2.6 2.6L10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ) : state === "active" ? (
                      <span className="ov-ping" />
                    ) : (
                      <span className="ov-idle" />
                    )}
                  </span>
                  <span className="ov-stage-text">
                    <b>{st.label}</b>
                    <em>{st.detail}</em>
                  </span>
                  <span className="ov-stage-code">{String(i + 1).padStart(2, "0")}</span>
                </li>
              );
            })}
          </ol>

          <div className="ov-foot">
            <span className="ov-timer">
              T+{Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, "0")}
            </span>
            {done ? (
              <button className="ov-close" onClick={onClose}>View documents</button>
            ) : (
              <span className="ov-working">
                <span className="ov-bars"><i/><i/><i/><i/><i/></span>
                pipeline running
              </span>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .ov-root {
          position: fixed; inset: 0; z-index: 1000;
          display: flex; align-items: center; justify-content: center;
          padding: 1.2rem;
        }
        .ov-scrim {
          position: absolute; inset: 0;
          background: rgba(20, 40, 36, 0.32);
          backdrop-filter: blur(6px);
          animation: fade 0.3s ease;
        }
        @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
        .ov-card {
          position: relative;
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 0;
          width: min(760px, 100%);
          background: var(--paper);
          border: 1px solid var(--line-strong);
          border-radius: 14px;
          box-shadow: var(--shadow-lg);
          overflow: hidden;
          animation: rise 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @keyframes rise { from { opacity: 0; transform: translateY(18px) scale(0.98) } to { opacity: 1; transform: none } }

        .ov-instrument {
          background:
            radial-gradient(circle at 50% 45%, #ffffff, var(--paper-2));
          border-right: 1px solid var(--line);
          display: flex; align-items: center; justify-content: center;
          padding: 1.4rem;
        }
        .ov-dial { width: 100%; max-width: 260px; }
        .ring-track { fill: none; stroke: var(--line); stroke-width: 3; }
        .ring-progress {
          fill: none; stroke: var(--teal); stroke-width: 5; stroke-linecap: round;
          transition: stroke-dasharray 0.25s linear;
        }
        .tick-major { stroke: var(--ink-soft); stroke-width: 1.4; }
        .tick-minor { stroke: var(--line-strong); stroke-width: 0.8; }
        .needle { transition: transform 0.3s cubic-bezier(0.3,0.7,0.3,1); }
        .needle-line { stroke: var(--coral); stroke-width: 2.4; stroke-linecap: round; }
        .needle-tip { fill: var(--coral); }
        .hub { fill: var(--ink); }
        .dial-pct {
          font-family: var(--font-display); font-weight: 600;
          font-size: 46px; fill: var(--ink);
        }
        .dial-unit {
          font-family: var(--font-mono); font-size: 8.5px;
          letter-spacing: 0.22em; fill: var(--sage-deep);
        }

        .ov-log { padding: 1.8rem 1.7rem 1.4rem; display: flex; flex-direction: column; }
        .ov-eyebrow {
          font-family: var(--font-mono); font-size: 0.68rem; letter-spacing: 0.2em;
          text-transform: uppercase; color: var(--coral); font-weight: 500;
        }
        .ov-log-head h3 {
          font-family: var(--font-display); font-size: 1.5rem; font-weight: 600;
          margin: 0.35rem 0 0.3rem; letter-spacing: -0.01em;
        }
        .ov-log-head p { font-size: 0.86rem; color: var(--ink-soft); line-height: 1.45; }

        .ov-stages { list-style: none; margin: 1.4rem 0 0; padding: 0; flex: 1; }
        .ov-stage {
          display: grid;
          grid-template-columns: 26px 1fr auto;
          align-items: center;
          gap: 0.7rem;
          padding: 0.5rem 0;
          position: relative;
        }
        .ov-stage:not(:last-child) .ov-node::after {
          content: ""; position: absolute; left: 12px; top: 26px; bottom: -4px;
          width: 1px; background: var(--line-strong);
        }
        .ov-node {
          width: 26px; height: 26px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid var(--line-strong); background: #fffdf8;
          position: relative; z-index: 1; color: var(--paper);
        }
        .ov-stage.done .ov-node { background: var(--teal); border-color: var(--teal); }
        .ov-stage.active .ov-node { border-color: var(--coral); }
        .ov-idle { width: 6px; height: 6px; border-radius: 50%; background: var(--line-strong); }
        .ov-ping {
          width: 9px; height: 9px; border-radius: 50%; background: var(--coral);
          box-shadow: 0 0 0 0 rgba(236,90,58,0.5); animation: png 1.4s infinite;
        }
        @keyframes png {
          0% { box-shadow: 0 0 0 0 rgba(236,90,58,0.5) }
          70% { box-shadow: 0 0 0 7px rgba(236,90,58,0) }
          100% { box-shadow: 0 0 0 0 rgba(236,90,58,0) }
        }
        .ov-stage-text { display: flex; flex-direction: column; line-height: 1.25; }
        .ov-stage-text b {
          font-size: 0.9rem; font-weight: 600; color: var(--ink);
          transition: color 0.2s ease;
        }
        .ov-stage.todo .ov-stage-text b { color: var(--sage-deep); }
        .ov-stage-text em {
          font-style: normal; font-family: var(--font-mono);
          font-size: 0.7rem; color: var(--ink-soft); letter-spacing: 0.02em;
        }
        .ov-stage.todo .ov-stage-text em { opacity: 0.5; }
        .ov-stage-code {
          font-family: var(--font-mono); font-size: 0.72rem;
          color: var(--sage-deep); letter-spacing: 0.06em;
        }
        .ov-stage.active .ov-stage-code { color: var(--coral); }

        .ov-foot {
          display: flex; align-items: center; justify-content: space-between;
          margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid var(--line);
        }
        .ov-timer {
          font-family: var(--font-mono); font-size: 0.8rem;
          color: var(--ink); letter-spacing: 0.06em;
        }
        .ov-working {
          display: flex; align-items: center; gap: 0.6rem;
          font-family: var(--font-mono); font-size: 0.72rem;
          text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-soft);
        }
        .ov-bars { display: inline-flex; gap: 2px; align-items: flex-end; height: 14px; }
        .ov-bars i {
          width: 3px; background: var(--teal); border-radius: 1px;
          animation: eq 1s ease-in-out infinite;
        }
        .ov-bars i:nth-child(1) { animation-delay: 0s; height: 6px; }
        .ov-bars i:nth-child(2) { animation-delay: 0.15s; height: 11px; }
        .ov-bars i:nth-child(3) { animation-delay: 0.3s; height: 8px; }
        .ov-bars i:nth-child(4) { animation-delay: 0.45s; height: 13px; }
        .ov-bars i:nth-child(5) { animation-delay: 0.6s; height: 7px; }
        @keyframes eq { 0%,100% { transform: scaleY(0.5) } 50% { transform: scaleY(1) } }

        .ov-close {
          font-family: var(--font-body); font-weight: 600; font-size: 0.86rem;
          color: var(--paper); background: var(--teal); border: none;
          border-radius: 4px; padding: 0.6rem 1.2rem; cursor: pointer;
          transition: background 0.2s ease;
        }
        .ov-close:hover { background: var(--ink); }

        @media (max-width: 620px) {
          .ov-card { grid-template-columns: 1fr; }
          .ov-instrument { border-right: none; border-bottom: 1px solid var(--line); }
          .ov-dial { max-width: 190px; }
        }
      `}</style>
    </div>
  );
}
