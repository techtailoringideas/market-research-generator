"use client";

import { useEffect, useRef, useState } from "react";
import ProgressOverlay from "@/components/ProgressOverlay";
import Results, { DocItem } from "@/components/Results";

/* ============================================================
   ASYNC DESIGN
   1. Make a jobId, send form+jobId to the /api/generate proxy.
   2. Proxy forwards to n8n; n8n replies instantly and runs the
      pipeline in the background, uploading 3 files to Supabase
      named: <jobId>-report.pdf, -deck.pptx, -action.pdf
   3. Website polls Supabase directly for those 3 files until they exist.
   4. Show download cards. Never holds a long connection -> never times out.
   ============================================================ */

// --- Supabase public bucket base (your project) ---
const SUPABASE_PUBLIC =
  "https://qglyxiqaprjnrylmavkn.supabase.co/storage/v1/object/public/reports";

// the 3 files each job produces, in order
const FILE_PLAN: {
  kind: "pdf" | "pptx";
  title: string;
  subtitle: string;
  suffix: string;
  ext: string;
}[] = [
  {
    kind: "pdf",
    title: "Market Research Report",
    subtitle: "The full written study",
    suffix: "report",
    ext: "pdf",
  },
  {
    kind: "pptx",
    title: "Presentation Deck",
    subtitle: "Slide-ready summary",
    suffix: "deck",
    ext: "pptx",
  },
  {
    kind: "pdf",
    title: "Action Plan",
    subtitle: "Company-specific recommendations",
    suffix: "action",
    ext: "pdf",
  },
];

type FormState = {
  topic: string;
  docInfo: string;
  rules: string;
  specialSections: string;
  companyName: string;
  companyIdeas: string;
  audience: string;
  geography: string;
  timeHorizon: string;
  colorPrimary: string;
  colorAccent: string;
};

const INITIAL: FormState = {
  topic: "",
  docInfo: "",
  rules: "",
  specialSections: "",
  companyName: "",
  companyIdeas: "",
  audience: "",
  geography: "",
  timeHorizon: "",
  colorPrimary: "#1f6f5c",
  colorAccent: "#ec5a3a",
};

const LS_KEY = "meridian:webhookUrl";

