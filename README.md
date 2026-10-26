# ShadowPersona AI

> **The invisible cultural layer for autonomous agents—grounding taste predictions in Qloo instead of LLM guesswork.**

## 1. Project Title & Tagline

**ShadowPersona AI** gives an agent a privacy-conscious way to reason about cultural fit. It turns a brief, a few human-selected descriptors, or event context into Qloo-backed cultural evidence that a language model can explain without pretending that a guess is a fact.

## 2. Executive Summary & Value Proposition

### The problem

Large language models can reason over instructions, but they do not inherently know what a particular audience likes. When asked to predict taste from sparse context, they can return generic recommendations, invent cultural associations, or confuse a plausible-sounding answer with evidence. Many personalization systems address this by collecting identity-linked browsing, social, or purchase histories—data that users and organizations may not want to collect or retain.

### The solution

ShadowPersona AI is a privacy-first cultural-fit workflow for event organizers and the agentic systems that support them. It accepts an event brief, a PDF or image, a URL, or manually entered descriptors, resolves relevant tags through Qloo, and uses returned entities and affinity signals as evidence for a structured analysis. The live workflow now queries Qloo for both artist and brand entities from the same resolved cultural tags, creating a bounded cross-domain use case for event partner discovery.

The “shadow persona” is a **latent, relational representation of taste**, not a dossier about a named person. In the current application, it is formed for an analysis from the submitted brief and descriptors; the product does not maintain a persistent, cross-domain personal taste profile. The first live workflow focuses on music and event planning, where organizers can compare cultural fit, review sourced context, and model event economics from their own assumptions.

### Value proposition

- **More specific than a generic prompt:** recommendations are tied to entities and affinity evidence returned by Qloo.
- **Less guesswork:** the language model interprets evidence instead of inventing the underlying cultural matches.
- **Lower data burden:** no social-account connection, individual fan tracking, or advertising identifier is needed for the current workflow.
- **Decision support, not false certainty:** cultural affinity is kept distinct from attendance, purchase intent, or measured demand.

