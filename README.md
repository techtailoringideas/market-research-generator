# Meridian — Market Research Report Generator

A premium Next.js front end for your **n8n market-research pipeline**. A user fills
in a brief, the app calls your workflow, and it returns **two PDFs and one PowerPoint
deck** — shown as clean, downloadable cards. While the pipeline runs, a custom
"survey instrument" progress display keeps the wait engaging.

---

## 1. Run it locally

```bash
# 1. install
npm install

# 2. (optional) configure your n8n webhook
cp .env.local.example .env.local
#    then edit .env.local and paste your webhook URL

# 3. start
npm run dev
```

Open **http://localhost:3000**.

> **No webhook yet?** Leave `N8N_WEBHOOK_URL` blank. The app runs in **DEMO MODE**
> and returns sample documents so you can see the entire flow before wiring n8n.

---

## 2. How the app talks to n8n

The browser never calls n8n directly. Instead:

```
Browser  ──POST /api/generate──►  Next.js route  ──POST──►  n8n Webhook
                                        ▲                        │
                                        └────── documents ◄──────┘
```

The proxy (`app/api/generate/route.ts`) keeps your webhook URL private, avoids
CORS issues, and allows a long timeout for slow report generation.

### What the app SENDS to your webhook

A JSON body with exactly these fields (matching your form):

```json
{
  "topic": "…",
  "docInfo": "…",
  "rules": "…",
  "specialSections": "…",
  "companyName": "…",
  "companyIdeas": "…",
  "audience": "…",
  "geography": "…",
  "timeHorizon": "…",
  "colorPrimary": "#1f6f5c",
  "colorAccent": "#ec5a3a"
}
```

In your n8n **Webhook** node these arrive under `{{ $json.body.topic }}`, etc.
(or `{{ $json.topic }}` depending on your n8n version / "response" settings).

### What your webhook should RETURN

The app is flexible — it accepts any **one** of these response shapes:

**Recommended — a JSON list of documents:**
```json
{
  "documents": [
    { "kind": "pdf",  "title": "Market Research Report", "subtitle": "The full study",  "url": "https://…/report.pdf" },
    { "kind": "pdf",  "title": "Action Plan",            "subtitle": "Recommendations", "url": "https://…/action.pdf" },
    { "kind": "pptx", "title": "Presentation Deck",      "subtitle": "Slides",          "url": "https://…/deck.pptx" }
  ]
}
```

**Or named URLs:**
```json
{
  "reportPdfUrl": "https://…/report.pdf",
  "actionPdfUrl": "https://…/action.pdf",
  "deckPptxUrl":  "https://…/deck.pptx"
}
```

**Or a flat list of URLs:**
```json
{ "urls": ["https://…/report.pdf", "https://…/action.pdf", "https://…/deck.pptx"] }
```

**Or a single binary file** (one PDF or PPTX streamed back) — the app will wrap it
into a download automatically.

The `url` values must be reachable by the browser (a public link, a signed cloud
URL, or a file served by n8n). See "Serving the files" below.

---

## 3. Wiring the n8n side (step by step)

Your existing "Market Research Pipeline" already ends by writing files to disk with
several **Read/Write Files from Disk** nodes. To surface those to this website:

1. **Swap the Form Trigger for a Webhook trigger** (or add a Webhook trigger in
   parallel). Set it to `POST`. Copy its **Production URL** into `.env.local`.

2. **Make the workflow respond with the files.** Two common patterns:

   **Pattern A — upload the files, return links (most robust).**
   After your files are generated, add nodes to upload each to storage
   (S3, Google Drive, Supabase, etc.), collect the public/signed URLs, then a
   **Respond to Webhook** node returning the JSON `documents` array above.

   **Pattern B — return the files inline.**
   If you'd rather not use storage, base64-encode each file in a **Code** node and
   have your app host serve them — or return one binary directly from
   **Respond to Webhook** (Response Mode: *Using 'Respond to Webhook' node*,
   with binary data). The proxy handles a single binary automatically.

3. **Set the Webhook node's "Response Mode" to `Using 'Respond to Webhook' Node`**
   so the HTTP call stays open until your PDFs/PPT are ready, then finishes with
   the document links. This is what lets the website wait and then show results.

### Serving the files

- **Cloud storage (recommended):** upload in n8n and return the links. Works from
  anywhere.
- **Local dev only:** if files live on disk next to n8n, you can serve the folder
  with any static server and return `http://localhost:PORT/filename.pdf` links.

---

## 4. Customizing

- **Colours / identity:** all design tokens live at the top of `app/globals.css`
  (`:root`). Change the palette there.
- **Form fields:** edit `app/page.tsx`. The `FormState` type + the `<input>`s are
  the single source of truth for what gets sent to n8n.
- **Progress stages:** the wording of the loading instrument is in
  `components/ProgressOverlay.tsx` (`STAGES`). Tune labels/pacing to match your
  real pipeline steps.
- **Timeout:** `N8N_TIMEOUT_MS` in `.env.local`.

---

## 5. Project structure

```
app/
  layout.tsx            root layout + fonts
  page.tsx              hero + the full brief form + submit logic
  globals.css           design system / identity
  api/generate/route.ts proxy to the n8n webhook (+ demo mode)
components/
  ProgressOverlay.tsx   the "survey instrument" loading experience
  Results.tsx           the 3 document cards
```

---

## 6. Build for production

```bash
npm run build
npm run start
```

Deploy anywhere that runs Next.js (Vercel, a Node server, Docker). Just set
`N8N_WEBHOOK_URL` in that environment.
