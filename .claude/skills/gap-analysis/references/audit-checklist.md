# Audit checklist

Walk this checklist for each scope. Each dimension produces a section of the
final report. Skip dimensions that don't apply to the scope (e.g.,
`feature <name>` only needs dimension 2).

---

## 1. New models

**Input:** `packages/ai-<provider>/src/model-meta.ts`
**Upstream:** the provider's models page (see provider-doc-urls.md).

Steps:

1. Read the local `model-meta.ts` and extract the model-id constants
   (e.g. `OPENAI_CHAT_MODELS`, `ANTHROPIC_MODELS`, `GEMINI_MODELS`, etc.).
   The constants are usually exported `as const` records keyed by model id.
2. WebFetch the upstream models page. Extract the canonical model ids.
3. **Diff**: produce two lists —
   - Missing locally (upstream lists, we don't)
   - Stale locally (we list, upstream has deprecated or removed)
4. For each missing model, capture from upstream:
   - Context window
   - Max output tokens
   - Knowledge cutoff date (if listed)
   - Pricing (input / cached input / output per 1M tokens)
   - Capabilities array (text / image / audio / video in/out, tools, reasoning)
5. Cross-reference with the existing `ModelMeta` shape in that provider's
   `model-meta.ts` so the report's suggested-addition block matches the
   shape the maintainer can paste in.

**Priority rubric:**

- New flagship / GA model → **high**
- New preview / experimental model → **medium**
- Deprecated upstream but still in local → **medium** (action: deprecate)
- Minor variant (e.g., size suffix) → **low**

---

## 2. Cross-adapter feature parity

**Input:** `testing/e2e/src/lib/feature-support.ts` (the matrix).
**Upstream:** each provider's API reference / capabilities page.

Steps:

1. Read the matrix. For each `feature ∈ ALL_FEATURES`:
   - List `providers_with = matrix[feature]`.
   - Compute `providers_without = ALL_PROVIDERS - providers_with`.
2. For each `(feature, provider)` in `providers_without`:
   - Check if `feature-support.ts` has an inline comment immediately above
     the feature's `Set` that excludes this provider (e.g., `// Gemini
excluded: …`). If yes → **tested gap**, surface in "Out-of-scope" with
     line-number citation.
   - Otherwise, WebFetch the provider's API reference and search for the
     capability. Map TanStack feature → upstream capability using the table
     below. If upstream supports it → **real gap**, high or medium priority.
     If upstream does not support it → not a gap, omit.
3. Also flag any provider in `providers_with` that the upstream docs say
   has **removed** support (rare, but possible after deprecation).

### Feature → upstream capability map

| TanStack feature           | Upstream capability to look for                    |
| -------------------------- | -------------------------------------------------- |
| `chat`                     | Any chat/messages/completions endpoint             |
| `one-shot-text`            | Non-streaming completion                           |
| `reasoning`                | Reasoning / thinking / chain-of-thought tokens     |
| `multi-turn`               | Conversation / message history support             |
| `tool-calling`             | Function calling / tool use                        |
| `parallel-tool-calls`      | Multiple tool calls in one turn (parallel)         |
| `tool-approval`            | Pause-before-execute / user-confirm tool hooks     |
| `text-tool-text`           | Tool call interleaved with text in the same turn   |
| `structured-output`        | JSON schema / response format / structured outputs |
| `structured-output-stream` | Streaming JSON schema responses                    |
| `agentic-structured`       | Structured output + tool calling combined          |
| `multimodal-image`         | Image input (vision)                               |
| `multimodal-structured`    | Image input + structured output                    |
| `summarize`                | Any non-chat completion useful for summarization   |
| `summarize-stream`         | Streaming summarize                                |
| `image-gen`                | Image generation endpoint                          |
| `tts`                      | Text-to-speech endpoint                            |
| `transcription`            | Speech-to-text endpoint                            |
| `video-gen`                | Video generation endpoint                          |

**Priority rubric:**

- Real gap on a flagship feature (`tool-calling`, `structured-output`,
  `multimodal-image`) → **high**
- Real gap on a media feature (`image-gen`, `tts`, `transcription`,
  `video-gen`) → **medium**
- Tested gap (documented exclusion) → **out-of-scope**

---

## 3. Untracked features

**Input:** the union of `ALL_FEATURES` plus the four media adapters
(`image-gen`, `tts`, `transcription`, `video-gen`).
**Upstream:** provider's API reference top-level navigation.

Steps:

1. Read the upstream API reference's top-level sections.
2. For each section, ask: does TanStack AI have a concept for this? Examples
   of "novel" upstream capabilities to look out for:
   - Prompt caching (Anthropic, OpenAI)
   - Batch API
   - Files API / assistants API
   - Fine-tuning
   - Moderation
   - Real-time / live API (already partially supported on openai, grok)
   - Embeddings (already supported on openai; gap if elsewhere)
   - Computer use / browser tools
   - Memory / sessions
3. Cross-check by grep'ing the adapter source:
   - `Grep "<capability-keyword>" packages/ai-<provider>/src/`
   - If zero matches → likely untracked.
4. For each untracked feature, note:
   - Upstream URL
   - One-line summary of what it does
   - Whether other TanStack AI adapters expose anything analogous

**Priority rubric:**

- Capability that meaningfully changes app architecture (caching, batch,
  realtime) → **high**
- Capability that's a sibling of existing features → **medium**
- Provider-specific niche → **low**

---

## 4. Capability flag drift

**Input:** every provider's `model-meta.ts` `supports.{input,output,endpoints,features,tools}` arrays.
**Upstream:** model-level capability tables on the provider's models page.

Steps:

1. Read every provider's `model-meta.ts`. For each model entry, list its
   `supports` arrays.
2. Build a cross-provider table: for the **chat** model class, which keys
   are commonly declared (e.g., `endpoints: ['chat']`)? Flag outliers.
3. For each provider's flagship model, WebFetch the upstream model card and
   check whether the local `supports` arrays match. Common drifts:
   - `supports.input` missing `image` after vision was added
   - `supports.features` missing `structured_outputs` after GA
   - `supports.tools` missing a newly launched provider tool
   - `context_window` stale (upstream raised the cap)
   - `knowledge_cutoff` stale
4. Pricing drift is generally **out of scope** for an audit (changes too
   often), but must be included in the report when an upstream pricing
   announcement is less than 30 days old.

**Priority rubric:**

- Missing capability flag for an in-use feature → **high** (causes type
  errors or feature unavailable)
- Stale context window / output tokens → **medium**
- Stale knowledge cutoff label → **low**

---

## 5. Telemetry / observability parity

**Input:** every adapter's stream-emit and final-response paths in
`packages/ai-<provider>/src/adapters/*.ts`.
**Upstream:** the provider's API reference for the response envelope (usage,
cost, cache, reasoning, request-id, safety/moderation fields).

The goal is to flag adapters that drop telemetry their upstream returns, or
that surface it less completely than a sibling adapter does. Pricing is
not computed locally — but if upstream returns billable counts (cached
tokens, reasoning tokens, image-token splits, etc.) the adapter should pass
them through so callers can price downstream.

Steps:

1. For each adapter, grep the streaming and non-streaming paths for the
   fields it forwards into `StreamChunk` / final response usage:
   - `Grep "usage|promptTokens|completionTokens|cached|reasoning|cache_creation|cache_read" packages/ai-<provider>/src/adapters/`
2. Build a cross-adapter table of which fields each adapter emits. Rows
   below are examples — extend per provider:

   | Telemetry field             | openai | anthropic | gemini | ollama | grok | groq |
   | --------------------------- | ------ | --------- | ------ | ------ | ---- | ---- |
   | prompt / input tokens       |        |           |        |        |      |      |
   | completion / output tokens  |        |           |        |        |      |      |
   | total tokens                |        |           |        |        |      |      |
   | cached input tokens         |        |           |        |        |      |      |
   | cache-creation tokens       |        |           |        |        |      |      |
   | reasoning tokens            |        |           |        |        |      |      |
   | image / audio token splits  |        |           |        |        |      |      |
   | request-id / response-id    |        |           |        |        |      |      |
   | upstream cost (if returned) |        |           |        |        |      |      |
   | safety / moderation flags   |        |           |        |        |      |      |
   | finish-reason / stop-reason |        |           |        |        |      |      |

3. WebFetch the upstream API reference to confirm which fields are actually
   returned. A blank cell where upstream returns the field → telemetry gap.
   A blank cell where upstream doesn't return the field → not a gap.
4. Also check logging parity: does one adapter `console.warn` /
   `console.debug` on retry/rate-limit/parse-failure while another swallows
   it silently? Grep `console\.(warn|error|debug|info)` and `logger` per
   adapter and note asymmetries.

**Priority rubric:**

- Adapter drops a field upstream returns that another adapter forwards
  (e.g., cached tokens) → **high** (breaks downstream cost accounting).
- Adapter drops a field upstream returns but no sibling forwards it
  either → **medium** (gap, but not a regression).
- Logging asymmetry (one adapter warns, another swallows) → **low**
  unless it hides a class of errors callers need to handle.

---

## 6. Activity coverage

**Input:** each provider's `packages/ai-<provider>/src/adapters/` directory.
**Reference:** the `AdapterKind` union in `packages/ai/src/activities/index.ts`
(7 kinds: `text`, `summarize`, `image`, `audio`, `video`, `tts`,
`transcription`).
**Upstream:** each provider's API reference / models page.

This dimension answers a coarser question than dimension 2: not "which
behaviour within chat is exercised" but **"which whole activity kinds does the
provider's API offer that we ship no adapter for at all."**

Steps:

1. For every provider, list its adapter files and map each to an activity kind
   using the filename→kind table in `SKILL.md` (§ Known activities). That
   yields the local provider×activity matrix. `text.ts`,
   `text-chat-completions.ts`, and `responses-text.ts` all count as `text`;
   `speech.ts` and `tts.ts` both count as `tts`; ignore `cost.ts` and other
   helpers.
2. Build the full grid (rows = 9 providers, cols = 7 activity kinds). A cell is
   ✅ if an adapter file of that kind exists, ❌ otherwise.
3. For each ❌ cell, WebFetch the provider's API reference and check whether
   upstream offers that activity:
   - **Real gap** — upstream offers it, we ship no adapter, and there is no
     documented reason. High if it's a flagship activity for that provider
     (e.g. a TTS provider missing `transcription`), medium otherwise.
   - **Not a gap** — upstream genuinely doesn't offer that activity (e.g.
     Anthropic has no image/audio/video/tts/transcription endpoints; Groq has
     no image/video generation). Mark the cell ❌-by-design and omit from the
     gap list, but keep it in the grid so the report is self-contained.
4. Note the inverse too: any **local adapter for an activity the provider no
   longer offers upstream** (rare; surface as a stale-adapter finding).

Map activity kind → upstream capability to look for:

| Activity kind   | Upstream capability                               |
| --------------- | ------------------------------------------------- |
| `text`          | Chat / messages / completions endpoint            |
| `summarize`     | Any text completion (summarize is built on chat)  |
| `image`         | Image generation endpoint                         |
| `audio`         | Music / sound / general audio generation endpoint |
| `video`         | Video generation endpoint                         |
| `tts`           | Text-to-speech endpoint                           |
| `transcription` | Speech-to-text endpoint                           |

**Priority rubric:**

- Missing a core activity the provider's API clearly offers (e.g. OpenAI-class
  provider with no `image`/`tts`/`transcription`) → **high**.
- Missing a secondary/media activity → **medium**.
- ❌-by-design (upstream doesn't offer it) → **out-of-scope**, keep in grid only.
- Local adapter for a now-removed upstream activity → **medium** (deprecate).

Render the grid in the report under its own "Activity coverage" section, with
one bullet per real gap citing the upstream URL.

---

## Subagent dispatch (for `--all` scope)

When fan-out is needed, launch one `Explore` subagent per provider with a
prompt of this shape:

> Audit the `<provider>` adapter at `packages/ai-<provider>/`
> against upstream docs at the URLs in
> `.claude/skills/gap-analysis/references/provider-doc-urls.md`. Walk
> dimensions 1, 3, 4, and 5 from `audit-checklist.md`. Skip dimensions 2
> and 6 (the orchestrator handles cross-provider parity and the
> activity-coverage grid centrally) — but do emit dimension-5 telemetry
> rows in the per-provider format; the orchestrator stitches them into the
> cross-adapter table. Return findings as markdown sections matching the
> report template — High / Medium / Low / Out-of-scope — with upstream
> URLs cited for every claim.

The orchestrator builds the dimension-6 activity-coverage grid itself from
the adapter-file listing (a one-shot `ls packages/ai-*/src/adapters/`), then
WebFetches each provider's API reference only for the ❌ cells.

Run at most 3 in parallel. Aggregate their returned markdown into the
combined report.
