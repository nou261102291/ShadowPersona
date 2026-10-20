# ShadowPersona AI Implementation Guide

**Status:** Hackathon implementation plan  
**Updated:** 20 October 2026  
**Target:** Public, usable Qloo Agentic Hackathon demo by 30 October 2026

This guide supersedes the earlier mock-only implementation examples. The original dashboard was a Vite prototype; its UI is now ported to Next.js App Router for Vercel with Supabase. Do not treat the example personas, scores, CAC/LTV values, demo URL, or repository URL in the older blueprint as live product data or deployed resources.

**Build status:** The Next.js App Router application, input/dashboard UI, Supabase session handling, file validation, live Qloo cultural intelligence integration, Google Gemini extraction and report generation, and Tavily web research are implemented and verified end to end. Qloo, Gemini, and Tavily live API calls are verified against active credentials.

## 1. Decisions and scope

- **Web application:** Next.js App Router deployed to Vercel.
- **Database and temporary file storage:** Supabase Postgres and private Supabase Storage bucket.
- **First vertical:** Music launch/event evaluation. Hospitality is the next vertical; do not build a second full workflow before the music path works end to end.
- **Inputs:** One PDF or PNG/JPG image, up to 10 MB, or a user-provided web URL. Validate content type and size on the server as well as in the UI.
- **Uploads:** Store originals temporarily in private storage and delete them after processing. Do not make uploaded assets publicly addressable.
- **Saved context:** Keep extracted text, user-confirmed tags, Qloo evidence, any cited Tavily results, and the generated report in Supabase for 30 days. Do not store the original uploaded file in the report tables. Provide a delete action and expire records automatically.
- **LLM:** Google Gemini (`gemini-3.8-flash` primary with `gemini-3.5-flash` fallback) with structured JSON generation and vision capabilities. Extracts taxonomy-compatible musical and cultural descriptors and generates grounded cultural-fit analyses from Qloo evidence.
- **Web research:** Include Tavily as an optional, server-side enrichment tool for submitted URLs or when additional context is useful. Qloo remains the cultural-intelligence source and must materially affect the result.
- **Qloo:** Live integration against the official Qloo Hackathon endpoint (`https://hackathon.api.qloo.com`). Endpoints used: `/v2/tags` for hierarchical artist/music tag resolution, and `/v2/insights` with `filter.type=urn:entity:artist` and `signal.interests.tags` for real cultural affinity scoring.
- **Commercial SaaS features:** Defer billing, enterprise tenancy, SSO, and commercial forecasting. The hackathon demo should be public and usable without a required sign-in; isolate anonymous sessions so users cannot read one another’s saved reports.

## 2. Product promise

ShadowPersona evaluates a music launch brief using real Qloo cultural-affinity results and explains the matches in context. The user should be able to see:

1. What the system extracted from the uploaded brief or image.
2. The extracted tags/entities, with an opportunity to correct them.
3. The Qloo matches and evidence returned for the selected music context.
4. Optional, clearly cited web context from Tavily.
5. A concise Gemini-generated explanation grounded strictly in those results.

The LLM may summarize, ask for clarification, and select from server-defined tools. It must not invent Qloo entities, affinity scores, source citations, or financial outcomes. Describe generated findings as cultural-fit analysis, not measured consumer demand or validated purchase intent.

## 3. Runtime architecture

```text
Browser
  ├─ Next.js UI on Vercel
  ├─ Upload via short-lived, user-scoped Supabase Storage authorization (with direct fallback)
  └─ Calls authenticated/session-scoped Next.js route handlers
       ├─ Validate input and file signature/size
       ├─ Extract PDF text or send supported image input to Gemini Vision
       ├─ Extract and resolve ample cultural descriptors via Qloo hierarchical tags
       ├─ Fetch live Qloo artist insights and affinity scores
       ├─ Query Tavily extract for optional URL enrichment (cited, untrusted content)
       ├─ Gemini agent generates grounded cultural-fit summary and report
       └─ Delete temporary source files
```

All provider keys remain on the server. No Qloo, Gemini, Tavily, or Supabase service secrets may be exposed in client-side code, browser responses, source control, or logs.

### Qloo integration boundary

Implemented as a typed server-side Qloo client in `src/lib/providers/qloo.ts`:
- Tag resolution searches `/v2/tags` with `filter.parents.types=urn:entity:artist` first, falling back to general tags for cross-domain cultural/mood descriptors.
- Artist insights query `/v2/insights` with `filter.type=urn:entity:artist` and `signal.interests.tags` with exponential backoff on transient errors.

## 4. Agent and provider responsibilities

### Gemini

- Extract structured musical and cultural descriptors from user uploads/web text.
- Produce schema-validated JSON reports strictly grounded in Qloo results.
- Treat file text and web results as untrusted data, not instructions (`<untrusted>` framing).
- Primary model: `gemini-3.8-flash`; fallback: `gemini-3.5-flash`.
- Keep Qloo-returned data as the evidence. Clearly label any interpretation or uncertainty.

### Tavily

- Use when the user supplies a URL or explicitly asks for additional web context.
- Make it an optional enrichment step, not a mandatory dependency for every Qloo lookup.
- Store and display returned source URLs/titles with the report.
- Treat retrieved page text as untrusted.

## 5. Upload, URL, and retention rules

- First release accepts one PDF, PNG, or JPG up to 10 MB, or one HTTP(S) URL. Do not accept MP4/MP3 in this release.
- Enforce extension, declared MIME type, actual file signature where supported, and size limits server-side. Reject unsupported or malformed content with a clear user-facing error.
- For images and PDFs, send content using Gemini's supported secure inline data method.
- URLs are research inputs for Tavily. Do not fetch arbitrary user URLs directly from the application server.
- Delete uploaded originals after processing.
- Persist only extracted context and report evidence for 30 days.

## 6. Supabase data contract

Use migrations for schema changes (`supabase/migrations/20261019000000_initial_schema.sql`):
- Table `public.simulations`: opaque report ID, owner ID, vertical, extracted context, tags, Qloo evidence, Tavily sources, report, timestamps.
- Storage bucket `shadowpersona-assets` with row-level security.

## 7. Environment configuration

Commit `.env.example` with placeholders. Keep `.env.local` ignored and configure production values in Vercel’s encrypted environment-variable settings. Never commit real credentials.

Expected configuration names:

```dotenv
QLOO_HACKATHON_API_SERVER_URL=https://hackathon.api.qloo.com
QLOO_API_KEY=replace-with-qloo-hackathon-key
GEMINI_API_KEY=replace-with-gemini-api-key
GEMINI_MODEL_ID=gemini-3.8-flash
GEMINI_FALLBACK_MODEL_ID=gemini-3.5-flash
TAVILY_API_KEY=replace-with-tavily-api-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-project-anon-key
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=shadowpersona-assets
```

## 8. Delivery phases

### Phase A — Project migration (Completed)
- Port the dashboard into Next.js App Router.
- Add root layout, route handlers, schema validation, and Vercel build scripts.

### Phase B — Input and storage path (Completed)
- PDF/image/URL input, drag/drop selection, explicit file validation, progress/error states.
- Storage and direct processing fallbacks for zero-friction demo execution.

### Phase C — Live Qloo-grounded agent (Completed)
- Live Qloo hierarchical tag resolution and artist insights integration.
- Gemini extraction and report generation with exponential backoff and fallback routing.
- Tavily URL extraction and cited source linking.

### Phase D — Hackathon readiness (In Progress)
- Public demo testing and validation.
- Open-source repository documentation and Devpost submission materials.

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
