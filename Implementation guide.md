# ShadowPersona AI Implementation Guide

**Status:** Hackathon implementation plan  
**Updated:** 19 October 2026  
**Target:** Public, usable Qloo Agentic Hackathon demo by 30 October 2026

This guide supersedes the earlier mock-only implementation examples. The original dashboard was a Vite prototype; its UI is now being ported to Next.js App Router for Vercel with Supabase. Do not treat the example personas, scores, CAC/LTV values, demo URL, or repository URL in the older blueprint as live product data or deployed resources.

**Build status:** The Next.js shell, current input/dashboard UI, Supabase anonymous-session clients, secure signed-upload route, initial RLS/storage migration, and explicit Qloo-pending API response are in place. The simulation route intentionally does not return fabricated results. PDF/image extraction, Mistral/Tavily calls, report persistence, retention cleanup, and the real Qloo request contract remain to be completed before the demo is end-to-end.

## 1. Decisions and scope

- **Web application:** Migrate the existing React dashboard to Next.js App Router and deploy it to Vercel.
- **Database and temporary file storage:** Supabase Postgres and a private Supabase Storage bucket. Cloudflare D1 and R2 are not part of this stack.
- **First vertical:** Music launch/event evaluation. Hospitality is the next vertical; do not build a second full workflow before the music path works end to end.
- **Inputs:** One PDF or PNG/JPG image, up to 10 MB, or a user-provided web URL. Validate content type and size on the server as well as in the UI.
- **Uploads:** Store originals temporarily in private storage and delete them after processing. Do not make uploaded assets publicly addressable.
- **Saved context:** Keep extracted text, user-confirmed tags, Qloo evidence, any cited Tavily results, and the generated report in Supabase for 30 days. Do not store the original uploaded file in the report tables. Provide a delete action and expire records automatically.
- **LLM:** Use one Mistral agent with tightly scoped tools. Prefer a current Mistral Small model variant that supports the required image input and tool calling. Confirm its exact model ID against the account before pinning it. Evaluate Mistral Large only if Small fails quality checks. Codestral and Mistral Embed are not needed for the first release.
- **Web research:** Include Tavily as an optional, server-side enrichment tool for submitted URLs or when additional context is useful. Qloo remains the cultural-intelligence source and must materially affect the result.
- **Qloo:** Keep the Qloo tool and integration boundary in the workflow now. The API key and exact endpoint/request contract are pending. Do not guess the endpoint, show fabricated “live” Qloo results, or return successful-looking demo data when credentials are missing.
- **Commercial SaaS features:** Defer billing, enterprise tenancy, SSO, and commercial forecasting. The hackathon demo should be public and usable without a required sign-in; isolate anonymous sessions so users cannot read one another’s saved reports.

## 2. Product promise

ShadowPersona evaluates a music launch brief using real Qloo cultural-affinity results and explains the matches in context. The user should be able to see:

1. What the system extracted from the uploaded brief or image.
2. The extracted tags/entities, with an opportunity to correct them.
3. The Qloo matches and evidence returned for the selected music context.
4. Optional, clearly cited web context from Tavily.
5. A concise Mistral-generated explanation grounded in those results.

The LLM may summarize, ask for clarification, and select from server-defined tools. It must not invent Qloo entities, affinity scores, source citations, or financial outcomes. Describe generated findings as cultural-fit analysis, not measured consumer demand or validated purchase intent.

## 3. Runtime architecture

```text
Browser
  ├─ Next.js UI on Vercel
  ├─ Upload via short-lived, user-scoped Supabase Storage authorization
  └─ Calls authenticated/session-scoped Next.js route handlers
       ├─ Validate input and access to the uploaded object
       ├─ Extract PDF text or send supported image input to Mistral
       ├─ Ask the user to confirm extracted tags where practical
       ├─ Mistral agent calls server-controlled tools
       │    ├─ Qloo search/insights (real API contract pending)
       │    └─ Tavily search/extract (optional, cited, untrusted content)
       ├─ Validate provider responses and persist a 30-day report in Supabase
       └─ Delete the temporary source file
```

All provider keys remain on the server. No Qloo, Mistral, Tavily, or Supabase service secrets may be exposed in client-side code, browser responses, source control, or logs.

### Qloo integration boundary

Implement a typed server-side Qloo client and a narrow tool interface before credentials arrive. Keep endpoint paths, required headers, request parameters, response parsing, rate limits, and permitted caching subject to the Qloo developer guide supplied for the account.

When Qloo credentials or configuration are missing, return a clear service-unavailable/configuration error. Do not silently substitute static personas, randomly generated scores, or a “successful” mock response. Unit tests may use clearly identified fixtures, but the deployed demo must distinguish test fixtures from live Qloo data.

## 4. Agent and provider responsibilities

### Mistral

- Extract structured descriptors from permitted inputs and produce a schema-validated report.
- Call only tools implemented and authorized by the server; do not allow arbitrary code execution or arbitrary network requests.
- Treat file text and web results as untrusted data, not instructions.
- Use a vision-capable Small model for the initial latency/cost balance, subject to confirmation that the selected API model supports both image input and tool calling. Use Large only if evaluation justifies its extra cost/latency.
- Keep Qloo-returned data as the evidence. Clearly label any interpretation or uncertainty from the LLM.

