# ShadowPersona AI Implementation Guide

**Status:** Hackathon implementation plan  
**Updated:** 20 October 2026  
**Target:** Public, usable Qloo Agentic Hackathon demo by 30 October 2026

This guide supersedes the earlier mock-only implementation examples. The original dashboard was a Vite prototype; its UI is now ported to Next.js App Router for Vercel with Supabase. Do not treat the example personas, scores, CAC/LTV values, demo URL, or repository URL in the older blueprint as live product data or deployed resources.

**Build status:** The Next.js App Router application, input/dashboard UI, Supabase session handling, file validation, live Qloo cultural intelligence integration, Google Gemini extraction and report generation, and Tavily web research are implemented and verified end to end. Qloo, Gemini, and Tavily live API calls are verified against active credentials.

## 1. Decisions and scope

- **Web application:** Next.js App Router deployed to Vercel.
- **Database and temporary file storage:** Supabase Postgres and private Supabase Storage bucket.
- **First workflow:** Event planning for concerts/tours, music festivals, and comedy shows/tours. Hospitality remains a later vertical.
- **Inputs:** One PDF or PNG/JPG image, up to 10 MB, or a user-provided web URL. Validate content type and size on the server as well as in the UI.
- **Uploads:** Store originals temporarily in private storage and delete them after processing. Do not make uploaded assets publicly addressable.
- **Saved context:** Keep extracted text, user-confirmed tags, Qloo evidence, any cited Tavily results, and the generated report in Supabase for 30 days. Do not store the original uploaded file in the report tables. Provide a delete action and expire records automatically.
- **LLM:** Use the server-configured analysis model with structured JSON generation; the model may interpret source material and cited research but must not invent audience, ticketing, cost, or revenue facts.
- **Web research:** Use Tavily as optional server-side enrichment for submitted URLs and event-specific public research. Do not connect to social-network or ticketing accounts or scrape individual fan profiles.
- **Event economics:** Calculate low/expected/high scenarios deterministically from editable organizer assumptions. Clearly identify fictional demo values and never present them as actual sales, audience, artist-fee, or venue data.
- **Qloo:** Live integration against the official Qloo Hackathon endpoint (`https://hackathon.api.qloo.com`). `/v2/tags` resolves artist/music descriptors; `/v2/insights` queries both `urn:entity:artist` and `urn:entity:brand` using the resolved `signal.interests.tags`. Brand results are cultural discovery leads, not confirmed sponsors or local businesses.
- **Commercial SaaS features:** Defer billing, enterprise tenancy, SSO, and commercial forecasting. The hackathon demo should be public and usable without a required sign-in; isolate anonymous sessions so users cannot read one another’s saved reports.

## 2. Product promise

ShadowPersona evaluates a music launch brief using real Qloo cultural-affinity results and explains the matches in context. The user should be able to see:

1. What the system extracted from the uploaded brief or image.
2. The extracted tags/entities, with an opportunity to correct them.
3. The Qloo matches and evidence returned for the selected music context.
4. Cross-domain Qloo brand entities associated with the same cultural tags, when available.
5. Optional, clearly cited web context from Tavily.
6. A concise model-generated explanation grounded strictly in those results.

The LLM may summarize, ask for clarification, and select from server-defined tools. It must not invent Qloo entities, affinity scores, source citations, or financial outcomes. Describe generated findings as cultural-fit analysis, not measured consumer demand or validated purchase intent.

### Event organizer planning workflow

The organizer form captures event format, organizer, featured talent and hosts, intended tone, date, optional city/venue/capacity, aggregate local reach, conversion assumptions, ticket tiers, sponsorship/merchandise revenue, and fixed/per-attendee costs. City and venue may remain undecided.