Qloo describes its Taste AI as connecting cultural interests across domains without personally identifiable information. The Qloo Agentic Hackathon likewise asks for applications where access to Qloo’s taste graph makes the product materially better than an LLM-only answer. ShadowPersona applies that principle to event planning. [Qloo Agentic Hackathon](https://qloo.devpost.com/) · [About Qloo](https://www.qloo.com/company/about)

## 3. Architecture & Technical Feasibility

### Current implementation

| Layer | Implementation |
| --- | --- |
| Web application | Next.js App Router, React, and TypeScript |
| Request and response validation | Zod schemas at API boundaries |
| Cultural evidence | Server-side Qloo Hackathon API client |
| Analysis model | Kimi API with the fixed `kimi-k2.6` model |
| Optional web context | User-submitted URL extraction through Tavily; public market research is opt-in and off by default |
| Persistence and controls | Supabase Postgres, private Storage, session isolation, shared model admission controls, and duplicate-run/result caching |
| Deployment target | Vercel-compatible Next.js application |

All generated analysis uses the fixed `kimi-k2.6` model through Kimi's API. JSON-mode responses are checked against the app's Zod schemas, image uploads use Kimi's multimodal chat format, and PDFs are rendered into up to 12 page images. Thinking mode is disabled for these short, schema-constrained tasks to reduce extra token use and latency. Qloo and optional Tavily remain evidence/data providers, not alternate model providers.

The current implementation uses lightweight Next.js route-handler orchestration; it does **not** depend on LangChain, AutoGen, or a separate vector database. Qloo’s API provides the cultural graph and evidence, so local vector storage is not needed for the shipped flow.

### Evidence-grounded request flow

```text
Brief / PDF / image / URL / user-entered descriptors
                         |
                         v
          Next.js server validates request
                         |
       +-----------------+------------------+
       |                                    |
       v                                    v
Model extracts structured tags        Optional Tavily research
from brief or image                   (cited, treated as untrusted)
       |
       v
Qloo /v2/tags resolves descriptors to graph tag IDs
       |
       v
Qloo /v2/insights returns artist and brand entities
from the same resolved cultural tags
       |
       v
Schema-validated model explanation + deterministic event forecast
```

1. **Input and validation:** The application accepts one PDF, PNG, or JPG up to 10 MB, a user-provided HTTP(S) URL, event context, or descriptors. Server-side checks validate request shape and uploaded-file signatures.
2. **Descriptor extraction:** The configured model extracts concise cultural descriptors from a brief or image. Structured output is validated before it is used.
3. **Qloo grounding:** The server resolves descriptors through `/v2/tags`—trying artist-specific tags before a general-tag fallback—then calls the documented `/v2/insights` endpoint with `filter.type=urn:entity:artist` and `filter.type=urn:entity:brand`, using the resolved tag IDs as `signal.interests.tags`. Requests enable Qloo's documented `feature.explainability` option. Results include Qloo entity identifiers and any returned affinity or per-entity contribution details; these form the evidence boundary for downstream explanations. The brand lookup is an optional cross-domain expansion: it may fail or return no matches without blocking the core artist analysis.
4. **Evidence-based analysis:** The model produces schema-validated reports and recommendations from the Qloo artist evidence and submitted context. The UI exposes resolved interest tags, Qloo entity IDs, and returned explainability details when available; missing explainability is stated explicitly. Qloo brand results are displayed as discovery leads, not verified sponsor recommendations. Tavily URL extraction is user-initiated by entering a URL; broader market research is opt-in. Retrieved material is cited and treated as untrusted input, not as instructions or verified Qloo data.
5. **Deterministic planning math:** Low, expected, and high attendance, revenue, costs, margins, and break-even values are calculated in application code from organizer-entered assumptions. They are not generated by the language model.
6. **Resilience and cost controls:** Supabase-backed shared request admission, duplicate-run suppression, and private result caching reduce avoidable repeated model work. Provider errors and invalid responses are surfaced instead of being presented as successful analysis.

### Hallucination boundaries

Qloo’s hackathon materials describe a graph of more than 250 million entities. ShadowPersona uses Qloo lookups to ground the **entities and cultural-fit signals** it presents, rather than asking an LLM to invent a trend, artist match, or brand name. The model is still generative: grounding reduces unsupported claims but cannot guarantee that every explanation is correct. It is not accurate to describe an affinity score as mathematical proof, a statistically validated demand forecast, or evidence that an individual will attend, purchase, or become a sponsor.

### Shipped scope and technical limits

- The live Qloo integration resolves cultural tags and queries **artist and brand insights**. The user interface includes multiple event formats, but that does not imply that every format has a dedicated Qloo taxonomy or validated mapping.
- Brand results are Qloo entities associated with the submitted cultural tags. They are **discovery leads**, not confirmed sponsors, local businesses, commercial endorsements, or proof of purchase intent.
- Qloo affinity is a cultural-fit signal, not local audience size, ticket demand, or purchase intent.
- The application displays the raw affinity number returned by Qloo, without an unverified scale conversion, percent sign, or probability claim.
- Event forecasts are only as reliable as the organizer’s aggregate reach, conversion, pricing, and cost assumptions.
- The promoter ROI console’s talent-fit values and sponsor-category leads are model-generated 0–100 planning heuristics informed by the event brief and Qloo artist evidence. They are not Qloo scores, measured demographics, audience overlap, verified sponsors, attendance, or purchase intent.
- Hospitality, travel, real estate, retail, and other verticals are potential extensions, not currently delivered Qloo integrations. Each needs a verified Qloo-supported entity/filter path and domain-specific validation.

### Organizer-ready use cases

| Use case | What the organizer can do now | Evidence and guardrail |
| --- | --- | --- |
| **Concert, tour, or festival planning** | Upload a brief or enter music and mood cues; inspect Qloo-matched artists; build low/expected/high scenarios from editable local-reach, conversion, ticket, sponsor, and cost assumptions. | Artist matches are Qloo entities. Attendance and financial results are deterministic calculations from organizer inputs, not predictions from Qloo or Kimi. |
| **Culturally aligned partner discovery** | Use the same event tags to surface Qloo brand entities that may be useful starting points for partnership research. | The list is not a sponsor recommendation or local availability check. Verify each brand, local presence, audience fit, and commercial relationship independently. |
| **Event brief review** | Compare the tags extracted from an event brief with the tags resolved by Qloo, then review the returned evidence before acting. | Model-written explanations are interpretation; the graph entities and organizer assumptions remain separate evidence types. |

The Qloo Agentic Hackathon also invites lateral applications such as helping an electrician match room-lighting styles to a customer’s taste, or helping seniors discover dining options that fit their preferences and practical needs. These are **future integrations, not features of this build**: lighting would require a verified design/brand mapping, while dining would require a verified place/cuisine integration. Dietary, allergy, medication, accessibility, and other safety constraints must be hard user- or professional-provided requirements—not inferred from taste. Medical or rare-disease guidance is outside the current product scope.

### Internal agent-tool contract

The reusable server-side boundary is [`getCulturalContext({ tags })`](./src/lib/agent/culturalContext.ts). It returns Qloo-resolved tags, artist evidence, brand evidence, and an explicit brand lookup status (`complete`, `empty`, or `failed`). It is an **internal TypeScript tool contract**, not a public API or an authenticated partner endpoint. No framework or new external service is required to reuse it from another server-side agent. A public adapter needs a separate authentication, tenancy, and quota design and is intentionally deferred.

## 4. Commercial Viability & Scalability

### Product direction

The commercial direction is an **infrastructure-level B2B2C API or SDK**: an existing agent platform could send a brief and a small set of relevant preference signals, receive Qloo-grounded cultural evidence, and use that evidence in its own user experience. Potential initial customers include event and entertainment platforms; travel, real estate, and commerce are plausible later verticals where cultural fit improves discovery or planning.

Possible go-to-market models include usage-based API access, a platform subscription with request tiers, or enterprise integration and support. These are product hypotheses; the hackathon application does not currently offer a commercial API plan or published pricing.

### Why it can scale

- **No per-vertical model retraining is inherently required:** the core approach combines user-provided context with an existing Qloo graph and a general-purpose analysis model.
- **Provider-backed cultural data:** artist and brand lookups come from Qloo’s data infrastructure rather than a locally maintained, manually curated trend catalog.
- **Stateless request handling:** Next.js route handlers can scale horizontally on a serverless platform; Supabase provides shared request controls and result caching across instances.
- **Composable internal integration boundary:** a typed server-side Qloo context tool can be adapted to a future SDK after partner authentication, tenancy, and quotas are designed.

Horizontal scale does not make every vertical plug-and-play. New integrations still need supported Qloo entity types and filters, domain-specific input/output schemas, privacy review, and evaluation against real user outcomes. Healthcare applications would need especially strict consent, safety, and regulatory review and should not make clinical or treatment recommendations.

### Potential impact

For organizers, the product makes cultural-fit evidence visible alongside event assumptions and cited market context. For agent builders, the longer-term opportunity is a reusable grounding layer that helps an agent distinguish a culturally informed recommendation from a fluent but unsupported guess. Success should be measured through evaluated recommendation relevance, user trust, and operational outcomes—not by affinity scores alone.

## 5. Privacy-by-Design — The Alex Elias Nexus

Qloo’s account of its origins connects founder and CEO Alex Elias’s internet-privacy background with the idea of predicting taste across domains without identity-based data. ShadowPersona follows that design principle: **use relationships among cultural entities as context, not a user’s identity as the product.** [About Qloo](https://www.qloo.com/company/about)

- Qloo receives cultural tag queries and resolved tag IDs for the artist and brand lookups; uploaded files and full source briefs are not sent to the Qloo endpoints used here.
- The application does not require social-network, ticketing, or advertising-account connections and does not build individual fan profiles.
- A submitted brief or image is sent to the configured analysis model for descriptor extraction. A URL explicitly entered by the user is sent to Tavily for extraction. Broader public market research is controlled by an opt-in checkbox and is off by default; when enabled, tags and event/location details may be sent as search terms.
- The input screen now explains this provider data flow before submission. A tags-only workflow avoids sending a brief or URL; leave event details blank as well to keep personally identifying context out of the model prompt.
- Uploaded source files are stored temporarily in private Supabase Storage when that upload path is used and are removed after processing.
- The demo uses an anonymous session identifier to isolate requests and cached results. This is not a cross-site advertising identity, but it is still session data handled by the application.
- Users should not submit sensitive personal information. A document can contain PII even when the product does not need it; remove it before upload.

These are product design choices, not a claim of legal compliance or a substitute for a deployment’s privacy notice, data-processing agreements, retention configuration, or jurisdiction-specific review.

## Evaluation & success criteria

Do not score affinity as ground truth. Evaluate the product on a fixed, human-reviewed set of event briefs with the same inputs run through a generic LLM-only baseline and the Qloo-grounded workflow. Track:

- **Evidence coverage:** proportion of named artist and brand entities that exactly match Qloo-returned IDs.
- **Unsupported-claim rate:** count of named entities or factual claims in generated recommendations without Qloo evidence or a cited source.
- **Organizer usefulness:** blind reviewer preference and edits required before acting on the recommendation.
- **Privacy boundary:** confirm Qloo requests contain tags/IDs rather than full files or briefs; verify source-file deletion and inspect provider disclosure in the UI.

The repository does not yet publish a benchmark result for these measures; report results only after running and documenting the evaluation. An offline study helper creates 24 synthetic event briefs, randomizes baseline and Qloo-grounded responses into a blind A/B packet, and scores reviewer ratings plus exact Qloo-entity-ID coverage. It performs **no provider calls**. Synthetic cases and mocked candidate outputs may test the workflow but must not be presented as real organizer or model evidence.

## 6. Quick Start & Run Instructions

### Prerequisites

- Node.js **22.13 or later** (Node 22 is pinned in `.mise.toml`)
- pnpm **10.34.3**
- A Qloo Hackathon API key
- A Supabase project with the migrations in `supabase/migrations/` applied
- A Kimi API key for `kimi-k2.6`
- Optional: a Tavily API key for URL extraction and public web research

Qloo’s developer guide and hackathon key instructions are linked from the [Qloo Agentic Hackathon](https://qloo.devpost.com/).

### Verify the Qloo integration

Run a bounded smoke test using only generic `jazz` tags. It calls Qloo’s tag endpoint and requests up to five artist and brand insights; it sends no brief, URL, or personal data. The script suppresses credentials and response bodies:

```powershell
pnpm qloo:smoke
```

On 25 October 2026, this test resolved two generic tags and returned five artist and five brand entities. Qloo returned numeric affinity values, but **no per-entity explainability objects** in either result set despite the documented explainability request flag. The interface therefore reports explainability as unavailable for those results instead of implying that an explanation was returned. This is an integration smoke test, not an accuracy or recommendation-quality benchmark.

### Build an offline organizer evaluation

The evaluation workflow uses synthetic prompts and local JSON files; it makes no external API requests:

```powershell
pnpm eval:grounding -- init
```

Complete the generated `resources/evaluation/study-template.json` with paired baseline and Qloo-grounded responses for the same 24 briefs. Add the actual Qloo entity IDs returned for each grounded run, and annotate named entities only when they match a returned Qloo ID exactly. If candidate outputs are mocked, keep them explicitly labeled as mock and do not report their scores as product performance.

Each candidate response entry has this shape:

```json
{
  "text": "The complete candidate recommendation shown to reviewers.",
  "namedEntities": [
    { "name": "A named artist or brand", "qlooEntityId": "exact Qloo ID, or null when unsupported" }
  ]
}
```

Create one randomized A/B packet and keep its answer key private:

```powershell
pnpm eval:grounding -- prepare resources/evaluation/study-template.json resources/evaluation/reviewer-packet.json resources/evaluation/private-answer-key.json
```

Have 3–5 independent event/marketing reviewers rate every case without being told which arm used Qloo. Collect their anonymous ratings as `ratings.json` in this shape:

```json
{
  "packetId": "copy from reviewer-packet.json",
  "reviewers": [
    {
      "id": "R1",
      "ratings": [
        {
          "caseId": "S01",
          "preference": "A",
          "A": {
            "culturalRelevance": 4,
            "evidenceSupport": 4,
            "actionability": 3,
            "unsupportedEntityClaims": 0,
            "namedEntityClaims": 2
          },
          "B": {
            "culturalRelevance": 3,
            "evidenceSupport": 2,
            "actionability": 4,
            "unsupportedEntityClaims": 1,
            "namedEntityClaims": 3
          }
        }
      ]
    }
  ]
}
```

Each reviewer must rate all cases. Use anonymous IDs, obtain reviewer consent, and do not place real personal data in the study file. Once all ratings are collected, score the study:

```powershell
pnpm eval:grounding -- score resources/evaluation/reviewer-packet.json resources/evaluation/private-answer-key.json ratings.json resources/evaluation/report.json
```

The report gives descriptive preference counts, rating averages, and entity-ID evidence coverage. It does not calculate statistical significance or prove causality.

### Install

```powershell
corepack enable
corepack prepare pnpm@10.34.3 --activate
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
```

Open `.env.local` in a local editor and replace the placeholders. Never commit `.env.local`; it is ignored by Git. Do not expose provider keys through `NEXT_PUBLIC_` variables.

```dotenv
QLOO_HACKATHON_API_SERVER_URL=https://hackathon.api.qloo.com
QLOO_API_KEY=your-qloo-hackathon-key

AI_PROVIDER=kimi
KIMI_API_KEY=your-kimi-api-key
KIMI_MODEL_ID=kimi-k2.6
KIMI_REQUESTS_PER_MINUTE=10

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=shadowpersona-assets
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key

# Optional: needed for URL extraction and public web research.
TAVILY_API_KEY=your-tavily-api-key
```

Apply the SQL files in `supabase/migrations/` to the Supabase project in timestamp order. The latest migration is required for shared analysis controls and private result caching. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only; never prefix it with `NEXT_PUBLIC_`.

### Run locally

```powershell
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Use the built-in demo scenarios, add cultural tags, or submit a supported brief. Live analysis requires the provider credentials and Supabase configuration above; the health endpoint reports configuration status without returning secret values.

### Checks

```powershell
pnpm lint
pnpm typecheck
pnpm build
```

## Deployment

Deploy the Next.js application to Vercel or another compatible host. Configure the same server-side provider keys in the host’s encrypted environment settings, configure the public Supabase URL and anon key, apply all Supabase migrations, and verify the health endpoint and a live end-to-end analysis before sharing the deployment. The hackathon requires a publicly accessible, functional demo; a local-only run is not sufficient for submission. See the [official submission requirements](https://qloo.devpost.com/rules).

The app intentionally has no model fallback: every generated analysis uses `kimi-k2.6`. Kimi's current model documentation lists K2-series retirement by the end of December 2026; review the model list before that date if this deployment is intended to remain live.

## License

This project is licensed under the **MIT License**; see [LICENSE](LICENSE). Qloo, model providers, and other third-party services remain subject to their own terms and licenses.

## References

- [Qloo Agentic Hackathon](https://qloo.devpost.com/)
- [Hackathon rules and submission requirements](https://qloo.devpost.com/rules)
- [Qloo developer documentation](https://docs.qloo.com/)
- [Qloo Insights API](https://docs.qloo.com/reference/insights-api-deep-dive)
- [Qloo entity-type parameter guide](https://docs.qloo.com/reference/available-parameters-by-entity-type)
- [Qloo explainability response field](https://docs.qloo.com/reference/parameters)
- [About Qloo](https://www.qloo.com/company/about)
