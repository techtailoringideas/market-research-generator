"use client";

export type DocItem = {
  kind: "pdf" | "pptx";
  title: string;
  subtitle: string;
  url: string; // download / view url
  filename?: string;
};

export default function Results({
  docs,
  onReset,
}: {
  docs: DocItem[];
  onReset: () => void;
}) {
  return (
    <div className="results" id="results">
      <div className="results-head">
        <span className="eyebrow" style={{ color: "var(--coral)" }}>
          Deliverables · Ready
        </span>
        <h2 className="serif">Your research package</h2>
        <p>
          Three documents, generated from your brief. Open or download each
          below.
        </p>
      </div>

      <div className="results-grid">
        {docs.map((d, i) => (
          <a
            key={i}
            href={d.url}
            target="_blank"
            rel="noreferrer"
            download={
              d.filename || `${d.title}.${d.kind === "pptx" ? "pptx" : "pdf"}`
            }
            className={`doc-card ${d.kind}`}
          >
            <div className="doc-top">
              <span className="doc-badge">
                {d.kind === "pdf" ? "PDF" : "PPTX"}
              </span>
              <span className="doc-num">{String(i + 1).padStart(2, "0")}</span>
            </div>
            <div className="doc-visual" aria-hidden="true">
              {d.kind === "pdf" ? <PdfGlyph /> : <DeckGlyph />}
            </div>
            <div className="doc-meta">
              <h3>{d.title}</h3>
              <p>{d.subtitle}</p>
            </div>
            <span className="doc-cta">
              Download {d.kind === "pptx" ? "PPTX" : "PDF"}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 2v9M4.5 7.5L8 11l3.5-3.5M3 13h10"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </a>
        ))}
      </div>

      <button className="results-reset" onClick={onReset}>
        ← Generate another report
      </button>

      <style jsx>{`
        .results {
          max-width: 1080px;
          margin: 2.5rem auto 0;
        }
        .results-head {
          text-align: center;
          margin-bottom: 2rem;
        }
        .results-head h2 {
          font-size: clamp(1.8rem, 4vw, 2.6rem);
          font-weight: 600;
          letter-spacing: -0.01em;
          margin: 0.5rem 0 0.4rem;
        }
        .results-head p {
          color: var(--ink-soft);
        }

        .results-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.4rem;
        }
        .doc-card {
          display: flex;
          flex-direction: column;
          background: var(--paper);
          border: 1px solid var(--line-strong);
          border-radius: 12px;
          padding: 1.3rem;
          text-decoration: none;
          color: var(--ink);
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            border-color 0.2s ease;
          position: relative;
          overflow: hidden;
          box-shadow: var(--shadow-sm);
        }
        .doc-card::after {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 4px;
          background: var(--teal);
        }
        .doc-card.pptx::after {
          background: var(--coral);
        }
        .doc-card:hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow-md);
          border-color: var(--teal);
        }
        .doc-card.pptx:hover {
          border-color: var(--coral);
        }

        .doc-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .doc-badge {
          font-family: var(--font-mono);
          font-size: 0.68rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          color: var(--paper);
          background: var(--teal);
          padding: 0.2rem 0.5rem;
          border-radius: 3px;
        }
        .doc-card.pptx .doc-badge {
          background: var(--coral);
        }
        .doc-num {
          font-family: var(--font-mono);
          font-size: 0.8rem;
          color: var(--sage-deep);
        }
        .doc-visual {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.6rem 0 1.2rem;
        }
        .doc-meta h3 {
          font-family: var(--font-display);
          font-size: 1.15rem;
          font-weight: 600;
          margin-bottom: 0.25rem;
        }
        .doc-meta p {
          font-size: 0.84rem;
          color: var(--ink-soft);
          line-height: 1.4;
        }
        .doc-cta {
          margin-top: 1.1rem;
          padding-top: 0.9rem;
          border-top: 1px solid var(--line);
          font-family: var(--font-mono);
          font-size: 0.76rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--teal);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .doc-card.pptx .doc-cta {
          color: var(--coral);
        }

        .results-reset {
          display: block;
          margin: 2rem auto 0;
          font-family: var(--font-mono);
          font-size: 0.8rem;
          letter-spacing: 0.05em;
          color: var(--ink-soft);
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.5rem;
        }
        .results-reset:hover {
          color: var(--teal);
        }

        @media (max-width: 780px) {
          .results-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function PdfGlyph() {
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
      <rect
        x="20"
        y="10"
        width="48"
        height="64"
        rx="4"
        fill="#fffdf8"
        stroke="var(--ink)"
        strokeWidth="2"
      />
      <path
        d="M20 24h48M20 34h30M20 42h38M20 50h30M20 58h38"
        stroke="var(--line-strong)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M46 34h22M46 42h0M46 50h22"
        stroke="var(--teal)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="48" y="54" width="24" height="20" rx="3" fill="var(--teal)" />
      <text
        x="60"
        y="68"
        textAnchor="middle"
        fontFamily="IBM Plex Mono, monospace"
        fontSize="9"
        fontWeight="600"
        fill="#fff"
      >
        PDF
      </text>
    </svg>
  );
}

function DeckGlyph() {
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
      <rect
        x="14"
        y="20"
        width="60"
        height="42"
        rx="4"
        fill="#fffdf8"
        stroke="var(--ink)"
        strokeWidth="2"
      />
      <rect
        x="20"
        y="28"
        width="20"
        height="14"
        rx="2"
        fill="var(--coral)"
        opacity="0.9"
      />
      <path
        d="M44 30h24M44 37h18M44 44h24M20 50h48"
        stroke="var(--line-strong)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M44 44h24"
        stroke="var(--coral)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M44 66v6M34 72h20"
        stroke="var(--ink)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