export default function Home() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [docs, setDocs] = useState<DocItem[] | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<number | null>(null);

  const [webhookUrl, setWebhookUrl] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState("");

  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : "";
    if (saved) setWebhookUrl(saved);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  function openSettings() {
    setDraftUrl(webhookUrl);
    setSettingsOpen(true);
  }
  function saveSettings() {
    const v = draftUrl.trim();
    setWebhookUrl(v);
    try {
      localStorage.setItem(LS_KEY, v);
    } catch {}
    setSettingsOpen(false);
  }

  const connected = !!webhookUrl;

  const set =
    (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [k]: e.target.value }));
      if (errors[k]) setErrors((prev) => ({ ...prev, [k]: "" }));
    };

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.topic.trim())
      e.topic = "A topic is required to start the survey.";
    if (!form.companyName.trim())
      e.companyName = "Name the company the action plan is for.";
    if (!form.audience.trim()) e.audience = "Tell us who this report is for.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // check if a single file exists.
  // Uses a ranged GET (bytes=0-0) instead of HEAD: public Supabase objects
  // reliably answer a tiny ranged GET (200/206), whereas HEAD can be blocked
  // or answered inconsistently depending on storage/CORS config.
  async function fileExists(url: string): Promise<boolean> {
    try {
      const r = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        cache: "no-store",
      });
      return r.ok || r.status === 206;
    } catch {
      return false;
    }
  }

  function urlFor(jobId: string, suffix: string, ext: string) {
    return `${SUPABASE_PUBLIC}/${jobId}-${suffix}.${ext}`;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setFatal(null);

    if (!webhookUrl) {
      openSettings();
      setFatal("Add your n8n webhook URL first (Connection settings).");
      return;
    }
    if (!validate()) {
      document
        .querySelector(".field-error")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // make a unique job id
    const jobId = `job-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    setRunning(true);
    setDone(false);
    setDocs(null);

    // 1) kick off the pipeline via our proxy (avoids CORS; n8n replies instantly)
    //    The proxy reads webhookUrl and forwards `body` to n8n.
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl,
          body: { ...form, jobId },
        }),
      });
      // we don't rely on the body; a 200 means it started
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(
          t
            ? `n8n responded ${res.status}: ${t.slice(0, 200)}`
            : `n8n responded ${res.status}`,
        );
      }
    } catch (err: any) {
      setRunning(false);
      const msg = String(err?.message || err);
      setFatal(
        /Failed to fetch|NetworkError|load failed/i.test(msg)
          ? "Couldn't reach n8n to start the job. Check the webhook URL and that n8n + the tunnel are running."
          : msg,
      );
      return;
    }

    // 2) poll Supabase for the 3 files
    const started = Date.now();
    const MAX_MS = 20 * 60 * 1000; // give up after 20 min (pipeline is ~8-10)

    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      // stop if user closed
      if (Date.now() - started > MAX_MS) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setRunning(false);
        setFatal(
          "Timed out waiting for the files. The pipeline may still be running — try again shortly.",
        );
        return;
      }

      const urls = FILE_PLAN.map((f) => urlFor(jobId, f.suffix, f.ext));
      const checks = await Promise.all(urls.map((u) => fileExists(u)));
      const allReady = checks.every(Boolean);

      if (allReady) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        const items: DocItem[] = FILE_PLAN.map((f, i) => ({
          kind: f.kind,
          title: f.title,
          subtitle: f.subtitle,
          url: urls[i],
          filename: `${
            form.topic
              ? form.topic
                  .replace(/[^\w\s-]/g, "")
                  .trim()
                  .replace(/\s+/g, "-")
                  .slice(0, 50)
              : "report"
          }-${f.suffix}.${f.ext}`,
        }));
        setDocs(items);
        setDone(true);
        setRunning(false); // stop the "Running…" state so results can show
      }
    }, 5000); // check every 5s
  }

  function closeOverlay() {
    setRunning(false);
    setDone(false);
    setTimeout(
      () =>
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      60,
    );
  }

  function reset() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    setDocs(null);
    setDone(false);
    setForm(INITIAL);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      {/* MASTHEAD */}
      <header className="masthead">
        <div className="mark">
          <svg
            className="mark-glyph"
            viewBox="0 0 34 34"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="17"
              cy="17"
              r="16"
              stroke="var(--ink)"
              strokeWidth="1.5"
            />
            <path
              d="M17 3v28M3 17h28"
              stroke="var(--line-strong)"
              strokeWidth="1"
            />
            <path
              d="M17 17L27 9"
              stroke="var(--coral)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="17" cy="17" r="3" fill="var(--teal)" />
          </svg>
          <span className="mark-text">
            Meridian<span> / Research</span>
          </span>
        </div>
        <button
          className="masthead-meta conn-btn"
          onClick={openSettings}
          type="button"
          title="Connection settings"
        >
          <span className="env">n8n pipeline</span>
          <span
            className="status-dot"
            style={{
              background: connected ? "var(--teal-bright)" : "var(--coral)",
            }}
          />
          <span>{connected ? "connected" : "not set"}</span>
        </button>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="hero-lede">
          <span className="eyebrow">Brief → Package · One pass</span>
          <h1 className="hero-title">
            Chart a market
            <br />
            in <em>minutes,</em> not <span className="coral">weeks.</span>
          </h1>
          <p className="hero-sub">
            Describe what you need. An analyst pipeline surveys the field,
            drafts the argument, and hands back two written reports and a
            presentation deck — styled in your colours.
          </p>
          <div className="hero-stats">
            <div>
              <div className="stat-label">Delivers</div>
              <div className="stat-value">
                2 PDFs <span className="u">+ 1 deck</span>
              </div>
            </div>
            <div>
              <div className="stat-label">Typical run</div>
              <div className="stat-value">
                ~8 <span className="u">min</span>
              </div>
            </div>
            <div>
              <div className="stat-label">Inputs</div>
              <div className="stat-value">
                11 <span className="u">fields</span>
              </div>
            </div>
          </div>
        </div>
        <div className="hero-instrument">
          <HeroInstrument
            primary={form.colorPrimary}
            accent={form.colorAccent}
          />
        </div>
      </section>

      {/* FORM */}
      <section className="panel-region">
        <div className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">The brief</span>
              <h2>Market Research Report Generator</h2>
              <p>
                Fill in your report details. Fields marked with a dot are
                required.
              </p>
            </div>
            <div className="panel-index">
              FORM 01 / MERIDIAN
              <br />
              REV. {new Date().getFullYear()}
            </div>
          </div>

          <form className="form-body" onSubmit={handleSubmit} noValidate>
            <fieldset className="group">
              <legend className="group-legend">
                <span className="group-num">01</span>
                <h3>Scope of study</h3>
                <span className="rule" />
              </legend>
              <div className="grid">
                <div
                  className={`field full ${errors.topic ? "field-error" : ""}`}
                >
                  <label htmlFor="topic">
                    Topic <Dot />
                  </label>
                  <input
                    id="topic"
                    value={form.topic}
                    onChange={set("topic")}
                    placeholder="e.g. The premium cold-brew coffee market in South Asia"
                  />
                  {errors.topic && <span className="err">{errors.topic}</span>}
                </div>
                <div className="field full">
                  <label htmlFor="docInfo">
                    Background & source material{" "}
                    <span className="hint">
                      context the report should build on
                    </span>
                  </label>
                  <textarea
                    id="docInfo"
                    value={form.docInfo}
                    onChange={set("docInfo")}
                    placeholder="Paste key facts, links, prior findings, or anything the analysis should treat as given."
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="group">
              <legend className="group-legend">
                <span className="group-num">02</span>
                <h3>Shape & rules</h3>
                <span className="rule" />
              </legend>
              <div className="grid">
                <div className="field">
                  <label htmlFor="rules">
                    Rules & constraints{" "}
                    <span className="hint">tone, length, do / don't</span>
                  </label>
                  <textarea
                    id="rules"
                    value={form.rules}
                    onChange={set("rules")}
                    placeholder="e.g. Neutral tone, cite figures, keep under 12 pages, no jargon."
                  />
                </div>
                <div className="field">
                  <label htmlFor="specialSections">
                    Special sections{" "}
                    <span className="hint">sections to include</span>
                  </label>
                  <textarea
                    id="specialSections"
                    value={form.specialSections}
                    onChange={set("specialSections")}
                    placeholder="e.g. SWOT, competitor matrix, regulatory outlook, pricing ladder."
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="group">
              <legend className="group-legend">
                <span className="group-num">03</span>
                <h3>The company & action plan</h3>
                <span className="rule" />
              </legend>
              <div className="grid">
                <div
                  className={`field ${errors.companyName ? "field-error" : ""}`}
                >
                  <label htmlFor="companyName">
                    Company name <Dot />
                  </label>
                  <input
                    id="companyName"
                    value={form.companyName}
                    onChange={set("companyName")}
                    placeholder="e.g. Northwind Beverages"
                  />
                  {errors.companyName && (
                    <span className="err">{errors.companyName}</span>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="companyIdeas">
                    Company ideas & direction{" "}
                    <span className="hint">what they're considering</span>
                  </label>
                  <input
                    id="companyIdeas"
                    value={form.companyIdeas}
                    onChange={set("companyIdeas")}
                    placeholder="e.g. Launch a canned line, enter Nepal, premium tier."
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="group">
              <legend className="group-legend">
                <span className="group-num">04</span>
                <h3>Frame</h3>
                <span className="rule" />
              </legend>
              <div className="grid">
                <div
                  className={`field ${errors.audience ? "field-error" : ""}`}
                >
                  <label htmlFor="audience">
                    Audience <Dot />
                  </label>
                  <input
                    id="audience"
                    value={form.audience}
                    onChange={set("audience")}
                    placeholder="e.g. Founders & investors"
                  />
                  {errors.audience && (
                    <span className="err">{errors.audience}</span>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="geography">
                    Geography <span className="hint">markets in scope</span>
                  </label>
                  <input
                    id="geography"
                    value={form.geography}
                    onChange={set("geography")}
                    placeholder="e.g. Nepal, India, Bangladesh"
                  />
                </div>
                <div className="field full">
                  <label htmlFor="timeHorizon">
                    Time horizon{" "}
                    <span className="hint">
                      the window the report should reason over
                    </span>
                  </label>
                  <input
                    id="timeHorizon"
                    value={form.timeHorizon}
                    onChange={set("timeHorizon")}
                    placeholder="e.g. 2026–2029"
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="group">
              <legend className="group-legend">
                <span className="group-num">05</span>
                <h3>Document palette</h3>
                <span className="rule" />
              </legend>
              <div className="color-row">
                <ColorField
                  label="Primary colour"
                  name="colorPrimary"
                  value={form.colorPrimary}
                  onChange={(v) => setForm((f) => ({ ...f, colorPrimary: v }))}
                />
                <ColorField
                  label="Accent colour"
                  name="colorAccent"
                  value={form.colorAccent}
                  onChange={(v) => setForm((f) => ({ ...f, colorAccent: v }))}
                />
              </div>
            </fieldset>

            <div className="submit-bar">
              <p className="submit-note">
                On submit, your brief starts your <b>n8n workflow</b>. The page
                checks for your finished files and shows them here when ready —
                you can keep waiting safely.
                {!connected && (
                  <>
                    {" "}
                    —{" "}
                    <button
                      type="button"
                      className="inline-link"
                      onClick={openSettings}
                    >
                      set the webhook URL
                    </button>{" "}
                    first.
                  </>
                )}
              </p>
              <button className="btn-run" type="submit" disabled={running}>
                {running ? "Running…" : "Generate report"}
                {!running && (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path
                      d="M3 9h11M10 4l5 5-5 5"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </div>
            {fatal && (
              <p className="err" style={{ marginTop: "1rem" }}>
                {fatal}
              </p>
            )}
          </form>
        </div>

        <div ref={resultsRef}>
          {docs && !running && <Results docs={docs} onReset={reset} />}
        </div>
      </section>

      <footer className="foot">
        <span>Meridian Research · Powered by your n8n pipeline</span>
        <button type="button" className="inline-link" onClick={openSettings}>
          Connection settings
        </button>
      </footer>

      <ProgressOverlay active={running} done={done} onClose={closeOverlay} />

      {settingsOpen && (
        <div
          className="cs-root"
          role="dialog"
          aria-modal="true"
          aria-label="Connection settings"
        >
          <div className="cs-scrim" onClick={() => setSettingsOpen(false)} />
          <div className="cs-card">
            <span className="eyebrow" style={{ color: "var(--teal)" }}>
              Connection settings
            </span>
            <h3 className="serif cs-title">Link your n8n webhook</h3>
            <p className="cs-help">
              Paste the current n8n webhook URL. It looks like{" "}
              <code>
                https://xxxx.trycloudflare.com/webhook/market-research
              </code>
              . Saved in this browser only.
            </p>
            <label className="cs-label" htmlFor="cs-url">
              Webhook URL
            </label>
            <input
              id="cs-url"
              className="cs-input"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="https://xxxx.trycloudflare.com/webhook/market-research"
              spellCheck={false}
              autoComplete="off"
            />
            <div className="cs-actions">
              <button
                type="button"
                className="cs-cancel"
                onClick={() => setSettingsOpen(false)}
              >
                Cancel
              </button>
              <button type="button" className="cs-save" onClick={saveSettings}>
                Save
              </button>
            </div>
          </div>
          <style jsx>{`
            .cs-root {
              position: fixed;
              inset: 0;
              z-index: 1100;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 1.2rem;
            }
            .cs-scrim {
              position: absolute;
              inset: 0;
              background: rgba(20, 40, 36, 0.32);
              backdrop-filter: blur(5px);
            }
            .cs-card {
              position: relative;
              width: min(560px, 100%);
              background: var(--paper);
              border: 1px solid var(--line-strong);
              border-radius: 14px;
              box-shadow: var(--shadow-lg);
              padding: 1.8rem 1.8rem 1.5rem;
              animation: csrise 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
            }
            @keyframes csrise {
              from {
                opacity: 0;
                transform: translateY(14px) scale(0.98);
              }
              to {
                opacity: 1;
                transform: none;
              }
            }
            .cs-title {
              font-size: 1.5rem;
              font-weight: 600;
              margin: 0.35rem 0 0.6rem;
              letter-spacing: -0.01em;
            }
            .cs-help {
              font-size: 0.86rem;
              color: var(--ink-soft);
              line-height: 1.5;
              margin-bottom: 1.2rem;
            }
            .cs-help code {
              font-family: var(--font-mono);
              font-size: 0.78rem;
              color: var(--teal);
              background: var(--paper-2);
              padding: 0.05rem 0.3rem;
              border-radius: 3px;
              word-break: break-all;
            }
            .cs-label {
              font-family: var(--font-mono);
              font-size: 0.72rem;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              color: var(--ink);
              font-weight: 500;
              display: block;
              margin-bottom: 0.45rem;
            }
            .cs-input {
              width: 100%;
              font-family: var(--font-mono);
              font-size: 0.88rem;
              color: var(--ink);
              background: #fffdf8;
              border: 1px solid var(--line-strong);
              border-radius: var(--radius);
              padding: 0.7rem 0.8rem;
              transition:
                border-color 0.18s ease,
                box-shadow 0.18s ease;
            }
            .cs-input:focus {
              outline: none;
              border-color: var(--teal);
              box-shadow: 0 0 0 3px rgba(42, 157, 120, 0.14);
            }
            .cs-actions {
              display: flex;
              justify-content: flex-end;
              gap: 0.7rem;
              margin-top: 1.4rem;
            }
            .cs-cancel {
              font-family: var(--font-body);
              font-size: 0.9rem;
              color: var(--ink-soft);
              background: none;
              border: 1px solid var(--line-strong);
              border-radius: var(--radius);
              padding: 0.6rem 1.2rem;
              cursor: pointer;
              transition: background 0.18s ease;
            }
            .cs-cancel:hover {
              background: var(--paper-2);
            }
            .cs-save {
              font-family: var(--font-body);
              font-weight: 600;
              font-size: 0.9rem;
              color: var(--paper);
              background: var(--ink);
              border: none;
              border-radius: var(--radius);
              padding: 0.6rem 1.4rem;
              cursor: pointer;
              transition: background 0.2s ease;
            }
            .cs-save:hover {
              background: var(--teal);
            }
          `}</style>
        </div>
      )}
    </>
  );
}

function Dot() {
  return (
    <span
      title="required"
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "var(--coral)",
        display: "inline-block",
      }}
    />
  );
}

function ColorField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const NAMES: Record<string, string> = {
    navy: "#0c2440",
    gold: "#c9a227",
    blue: "#1e40af",
    royalblue: "#1e40af",
    red: "#b91c1c",
    green: "#15803d",
    teal: "#0f766e",
    cyan: "#0891b2",
    purple: "#6d28d9",
    violet: "#6d28d9",
    charcoal: "#1f2937",
    grey: "#374151",
    gray: "#374151",
    pink: "#be185d",
    magenta: "#be185d",
    orange: "#c2410c",
    amber: "#b45309",
    maroon: "#7f1d1d",
    burgundy: "#7f1d1d",
    emerald: "#047857",
    forest: "#065f46",
    black: "#111111",
    slate: "#334155",
    indigo: "#4338ca",
    crimson: "#9f1239",
    olive: "#4d7c0f",
    bronze: "#92400e",
  };
  function toHex(v: string): string {
    const t = v.trim().toLowerCase();
    const noHash = t.replace("#", "");
    if (/^[0-9a-f]{6}$/i.test(noHash)) return "#" + noHash;
    if (/^[0-9a-f]{3}$/i.test(noHash))
      return (
        "#" +
        noHash
          .split("")
          .map((c) => c + c)
          .join("")
      );
    if (NAMES[t]) return NAMES[t];
    return "#cccccc";
  }
  const preview = toHex(value);
  const known = preview !== "#cccccc";
  return (
    <div className="color-field">
      <div className="swatch-wrap">
        <input
          type="color"
          id={`${name}-picker`}
          value={known ? preview : "#1f6f5c"}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} swatch`}
        />
      </div>
      <div className="color-meta" style={{ flex: 1 }}>
        <label htmlFor={name} className="name">
          {label}
        </label>
        <input
          id={name}
          className="color-text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#1f6f5c or navy"
          spellCheck={false}
          autoComplete="off"
        />
        <span className="color-resolved">
          {known ? preview.toUpperCase() : "type a hex or colour name"}
        </span>
      </div>
    </div>
  );
}

