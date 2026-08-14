import { NextRequest, NextResponse } from "next/server";

/**
 * This route forwards the form brief to your n8n workflow's webhook and
 * returns whatever documents it produces back to the browser.
 *
 * WHY A PROXY (and not calling n8n directly from the browser)?
 *  - Keeps your webhook URL out of the client bundle.
 *  - Avoids CORS problems (n8n webhooks don't send CORS headers by default).
 *  - Lets you extend the timeout for long-running report generation.
 *
 * Configure the webhook URL in `.env.local`:
 *    N8N_WEBHOOK_URL=http://localhost:5678/webhook/your-webhook-id
 *
 * See README.md for exactly how to wire the n8n side.
 */

export const runtime = "nodejs";
export const maxDuration = 300; // allow up to 5 min for the pipeline (hosting-dependent)

const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

// how long to wait for n8n before giving up (ms)
const TIMEOUT_MS = Number(process.env.N8N_TIMEOUT_MS || 280_000);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // ----- DEMO MODE -----------------------------------------------------
  // If no webhook is configured, return sample documents so you can see
  // the full flow (progress instrument + results) before wiring n8n.
  if (!WEBHOOK_URL) {
    await sleep(3200);
    return NextResponse.json({
      documents: [
        {
          kind: "pdf",
          title: "Market Research Report",
          subtitle: "The full written study — demo output",
          url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
          filename: "market-research-report.pdf",
        },
        {
          kind: "pdf",
          title: "Action Plan",
          subtitle: "Company-specific recommendations — demo output",
          url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
          filename: "action-plan.pdf",
        },
        {
          kind: "pptx",
          title: "Presentation Deck",
          subtitle: "Slide-ready summary — demo output",
          url: "https://file-examples.com/storage/fe0b6a3f3e6b1e0f6b3f0a0/2017/08/file_example_PPT_250kB.ppt",
          filename: "presentation-deck.pptx",
        },
      ],
      _demo: true,
    });
  }

  // ----- LIVE MODE -----------------------------------------------------
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: `n8n responded ${upstream.status}. ${text.slice(0, 400)}` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "";

    // Case A: n8n returns JSON describing the documents (recommended).
    if (contentType.includes("application/json")) {
      const data = await upstream.json();
      return NextResponse.json(data);
    }

    // Case B: n8n returns a single binary file (e.g. one PDF). We surface it
    // as a data URL so the browser can download it without another round trip.
    const buf = Buffer.from(await upstream.arrayBuffer());
    const b64 = buf.toString("base64");
    const dataUrl = `data:${contentType || "application/octet-stream"};base64,${b64}`;
    return NextResponse.json({
      documents: [
        {
          kind: contentType.includes("presentation") ? "pptx" : "pdf",
          title: "Generated document",
          subtitle: "Returned by the pipeline",
          url: dataUrl,
          filename: fileNameFromHeaders(upstream) || "document",
        },
      ],
    });
  } catch (err: any) {
    clearTimeout(timer);
    const aborted = err?.name === "AbortError";
    return NextResponse.json(
      {
        error: aborted
          ? "The pipeline took too long and timed out. Try increasing N8N_TIMEOUT_MS."
          : `Could not reach n8n: ${err?.message || "unknown error"}. Is the webhook URL correct and n8n running?`,
      },
      { status: aborted ? 504 : 502 }
    );
  }
}

function fileNameFromHeaders(res: Response): string | null {
  const cd = res.headers.get("content-disposition");
  if (!cd) return null;
  const m = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
  return m ? decodeURIComponent(m[1].replace(/"/g, "")) : null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
