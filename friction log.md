# ShadowPersona AI — Friction Log

**Retrospective snapshot:** 25 October 2026  
**Purpose:** Record material implementation challenges, the workarounds used, and what remains unverified. This is a retrospective summary of the project history, not a contemporaneous issue tracker. It distinguishes completed implementation work from evidence still needed.

## Friction history

### 1. Product ambition exceeded the verified build scope

**Challenge:** The original positioning risked implying an all-purpose cultural digital twin, broad multi-vertical support, or that Qloo data would prevent all LLM hallucinations. Those claims went beyond the implemented event-planning workflow.

**Workaround:** Narrowed the present-tense product description to event planning, Qloo artist and brand insights, and organizer-input-based financial scenarios. Other verticals and broader partner integrations are described as future possibilities. Documentation also clarifies that grounding can reduce unsupported claims but cannot guarantee correctness.

**Status:** Addressed in the project narrative. See [README.md](./README.md).

### 2. Qloo endpoint behavior needed live verification

**Challenge:** The project needed to verify that its Qloo requests worked for both artist and brand insights without guessing at undocumented endpoints or response shapes.

**Workaround:** Used the documented Qloo Hackathon API and ran a bounded smoke test with generic jazz tags. The test resolved two tags and returned five artist and five brand entities with numeric affinity values. It sent no event brief, URL, or personal data.

**Status:** Smoke test passed. This establishes connectivity and response parsing for the tested queries; it is not a recommendation-quality benchmark. See [qloo-smoke.mjs](./scripts/qloo-smoke.mjs).

### 3. Explainability was requested but absent in tested results

**Challenge:** The request enabled Qloo’s documented explainability option, but the tested artist and brand results did not contain per-entity explainability objects.

**Workaround:** The application reports explainability as unavailable when Qloo does not return it. It does not invent explanations or present model-written interpretation as provider-returned evidence.

**Status:** Implemented for the tested response shape. Other Qloo response variants still require validation if encountered. See [qloo.ts](./src/lib/providers/qloo.ts) and [App.tsx](./src/App.tsx).

### 4. Affinity values could be mistaken for percentages or probabilities

**Challenge:** Displaying affinity as a percentage could imply a calibrated probability or a measured likelihood of attendance or purchase.

**Workaround:** Preserved and displayed the raw Qloo affinity number without converting it to a percentage or describing it as a probability. Documentation distinguishes cultural-fit signals from demand, attendance, and purchase intent.

**Status:** Addressed in the UI and documentation. See [qloo.ts](./src/lib/providers/qloo.ts) and [README.md](./README.md).

### 5. Cultural brand results could be mistaken for confirmed sponsors

**Challenge:** A brand associated with cultural tags is not necessarily a local business, available partner, or willing sponsor.

**Workaround:** Labeled Qloo brand results as discovery leads and required independent verification of local presence, audience fit, availability, and commercial interest. Kept generated sponsor-category hypotheses distinct from Qloo-returned brand entities.

**Status:** Addressed in product copy. No verified sponsor relationships are claimed.

### 6. Model-generated ROI indicators risked sounding like measured data

**Challenge:** Fit indices, downside-risk indicators, and demographic-sounding labels could be mistaken for measured audience demographics, actuarial estimates, or Qloo scores.

**Workaround:** Relabeled these values as model-generated planning heuristics on a 0–100 index. Added UI and documentation disclosures that they are not measured demographics, audience overlap, actuarial risk, verified sponsors, or purchase intent.

**Status:** Addressed in the local UI and documentation. These indicators remain model-generated estimates, not validated measurements. See [PromoterROIConsole.tsx](./src/components/PromoterROIConsole.tsx) and [Implementation guide.md](./Implementation%20guide.md).

### 7. No real organizer or reviewer evidence was available

**Challenge:** Without anonymized organizer briefs, independent reviewers, or organizer pilots, the project cannot demonstrate that Qloo-grounded recommendations outperform a baseline or change real planning decisions.

**Workaround:** Added a local evaluation helper and 24 synthetic briefs. The helper can prepare randomized blind A/B packets and score reviewer ratings and entity-ID coverage without making provider calls.

**Status:** Evaluation mechanics are available, but no real reviewer study or organizer pilot has been completed. Synthetic cases, mocked responses, and workflow tests must not be presented as product-performance evidence. See [grounding-eval.mjs](./scripts/grounding-eval.mjs) and the evaluation section in [README.md](./README.md).

### 8. A public partner API would need more than an endpoint

**Challenge:** A customer-facing API would require an authentication model, tenant isolation, rate limits, usage controls, and operational safeguards. Adding a route that calls Qloo alone would not make a production-ready partner API.

**Workaround:** Implemented a typed, server-side internal cultural-context operation for the current workflow rather than claiming to provide a public API or SDK.

**Status:** Public API and SDK remain future work. See [culturalContext.ts](./src/lib/agent/culturalContext.ts).

### 9. Evaluation needed to respect the no-new-resource constraint

**Challenge:** A credible study should not depend on adding a new analytics, survey, or evaluation service.

**Workaround:** Kept the study workflow local and file-based. The authorized Qloo smoke test was bounded; the evaluation helper makes no provider calls. No new dependency was added for the evaluation workflow.

**Status:** The offline workflow is available. A real study still needs human participants and actual paired outputs; local tooling cannot substitute for those.

### 10. Local changes and the deployed demo are not the same build

**Challenge:** Local implementation changes do not automatically update the public Vercel demo.

**Workaround:** Reported local validation separately from deployed behavior and avoided claiming that the live demo contains these changes.

**Status:** The changes described in this log are local until pushed and redeployed. Verify the deployed build before presenting it as evidence of the latest implementation.

### 11. The pinned package manager was not globally available

**Challenge:** The environment did not have the project’s pinned `pnpm` command available globally.

**Workaround:** Used Corepack with the repository-pinned package manager rather than installing another global tool.

**Status:** `corepack pnpm lint`, `corepack pnpm typecheck`, and `corepack pnpm build` passed for the local implementation.

## Remaining evidence needed

1. Use at least 20 anonymized event briefs and create genuine paired LLM-only and Qloo-grounded outputs using comparable model settings.
2. Have 3–5 independent event or marketing reviewers rate the blinded pairs.
3. Run a small organizer pilot and record whether recommendations changed a real planning decision.
4. Publish the sample size, method, results, and limitations. Do not claim statistical significance or guaranteed judge scores from a small exploratory study.

## Summary

The principal workarounds made the build more testable and its claims more precise: verify Qloo behavior with a bounded smoke test, expose missing provider evidence honestly, keep model estimates distinct from measured data, and use a local evaluation workflow while real participants are unavailable. These steps improve technical credibility, but they do not replace organizer and reviewer evidence.