### Tavily

- Use only when the user supplies a URL or explicitly asks for additional web context.
- Make it an optional enrichment step, not a mandatory dependency for every Qloo lookup.
- Store and display returned source URLs/titles with the report.
- Treat retrieved page text as untrusted; do not follow instructions contained in pages or pass it to tools as authority.
- Call Tavily only from server routes. Apply request limits and surface rate-limit/provider errors rather than hiding them.

## 5. Upload, URL, and retention rules

- First release accepts one PDF, PNG, or JPG up to 10 MB, or one HTTP(S) URL. Do not accept MP4/MP3 in this release.
- Enforce extension, declared MIME type, actual file signature where supported, and size limits server-side. Reject unsupported or malformed content with a clear user-facing error.
- For PDFs, extract text server-side. If the PDF is image-only, report that OCR is needed or use an approved OCR path; do not claim the document was understood when extraction returns no usable text.
- For images, use a verified Mistral vision-capable model. Do not make the storage URL public to enable model access; send content using the provider’s supported secure image input method.
- URLs are research inputs for Tavily. Do not fetch arbitrary user URLs directly from the application server. Validate URL scheme and reject local/private-network destinations if any direct retrieval is later introduced.
- Delete uploaded originals after processing, on processing failure, and through a scheduled cleanup for abandoned uploads.
- Persist only extracted context and report evidence for 30 days. Enforce row ownership using an anonymous session identity and Supabase Row Level Security. Include an immediate report-delete action and automatic expiration cleanup.

## 6. Supabase data contract

Use migrations for schema changes. A simulation record should include, at minimum:

- Opaque report ID and anonymous owner/session ID.
- Vertical, extracted text, confirmed tags, and safe upload metadata (not file contents).
- Qloo request/result evidence in a structured, validated form.
- Optional Tavily sources and the generated report.
- Created and expiry timestamps.

Do not use a Supabase service-role key from browser code. Prefer user-scoped access and Row Level Security. If an elevated server credential is required for a specific operation, keep it server-only and restrict that operation narrowly.

## 7. Environment configuration

Commit `.env.example` with placeholders. Keep `.env.local` ignored and configure production values in Vercel’s encrypted environment-variable settings. Never commit real credentials.

Expected configuration names:

```dotenv
QLOO_API_KEY=replace-when-access-is-granted
MISTRAL_API_KEY=replace-with-server-side-key
MISTRAL_MODEL_ID=replace-with-verified-vision-tool-model-id
TAVILY_API_KEY=replace-with-server-side-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-project-anon-key
```

The public Supabase URL/anon key are not substitutes for Row Level Security. Do not add a service-role key unless a reviewed server-only operation requires it. Do not invent Qloo endpoint variables or defaults before reading the account’s API guide.

## 8. Delivery phases

### Phase A — Project migration

- Port the existing dashboard design into Next.js App Router without preserving fake output as live data.
- Add the root layout, route handlers, server/client boundaries, Supabase clients, schema validation, and Vercel build scripts.
- Add `.env.example` and ensure local environment files are ignored.

### Phase B — Input and storage path

- Add PDF/image/URL input, drag/drop and keyboard-accessible selection, explicit file validation, and progress/error states.
- Store uploads privately and temporarily; implement extraction, delete-on-completion/failure, and abandoned-upload cleanup.
- Persist extracted text and reports in Supabase with 30-day expiration and per-session access control.

### Phase C — Live Qloo-grounded agent

- Implement the real Qloo client after the API guide and redacted request/response arrive.
- Add Mistral structured extraction and a bounded tool-calling loop.
- Add optional Tavily enrichment and source citations.
- Keep a clear blocked/configuration state until all required provider keys and API contracts are configured.

### Phase D — Hackathon readiness

- Ensure the public demo works without payment or private access and remains available through the judging period.
- Publish a public source repository with setup/testing instructions and a visible open-source license.
- Provide accurate Devpost text and explain significant Qloo integration work completed during the submission period if this project predates it.
- Do not reuse unverified deployment/repository URLs or unsupported speed, accuracy, bias, CAC, or LTV claims from older drafts.

## 9. Acceptance checks

- The production build and TypeScript checks pass.
- Invalid file types, oversized files, malformed URLs, and invalid provider responses produce explicit errors.
- A user can upload a supported file or enter a URL, review extracted tags, run the Qloo-grounded workflow, and see source evidence.
- The real demo never presents fixtures as live Qloo results; missing credentials are visible and actionable.
- A user cannot read another anonymous session’s saved reports.
- Uploaded originals are deleted after processing; stored context expires after 30 days and can be deleted earlier.
- Mistral/Tavily outputs are schema-validated and their errors/rate limits are surfaced.
- The deployed demo is public, usable without a required sign-in, and available to judges at no charge.

## 10. External inputs still required

1. Qloo account/API guide, endpoint access, and a redacted working request/response. Do not send the secret key in chat.
2. Supabase project URL and anon key for deployment setup; keep secret values in local/hosted secret storage.
3. Mistral API access and the exact model ID available to the account that supports image input and tool calling.
4. Tavily API access if optional web enrichment is to be enabled in the live demo.
5. Vercel project/team access for deployment and environment-variable setup.