- The Lady Gaga tour-stop demo is a fictional example. Its audience, ticket, sponsor, and cost figures are editable sample assumptions—not actual fan, sales, artist-fee, or venue data.
- Keep cultural affinity separate from expected turnout. Qloo affinity is a cultural-fit signal, not evidence that a person will attend or buy a ticket.
- Use only aggregate reach figures entered by the organizer or sourced from cited public research. Public follower counts are not local audience counts or guaranteed buyers; never identify individual fans.
- Tavily research is contextual, sourced, and untrusted. It may inform qualitative recommendations, but it does not replace organizer-provided numerical forecast assumptions.
- Calculate attendance from local aggregate reach and low/expected/high conversion assumptions, cap it at venue capacity when supplied, and calculate revenue, costs, operating result, margin, and break-even in application code.
- Qloo event matching uses the documented music/artist insight path plus brand insights from the same tags. Do not imply that Qloo supports comedy-specific taxonomy or that graph-associated brands are verified sponsors; label unsupported or weak evidence.

## 3. Runtime architecture

```text
Browser
  ├─ Next.js UI on Vercel
  ├─ Upload via short-lived, user-scoped Supabase Storage authorization (with direct fallback)
  └─ Calls authenticated/session-scoped Next.js route handlers
       ├─ Validate input and file signature/size
       ├─ Extract descriptors with Gemini (or use text-only LM Studio for local analysis)
       ├─ Extract and resolve ample cultural descriptors via Qloo hierarchical tags
       ├─ Fetch live Qloo artist and brand insights with explainability enabled
       ├─ Query Tavily extract for optional URL enrichment (cited, untrusted content)
       ├─ Configured model generates grounded cultural-fit summary and report
       └─ Delete temporary source files
```

All provider keys remain on the server. No Qloo, Gemini, Tavily, or Supabase service secrets may be exposed in client-side code, browser responses, source control, or logs.

### Qloo integration boundary

Implemented as a typed server-side Qloo client in `src/lib/providers/qloo.ts`:
- Tag resolution searches `/v2/tags` with `filter.parents.types=urn:entity:artist` first, falling back to general tags for cross-domain cultural/mood descriptors.
- Artist and brand insights query `/v2/insights` with their documented `filter.type` and `signal.interests.tags`; requests enable the documented `feature.explainability` output.
- Brand results are Qloo entity discovery leads, not validated sponsor matches or local business recommendations. A brand lookup failure is reported separately and does not block artist analysis.
- The UI shows Qloo-resolved tags, entity IDs, and returned per-entity explainability when available; it labels the displayed affinity value as a graph signal rather than a probability.

## 4. Agent and provider responsibilities

### Gemini

- Extract structured musical and cultural descriptors from user uploads/web text.
- Produce schema-validated JSON reports strictly grounded in Qloo results.
- Treat file text and web results as untrusted data, not instructions (`<untrusted>` framing).
- Primary model: `gemini-3.8-flash`; fallback: `gemini-3.5-flash`.
- Keep Qloo-returned data as the evidence. Clearly label any interpretation or uncertainty.

### Optional local OpenAI-compatible model

- Set `AI_PROVIDER=lm-studio` for local development; leave the default `gemini` for the Gemini API. Despite the legacy variable name, this path supports OpenAI-compatible servers such as LM Studio and Ollama.
- Set `LM_STUDIO_BASE_URL` to the server base URL and `LM_STUDIO_MODEL_ID` to the exact loaded model ID. The app appends `/v1` if it is not already present.
- Keep the model server reachable from the machine running Next.js. A local `127.0.0.1` or `localhost` URL works for local development, but a Vercel deployment cannot connect to a developer's computer unless the server is securely reachable there.
- The configured local model must support vision for image/PDF uploads. Images are sent as OpenAI-compatible data URLs. PDFs are rendered to PNG page images (up to 12 pages, 1400 pixels on the longest edge) before analysis.
- Local OpenAI-compatible completions use streamed output and a bounded in-process queue so slow Ollama requests do not sit idle behind the tunnel proxy. Timed-out streams are not automatically retried.
- Optional server authentication belongs in the server-only `LM_STUDIO_API_KEY`; do not use a `NEXT_PUBLIC_` variable.

