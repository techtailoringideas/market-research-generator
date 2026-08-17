import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const FALLBACK_URL =
  process.env.N8N_WEBHOOK_URL ||
  "https://n8n-production-a4a2.up.railway.app/webhook/market-research";

// Are we running on a server that CAN'T reach the user's localhost?
// (Vercel/any cloud sets VERCEL or NODE_ENV=production.)
const isCloud = !!process.env.VERCEL || process.env.NODE_ENV === "production";

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let targetUrl =
    typeof payload.webhookUrl === "string" && payload.webhookUrl.trim()
      ? payload.webhookUrl.trim()
      : FALLBACK_URL;

  // If someone pastes a localhost URL but we're on the cloud, that can never
  // work (the server can't see their machine) — fall back to the real URL.
  const pointsToLocalhost = /localhost|127\.0\.0\.1/i.test(targetUrl);
  if (pointsToLocalhost && isCloud) {
    targetUrl = FALLBACK_URL;
  }

  const forwardBody = payload.body ?? payload;

  try {
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forwardBody),
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Could not reach n8n: ${err?.message || "unknown error"}.` },
      { status: 502 },
    );
  }
}