function HeroInstrument({
  primary,
  accent,
}: {
  primary: string;
  accent: string;
}) {
  return (
    <svg
      viewBox="0 0 320 320"
      width="100%"
      style={{ maxWidth: 360 }}
      aria-hidden="true"
    >
      <circle
        cx="160"
        cy="160"
        r="150"
        fill="#fffdf8"
        stroke="var(--line-strong)"
        strokeWidth="1.5"
      />
      <circle
        cx="160"
        cy="160"
        r="150"
        fill="none"
        stroke={primary}
        strokeWidth="2"
        strokeDasharray="4 8"
        opacity="0.4"
      />
      <g stroke="var(--line)" strokeWidth="1">
        <ellipse cx="160" cy="160" rx="150" ry="60" fill="none" />
        <ellipse cx="160" cy="160" rx="150" ry="105" fill="none" />
        <ellipse cx="160" cy="160" rx="105" ry="150" fill="none" />
        <ellipse cx="160" cy="160" rx="60" ry="150" fill="none" />
        <line x1="10" y1="160" x2="310" y2="160" />
        <line x1="160" y1="10" x2="160" y2="310" />
      </g>
      <polyline
        points="70,220 105,205 140,190 175,150 210,135 250,95"
        fill="none"
        stroke={primary}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[
        ["70", "220"],
        ["105", "205"],
        ["140", "190"],
        ["175", "150"],
        ["210", "135"],
        ["250", "95"],
      ].map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r="4.5"
          fill="#fffdf8"
          stroke={primary}
          strokeWidth="2.5"
        />
      ))}
      <g>
        <circle
          cx="250"
          cy="95"
          r="12"
          fill="none"
          stroke={accent}
          strokeWidth="2"
        >
          <animate
            attributeName="r"
            values="12;18;12"
            dur="2.6s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="1;0.2;1"
            dur="2.6s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="250" cy="95" r="5" fill={accent} />
      </g>
      <text
        x="160"
        y="300"
        textAnchor="middle"
        fontFamily="IBM Plex Mono, monospace"
        fontSize="9"
        letterSpacing="3"
        fill="var(--sage-deep)"
      >
        MARKET · FIG.01
      </text>
    </svg>
  );
}