### Tavily

- Use when the user supplies a URL or explicitly asks for additional web context.
- Make it an optional enrichment step, not a mandatory dependency for every Qloo lookup.
- Store and display returned source URLs/titles with the report.
- Treat retrieved page text as untrusted.

## 5. Upload, URL, and retention rules

- First release accepts one PDF, PNG, or JPG up to 10 MB, or one HTTP(S) URL. Do not accept MP4/MP3 in this release.
- Enforce extension, declared MIME type, actual file signature where supported, and size limits server-side. Reject unsupported or malformed content with a clear user-facing error.
- For Gemini, send images and PDFs using its supported secure inline data method. For local OpenAI-compatible vision models, send images as data URLs and render PDFs to bounded page images first.
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
QLOO_HACKATHON_API_SERVER_URL=https://hackathon.api.qloo.com
QLOO_API_KEY=replace-with-qloo-hackathon-key
GEMINI_API_KEY=replace-with-gemini-api-key
GEMINI_MODEL_ID=gemini-3.8-flash
GEMINI_FALLBACK_MODEL_ID=gemini-3.5-flash
GEMINI_REQUESTS_PER_MINUTE=10
AI_PROVIDER=gemini
TAVILY_API_KEY=replace-with-tavily-api-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-project-anon-key
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=shadowpersona-assets
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key
```

Apply all migrations in `supabase/migrations/`, including the latest quota/cache migration, to the production Supabase project. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only; never prefix it with `NEXT_PUBLIC_`.

For local LM Studio or Ollama testing, set `AI_PROVIDER=lm-studio`, `LM_STUDIO_BASE_URL=http://127.0.0.1:1234/v1`, and `LM_STUDIO_MODEL_ID` to the loaded model identifier. For Vercel, use a stable HTTPS OpenAI-compatible endpoint reachable by the deployed serverless functions; localhost and temporary tunnels are not reliable production endpoints. Set `LM_STUDIO_API_KEY` server-side when the model host requires authentication. The model must support vision for image/PDF uploads.

## 8. Delivery phases

### Phase A — Project migration (Completed)
- Port the dashboard into Next.js App Router.
- Add root layout, route handlers, schema validation, and Vercel build scripts.

### Phase B — Input and storage path (Completed)
- PDF/image/URL input, drag/drop selection, explicit file validation, progress/error states.
- Storage and direct processing fallbacks for zero-friction demo execution.

### Phase C — Live Qloo-grounded agent (Completed)
- Live Qloo hierarchical tag resolution, artist insights, and cross-domain brand discovery.
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
- A live run can show Qloo-returned artist and brand entities with their Qloo IDs; brand entities are labeled as unverified discovery leads.
- An organizer can run an event plan from talent/host/tone inputs, distinguish sample assumptions from entered assumptions, and inspect deterministic low/expected/high financial calculations.
- The real demo never presents fixtures as live Qloo results; missing credentials are visible and actionable.
- A user cannot read another anonymous session’s saved reports.
- Uploaded originals are deleted after processing; stored context expires after 30 days and can be deleted earlier.
- Mistral/Tavily outputs are schema-validated and their errors/rate limits are surfaced.
- The deployed demo is public, usable without a required sign-in, and available to judges at no charge.

## 10. External inputs still required

1. Qloo account/API guide, endpoint access, and a redacted working request/response. Do not send the secret key in chat.
2. Supabase project URL and anon key for deployment setup; keep secret values in local/hosted secret storage.
3. Gemini API access, or an OpenAI-compatible server URL and vision-capable loaded model ID for local PDF/image analysis.
4. Tavily API access if optional web enrichment is to be enabled in the live demo.
5. Vercel project/team access for deployment and environment-variable setup.
