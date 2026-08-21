# @tanstack/ai

## 0.47.3

### Patch Changes

- [#938](https://github.com/TanStack/ai/pull/938) [`7c4b73a`](https://github.com/TanStack/ai/commit/7c4b73af5023e7ab7e113121644213c75d611aac) - Reject non-streaming text calls when their event stream ends with a `RUN_ERROR`.

- [#931](https://github.com/TanStack/ai/pull/931) [`87e497f`](https://github.com/TanStack/ai/commit/87e497f2e282c2389579051ec743fa4cc8cf493e) - Preserve signed thinking blocks relative to tool calls when converting assistant UI messages. A thinking block that follows a provider-executed tool now starts a new assistant segment instead of being replayed before that tool.

- [#1020](https://github.com/TanStack/ai/pull/1020) [`c0ba484`](https://github.com/TanStack/ai/commit/c0ba48402a807d6482e1cb36a0cf393d0cd26b2b) - Fix tool-call `input` corruption when a `TEXT_MESSAGE_CONTENT` event arrives between `TOOL_CALL_ARGS` events. Text events no longer force-complete in-flight tool calls, and `input` is only set when a strict `JSON.parse` of the accumulated arguments succeeds.

- [#1016](https://github.com/TanStack/ai/pull/1016) [`d34b6c0`](https://github.com/TanStack/ai/commit/d34b6c01fbc9ed83e5dc9bd2725eb05f6b03bfd4) - New provider adapter: `@tanstack/ai-llmgateway` connects TanStack AI to
  [LLM Gateway](https://llmgateway.io), an open-source, self-hostable AI
  gateway that routes one OpenAI-compatible endpoint to hundreds of models
  across many providers.
  - `llmGatewayText` / `createLLMGatewayText` — streaming chat with tool
    calling, structured outputs, multimodal (image) input, and reasoning
    deltas (`reasoning_content`) surfaced as AG-UI `REASONING_*` events
  - `llmGatewaySummarize` / `createLLMGatewaySummarize` — summarization via
    the shared `ChatStreamSummarizeAdapter`
  - `LLMGATEWAY_CHAT_MODELS` — a curated list of flagship model ids, with
    per-model input modalities and tool capabilities resolved at the type
    level, and any other model id from llmgateway.io/models accepted and
    typed against the generic provider options
  - `provider/model` ids pin routing to a specific provider; bare ids let
    the gateway choose

  `@tanstack/ai` registers `llmgateway` in the summarize wrapper's
  provider-native token-key map, so `summarize({ maxLength })` reaches the
  gateway as `max_tokens` instead of being dropped with a warning.

## 0.47.2

### Patch Changes

- [#1175](https://github.com/TanStack/ai/pull/1175) [`17b4c60`](https://github.com/TanStack/ai/commit/17b4c60c8d237df53a63dcda18c43d8017d45449) - Route adapter-emitted `RUN_ERROR` events through middleware `onError` hooks and preserve provider error codes in persisted run failures.

## 0.47.1

### Patch Changes

- [#1126](https://github.com/TanStack/ai/pull/1126) [`47699ed`](https://github.com/TanStack/ai/commit/47699ed1bf0c21a3835f012fe95f9dd8f089e41d) - Persist completed structured outputs as structured-output message parts and restore them during chat hydration.

## 0.47.0

### Minor Changes

- [#1102](https://github.com/TanStack/ai/pull/1102) [`32e62ab`](https://github.com/TanStack/ai/commit/32e62ab8b7dc6a8a13ca3851c8925ab806e08f29) - Add first-party generic interrupts.

  Use `defineInterrupt()` to describe a pause, register it on `chat()` and the client hooks, and return requests from `onInterruptBoundary`. The client gets typed payloads and `resolveInterrupt`. Resume validates the answer and runs `onInterruptResolution`.

  `GenericInterrupt<typeof reviewPlan>` types one bound card. `INTERRUPT_BOUNDARY_PHASES` and `INTERRUPT_TOOL_RESUMES` are the shared phase and resume lists.

### Patch Changes

- [#1161](https://github.com/TanStack/ai/pull/1161) [`5f68cbc`](https://github.com/TanStack/ai/commit/5f68cbccf3621b48dae73cedcb1e59cb4cbe72b4) - Harden first-party generic interrupt resume.

  Ephemeral continuation now rehydrates an already-parsed display payload instead of running `payloadSchema` again, so transforming schemas keep working. Invalid `expiresAt` values fail closed, binding parse uses one reader, and sequential interrupt-store writes preflight before changing records.

## 0.46.0

### Minor Changes

- [#896](https://github.com/TanStack/ai/pull/896) [`41a5d18`](https://github.com/TanStack/ai/commit/41a5d189082331e052e1f2f5e987848501ffd08b) - Add a self-describing `billed` field to `TokenUsage` so billed quantities carry the unit they are counted in ([#816](https://github.com/TanStack/ai/issues/816)). `usage.billed` is `{ quantity, unit }` with a `BillingUnit` union (`'seconds'`, `'units'`, `'images'`, `'tokens'`, ... open-ended). The deprecated `unitsBilled` / `durationSeconds` counts are still populated for backward compatibility. The fal adapters report `{ quantity, unit: 'units' }`, Grok video `{ quantity, unit: 'seconds' }`, the OpenAI/Grok/BytePlus duration-billed transcription paths `{ quantity, unit: 'seconds' }`, BytePlus Seedream images `{ quantity, unit: 'images' }`, BytePlus Seedance video `{ quantity, unit: 'tokens' }`, and Cohere/OpenRouter rerank `{ quantity, unit: 'units' }` (search units). Persistence sums `billed` when both reports use the same unit. `otelMiddleware` emits the pair as `tanstack.ai.usage.billed_quantity` / `tanstack.ai.usage.billed_unit` span attributes.

- [#969](https://github.com/TanStack/ai/pull/969) [`ecd12a4`](https://github.com/TanStack/ai/commit/ecd12a408987bc75649c21aada6948282a2a66dd) - WebSocket transport: a full-duplex, resumable third transport alongside SSE and
  NDJSON, reusing the same delivery-durability seam.

  On the server, `@tanstack/ai` adds `toWebSocketStream(socket, request, { onRun,
durability, batch, heartbeatMs, idleTimeoutMs, debug })` — a portable core that
  pumps a conversation over an already-accepted WHATWG `WebSocketLike` server
  socket (Node via `ws`, Bun, etc.), and `toWebSocketResponse(request, { onRun,
… })`, a thin wrapper that upgrades via `WebSocketPair` and returns a 101
  `Response` on Cloudflare Workers/Durable Objects (it throws elsewhere, pointing
  you at `toWebSocketStream`). Because one socket outlives many `chat()` turns
  (client-tool resubmits, follow-up user messages), you pass an `onRun(ctx) =>
AsyncIterable<StreamChunk>` factory instead of a prebuilt stream — the helper
  calls it per inbound `RunAgentInput` frame. The socket is conversation-scoped:
  it stays open across turns and closes on client close or the idle timeout
  (which never fires while a turn is still streaming), with a periodic
  `{ type: 'ping' }` heartbeat. An `{ type: 'abort', runId }` control frame
  aborts only that turn, leaving the socket open. A turn that fails is surfaced
  to the client as a live `RUN_ERROR` frame, mirroring the HTTP transports. Durability is keyed per turn and reuses
  the existing `durableStreamSource`, so server→client frames carry the same
  `{ id, chunk }` envelope as NDJSON. `resumeWebSocketStream(socket, { adapter })`
  and `resumeWebSocketResponse({ adapter })` replay a run read-only from the
  durability log (no model call).

  On the client, `webSocket(url, options)` (in `@tanstack/ai-client`, re-exported
  from `@tanstack/ai-react`, `-solid`, `-vue`, `-svelte`, and `-angular`) is a
  full-duplex `subscribe` + `send` connection adapter for `useChat`. `send()`
  writes a `RunAgentInput` frame; `subscribe()` yields inbound chunks, ignores
  heartbeats, unwraps durable envelopes, and auto-reconnects a dropped durable run
  by reopening with `?runId=&offset=` (browsers can't set a `Last-Event-ID`
  handshake header, so the offset rides in the URL). The reconnect bookkeeping
  (offset de-dupe, no-progress ceiling → `StreamReconnectLimitError`) is shared
  with the HTTP adapters via the new `createReconnectTracker`, and a fatal drop
  surfaces to the consumer (`StreamReadError` / `StreamReconnectLimitError`)
  instead of hanging. Aborting a run (`stop()` in `useChat`) sends the
  `{ type: 'abort', runId }` frame so the server cancels the turn instead of
  generating to completion, and `joinRun()` opens its own replay socket so a
  rejoin never collides with the live conversation socket.

### Patch Changes

- [#1147](https://github.com/TanStack/ai/pull/1147) [`4599019`](https://github.com/TanStack/ai/commit/4599019eb02f72562ef155b69b8f61f9d25d187a) - Preserve reasoning in server chat message history and interrupt snapshots.

- [#932](https://github.com/TanStack/ai/pull/932) [`3eda66c`](https://github.com/TanStack/ai/commit/3eda66cb132def6346829ba113f315ffdd4edf6b) - Classify Anthropic, Gemini, and OpenAI native tools with stable runtime discriminators so ordinary functions can use the same public names without selecting provider-native behavior. Native tools must come from the adapter factory (`webSearchTool()`, `googleSearchTool()`, and the rest). A reserved `name` alone does not select a native converter. `chat()` throws `DuplicateToolNameError` when a factory tool and a custom function share the same public name.

  Previously the converters picked provider-native behavior by `tool.name`. Tool names are public application identifiers, so a plain function called `web_search`, `google_search`, or `code_execution` was routed into a native converter: it lost its `inputSchema` and was sent as a provider-only payload (and on Anthropic could also flip on `code_execution` / skills beta headers). Native tools are now identified by adapter-owned metadata, which converters strip before building the wire payload, so provider API versions stay confined to the wire converters.

  Also preserves Anthropic `webSearchTool` options (`max_uses`, `allowed_domains`, `blocked_domains`, `user_location`, `cache_control`) on the wire payload.

  Also fixes `googleSearchTool({ searchTypes: … })` being silently dropped on the experimental `geminiTextInteractions()` adapter. The Interactions converter read a snake_case `search_types` array, but the public factory takes the Generate Content shape (`GoogleSearch.searchTypes: { webSearch?, imageSearch? }`), so the field never matched and every request fell back to the provider default of web-search-only. The camelCase config is now translated to the Interactions wire list.

- Updated dependencies [[`41a5d18`](https://github.com/TanStack/ai/commit/41a5d189082331e052e1f2f5e987848501ffd08b)]:
  - @tanstack/ai-event-client@0.9.0

## 0.45.1

### Patch Changes

- [#1139](https://github.com/TanStack/ai/pull/1139) [`b97a11b`](https://github.com/TanStack/ai/commit/b97a11beaea57bd675b5646074d15c0041f4763a) - Return recoverable Groq `tool_use_failed` responses to the model as non-executable tool errors so the agent loop can repair them.

## 0.45.0

### Minor Changes

- [#1110](https://github.com/TanStack/ai/pull/1110) [`c63319e`](https://github.com/TanStack/ai/commit/c63319e34a2ca2f1d56b90addf28784f7c3e13ad) - Harness adapters honor `chat({ outputSchema })` on the same turn.

  Claude Code and Codex pass a native schema flag. OpenCode, Grok Build, and `acpCompatible` parse JSON from the final assistant text. The engine reads a `structured-output.complete` event so harness prose is not parsed as JSON.

- [#1114](https://github.com/TanStack/ai/pull/1114) [`0fb8263`](https://github.com/TanStack/ai/commit/0fb826321c9ba7bd5d8ba0062be2a00b6178726d) - Rename Code Mode "skills" to "snippets" to disambiguate them from agent skills (the `SKILL.md` packaging system).

  **Breaking — package rename.** `@tanstack/ai-code-mode-skills` is now published as **`@tanstack/ai-code-mode-snippets`**. Update your dependency and imports. The `/storage` subpath is unchanged.

  **Breaking — API rename.** Every `Skill`/`skill` identifier in the package public API becomes `Snippet`/`snippet`, for example:
  - `codeModeWithSkills()` → `codeModeWithSnippets()`
  - `skillsToTools()` / `skillToTool()` → `snippetsToTools()` / `snippetToTool()`
  - `skillsToBindings()` / `skillsToSimpleBindings()` → `snippetsToBindings()` / `snippetsToSimpleBindings()`
  - `selectRelevantSkills()` → `selectRelevantSnippets()`
  - `createSkillManagementTools()` → `createSnippetManagementTools()`
  - `createSkillsSystemPrompt()` → `createSnippetsSystemPrompt()`
  - `generateSkillTypes()` → `generateSnippetTypes()`
  - `createFileSkillStorage()` / `createMemorySkillStorage()` → `createFileSnippetStorage()` / `createMemorySnippetStorage()`
  - Types: `Skill`, `SkillStorage`, `SkillIndexEntry`, `SkillStats`, `SkillBinding`, `SkillsConfig`, `CodeModeWithSkillsOptions`/`Result` → the `Snippet…` equivalents
  - Options: `skills` → `snippets`, `skillsAsTools` → `snippetsAsTools`, `maxSkillsInContext` → `maxSnippetsInContext`
  - Runtime tools: `search_skills` / `get_skill` / `register_skill` → `search_snippets` / `get_snippet` / `register_snippet`
  - Sandbox bindings are now exposed with the `snippet_` prefix (was `skill_`)

  **Breaking — sandbox hook (`@tanstack/ai-code-mode`).** The `createCodeModeTool` config option `getSkillBindings` is renamed to **`getSnippetBindings`** (same signature — an optional `() => Promise<Record<string, ToolBinding>>` returning dynamic bindings merged at execution time).

  **Breaking — wire contract (`@tanstack/ai`).** The Code Mode custom events are renamed: `code_mode:skill_call` / `_result` / `_error` → `code_mode:snippet_*` (payload field `skill` → `snippet`), and `skill:registered` → `snippet:registered`. The exported event types `CodeModeSkillCallEvent` / `CodeModeSkillResultEvent` / `CodeModeSkillErrorEvent` / `SkillRegisteredEvent` are renamed to their `Snippet` equivalents.

### Patch Changes

- [#1116](https://github.com/TanStack/ai/pull/1116) [`d10dfe6`](https://github.com/TanStack/ai/commit/d10dfe6eca788ae52631d45e5599aa0c45e9ba37) - Preserve existing message IDs on interrupt `MESSAGES_SNAPSHOT` events.

- [#1132](https://github.com/TanStack/ai/pull/1132) [`eda82cc`](https://github.com/TanStack/ai/commit/eda82cc8a86923afd604a663d050c6edfa6b829b) - Timestamp native and fallback structured-output events when they are emitted so their lifecycle remains chronologically ordered.

- [#1134](https://github.com/TanStack/ai/pull/1134) [`b09e010`](https://github.com/TanStack/ai/commit/b09e010b32932c812e65b1e14f6faa2b0e6d5cb8) - Return malformed tool arguments to the model as an error result so the agent loop can repair them.

## 0.44.1

### Patch Changes

- [#1101](https://github.com/TanStack/ai/pull/1101) [`99fb2b7`](https://github.com/TanStack/ai/commit/99fb2b7b113548b20afa894e014bd03773815a41) - Preserve stable IDs and creation timestamps for server-generated assistant messages across persistence and hydration.

## 0.44.0

### Minor Changes

- [#1047](https://github.com/TanStack/ai/pull/1047) [`59aa8b5`](https://github.com/TanStack/ai/commit/59aa8b5049549246227c8f2cf736ce50d05205a5) - feat(ai): add `timeout` and `abortSignal` to media generation activities

  Media activities (`generateImage`, `generateAudio`, `generateVideo`, `generateSpeech`, `generateTranscription`, and `summarize`) now accept optional `timeout` and `abortSignal`. Core composes them into a request-specific effective signal, races the adapter call so hung providers reject, clears timeout resources on settle, and routes aborts to middleware `onAbort` (not `onError`).

  `@tanstack/ai-fal` forwards the signal to `fal.subscribe()` / `fal.queue.submit()` per request — never via global `fal.config()` — so concurrent generations stay isolated.

- [#926](https://github.com/TanStack/ai/pull/926) [`ee07854`](https://github.com/TanStack/ai/commit/ee07854fd3d2d4bb279e6e4748802f7f9a5a7167) - Add a multimodal `embed()` activity. A single primitive covers one input or a batch — `input` accepts a string, a text part, an image part, or a fused text+image item written as a nested `Array<ContentPart>` (`[textPart, imagePart]`, the same shape chat messages use), one vector per item, with the accepted item types narrowed per model at compile time. Top-level `dimensions` requests Matryoshka output sizes where supported. Results carry `embeddings: [{ vector, index }]` plus `usage` when the provider reports it, and `embed()` participates in generation middleware, debug logging, OTel (`gen_ai.operation.name: embeddings`), and devtools events like every other activity.

  Provider adapters: `openaiEmbedding` (text-embedding-3-small/large), `geminiEmbedding` (gemini-embedding-001), `mistralEmbedding` (mistral-embed, codestral-embed), `ollamaEmbedding` (nomic-embed-text and any local model), `bedrockEmbedding` (Titan Text V2, Titan Multimodal G1 with fused text+image, Cohere Embed v3 on Bedrock), and `@tanstack/ai-cohere`'s `cohereEmbedding` (embed-v4.0, multimodal text+image with required `inputType`).

- [#845](https://github.com/TanStack/ai/pull/845) [`6903978`](https://github.com/TanStack/ai/commit/690397804254dca638961c79b7941555edc52c02) - feat: add `rerank()` activity for reordering documents by relevance to a query

  Adds a provider-agnostic `rerank()` activity (with `createRerankOptions`, the
  `RerankAdapter` interface, and `BaseRerankAdapter`). Documents may be strings
  or JSON-serializable objects — object documents are serialized for the
  provider and the original element is returned in the result, fully typed.
  Supports `topN`, per-request cancellation via `abortSignal`, and the standard
  observe-only `GenerationMiddleware` (`onStart`/`onUsage`/`onFinish`/`onAbort`/
  `onError`) plus `rerank:*` devtools events. Rerank bills in provider-defined
  search units, surfaced on `usage.unitsBilled`.

  The first adapter ships in the new `@tanstack/ai-cohere` package as
  `cohereRerank` / `createCohereRerank`.

### Patch Changes

- [#1066](https://github.com/TanStack/ai/pull/1066) [`b785cc4`](https://github.com/TanStack/ai/commit/b785cc4ae382fb0e2a337199d192bd9335ac9249) - Preserve stable UI message IDs when converting UI messages to model messages.

- [#928](https://github.com/TanStack/ai/pull/928) [`47e2464`](https://github.com/TanStack/ai/commit/47e246480d29e2ab5a83ca684e047670e75ba66c) - Fix OpenTelemetry root spans to report usage across all chat iterations, including error and abort exits.

- [#1069](https://github.com/TanStack/ai/pull/1069) [`dd7ddf1`](https://github.com/TanStack/ai/commit/dd7ddf19283358adfbf61d057321d7daee3ca50d) - Preserve `UIMessage.createdAt` when converting messages to and from `ModelMessage` so persisted transcripts retain their original timestamps.

- [#985](https://github.com/TanStack/ai/pull/985) [`fdb791a`](https://github.com/TanStack/ai/commit/fdb791a1c9c8de906eecf76f59743f697621b027) - `toRunErrorPayload` now falls back to a numeric `status` field when a thrown
  error carries no `code`. Some SDK error classes report the HTTP status only as
  `status: number` and no `code` (for example Google's `@google/genai`
  `ApiError`), so their status was previously dropped and the resulting
  `RUN_ERROR` event surfaced `code: undefined` — indistinguishable from an
  unknown failure. A string `status` (an HTTP reason phrase such as `"Forbidden"`
  or a symbolic status such as `"PERMISSION_DENIED"`) is intentionally ignored so
  only the numeric HTTP code is forwarded; an explicit `code` still wins.

- [#858](https://github.com/TanStack/ai/pull/858) [`7aa4ae9`](https://github.com/TanStack/ai/commit/7aa4ae9d07d21195dd3d62598ac503f1dfdc79e4) - Fix provider-specific model options inference for TTS, transcription, and summarize activities.

- [#1071](https://github.com/TanStack/ai/pull/1071) [`ea9c077`](https://github.com/TanStack/ai/commit/ea9c07724bd6992480238a699fbb18835eab743e) - fix: publish internal dependency ranges as `^x.y.z` instead of exact pins

  Internal dependencies on other TanStack AI packages used `workspace:*` in
  `dependencies` and `peerDependencies`. pnpm rewrites that to an **exact** version
  at publish time, so a released package asked for e.g. `@tanstack/ai-utils@0.4.0`
  rather than `^0.4.0`.

  Two consequences for consumers:
  - **Duplicate copies.** An exact pin cannot dedupe. Installing a newer
    `@tanstack/ai` alongside a package pinned to the previous patch produced two
    copies in the tree, which breaks `instanceof` checks and module-level state,
    and inflates bundles.
  - **Unsatisfiable peers.** An exactly pinned `peerDependency` conflicts the
    moment the internal package ships its next patch, forcing consumers into
    overrides or `--legacy-peer-deps`.

  These fields now use `workspace:^`, which publishes as `^x.y.z`. Every package
  here is still `0.x`, so `^0.43.1` resolves to `0.43.x` only — patches dedupe
  cleanly and no breaking minor is ever pulled in.

  `devDependencies` deliberately keep `workspace:*`: they are never published, and
  `*` correctly means "always build against the local copy".

- Updated dependencies [[`ee07854`](https://github.com/TanStack/ai/commit/ee07854fd3d2d4bb279e6e4748802f7f9a5a7167), [`6903978`](https://github.com/TanStack/ai/commit/690397804254dca638961c79b7941555edc52c02)]:
  - @tanstack/ai-event-client@0.8.0

## 0.43.1

### Patch Changes

- [#1055](https://github.com/TanStack/ai/pull/1055) [`ed44467`](https://github.com/TanStack/ai/commit/ed44467c5e701f0a4fcc1c9f5639d036de35d26a) - fix(otelMiddleware): open an iteration span for structured-output finalization ([#1054](https://github.com/TanStack/ai/issues/1054))

  No-tools + `outputSchema` calls skip the agent loop and only run the structured-output finalization request. That path previously emitted only a root `chat` span — no generation record, and `captureContent` was a silent no-op. `onConfig` now also opens an iteration span when `phase === 'structuredOutput'`, so each provider model call is observable. Native-combined mode is unaffected (it never fires that phase).

## 0.43.0

### Minor Changes

- [#1051](https://github.com/TanStack/ai/pull/1051) [`7499171`](https://github.com/TanStack/ai/commit/74991716aea4d90a5d0363676a1e3349689a48e8) - Fix `pipeToRunLog` recording an aborted drive as `'completed'`.

  `pipeToRunLog` checked its `signal` only inside the per-chunk loop, so an abort that arrived _between_ chunks — or a producer that reacted to the signal by simply ending its stream, which is what `chat()` does — let the loop exit normally and fall through to the success path. The run was then recorded `status: 'completed'` with a `finishedAt` it never earned. The signal is now re-checked after the loop: an aborted drive finishes as `'aborted'` whatever the producer did on its way out. A producer that _throws_ on abort still records `'failed'` (the thrown value is what a tailing client must be shown), a genuine completion still records `'completed'`, and `durability.close()` still runs on every exit path.

  The visible symptom was a false transcript on the worst possible run: `reapDetachedRuns` force-expiring a detached run past its TTL, destroying its sandbox, and reporting the run as having completed successfully. Any caller whose producer ends its stream on abort hit the same gap, including a takeover whose claim is lost mid-drive.

  With the status honest, `reapDetachedRuns` no longer reports the TTL-expiry path as the `'budget-exceeded'` anomaly. That outcome is documented as meaning the journal read, translation, or log is misbehaving, and it is now reserved for the finalization path where the probe already said the agent was finished. On the expiry path there is no probe and `runBudgetMs` is the only thing that stops a still-producing agent, so the designed stop reports `'expired'` — with `status: 'aborted'` distinguishing an agent cut off mid-sentence from one that had already finished.

  Add `@tanstack/ai-byteplus`, an adapter package for BytePlus ModelArk: Seed
  chat models, Seedance video generation, Seedream image generation, and Seed
  Speech text-to-speech and transcription.

  Seedance was already reachable through `@tanstack/ai-fal`, which proxies it.
  This package is the direct-to-BytePlus path — BytePlus billing and rate limits,
  the first-class Seedance request fields, and BytePlus's own model ids — so the
  overlap is deliberate. Seed Speech is a separate BytePlus product and needs its
  own API key (`BYTEPLUS_VOICE_API_KEY`), not the Ark key.

  Remove zod from `@tanstack/ai`'s dependency graph entirely.

  `@ag-ui/core` is bumped to `0.1.1-canary.beta.0`, which drops zod from its
  runtime dependencies and declares it as an optional peer instead. Previously
  every `@tanstack/ai` install pulled zod in transitively through it.

  `chatParamsFromRequest` / `chatParamsFromRequestBody` were the only zod
  consumers in this package — they validated request bodies with AG-UI's
  `RunAgentInputSchema`. They now validate the same `RunAgentInput` contract
  structurally, so `@tanstack/ai` ships with no schema-validation runtime at all
  and neither requires nor suggests zod.

  No API change: both helpers keep their signatures, still reject non-conforming
  bodies with a migration-pointing `AGUIError` (`chatParamsFromRequest` still
  throws a 400 `Response`), and still carry TanStack's canonical `parts` field
  through on messages. Validation errors now name the offending field —
  `messages[1].content must be a string` instead of a zod issue dump.

  zod remains fully supported for defining tools; it is simply no longer
  installed on your behalf. If you relied on getting zod transitively without
  declaring it, add it explicitly: `npm install zod`.

  Adopt the AG-UI interrupt lifecycle for tool approvals, generic responses, and
  client-tool execution, with typed bound resolvers, atomic batches, and
  structured errors. Interrupts run ephemerally by resuming from the full client
  message history in a fresh child run — no persistence required.

  This changes native approval and client-tool streams from legacy custom events
  to snapshot-plus-`RUN_FINISHED` interrupt outcomes. Deprecated
  `pendingInterrupts`, `addToolApprovalResponse`, raw `resumeInterrupts`, and
  legacy event readers remain as limited compatibility surfaces for migration;
  `addToolResult` remains supported.

  The artifact options for `withGenerationPersistence` are now named
  `ArtifactPersistenceOptions`.

  They were declared as a second `export interface WithPersistenceOptions`, which
  TypeScript merged with the chat middleware's options of the same name. The merge
  was invisible but not harmless: `withPersistence(chat, …)` silently accepted
  `extractArtifacts` / `storageKey` / `allowInputUrl` / `artifactFetch`, and
  `WithGenerationPersistenceOptions` — which extends it — advertised
  `snapshotStreaming` / `snapshotIntervalMs`. Every one of those is a no-op on the
  other middleware, so autocomplete offered options that did nothing.

  `WithPersistenceOptions` keeps its meaning: the chat middleware's options.
  `WithGenerationPersistenceOptions` is unchanged in shape and is still what you
  pass to `withGenerationPersistence`, so only code that named the artifact
  interface directly needs an edit:

  ```diff
  -import type { WithPersistenceOptions } from '@tanstack/ai-persistence'
  -function artifactOptions(): WithPersistenceOptions {
  +import type { ArtifactPersistenceOptions } from '@tanstack/ai-persistence'
  +function artifactOptions(): ArtifactPersistenceOptions {
     return { storageKey: ({ runId, artifactId }) => `media/${runId}/${artifactId}` }
   }
  ```

  A bootstrap shell that dies mid-setup now fails the run instead of exhausting the host's memory, and teardown's `destroy` is no longer cancelled by the abort that triggered it.

  **`createBootstrapShell`'s sentinel loop had no exit but the sentinel.** `run()` read lines until it saw `<sentinel> <code>`, and the stdout drainer resolved every parked waiter with `''` once the stream ended — indistinguishable from the empty lines `sh` emits constantly. So when the shell exited without printing its sentinel (a missing binary, an OOM kill, the provider reaping the sandbox mid-bootstrap, a transport reset), the loop spun on an infinite supply of `''`, pushing each one into its output buffer until the host process died of memory exhaustion. Two independent terminators now exist:
  - End-of-stream is signalled as `null`, distinct from an empty line, so `run()` rejects the moment the shell is gone — with the drainer's own thrown value attached as `cause` when the stream errored rather than ended.
  - A per-command deadline for a shell that stays alive and simply never answers. `BootstrapShellOptions.commandTimeoutMs` configures it; the default is 30 minutes, deliberately generous because setup steps legitimately run that long (`npm install`, image pulls).

  `drainStdout` also unblocks every parked waiter in a `finally`, so a throw while iterating stdout can no longer leave callers on a promise nobody resolves.

  **`defineSandbox`'s teardown `destroy` no longer forwards `ctx.signal`.** `destroy` runs on every teardown path _including_ the one caused by that signal aborting, so forwarding it handed the provider an already-aborted signal: a provider that honors it did nothing and returned successfully, and the instance-store `delete` that follows then removed the only pointer to a live, billed sandbox. `SandboxInstanceStore` has no `list`, so that sandbox was unreachable from then on. Teardown now uses a fresh controller with its own 60s bound — cleanup outlives whatever cancelled the work, without being able to hang forever. Same reasoning as `close()` never being fenced by the run claim.

  Add browser-refresh durability to the `persistence` option.

  The client `persistence` adapter now stores one combined record per chat id, the message transcript plus a resume snapshot, so a full page reload restores the conversation, rehydrates any pending interrupt, and rejoins a run that was still streaming (via `joinRun`, when the connection is durability-backed). A bare `UIMessage[]` from an older store is still read for backward compatibility.

  **If you hand-rolled a `persistence` adapter, update its write path.** `setItem` now receives the combined `{ messages, resume? }` record where it used to receive a bare `UIMessage[]`, so an adapter that assumed an array will write the new shape and then fail to parse it back — and because adapter reads are best-effort, the failure is silent: the conversation simply does not restore. Read `{ messages, resume? }` in `getItem` (a bare array is still accepted), or switch to the `localStoragePersistence` / `sessionStoragePersistence` / `indexedDBPersistence` adapters below, which handle it for you.

  The `persistence` option also accepts `true` for a server-authoritative chat: the client caches nothing, and on mount it hydrates the thread from the server by its `threadId` (painting the stored transcript and tailing any run still generating). Use it to keep large transcripts off the client while the server stays authoritative for history; it needs a connection with a `hydrate` handler and a server GET endpoint (`reconstructChat`). Passing an adapter is client-authoritative; omitting `persistence` (or `false`) is ephemeral, in-memory only.

  New web storage adapters are exported for this: `localStoragePersistence`, `sessionStoragePersistence`, and `indexedDBPersistence` (plus `StorageUnavailableError` and the `ChatPersistedState` / `ChatStorageAdapter` / `ChatPersistenceOption` types). Because durability rides the existing `persistence` option, every framework integration (`react`, `solid`, `vue`, `svelte`, `angular`, `preact`) gets it with no framework-specific code.

  A restored generation whose result can't be rebuilt now reports an error instead
  of repainting as a blank success.

  Every `reconstructResult` mapper in `generation-reconstruct.ts` (and the video
  client's built-in `reconstructVideoResult`) returns `null` when the persisted
  record lacks what it needs — most commonly an output artifact stored without a
  serve `url`, which is possible because `artifactUrl` is optional server-side.
  `repaintFromSnapshot` silently skipped `setResult` in that case, leaving
  `status: 'success'` with `result: null`: a state no consumer can render, and one
  that hides the real cause.

  When a mapper declines a snapshot whose status is `complete`, the restore now
  settles on `status: 'error'` with an explanatory message and fires `onError`. A
  decline on any other status is still silent — a `running` snapshot has no result
  yet by definition, and the rejoin delivers it. A client with no
  `reconstructResult` mapper at all is unaffected.

  Server-driven generation hydration no longer swallows every failure.

  `GenerationClient` / `VideoGenerationClient` mount hydration
  (`persistence: true`) wrapped the whole `hydrateGeneration` call in a bare
  `try { … } catch { return }`, collapsing a transport error, a `403` from the
  `reconstructGeneration` authorize gate, an unparseable body, and "no record for
  this thread" into one indistinguishable silent no-op — so an app could not tell a
  broken server from a fresh thread, and had no signal to retry.
  - A genuine **miss** (the server reports no record) stays silent, as before.
  - A genuine **failure** now surfaces on `status` / `error` and fires `onError`,
    with a message naming the cause. A record the client's own validator rejects
    (unknown schema version, missing/invalid `status` or `resumeState`) counts as a
    failure, not a miss.
  - The failure is skipped when a `generate()` took ownership of the client while
    the hydrate request was in flight — the live run still wins.

  Relatedly, `fetchServerSentEvents` / `fetchHttpStream` `hydrateGeneration` now
  only treats a `200` carrying `null` as a miss. Any other non-object body (a
  string, an array) rejects instead of being reported as an empty thread, so a
  misconfigured route no longer masquerades as a fresh one.

  A generation stream that ends without a terminal chunk now settles to `error`
  instead of wedging the client on `generating` forever.

  `GenerationClient.processStream` / `VideoGenerationClient.processStream` only
  settled the status on `RUN_FINISHED` or `RUN_ERROR`. A `for await` loop over a
  stream that simply _ends_ — a proxy/load-balancer idle timeout, a server restart
  mid-run, or a durable log whose terminal append never landed — returns normally,
  so no catch fired and the client came to rest on
  `status: 'generating'`, `isLoading: false`, `result: null`, with `onError` never
  called. Worse, the resume snapshot stayed `running`, so every subsequent mount
  rejoined the same dead run and repeated the same outcome.

  Both clients now throw when the stream ends with no terminal chunk seen (and the
  read wasn't aborted by `stop()` / `dispose()`), which routes the failure through
  the existing error path: `status: 'error'`, `error` set, `onError` fired, and the
  resume snapshot rewritten to a terminal `error` with a null `resumeState` so
  nothing chases it again. This applies to both the initial `generate()` path and
  the mount-time `rejoinInFlight` path. A rejoin failure now also fires `onError`,
  matching `generate()`.

  This is the sibling of the earlier "rejoin settles to error" fix, which covered a
  missing and a throwing `joinRun` but not a join that returns cleanly with no
  terminal chunk.

  `localStoragePersistence` / `sessionStoragePersistence` / `indexedDBPersistence`
  are no longer generic. Each returns a `ChatStorageAdapter<ChatPersistedState>`,
  and `WebStoragePersistenceOptions` types its `serialize` / `deserialize` codec
  over `ChatPersistedState`.

  The type parameter existed so one adapter could back both the chat and the
  generation `persistence` option. Generation `persistence` is now `boolean`
  (server-driven only), so chat is the sole option that takes a storage adapter and
  the parameter had no second value to hold.

  A bare `localStoragePersistence()` is unchanged. A call that passed an explicit
  type argument for a standalone store, `localStoragePersistence<MyValue>()`, no
  longer compiles: build that store with your own object literal, since these
  factories are for chat state.

  Extend the shared conformance testkit to the generation stores.

  **Migration — every existing adapter must update its conformance call.** The suite now fails loudly on a store that is absent without being declared, so a chat-only adapter that used to pass unchanged will start failing on `generationRuns` / `artifacts` / `blobs`. Declare them absent:

  ```diff
  - runPersistenceConformance('my-adapter', () => makePersistence())
  + runPersistenceConformance('my-adapter', () => makePersistence(), {
  +   skip: ['generationRuns', 'artifacts', 'blobs'],
  + })
  ```

  Drop an entry from `skip` as you implement that store — the suite then holds it to the contract below. Declaring absence is deliberate: a silently skipped store is how an adapter ships a `generationRuns` implementation that was never exercised.

  `runPersistenceConformance` now exercises `generationRuns`, `artifacts`, and `blobs` alongside the four chat state stores, so a hand-rolled generation backend is held to the same gate as a chat one: `createOrResume` idempotency and `findLatestForThread` (latest by `startedAt`, thread-scoped, terminal runs included) on the run store; upsert `save`, `list(runId)` ordering, and `delete` / `deleteForRun` scoping on the artifact store; and byte/metadata round-trips, overwrite, silent absent-key `delete`, and `list` prefix + cursor paging on the blob store. Two invariants that were easy to get wrong and are now checked: `list`'s `prefix` matches **literally and case-sensitively** (a SQL backend using `LIKE` fails on both counts, since SQLite's `LIKE` is case-insensitive for ASCII and treats `%` / `_` as wildcards), and cursor paging visits every key exactly once.

  `examples/ts-react-chat`'s self-contained `node:sqlite` adapter implements all seven stores and runs the full suite; its server-side generation route is backed by that adapter, so generated images survive a dev-server restart.

  Fix `@tanstack/ai` breaking non-React TanStack Start builds.

  A JSDoc example on `replayRunStream` inlined a server-function builder chain. Comments survive into `dist`, and Start's server-fn Vite plugin decides whether a module needs compiling by regex-matching the source — so it treated this package as a server-fn module and tried to resolve the framework's `@tanstack/*-start` package, failing the build of any Solid/Vue/Svelte Start app (`could not resolve "@tanstack/solid-start"`). The example now declares the generator separately and no longer trips the match.

  `GenerationMiddlewareContext.resultTransforms` is now required.

  Middleware registers a result transform by pushing onto the array, so an optional one let a host that builds its own context omit it and silently no-op every registration — generation persistence would then mark a run completed with neither its result nor its artifacts written, with nothing to observe but the missing data. Every context the library builds already comes from `createGenerationContext`, which always sets `[]`, so this only affects code that constructs a `GenerationMiddlewareContext` by hand: set `resultTransforms: []`.

  `summarize()` accepts generation middleware, so summaries can be persisted.

  `useSummarize({ persistence: true, threadId })` type-checked exactly like the six media hooks, but `summarize()` took no `middleware`, so no library path could ever write its run record and a reload restored nothing. It now takes `middleware` like the `generate*` activities: one `onStart`, the result transforms applied to the `SummarizationResult`, then `onFinish` / `onError`, in both streaming and non-streaming mode (a consumer that disconnects mid-summary fires `onAbort`). In streaming mode the transformed result is what is yielded, so the client and the persisted record hold the same object.

  `GenerationActivity` gained `'summarize'`, and `otelMiddleware` maps it to the `summarize` operation name. Summaries are text, so there are no artifacts: a persistence middleware stores the run record and its result and nothing else.

  Fix non-streaming `generateVideo()` losing the generation when persistence is on.

  A non-streaming `generateVideo()` call only SUBMITS a job — the video does not exist until a later poll — but it fired `onFinish` as soon as the job was queued and never applied the result transforms, and it never put the caller's `threadId` on the middleware context. With `withGenerationPersistence` that meant `generateVideo({ threadId, middleware })` threw for want of a scope, and (once given one) would have stamped the run `completed` with no result, no url, and no stored bytes, while the eventual result had nowhere to land.

  Submitting a job now OPENS the run and `getVideoJobStatus()` closes it, with the two calls correlated by the provider's **`jobId`** — the one id a poller structurally cannot be missing, since it cannot poll without it. Nothing else has to be threaded through:
  - `generateVideo()` (non-streaming) passes `threadId` and the prompt inputs to middleware, files the run under an id derived from the provider + `jobId`, applies the result transforms to the submission (so the run record captures the `jobId` and stays resumable from a later request or process), and fires **no terminal hook**.
  - `getVideoJobStatus()` accepts `threadId` and `middleware`, and recomputes the same run id from `adapter` + `jobId`. On the poll that first observes a terminal job state it resumes that run, applies the result transforms — which is where persistence copies the video into the blob store and rewrites `url` to a durable one, so the returned result and the stored record carry the same urls — and fires `onFinish`, or `onError` when the job (or the url fetch) failed. Intermediate polls invoke nothing. Its result gained `jobId`, `expiresAt`, and `artifacts`; `VideoJobResult` gained `artifacts` (refs for persisted prompt INPUTS, e.g. a start frame).
  - `runId` on a non-streaming `generateVideo()` call is **ignored** (it remains the wire run id in stream mode). The run id has to be recomputable by the poll from the `jobId` alone; honoring a custom one would reintroduce the failure this avoids — a caller who set it on the submit and forgot it on the poll would silently open a second record while the first sat unfinished forever.

  Two consequences worth knowing. Because the job id only exists once the provider accepts the job, `onStart` now fires AFTER the submit request, so an `otelMiddleware()` span covers the run from acceptance onward rather than the submit round-trip, and a submission that FAILS (no job to key on) opens and immediately fails a run under the call's `requestId` — terminal and unresumable, but filed under the thread so a hydrating client sees the failure. And `threadId` must reach the poll: omitting it makes generation persistence throw loudly rather than file the finished video where nothing can hydrate it.

  Add `defineLock` to `@tanstack/ai/locks`: an identity typer for a `LockStore`
  implementation, matching the `define*Store` helpers in `@tanstack/ai-persistence`.
  Pass a `withLock` object and get autocomplete and contract checking inline, with
  no `: LockStore` annotation, then hand it to `withLocks`.

  ```ts
  import { defineLock, withLocks } from '@tanstack/ai/locks'

  const locks = defineLock({
    async withLock(key, fn) {
      const { release, signal } = await acquire(key)
      try {
        return await fn(signal)
      } finally {
        release()
      }
    },
  })

  const middleware = [withLocks(locks)]
  ```

  Add per-store typer helpers: `defineMessageStore`, `defineRunStore`,
  `defineInterruptStore`, `defineMetadataStore`.

  Each takes a store implementation and returns it typed against the contract, so
  you get autocomplete and checking on the object literal inline — no separate
  `: MessageStore` return annotation. They compose into `defineAIPersistence`,
  which already infers **exact presence**: a store you define is a defined,
  non-optional, autocompleted key on `persistence.stores`, and accessing a store
  you did not define is a compile error.

  ```ts
  import {
    defineAIPersistence,
    defineMessageStore,
    defineRunStore,
  } from '@tanstack/ai-persistence'

  const persistence = defineAIPersistence({
    stores: {
      messages: defineMessageStore({ loadThread, saveThread }),
      runs: defineRunStore({ createOrResume, update, get, findActiveRun }),
    },
  })

  persistence.stores.runs // RunStore (defined)
  persistence.stores.interrupts // compile error — not provided
  ```

  Deprecate generation `id` in favor of `threadId` as the single identity.

  `threadId` is the scope for the wire, devtools, and persistence. When it is
  supplied, `id` is typed `never` so you cannot pass both. Legacy `id` remains
  only for ephemeral runs that have no `threadId` (wire/devtools fallback) and is
  marked `@deprecated`.

  Fixed: a detached run's delivery log stays open, so a takeover can actually continue it.

  The durable delivery sink behind `toServerSentEventsResponse` / `toHttpResponse` appended a synthetic terminal `RUN_ERROR` ("Request aborted") and called `durability.close()` on **every** abort. On a plain disconnect of a detachable run — the whole point of durable runs — that defeated the feature twice over:
  - the log was terminalized, so a later attach's replay ended at the stored `RUN_ERROR` instead of continuing, and
  - that `RUN_ERROR` is a chunk the takeover's journal replay cannot reproduce, so `alignToStoredLog` threw `JournalReplayDivergedError`, `pipeToRunLog` recorded the perfectly healthy detached run as `'failed'`, and appended a _second_ terminal error.

  The sink now consults the run's own abort verdict. `withSandbox`'s `onAbort` publishes the new `RunDetachedCapability` on its detach branch — it is the only actor that has resolved both out-of-band cancel bands (`AbortInfo.cancelRequested` and `wasCancelRequested` on the record) plus `detachOnDisconnect` — and core carries the fact to the transport on the stream object itself, so there is nothing for an application to wire.

  Only a plain, intentless disconnect of a detachable run is spared. An explicit cancel in either band, a disconnect on a non-detachable run, `detachOnDisconnect: false`, a genuine provider failure, and a normal finish all terminalize and close exactly as before — a run is never left with an open log and no successor. Core additionally refuses to treat an abort carrying `RUN_CANCEL_REASON` as a detach whatever a middleware claims, so a user pressing Stop always gets a closed, terminal log.

  **Surface server-side memory state in the TanStack AI DevTools.**

  The DevTools panel now has a **Memory** tab for any chat wired with
  `memoryMiddleware`. It shows, per scope (session), an operations timeline (each
  turn's recall — query, fragment count, injected system-prompt size, whether
  memory tools were exposed, duration) and the current stored records/facts when
  the adapter implements the optional `inspect`/`listFacts` methods.

  Because memory runs on the server (whose event bus never reaches the browser),
  the middleware transports its state to the panel over the chat stream as a
  `memory:state` `CUSTOM` event, which `@tanstack/ai-client`'s devtools bridge
  re-emits as browser `memory:*` events — the same pattern generation results use.
  The snapshot reflects memory as of the start of each turn; opening the panel
  mid-conversation replays the latest state so the tab isn't empty.
  - `@tanstack/ai-memory` — `memoryMiddleware` injects a `memory:state` `CUSTOM`
    chunk carrying recall metrics + an `inspect`/`listFacts` snapshot; exports
    `MEMORY_STATE_EVENT` and `MemoryStateEventValue`.
  - `@tanstack/ai-event-client` — adds the `memory:snapshot` devtools event.
  - `@tanstack/ai-client` — the chat devtools bridge re-emits `memory:*` from the
    transported chunk and replays the last snapshot on `devtools:request-state`.
  - `@tanstack/ai-devtools-core` — new Memory tab + per-scope memory store slice.

  A sandboxed agent's run now survives a disconnect and can be picked back up by a later request instead of being torn down with the connection that started it. Wire `runs` + `durability` into `withSandbox` (the same `RunStore` chat persistence uses) and a disconnect on a durable run leaves the agent running, records `detachedSince`, and a later attach for the same `runId` replays the stored log, aligns against it, and keeps streaming from where the previous host left off.
  - **Single-writer enforcement.** A durable run is driven under a lease (`locks.withLock`) plus an `epoch` fence (`RunRecord.driverEpoch`, re-checked every 32 appends) plus a quiescence gate over `snapshot()` before a successor starts appending. A superseded driver's append is refused (`RunClaimLostError`) and, separately, its refusal can no longer terminalize the run record it lost the claim to — only the current claim holder may write a terminal status.
  - **`sandboxRunDriver`** (`@tanstack/ai-sandbox`) wires the claim and the run log together so an app supplies `request`/`runs`/`locks`/`durability`/`drive` rather than hand-rolling the claim/fence sequencing itself.
  - **Out-of-band cancel.** `requestRunCancel(runs, runId)` (durable — reaches a run being driven by a different host) and the `RUN_CANCEL_REASON` abort sentinel (in-process — fast path when the cancel reaches the driving host) are the only two channels that carry cancel intent; a plain disconnect and an explicit Stop produce the identical TCP close and are no longer conflated. `wasCancelRequested` reads the durable flag back; a store failure degrades to a detach rather than throwing, since a scheduled TTL reaper (see the `reapDetachedRuns` changeset) can still reclaim a stuck detach — provided the application actually schedules it; nothing sweeps `detachedSince` on its own.
  - **`@tanstack/ai-persistence`'s `onAbort` now distinguishes the two.** An explicit cancel (either channel) or a non-detachable run writes terminal `'aborted'`. A plain disconnect on a detachable run writes nothing — the record stays `'running'` for a later attach to resume, rather than the previous behavior of marking every disconnect `'interrupted'` with a terminal `finishedAt`.
  - **`ai-codex`, `ai-claude-code`, `ai-grok-build`** thread the durable `runId` through their journal and attach paths: `resolveDurableRunId` enforces a caller-supplied id whenever sandbox durability is wired (throwing `DurableRunIdRequiredError` otherwise, since a random fallback id is not derivable by a successor), `journalOptionsFor` builds the journal option only when durability is active, and `alignedIfAttaching` wraps the merged output stream so an attach replays and aligns against the stored log instead of restarting the agent. **`ai-opencode` and `ai-acp` do not journal**; both route through `resolveDurableRunId` with enforcement off (`durable: false`) and keep their generated-id fallback, purely so that whenever either gains journaling it inherits the caller-supplied-`runId` requirement instead of re-deriving it.
  - **`makeFakeShellSpawn`** ships from `@tanstack/ai-sandbox/testkit` for exercising the journal/claim/driver seam against a fake shell without a real sandbox provider.
  - **`RunError` in `@tanstack/ai-persistence`'s conformance suite now pins the `undefined`-vs-`false` distinction** on `cancelRequested`, `detachedSince`, `sandboxKey`, and `driverEpoch`: a fresh run must read all four back as `undefined` (not a coerced falsy default), and an explicitly-written `cancelRequested: false` must round-trip as `false`, distinct from the unset case.

  ### Breaking: `@tanstack/ai-sandbox`'s `RunDeps.durability` is now a per-run factory

  ```diff
   export interface RunDeps {
     runs: RunStore
  -  durability: StreamDurability
  +  durability: (runId: string) => StreamDurability
   }
  ```

  A single `StreamDurability` instance is bound to one run (a backend adapter's offsets embed a cursor into one log), so holding one instance let a caller silently mis-bind a run at concurrency 1 (`start({ runId })` accepted an arbitrary id while the instance stayed bound to whatever run it was constructed for, writing the lifecycle record under one id and the events under another with no error) and let concurrent runs cross-talk (parallel runs interleaved into the same log, and whichever finished first `close()`d every other run's stream too). `pipeToRunLog` and `RunController` now resolve the log FROM the `runId` being driven, once per run, which makes both failures unrepresentable. `RunController.attach` and the rest of its per-run surface now take `runId` explicitly instead of assuming a single bound log.

  **Not released — this stays a minor, not a major.** The durability surface introduced in earlier phases of this branch has not shipped in a published version, so this break reaches no released consumer. Migration for anyone building against the unreleased surface: change `durability` from an instance to `(runId) => StreamDurability`, and pass `runId` to `RunController.attach`.

  ### Breaking: `@tanstack/ai-persistence`'s `onAbort` no longer marks every disconnect `'interrupted'`

  `onAbort` used to write `status: 'interrupted'` with a terminal `finishedAt` on every abort, including a plain disconnect. `'interrupted'` is not supposed to be terminal-shaped (`isTerminalRunStatus('interrupted')` is `false`), so stamping a terminal timestamp on it told every reader the run was over while it might only be paused or still streaming elsewhere. `onAbort` now branches: an explicit cancel or a non-detachable run calls the new `abortRun` helper (`status: 'aborted'`, terminal); a plain disconnect on a detachable run writes nothing at all, leaving the record `'running'` for a later attach.

  **Migration:** a reader that treated every post-abort record as `'interrupted'` with a `finishedAt` must instead handle a `'running'` record with no `finishedAt` as "detached, possibly resumable" rather than "over." `withGenerationPersistence`'s `onAbort` is unaffected — a generation job has no journal or agent loop to reattach to, so it still unconditionally finalizes as `'aborted'`.

  ### Not breaking, called out for completeness: `AbortInfo.cancelRequested` now populates

  Declared as a placeholder in an earlier phase and unpopulated; core now sets it from the abort reason (`true` when the abort reason is the `RUN_CANCEL_REASON` sentinel, `false` otherwise). Purely additive in the type sense — this widens what was already `boolean | undefined` toward a real value — but is a **behavior** change worth flagging: middleware reading this field to distinguish an explicit cancel from any other abort now gets a real answer instead of always `undefined`.

  fix(persistence): stop charging every adapter for sandbox-only run fields

  `runPersistenceConformance` required every backend to round-trip four fields that
  only durable sandboxed runs use: `sandboxKey`, `detachedSince`, `cancelRequested`
  and `driverEpoch`, including the rule that an omitted patch key means "leave the
  column" while an explicit `undefined` means "clear it". The case was deliberately
  non-skippable, so a Postgres adapter for a plain chat app failed conformance until it
  implemented four columns nothing in its stack would ever write.

  The assertions moved rather than disappeared. `runDurableRunFieldsConformance` now
  ships from `@tanstack/ai-sandbox/testkit`, beside the takeover and reaper suites that
  consume those fields, and takes the same `runs` store:

  ```ts
  import { runDurableRunFieldsConformance } from '@tanstack/ai-sandbox/testkit'
  import { persistence } from './persistence'

  runDurableRunFieldsConformance(
    'my postgres runs',
    () => persistence.stores.runs,
  )
  ```

  So a chat-only backend leaves those columns out of its schema and passes, and an app
  that wires `withSandbox(sandbox, { runs, durability })` proves them with one extra
  line. The fields were already optional on `RunRecord` and `listReclaimable` was
  already optional and feature-detected; the conformance suite was the only thing making
  them mandatory in practice.

  Docs follow the same split. The fields are explained where they are used, on
  `persistence/build-a-sandbox-adapter` ("The four run fields", with the failure each
  omission causes), and `persistence/store-reference` marks them sandbox-only and points
  there instead of teaching them inline. The chat walkthrough's `runs` example labels
  them SANDBOX ONLY, since a reader following it for a chat app should skip them.

  A sandboxed agent's output now survives the host that started it. The agent writes newline-delimited JSON to a **journal** file inside the sandbox instead of into a pipe the host holds, so the host can return, die, or be replaced without taking the agent down with it, and a bounded read of the already-stored event log lets a successor line its own output up against the prefix a previous host delivered.

  This entry covers the journal, the journal reader, and the alignment primitive — the substrate the rest of the durable-run surface is built on. Detach, takeover, out-of-band cancel, and the reaping sweep ship in the same release and are described in their own entries: `RunRecord.cancelRequested` is written by `requestRunCancel` (`@tanstack/ai`), `detachedSince` and `sandboxKey` are written by `withSandbox`'s detach branch (`@tanstack/ai-sandbox`), and `sandboxRunDriver`, `reapDetachedRuns`, and `pruneJournals` all ship from `@tanstack/ai-sandbox`'s root. What the pieces below give you on their own is: run an agent through a journal, read that journal back from byte 0, and replay a journal against a stored log without duplicating what is already there.

  ### `@tanstack/ai`: `StreamDurability.snapshot`

  `StreamDurability` gains a required `snapshot`:

  ```ts
  snapshot: () => Promise<Array<{ offset: TOffset; chunk: StreamChunk }>>
  ```

  Everything stored for the run at the moment of the call, in append order, then resolve. It never tails and never waits for more entries, it resolves to `[]` for a run with nothing stored rather than throwing, and it returns a fresh array whose pair objects do not reach the stored log. The result carries no lock, so the last returned offset is not a permanent tail.

  It exists because `read` is the only read the interface had, and `read` tails: it parks until the log is terminalized with `close()` or the caller aborts. A crashed producer never calls `close()`, so its log stays open forever and `for await (const entry of read('-1'))` over it never finishes. A producer resuming that run could not inspect the log at all. `snapshot` is the read that returns.

  **Breaking for a custom `StreamDurability`.** The interface is public and shipped in `0.42.0`, so an existing implementation stops compiling until it adds the method. The migration is one method: return your stored entries as `{ offset, chunk }` pairs in append order without waiting, and return `[]` for an unknown run.

  `memoryStream` implements it by peeking at its log map rather than creating one, so an unknown run resolves to `[]` and no empty never-completed log is left behind for the sweep to miss.

  ### `@tanstack/ai-durable-stream`: bounded snapshot over the existing protocol

  `durableStream` implements `snapshot` with no protocol change. The control frame already carried an `upToDate` field that the parser validated and `read` then ignored; `read` and `snapshot` now share one window-pulling loop whose only difference is whether `upToDate: true` ends it. A live `read` keeps long-polling past it, a `snapshot` returns there, which is what makes a snapshot bounded on a stream nobody ever closed.

  Two honest limits:
  - It is bounded by an internal ceiling of 1000 windows. A conforming backend reports `upToDate` within one or two windows; a backend that keeps handing out advancing windows without ever reporting it gets a `DurableStreamError` rather than a read that never returns.
  - It cannot return `[]` for a stream the backend never created. A snapshot must not create a stream as a side effect of reading, so an unknown stream surfaces whatever status the backend returns for it instead of an empty result. `memoryStream` is the implementation that satisfies the empty-run clause exactly.

  ### `@tanstack/ai-sandbox`: the journal

  The substance of the phase.

  **The journal.** An agent's NDJSON stdout is redirected to `/tmp/tanstack-runs/<runId>.ndjson` with its stderr in a `<runId>.err` sidecar and an `{"__exit":N}` sentinel appended when it exits. Because the host holds no handle on the agent's output, there is no pipe to `SIGPIPE`: a trigger can start the agent and return while the agent keeps writing.
  - `spawnNdjson` takes a new `journal?: { runId; dir?; attach?; pollIntervalMs? }`.
  - `startJournaledAgent(handle, command, options)` starts the agent and returns without waiting for it or reading its stdout. Stdin is still written directly to the process.
  - `readJournalNdjson(handle, options)` reads a journal from byte 0 as parsed NDJSON, stops at the sentinel, and throws for a non-zero exit code so a calling adapter's existing `catch` turns it into a `RUN_ERROR`, the same observable outcome the unjournaled path produces from a non-zero `wait()`. The sentinel is the exit code here; there is no process to `wait()` on.
  - `DEFAULT_JOURNAL_DIR`, `EXIT_SENTINEL_KEY`, `journalPaths`, `journaledCommand`, `journalFollowCommand`, `journalReadCommand`, `journalExistsCommand`, plus `decodeBase64Stream` and `toJournalLines` for byte-exact decoding and line splitting.

  **A `runId` must be unique per run.** The journal is append-only on purpose, because a takeover depends on the prefix a previous host delivered still being there, and `DEFAULT_JOURNAL_DIR` is a fixed absolute path that outlives any single sandbox, test, or process. A reused `runId` therefore does not start a fresh journal, it appends behind the previous run's sentinel, and a reader stops at the FIRST sentinel it sees: the new run appears to emit nothing, or to fail with the old run's exit code. This is deliberately not enforced, since refusing to append would break the append-only property the takeover relies on. **Durability therefore requires a caller-supplied `runId`**, and the harness adapters no longer paper over its absence: `resolveDurableRunId` throws `DurableRunIdRequiredError` when sandbox durability is wired and no `runId` was passed, and only falls back to a generated id on a non-durable run. A random fallback is not recomputable by any successor, so no successor could derive the journal path.

  **The reader.** `readJournal` and `journalReadStrategy(handle)` pick between two strategies. `follow` uses `tail -f` and requires both `backgroundProcesses` and `killableProcesses`; everything else falls back to a bounded poll, because a follower that cannot be stopped would leak an unstoppable process inside the sandbox. The follow path is streamed rather than buffered, and honors an `AbortSignal` itself instead of blocking on `stdout` until a best-effort kill closes the pipe.

  **Alignment.** `alignToStoredLog` replays a journal from byte 0, reads the stored prefix once and eagerly through `snapshot()`, suppresses the chunks the log already holds, and forwards the remainder with plain `append`. On a mismatch it throws `JournalReplayDivergedError(index, stored, replayed)` rather than forwarding chunks whose prefix and suffix disagree about message identity. It appends and never upserts by design: `memoryStream.upsert` rejects an offset it did not mint, and `durableStream` has no `upsert` at all because its offsets embed a backend-assigned cursor. Deriving the dedupe boundary from the log means there is no window in which a checkpoint and the log can disagree. Supporting pieces: `createRunScopedIdGen(runId)` (a counter with no clock and no randomness) and `chunkFingerprint` (every field except the wall-clock `timestamp`).

  **Journal lifetime.** Reaching the sentinel means the run is terminal and the event log is now the run's record, so both journal files are deleted before `readJournalNdjson` finishes. The ordering is load-bearing and asserted: the follower is stopped before its input is removed, and the stderr sidecar is read for the error message before the deletion that destroys it. A stream that ends without a sentinel deletes nothing, since the run may be mid-flight and a successor may still need every byte. This per-run cleanup covers only the runs a host watched to completion: a run that reaches its sentinel while detached has no reader, so nothing observes the sentinel. `pruneJournals` (see the `reapDetachedRuns` entry) is the sweep that bounds those, deleting a journal only once its run is provably terminal and keeping everything it cannot prove dead.

  **Conformance.** `runJournalConformance` and `JournalConformanceConfig`, reachable from `@tanstack/ai-sandbox/testkit`, so a provider can prove its journal behavior against the same suite the bundled providers run.

  #### Breaking: `SandboxCapabilities.killableProcesses`

  ```ts
  killableProcesses: boolean
  ```

  New and required. `true` when a spawned process can be terminated through `SpawnHandle.kill` and aborted mid-flight through the `signal` passed to `SandboxProcess.spawn`. A bring-your-own provider stops compiling until it declares one, which is the point: an omitted field would default to killable and leak an unstoppable follower into the sandbox. Migration is one line. Callers must branch on it before relying on `kill` or abort to reclaim a background process.

  Every bundled provider declares it. Cloudflare declares `false`, because its `kill()` is a no-op and Workers RPC cannot serialize an `AbortSignal`, so a `tail -f` started there can only be polled and abandoned.

  ### `@tanstack/ai-sandbox-local-process` and `@tanstack/ai-sandbox-docker`: UTF-8 decoding fix

  Separate from the journal work and older than it. Both decoded spawn stdout and stderr with a per-chunk `Buffer.toString('utf8')`, which corrupts any multi-byte UTF-8 character a Node stream happens to split across two `data` events: each half decodes independently into a replacement character. Both now use a streaming `TextDecoder` that retains a partial trailing sequence across calls and flushes once at end of stream, so a genuinely truncated sequence still surfaces as `U+FFFD` instead of being dropped. This is a correctness fix in its own right and applies to every consumer of these providers, journaled or not.

  ### `@tanstack/ai-claude-code`, `@tanstack/ai-codex`, `@tanstack/ai-grok-build`: deterministic ids on the journaled path

  All three now route agent stdout through the journal and mint message ids with `createRunScopedIdGen(runId)` instead of `generateId()`, so re-translating the same journal bytes produces the same chunk sequence. `generateId()` mixes in `Date.now()` and `Math.random()`, which makes "same bytes produce same chunks" false.

  **Visible behavior change: message id format.** Ids on the journaled path go from a provider-prefixed random id such as `grok-build-1785...-x7f2q` to `<runId>-0`, `<runId>-1`, and so on. Anything that parses a provider prefix out of a message id, or assumes ids are globally unique across runs rather than unique within one, is affected.

  The determinism guarantee is **translator-level**, not stream-level. On codex and claude-code the adapter wraps the translator in `mergeChunkStreams(translated, channel.stream)`, splicing host-tool-bridge custom events from live tool execution into the middle of the stream. Those events do not occur on a replay at all, and even on the original run their interleaving position is timing-dependent rather than derivable from the journal. A run that used bridged tools can therefore still diverge post-merge. Nothing in this phase closes that.

  One run is now described by one record. Chat persistence and the sandbox run driver both read and write the same `RunRecord`, so they can no longer disagree about the status of a given `runId`.
  - **`RunStatus`** (`'running' | 'interrupted' | 'completed' | 'failed' | 'aborted'`), **`TerminalRunStatus`** (`'completed' | 'failed' | 'aborted'`), **`RunRecord`**, **`RunError`**, **`RunStore`**, **`isTerminalRunStatus`**, **`defineRunStore`**, and **`InMemoryRunStore`** now live in `@tanstack/ai` (`packages/ai/src/activities/chat/middleware/run-store.ts`). A `RunStore` needs `createOrResume` / `update` / `get` / `findActiveRun`; `listByThread` and `listReclaimable` are optional.
  - `RunRecord.error` is a structured **`RunError`** (`{ message: string; code?: string }`) instead of a bare `string`. `RUN_ERROR` chunks carry a provider `code`, and the Cloudflare event log already populated one, so a bare message forced consumers to string-match provider prose to decide whether to retry or escalate.
  - `isTerminalRunStatus` is now a type predicate (`status is TerminalRunStatus`) over an exhaustiveness-checked map, so a caller inside the guard can pass the status where a `TerminalRunStatus` is required without a cast. Purely additive.
  - `defineRunStore` is now generic (`<const T extends RunStore>(store: T): T`), so an optional method the implementation actually provides stays known-present on the result instead of collapsing back to `| undefined` on the interface. Purely additive.
  - `AbortInfo` gains an optional `cancelRequested` field, and core populates it: `packages/ai/src/activities/chat/index.ts` sets it from the abort reason via `isCancelRequestedReason(reason)` — `true` for the `RUN_CANCEL_REASON` sentinel, `false` for any other abort. `stream-to-response.ts` relies on it to refuse treating an explicit cancel as a detach, so a user pressing Stop always gets a closed, terminal log. Middleware reading it to tell an explicit cancel from a plain disconnect gets a real answer.

  ### `StreamDurability`: single-argument `append`, upsert as a separate capability

  `StreamDurability.append` takes exactly one argument:

  ```ts
  append: (chunks: Array<StreamChunk>) => Promise<Array<TOffset>>
  ```

  Idempotent re-persistence of an already-stored range is a separate, optional method on a separate interface:

  ```ts
  export interface UpsertableStreamDurability<
    TOffset extends string = string,
  > extends StreamDurability<TOffset> {
    upsert: (
      entries: Array<{ chunk: StreamChunk; offset: TOffset }>,
    ) => Promise<Array<TOffset>>
  }
  ```

  Pairing every chunk with its offset structurally makes a length mismatch, a sparse hole, and an unpaired chunk unrepresentable. `memoryStream` returns `UpsertableStreamDurability` and validates the whole batch before mutating any stored state, rejecting a foreign-format offset, an offset minted for a different run, a duplicate within one batch, and a new offset claiming a position at or before the current tail. `durableStream` in `@tanstack/ai-durable-stream` returns a plain `StreamDurability` and deliberately does **not** implement `upsert`, because its offsets embed a backend-assigned cursor a caller cannot choose: a consumer that requires upsert now gets a compile error at the wiring site instead of a runtime throw, and the guard that used to raise `DurableStreamError` for caller-supplied offsets is gone.

  ### Breaking: `@tanstack/ai-persistence`
  - `RunStatus` widened to include `'aborted'` (previously `'running' | 'completed' | 'failed' | 'interrupted'`). The union appears in a read position (`get(): Promise<RunRecord | null>`), so an exhaustive `switch` over `record.status` with a `never` default in your code stops compiling until it handles `'aborted'`.
  - Run types are re-exported from `@tanstack/ai` rather than declared here, so the `runs` store is typed against core's `RunStore` directly. `MemoryRunStore` implements both optional list methods, and the shared conformance testkit covers them.
  - `runPersistenceConformance` accepts `skipMethods`. An optional method that is missing **and** not declared in `skipMethods` now throws instead of silently passing, so an existing backend running the suite may see a new failure telling it to implement the method or declare the omission.
  - `RunRecord.error` changing from `string` to `RunError` costs no migration today: this package is still unreleased at `0.0.0`.

  ### Breaking: `@tanstack/ai-sandbox`

  The package's own run-tracking types are gone in favor of the core ones:
  - `RunEventLog`, `InMemoryRunEventLog`, `RunEvent`, and `RunEventLogReadOptions` are removed. If you were reading sandbox run events for Cloudflare, the same event-log implementation now lives in `@tanstack/ai-sandbox-cloudflare/agent`.
  - `RunError` is removed along with the package's local `RunRecord`, `RunStatus`, `TerminalRunStatus`, and `isTerminalRunStatus`. Import these from `@tanstack/ai` instead.
  - `pipeToRunLog` and `RunController` no longer take an event log. They take `RunDeps: { runs: RunStore; durability: (runId: string) => StreamDurability<TOffset>; logger?: InternalLogger }` — `durability` is a **per-run factory**, not a single instance (see the durable-agent-runs-takeover entry for why a single instance was unsafe).
  - `RunController.attach` takes `(runId, fromOffset, signal?)`: the run being attached, an opaque `fromOffset: TOffset` (`string` by default) minted by `StreamDurability` instead of a numeric `fromSeq`, and an optional abort signal.
  - `threadId` is now a required field wherever a run is created or looked up.
  - Terminal status names changed to match the shared `TerminalRunStatus`: `done` is now `completed`, `error` is now `failed`, `aborted` stays `aborted`. The event log that moved to `@tanstack/ai-sandbox-cloudflare` converged on the same vocabulary, with a live-data migration for records persisted under the old one (see below).

  `pipeToRunLog` is now total: it never rejects. `RunDeps.logger` is an optional sink for the failures the driver absorbs (a failing `runs.update`, a failing `durability.close()`, a record that vanished before the terminal re-read), because a detached run has no caller left to receive an error. Every exit path still terminalizes, so a store or log failure no longer leaves a run wedged at `'running'` with live tailers parked on a log that never closes.

  ### Breaking: `@tanstack/ai-sandbox-cloudflare`

  New home of the run event log. `@tanstack/ai-sandbox-cloudflare/agent` now exports `InMemoryRunEventLog` alongside the existing `DurableObjectRunEventLog`, plus the `RunEventLog`, `RunEvent`, and `RunEventLogReadOptions` types.

  The log now speaks core's run vocabulary rather than a legacy one of its own:
  - Statuses are core's `'running' | 'completed' | 'failed' | 'aborted'` (`done` → `completed`, `error` → `failed`), and `isTerminalRunStatus` is core's helper. Import `RunStatus` / `TerminalRunStatus` / `RunRecord` / `RunError` from `@tanstack/ai`; the package no longer exports run vocabulary of its own.
  - The record is **`RunLogRecord`** (exported from `./agent`): core's `RunRecord` — required `threadId`, `startedAt`/`finishedAt`, structured `RunError` — plus the two fields only an event log needs, the `lastSeq` cursor and the `updatedAt` activity clock.
  - `RunEventLog.open` requires `threadId` (and accepts an optional `startedAt`), matching core's `RunRecord`. The interface also gains `update` (a `RunStore`-shaped patch of the record's mutable fields; implementations must wake blocked readers, because a driver that terminalizes through its `RunStore` is ending the log with that call) and `list` (every record the log holds).
  - **The package no longer ships a run driver.** Its `pipeToRunLog`/`RunController` copy is deleted; `SandboxCoordinator` now drives runs with core's `RunController` from `@tanstack/ai-sandbox`, bound to the Durable Object log by two adapters exported from `./agent`: `runLogStore(log)` exposes the log as core's `RunStore`, and `runLogStream(log, { runId })` exposes one run of it as core's `StreamDurability` — so `alignToStoredLog`, `replayRunStream`, and the rest of the portable durable-runs machinery compose with the DO log directly. The coordinator's WebSocket tail and `?lastSeq` wire protocol are unchanged.
  - **Live-data migration.** Records a Durable Object persisted under the old layout (`{ status: 'done' | 'error' | …; createdAt; updatedAt; threadId? }`) are migrated **in place, on first read**, and written back so each record pays the conversion once: `done` → `completed`, `error` → `failed`, `createdAt` → `startedAt`, a terminal record gains `finishedAt = updatedAt`, and a record stored without `threadId` gets `threadId = runId` (the log runs no thread-scoped queries, so the self-reference cannot leak into thread history). Event rows (`evt:`) are raw chunks and are untouched. `migrateStoredRunRecord` is exported from `./agent` for bring-your-own-backend logs that persisted the old layout.
  - **Wire-visible.** `GET /runs/:id` and the coordinator's WebSocket terminal `status` frame now carry the converged status strings and field names. A client branching on `record.status === 'done'` must branch on `'completed'` (and `'error'` → `'failed'`).

  Durable streaming runs now survive a client disconnect (page reload) and can be
  tailed to completion by a rejoining client — no route-side detachment code
  required. Two internal fixes to `toServerSentEventsResponse` /
  `toHttpResponse`, both additive with no public API change:
  - **`RUN_STARTED` is a durability flush boundary.** One-shot generation
    activities (image, speech, transcription, summarize) emit `RUN_STARTED`, then
    await the provider for seconds, then a terminal. Previously `RUN_STARTED` sat
    in the batch buffer, so the durable log was empty for the whole run and a
    mount-time `joinRun` fast-failed as "run gone". It now flushes immediately, so
    the run is resumable from the instant it starts.
  - **The producer is decoupled from the HTTP response when durability is on.**
    A client disconnect used to abort the producer and seal the log with
    `RUN_ERROR`, even though the run kept running and recorded success. Now, on a
    durable (persistence-on) run, a response cancel detaches and the producer
    keeps draining into the log to its real terminal, so a rejoining client tails
    it to completion. This supersedes the earlier "producers terminalize the log
    on cancellation" behavior **for durable runs only**:
    - **No durability (persistence off)** → unchanged: a disconnect aborts and
      stops the run.
    - **Durability present (persistence on)** → the run survives a disconnect.
    - A genuine caller stop — aborting an `abortController` you pass (e.g. wired to
      `request.signal`, as the resumable-streams demo does) — still terminalizes
      the run, so opt-in die-on-disconnect keeps working.

  `durableStream` now resolves the run id exactly the way core does, through
  `resolveResumeRunId` from `@tanstack/ai`: the `X-Run-Id` header first, then the
  `?runId` query param. It previously read `?runId` only.

  Two consequences of the old query-only resolution are fixed:
  - A `@tanstack/ai-client` POST keeps its URL byte-identical to a plain chat
    request and carries the run id in `X-Run-Id`, so a POST producer route wired
    to `durableStream` wrote to a random-UUID stream while the GET attach route
    addressed the real one — the producing and attaching routes never met.
  - A mid-stream reconnect re-POSTs with `Last-Event-ID` and no `?runId`, which
    tripped the resume guard and threw `resume offset requires a runId`.

  **Behavior change:** a request that names no run at all — neither header nor
  query — now throws instead of generating a run id. A generated id names a stream
  no attach request could ever address, so the producer appeared healthy while
  writing where nobody could read. This matches `DurableRunIdRequiredError` in
  `@tanstack/ai-sandbox`. Pass the run id in `X-Run-Id` (what the client adapters
  send) or `?runId`.

  Make a reload rejoin fast, robust, and repeatable.
  - **`memoryStream` first-chunk deadline now defaults to 100ms** (was 30s). The
    common from-start join is a reload rejoining a run whose producer ran in a
    prior request: an in-flight run's log already holds chunks (it streams
    immediately, the deadline never applies), and an empty log means the run is
    gone — so failing fast lets the client re-enable input near-instantly instead
    of holding a dead connection open. Raise `firstChunkDeadlineMs` for a backend
    whose producer can legitimately start well after a joiner attaches.
  - **`ChatClient` reload rejoin hardened:** it bounds the wait for the first
    chunk and clears a dead resume pointer (so a stale pointer can't pin the UI in
    a loading state and can't be retried on the next load); it drops the hydrated
    in-flight partial only when real content arrives (never on `RUN_STARTED`
    alone), so a rejoin that connects but delivers nothing can't leave an empty
    assistant bubble; and it no longer lets a replayed `RUN_STARTED` (which
    carries the provider run id) overwrite the persisted resume pointer with an id
    the durability log isn't keyed by — so a SECOND consecutive reload still
    re-attaches and continues.

  Server-authoritative reconnect is now automatic and keyed on the thread, not the run.

  A chat's durable identity is its **thread**; run ids are ephemeral (a single turn
  can span several runs via interrupts or tool continuations), so basing reconnect
  on a client-cached run id goes stale the moment a turn rolls to a new run. This
  moves the whole reconnect story onto the stable thread id, resolved by the server.
  - **`RunStore.findActiveRun(threadId)`** — required store
    method returning the most recent `'running'` run for a thread. Implemented by
    the in-memory reference backend and covered by the conformance testkit, so any
    adapter that provides it is held to the same invariants (most-recent-running
    wins, thread-scoped, null when idle).
  - **`reconstructChat` now returns `{ messages, activeRun, interrupts }`** (was a
    bare message array): the stored transcript as UI messages, a cursor to an
    in-flight run if one exists, and any pending human-in-the-loop interrupts (tool
    approvals / waits) plus the run they paused. It reads the active run before the
    transcript so observing "no active run" guarantees the transcript is final
    (closing a finish-window race).
  - **`@tanstack/ai-client` hydrates itself on mount.** In server-authoritative
    mode (`persistence: true`) the client caches no transcript and no run
    pointer: on mount `useChat`/`ChatClient` calls the connection's new
    `hydrate(threadId)` (a JSON GET against the same endpoint), paints the returned
    transcript, and — if a run is in flight — tails it via the existing `joinRun`
    durability replay. A reload and the same thread opened on another device are the
    identical, server-resolved path. No loader, no `initialMessages`, no
    `initialResumeSnapshot`, no app-side fetching required.
  - **Interrupts reconstruct from the server too.** A paused approval (a tool with
    `needsApproval`) is restored from `reconstructChat`'s `interrupts` exactly as a
    persisted resume snapshot would be, so a reload — or another device — re-prompts
    the same approve/reject decision and resumes the run it paused. Previously the
    pending interrupt was only recoverable from client storage, so a fresh client
    showed the paused tool call with no way to resolve it.

  Apps keep the single GET endpoint they already have (durability replay when a
  resume cursor is present, else `reconstructChat`); everything else is handled by
  the hook.

  Fix `generateVideo` dropping result transforms and run identity, which made a persisted video restore as nothing.

  Streaming video was the only media activity that never called `applyGenerationResultTransforms`, and never put the caller's `threadId` / `runId` on the middleware context. Because `withGenerationPersistence` registers BOTH its artifact capture and its run-record `result` write as result transforms — pushed onto an optional `ctx.resultTransforms` — both silently no-opped. A completed video therefore stored a run record with `status: 'complete'` and nothing else: no result metadata, no artifact refs, no stored bytes, and no thread link (the run was filed under the internal `requestId`). On reload the client found no output artifact and restored nothing.

  Streaming video now applies the transforms to its terminal result before yielding it, so the `generation:result` chunk and the stored run record carry the same URLs — including the durable app-origin URL that `artifactUrl` stamps. It also passes `threadId`, `runId`, and `artifactInputs` into the middleware context, matching `generateImage`.

  `threadId` is now a documented option on `generateVideo` (it previously had none — callers passing one via an object spread type-checked but were silently ignored). When omitted, an id is still minted for the `RUN_STARTED` / `RUN_FINISHED` wire chunks, but the middleware context gets `undefined` rather than the minted value: a fabricated thread id is a slot no client can hydrate by, which is worse than recording no link at all.

  Fix generation mount hydration to run in the commit phase, and restore TTS
  results.
  - The `GenerationClient` / `VideoGenerationClient` used to kick off mount
    hydration from their constructor. Framework hooks build the client inside
    `useMemo`, so that ran in React's render phase, and several clients mounting
    together re-fired the hydrate GET on every discarded/speculative render,
    flooding the connection pool (`ERR_INSUFFICIENT_RESOURCES`). Hydration now runs once from `mountDevtools`
    (the hooks' commit-phase mount effect), guarded by `serverHydrationStarted`.
    Note for direct
    (non-framework) `GenerationClient`/`VideoGenerationClient` users: mount
    hydration and the "missing `hydrateGeneration` handler" warning now fire from
    `mountDevtools()` rather than the constructor, so call `mountDevtools()` (as
    every framework hook does on mount) to trigger a server/storage restore;
    `generate()` still triggers it too.
  - New `reconstructSpeechResult` mapper, wired into the speech hook of **every**
    framework package — `useGenerateSpeech` (React, Solid, Vue),
    `createGenerateSpeech` (Svelte) and `injectGenerateSpeech` (Angular). A
    restored `TTSResult` carries no base64 bytes (they live in the blob store), so
    it surfaces the durable serve URL through `result.artifacts`; the speech clip
    now repaints after a reload instead of showing status only. Previously only
    React was wired, so a restored TTS run on the other four repainted
    `status`/`error` but left `result` null.

  Generation persistence is server-driven only. The hooks' `persistence` option is
  now a boolean.

  ```diff
  - useGenerateImage({ threadId, connection, persistence: localStoragePersistence() })
  + useGenerateImage({ threadId, connection, persistence: true })
  ```

  A generation is one job with one result, not a growing transcript, so a browser
  copy of its record bought nothing that the server record does not already
  provide, and cost a second source of truth to keep in step. Worse, the two modes
  restored differently: a client snapshot can never hold the generated bytes, so
  `result` came back `null` from storage but whole from the server. One mode
  removes that split.

  Gone from `@tanstack/ai-client`: the `GenerationPersistence` type and the storage
  read/write path in `GenerationClient` and `VideoGenerationClient`.
  `persistence: true` still requires a stable `threadId` at the type level, and
  still needs a `hydrateGeneration` handler (every built-in connection has one)
  plus a `reconstructGeneration` route.

  The `initialResumeSnapshot` option went with it: it seeded the storage mode that
  no longer exists, so the server hydration handler is the only way a run is
  restored.

  **None of this touches chat.** `useChat` keeps both modes, and
  `localStoragePersistence` / `sessionStoragePersistence` / `indexedDBPersistence`
  are still exported and still work for conversations.

  Add generation persistence, mirroring chat: media generation runs survive a reload or dropped connection, restoring transparently into the normal hook fields, with optional durable storage of the generated bytes.

  **Generation run store (server).** `withGenerationPersistence` records each run in a dedicated `generationRuns` (`GenerationRunStore`) store, keyed by the run's own `runId` (the same AG-UI run id the client sends), with `threadId` the run's scope — it no longer overloads the chat `RunStore`. The record holds the activity/provider/model, lifecycle status, result metadata, and (when byte storage is on) the durable artifact refs. `memoryPersistence()` ships an in-memory `generationRuns` store, and `defineGenerationRunStore` / `defineArtifactStore` / `defineBlobStore` type a custom store inline the way `defineMessageStore` / `defineRunStore` already do.

  **Server-side load (`reconstructGeneration`).** A new `reconstructGeneration(persistence, request, options?)` server helper — the generation parallel of `reconstructChat` — reads a `?runId=` (or `?threadId=`) from the request, authorizes it via an `authorize` callback, and returns `{ resumeSnapshot, activeRun }` JSON so a server-authoritative client restores the last run on mount. Requires the `generationRuns` store. `authorize` is optional at the type level for single-user and prototype routes, but any multi-user deployment must pass it: the run and thread ids arrive from the caller, so identity has to be derived from server-side session state and ownership checked before the helper reads persistence. The same applies to a route that serves artifact bytes by id.

  **Media byte storage (server).** When the backend also provides both an `artifacts` (`ArtifactStore`) and a `blobs` (`BlobStore`) store, `withGenerationPersistence` writes each generated file's bytes to the blob store (key `artifacts/<runId>/<artifactId>`), records an `ArtifactRecord`, and attaches `PersistedArtifactRef`s to the result and the run record. A new `artifactUrl` option stamps a durable app-origin serve URL onto each ref (a new `PersistedArtifactRef.url`) and rewrites the live result's media URL to it, so live and restored results both render media from your own origin instead of the provider's expiring link. Extraction is customizable via `extractArtifacts` / `nameArtifact`; `retrieveArtifact` / `retrieveBlob` (which resolve the key through `resolveArtifactBlobKey`) serve the bytes back. Prompt media referenced by **URL** is not downloaded: the URL is caller-supplied, so fetching it server-side would be an SSRF vector, and the bytes are redundant. Opt in per-app with `allowInputUrl` (a predicate, so the check can't be skipped). Every artifact fetch is limited to `http:`/`https:`, timed out (`artifactFetchTimeoutMs`, default 30s) and size-capped (`maxArtifactBytes`, default 100 MiB); input fetches additionally block loopback/private/link-local hosts and refuse redirects. `artifactFetch` injects the `fetch` used, for routing downloads through an egress-restricted proxy. `memoryPersistence()` ships in-memory `artifacts`/`blobs` stores; the generation activities gained `threadId` / `runId` options. `@tanstack/ai-utils` adds `base64ToUint8Array`.

  **Client (transparent restore).** Generation hooks (`useGenerateImage`, `useGenerateVideo`, `useGenerateAudio`, `useGenerateSpeech`, `useGeneration`, `useSummarize`, `useTranscription`, and their Solid/Vue/Svelte/Angular equivalents) take a `persistence` option, and it is boolean — server-driven only, with no client-storage adapter arm: `true` hydrates the last run for a stable `threadId` on mount, and the browser caches nothing. Restore is **invisible**: it repaints the normal `result` / `status` / `error` fields as if the run had just finished, and reports the in-flight run's id as `runId` — there is no `resumeSnapshot` / `resumeState` / `pendingArtifacts` / `resultArtifacts` hook field. If a run is still generating when the connection drops or the page reloads, the client re-attaches to it and finishes it in place (via the connection's `joinRun` durability replay), exactly like `useChat`. With byte storage configured, a restored `result` is rebuilt whole, its media resolved to the durable serve URL and its refs on `result.artifacts`; without it, `status` / `error` restore and `result` stays null. The snapshot never holds the generated bytes and never restarts provider work — generation still only begins on `generate(...)`.

  **`threadId` is required whenever `persistence` is set**, enforced at the type level. It is the generation's _scope_ — a stable, app-chosen name for the slot successive runs fill (`product-123-hero`, `video-9-start-frame`) — not a link to a chat conversation, so a workflow generating media outside any conversation names it just as naturally. It stays optional for ephemeral generations, so existing call sites that do not opt into persistence are unaffected. Persistence keys on `threadId` and nothing else; the legacy `id` is deprecated and typed `never` whenever `threadId` is supplied — pass one scope, not two. Previously the key fell back to `id` and then to a generated id, which silently wrote a different slot on every reload — restoring nothing while orphaning the last record.

  **Choose where bytes land.** `withGenerationPersistence`'s new `storageKey` option maps each artifact to its blob-store key, so generated media can live in your own folder structure instead of the default `artifacts/<runId>/<artifactId>`. Server-side only — a browser-supplied key would be a path-traversal and cross-tenant-write vector. The resolved key is recorded on the new `ArtifactRecord.blobKey` (it is no longer derivable once arbitrary) and reads resolve through `resolveArtifactBlobKey`; records written before the field existed fall back to the default convention, so it is a non-breaking addition.

  `findLatestForThread` is a **required** method on `GenerationRunStore` — a `?threadId=` lookup is the whole mount-time hydration path, so a store that cannot answer it cannot back generation persistence. TypeScript rejects a store that omits it; a JavaScript adapter that ships without it fails at the call, not silently.

  Snapshots arriving from the server are validated before anything is repainted, so a stale or malformed record cannot paint a bogus result.

  A generation mount-time rejoin that can't finish now settles to `error` instead
  of hanging on `generating`.
  - `recordResumeSnapshotError` surfaces `error` on the observable `status` even
    when a streamed `RUN_ERROR` already flipped the resume snapshot to `error`
    (via `observeResumeSnapshot`). Previously its early-return skipped
    `setStatus`, so a rejoin whose delivery log had aged out (or whose route
    couldn't serve the join) left the hook stuck on `generating` forever. Guarded
    so the live `generate()` path doesn't double-emit `error`.
  - `GenerationClient` / `VideoGenerationClient` `dispose()` no longer calls
    `stop()`: a teardown (unmount / React StrictMode dispose) must not mark the
    run non-resumable and wipe the `running` snapshot the way a user-driven
    `stop()` intentionally does — that destroyed the resume state so a remount
    could never rejoin. It now aborts only the in-flight delivery, keeps
    the snapshot resumable, and re-arms mount hydration so a remount rejoins.

  `GenerationRunStatus` now uses the same vocabulary as chat's `RunStatus`.

  ```diff
  - type GenerationRunStatus = 'running' | 'complete' | 'error' | 'interrupted'
  + type GenerationRunStatus = RunStatus // 'running' | 'completed' | 'failed' | 'interrupted'
  ```

  The two enums described the same four lifecycle states under different names,
  `complete` against `completed` and `error` against `failed`, for no reason
  either one could point at. An adapter storing both kinds of run had to keep two
  status vocabularies straight, and a shared `status` column needed two sets of
  checks. They are now one type, so one column and one check constraint cover both
  tables.

  If you wrote a `GenerationRunStore` against the old names, update the two
  literals your store maps or validates. `running` and `interrupted` are
  unchanged. The conformance suite round-trips both new literals — it writes
  `completed` and then `failed` through `update` and reads each back through
  `get` — so re-running it against your adapter will catch anything missed.

  The client-facing resume-snapshot status is **unchanged**
  (`idle | running | complete | error`). It is a separate vocabulary with its own
  `idle` state, mapped from the store status by `reconstructGeneration`, exactly
  as chat maps `RunStatus` to `ChatClientState`. Nothing on the wire moves.

  Also corrected: `GenerationRunRecord.threadId` was documented as an "optional
  link to the chat conversation that triggered this generation", and typed
  optional to match. It is the slot the run fills, the stable app-chosen key
  `findLatestForThread` hydrates by, and `withGenerationPersistence` refuses to
  start a run without one — so the field is now **required**. A record written
  without a scope could never be found again, which is not a shape worth keeping
  representable.

  `GenerationRunRecord.threadId` is now required.

  ```diff
    interface GenerationRunRecord {
      runId: string
  -   threadId?: string
  +   threadId: string
      …
    }
  ```

  `GenerationRunStore.createOrResume` requires it on its input, and the
  `resumeState` cursor on the hydration payload (`ReconstructedGeneration`,
  `GenerationHydrationResult`) narrows from `{ threadId?: string; runId: string }`
  to `{ threadId: string; runId: string }`.

  **Why.** The optional field described a record no code path could produce and no
  client would accept. `withGenerationPersistence` already refused to start a run
  without a scope, so every record the library writes has one.
  `findLatestForThread` — the only query that hydrates a generation — keys on it,
  so a record without one could be written and then never read back. And the
  client discarded any snapshot that arrived without one.

  That last disagreement was a silent failure: the server legitimately omitted
  `threadId` for a record that had none, and the client's snapshot validation
  responded by dropping the **entire** snapshot (status, result and error along
  with the cursor), leaving a blank idle panel with no diagnostic while the
  provider kept billing. Making the field required removes the disagreement by
  construction rather than patching one side of it.

  **Migration.** If you wrote a `GenerationRunStore`, make the column non-nullable
  and stop defaulting the field to `null`/`undefined`. The conformance suite now
  asserts `threadId` round-trips exactly and is not mutated by an idempotent
  `createOrResume`, so re-running it against your adapter will catch anything
  missed. Records already stored without a `threadId` were unreachable by
  `findLatestForThread`, so there is nothing to backfill for hydration to work —
  delete them or assign them a scope.

  `withGenerationPersistence` reads `threadId` from the activity instead of
  requiring it twice.

  ```diff
  - generateImage({ threadId, middleware: [withGenerationPersistence(p, { threadId })] })
  + generateImage({ threadId, middleware: [withGenerationPersistence(p)] })
  ```

  **The bug underneath (`@tanstack/ai`).** Four streaming activities spread the
  resolved wire identity over their own options:

  ```diff
  - (resolved) => runGenerateImage({ ...options, ...resolved })
  + (resolved) => runGenerateImage({ ...options, runId: resolved.runId })
  ```

  `streamGenerationResult` mints a thread id for the `RUN_*` chunks when the caller
  passes none, so that spread overwrote the caller's `threadId` with an id known to
  nobody. `generateImage`, `generateAudio`, `generateSpeech`, and
  `generateTranscription` were all affected; `generateVideo` already did this
  correctly. Any middleware reading `ctx.threadId` on those four saw a fabricated
  value it could not tell apart from a real one, which is why persistence ignored
  the context and demanded the option.

  **The option (`@tanstack/ai-persistence`).** `WithGenerationPersistenceOptions.threadId`
  is now optional, and an override rather than the only source. The scope resolves
  to `opts.threadId ?? ctx.threadId`, and a run with neither throws a named error
  at `onStart` instead of being filed somewhere nothing can hydrate it from. Code
  that passes `threadId` to both keeps working unchanged.

  The redundancy was also a trap: passing different values to the activity and the
  middleware silently split one slot in two, with the wire using one id and the
  record filed under the other.

  `InjectChatOptions` no longer exposes `onResumeStateChange`.

  `injectChat` surfaces the run identity as the `runId` signal and pending
  interrupts through `interrupts` / `pendingInterrupts` / `onInterruptStateChange`,
  exactly like React / Solid / Vue / Svelte / Preact — but Angular's omit list was
  missing the key, so `onResumeStateChange` leaked as a public option and
  `injectChat` forwarded to it. Both the key and the forwarding are gone; a caller
  passing it now gets a type error instead of depending on an option no other
  framework offers.

  **Breaking:** the hooks expose `runId` instead of `resumeState`.

  ```diff
  - const { resumeState } = useChat({ threadId, connection })
  - const liveRunId = resumeState?.runId ?? null
  + const { runId } = useChat({ threadId, connection })
  ```

  Every chat hook (`useChat` / `createChat` / `injectChat`) and every generation
  hook (`useGenerateImage`, `useGenerateVideo`, `useGenerateAudio`,
  `useGenerateSpeech`, `useGeneration`, `useSummarize`, `useTranscription` and the
  Solid / Vue / Svelte / Angular equivalents) now returns `runId: string | null` —
  the id of the run streaming right now, or `null` when nothing is in flight.

  `resumeState` was a `{ threadId, runId }` pair whose `threadId` half was always
  the id the caller had just passed in, so the only new information it carried was
  the run id, wrapped in an object that had to be unwrapped and null-checked.
  `runId` is the thing callers actually reach for: the handle you send to your own
  endpoint to cancel or poll a provider job, since `stop()` only aborts the local
  stream and does not stop work already running on the provider.

  On chat it also reports **more** than `resumeState` did. `resumeState` only ever
  held a run that was interrupted or being rejoined, so it stayed `null` through an
  ordinary streaming turn. `runId` tracks every run: it is set when any run starts
  (including a rejoin) and cleared when it settles, backed by the new
  `ChatClient.getCurrentRunId()`.

  `injectChat` (Angular) exposed no equivalent field before and now returns `runId`
  alongside the other frameworks.

  `ChatResumeState` remains exported, since `resumeInterruptsUnsafe` still takes
  one. It is simply no longer part of a hook's return shape.

  New docs page: [Id map](https://tanstack.com/ai/latest/docs/persistence/id-map)
  covers what each id means on chat versus generation, how to choose a `threadId`,
  and when to read `runId`.

  Correct the `persistence` / `threadId` JSDoc on every generation hook.

  `persistence` is now `boolean`, but the tooltip still described a third value —
  "a storage adapter: client-driven — the lightweight snapshot is cached under
  `generation:<threadId>`" — left over from the deleted client-side persistence
  surface, and `threadId` still claimed persistence keys on it "in **both**
  modes". IDE tooltips on a public option were telling users to pass something
  the types reject. Both now describe the server-driven-only behaviour, and
  `threadId` documents that the persisted record requires it (as does
  `withGenerationPersistence` on the server).

  Make interrupt ownership explicit rather than assumed.

  An AG-UI `Interrupt` is a shared envelope — a workflow engine's durable
  approval or another agent framework's pause can arrive on the same stream. What
  makes a pause resumable through `chat()` is the binding this package attaches
  under `tanstack:interruptBinding`.
  - Interrupts that carry no binding this client understands now surface as
    `kind: 'unbound'` with `canResolve: false`, instead of being given a
    synthesized binding and rendered as resolvable generic interrupts. Resolving
    those produced an answer submitted against a run with nothing pending, which
    failed as `unknown-interrupt` only after the user had filled in the form.
    Unbound items never block submission of the interrupts that are yours.
  - The binding carries a wire version (`INTERRUPT_BINDING_VERSION`). Readers
    reject a version they don't recognise rather than duck-typing its fields. A
    binding written before the field existed is still read.
  - `INTERRUPT_BINDING_METADATA_KEY`, `withInterruptBinding()` and
    `readInterruptBinding()` are exported, so anything producing an interrupt this
    package must later resume attaches the binding through a supported API
    instead of copying the metadata key.
  - Interrupt classification is driven by the binding alone. `Interrupt.reason` is
    free-form AG-UI text another producer can also use, so it is now a display
    hint only and never decides ownership.
  - The interrupt protocol surface is enumerated instead of `export *`. The
    unimplemented durable-recovery contract (`InterruptRecoveryStateV1`,
    `InterruptRecoveryQuery`, the never-called `loadInterruptState` adapter hook,
    and the `persistence-required` / `atomic-commit-unsupported` /
    `recovery-unavailable` error codes) is removed rather than published.

  Interrupts: the application owns wire-schema validation, and the hashing
  dependency is gone.

  The library no longer transforms a generic interrupt's wire JSON Schema into a
  validator or validates the resolved value against it, on either the client or
  the server. Whatever you pass to `resolveInterrupt` (client) or send in the
  `resume` batch (server) flows through as-is. Validate it yourself if you need to
  trust it, e.g. with `z.fromJSONSchema(interrupt.responseSchema).safeParse(value)`
  on the client and your own check on the server. Validation of a tool's
  code-authored Standard Schema (`approvalSchema` / `inputSchema`) is unchanged.

  This drops the `ajv` and `ajv-formats` dependencies. Interrupt binding hashes and
  resolution fingerprints now use a small bundled SHA-256 instead of
  `@noble/hashes`, so that dependency is gone too. The wire hash shape
  (`sha256:<hex>`) is unchanged.

  `localProcessSandbox` no longer leaks a process per killed command on Windows.

  `killTree` ran `taskkill /PID <sh> /T /F` and returned as soon as `spawnSync`
  reported no `error` — treating "I successfully asked" as "it died". Two things
  were wrong with that, and the second is the one that actually leaked.

  **It never checked taskkill's exit status.** A launched taskkill is not a
  successful taskkill. A genuine refusal (access denied, a protected process) was
  indistinguishable from a kill that worked.

  **`taskkill /T` cannot reach the process anyway.** Commands run through a
  git-bash `sh`, and MSYS's fork emulation runs the final command of a statement
  list — such as the `tail -f` behind a journal follow read — under an intermediate
  shell that immediately exits. Windows never reparents, so the surviving
  `tail.exe` points at a dead parent, and `taskkill /T` walks only live parent
  links. It misses the process **and still exits `0`**, which is why checking the
  exit status alone would not have caught this either. Measured on Windows 11: the
  journal conformance suite leaked 2 processes per run and the takeover suite 4,
  accumulating for the life of the machine. Streaming was unaffected (the reader
  honors its own `AbortSignal` rather than waiting for the kill), so it failed
  silently and cumulatively and no test ever went red.

  `killTree` now resolves the tree through MSYS's own process table — which does
  keep the logical parentage — **before** killing, since the taskkill destroys the
  only link back to our shell, then verifies each descendant is gone and kills the
  survivors directly. Both suites now leak 0. A process that had already exited on
  its own is recognized as success, not retried and not reported.

  Teardown remains total by construction: nothing here throws, because a throwing
  kill would strand a run mid-flight with its readers parked. That makes an
  unkillable process otherwise invisible, so `localProcessSandbox` accepts a
  `logger`:

  ```ts
  const dev = localProcessSandbox({
    logger: { warn: (message, meta) => console.warn(message, meta) },
  })
  ```

  Any object with a `warn(message, meta?)` method satisfies the new
  `LocalProcessLogger`, including the `InternalLogger` an adapter already holds.

  Nothing changes on POSIX, where `sh` really is the command's parent and
  signalling the wrapper suffices.

  Move multi-instance **locks** to `@tanstack/ai` under a dedicated `@tanstack/ai/locks` subpath, and nest persistence agent skills like `ai-core`.
  - **`LockStore` / `InMemoryLockStore` / `LocksCapability` / `getLocks` / `provideLocks` / `withLocks`** live in `@tanstack/ai/locks` (not the main `@tanstack/ai` barrel, and not `@tanstack/ai-persistence`).
  - `@tanstack/ai-sandbox` consumes the core `LocksCapability` token (no local lock re-export).
  - The locks agent skill moves with the code: `ai-core/locks` in `@tanstack/ai`, not `ai-persistence/locks`.
  - Agent skills under `@tanstack/ai-persistence` nest as `skills/ai-persistence/{stores,server,build-*-adapter}/`.
  - Docs: locks guide under advanced middleware.

  Rework tool-call fan-out budgets as middleware hooks (unreleased [#965](https://github.com/TanStack/ai/issues/965) API).
  - **Remove** (never released): `maxToolCalls()` strategy and `chat({ maxToolCallsPerTurn })`
  - **Add** `onShouldContinue` middleware hook so policies can stop further agent turns without aborting
  - **Keep** `AgentLoopState.toolCallCount` / `lastTurnToolCallCount` for strategies and middleware
  - Tool-call budgets are an **app-owned middleware recipe** (docs), not a built-in export

  ```ts
  import { chat, maxIterations, type ChatMiddleware } from '@tanstack/ai'

  function toolCallBudget({
    max,
    maxPerTurn,
  }: {
    max?: number
    maxPerTurn?: number
  }): ChatMiddleware {
    let perTurn = 0
    return {
      onIteration: () => {
        perTurn = 0
      },
      onToolPhaseComplete: () => {
        perTurn = 0
      },
      onBeforeToolCall: () => {
        if (maxPerTurn == null) return
        if (++perTurn > maxPerTurn) {
          return {
            type: 'skip',
            result: {
              error: `Skipped: exceeded maxToolCallsPerTurn (${maxPerTurn})`,
            },
          }
        }
      },
      onShouldContinue: (_ctx, state) =>
        max != null && state.toolCallCount >= max ? false : undefined,
    }
  }

  chat({
    adapter,
    messages,
    tools,
    agentLoopStrategy: maxIterations(20),
    middleware: [toolCallBudget({ maxPerTurn: 10, max: 20 })],
  })
  ```

  **Add server-side memory via a `recall`/`save` adapter contract in `@tanstack/ai-memory`.**

  Memory is now a single, provider-agnostic contract with two verbs — `recall` and
  `save` — which is the shape every memory backend (in-process, Redis, and hosted
  vendors) naturally exposes. `memoryMiddleware` recalls relevant memory into the
  system prompt (and optionally injects vendor tools) before the model runs, then
  defers `save` of the finished turn via `ctx.defer` so streaming is never blocked.
  Extraction, ranking, and rendering live inside each adapter — the middleware is thin.

  `@tanstack/ai-memory` (new package) — everything ships here:
  - Root: `memoryMiddleware`, the `MemoryAdapter` contract
    (`recall` / `save` / optional `inspect` / `listFacts`), and the `MemoryScope` /
    `MemoryTurn` / `RecallResult` / `SaveReceipt` types.
  - `@tanstack/ai-memory/in-memory` → `inMemory()` — zero-dependency adapter for dev,
    tests, and single-process demos. Pass an `embedder` for semantic scoring and/or an
    `extract` function to persist derived facts.
  - `@tanstack/ai-memory/redis` → `redis({ redis, prefix? })` — production adapter for
    plain Redis. `ioredis` wires in directly; `redis` (node-redis v4+) via the
    `fromNodeRedis(client)` wrapper. Both are optional peer dependencies.
  - `@tanstack/ai-memory/hindsight` → `hindsight()`, `@tanstack/ai-memory/mem0` →
    `mem0()`, `@tanstack/ai-memory/honcho` → `honcho()` — hosted-vendor adapters. Their
    SDKs (`@vectorize-io/hindsight-client`, `@honcho-ai/sdk`) are optional peers loaded
    lazily; mem0 talks to its server over plain HTTP (no SDK). Vendors can expose LLM
    tools through `recall` (e.g. hindsight's retain/recall/reflect).
  - A shared `recall`/`save` contract-test suite (`@tanstack/ai-memory/tests/contract`)
    that any adapter — including third-party ones — can run.

  `@tanstack/ai`:
  - **Removes the (unreleased) `@tanstack/ai/memory` subpath.** The middleware,
    contract, and helpers all moved to `@tanstack/ai-memory`.

  `@tanstack/ai-event-client`:
  - The five `memory:*` devtools events (`memory:retrieve:started` / `:completed`,
    `memory:persist:started` / `:completed`, `memory:error`) now carry recall/save
    payloads (adapter id, fragment/receipt counts, `phase: 'recall' | 'save'`).

  **Align `MemoryScope` to the shared `Scope` type (`threadId`).**

  `MemoryScope` is now an alias of `Scope` from `@tanstack/ai` so memory and
  persistence share one isolation vocabulary. The conversation key is
  `threadId` (required); optional dims are `userId`, `tenantId`, and reserved
  `namespace`. There is no public `sessionId` on memory scope — hard cut while
  `@tanstack/ai-memory` is still `0.x` / unreleased.
  - `@tanstack/ai-memory` — `export type MemoryScope = Scope`. Built-in adapters
    (`inMemory`, `redis`) and middleware use `threadId`; `sameScope` also matches
    `tenantId` when present on the query. Redis index keys are now
    `{prefix}:index:{tenantId|_}:{userId|_}:{threadId}` (escaped). Hindsight banks
    use `{user}__{threadId}`. Anyone who wrote Redis rows under the pre-rename
    layout needs to reindex or wipe — keys are not dual-read.
  - `@tanstack/ai-event-client` — `MemoryScopeLite` is
    `{ threadId?, userId?, tenantId? }` (devtools telemetry; not an isolation
    authority).
  - `@tanstack/ai-client` / `@tanstack/ai-devtools-core` — memory event payloads
    and the Memory panel registry follow the same `threadId` field names.

  Fix `memoryStream` truncating a tool-calling (agent-loop) run at its first tool
  call.

  An agent-loop run emits one `RUN_STARTED`/`RUN_FINISHED` pair per iteration
  (`finishReason: "tool_calls"` for a turn that calls a tool, then `"stop"` for the
  final answer). `memoryStream` treated the _first_ terminal chunk as the end of
  the log — both marking the log complete on append and ending the reader on read —
  so a run that called a tool was delivered only up to that first `RUN_FINISHED`:
  the tool result and everything after (the model's actual answer) never reached
  the client, leaving the tool call stuck "running" and the reply missing, on the
  initial stream and on any reconnect/reload.

  Completion is now driven solely by the producer calling `close()` (which it does
  on every exit — the documented `StreamDurability.close` contract, honored by
  `toServerSentEventsResponse`/`resumeServerSentEventsResponse` and detached
  producers). The reader tails across per-iteration terminals and ends when the
  producer closes, so a tool-calling run is delivered in full — live, on rejoin,
  and on a server-authoritative reload.

  A throwing middleware terminal hook no longer cancels every other middleware's teardown.

  `onFinish`, `onAbort`, and `onError` were fanned out in an unguarded `for` loop, so the first hook to throw skipped every middleware ordered after it. These are the hooks that release per-middleware resources — `withSandbox`'s `onAbort` detaches or destroys the sandbox and stamps `detachedSince`; `withPersistence`'s `onAbort` records the run's status through the store — so one transient store error leaked a sandbox permanently, for every middleware behind it in the chain. `runOnAbort` is additionally awaited from `chat()`'s `finally`, where a throw also replaced the original abort reason with the hook's error.

  All three fan-outs now give **every** middleware its turn: a throw is captured, logged on the `errors` channel (never invisible), and the loop continues. Instrumentation only reports the hooks that actually completed.

  **Isolation does not mean silence, and the three hooks differ in who reports:**
  - **`onFinish` reports.** It is the only terminal fan-out on the success path, and it is where `withPersistence`'s `onFinish` saves the assistant turn. The collected failures are therefore rethrown **after** the loop: a single failure as-is (so the store's own message, `cause` and `code` reach the caller and the wire), several as an `AggregateError`. Previously they were swallowed, and a failed `messages.append` left a `completed` run record for a turn that never reached storage with a middleware log line as the only trace anywhere.

    This fan-out is awaited **after** the run's `RUN_FINISHED` has already been streamed, so the rethrow can only append to what the consumer saw, never retract it — and what it achieves differs per transport:
    - **Without durability**, the throw escapes mid-response and the SSE / HTTP-stream encoder emits a **trailing `RUN_ERROR`** carrying the store's own message and `code`. `ai-client` surfaces that as an error status, so the user is no longer told the turn was saved when it was not.
    - **With durability**, the throw reaches the **durability sink**, which records it server-side and leaves the already-forwarded `RUN_FINISHED` standing rather than appending a contradictory second terminal. That is intended: the _save_ failed, not the run — the client did receive the complete stream. The improvement is that the sink observes the failure at all; before, it never did.

  - **`onAbort` and `onError` swallow, after logging.** Both run once the outcome is already decided and already being reported — the abort reason, or the run's real error, which `chat()` rethrows the moment the fan-out returns. A propagated hook throw there could only _displace_ that outcome with a teardown artifact, so it stops at the log.

  **`onChunk` and `onConfig` are deliberately NOT guarded.** They are transform hooks in the middle of the data path: swallowing a throw there would forward a chunk or a config the middleware had decided to reject, silently producing wrong output rather than a failed run. A throw from either still fails the stream, which is the correct behavior — so a middleware doing anything fallible inside `onChunk` or `onConfig` still has to handle its own errors.

  feat(ai-client): only the chat on screen holds a stream — `attach()` / `detach()`

  **Behavior change for direct `ChatClient` users.** Tailing no longer starts in the
  constructor. If you construct `ChatClient` yourself, call `client.attach()` when your
  view appears and `client.detach()` when it goes. Every framework package in this repo
  does it for you, so `useChat` (React, Vue, Solid, Svelte, Preact) and `injectChat`
  (Angular) users need no change.

  Why it had to move out of the constructor: a UI framework may build a client and then
  throw it away — React does on a double-invoked render. A discarded client is never
  mounted, so nothing ever calls `detach()` or `dispose()` on it, and a connection its
  constructor had opened could never be closed. Traced with CDP: connection ids
  1374/1396/1428/1437 were still held after eight thread switches, and a later request
  waited 210 SECONDS for a free slot (`stallMs: 210752`). No guard inside the client can
  fix that, because every guard runs on the instance the framework KEPT — the leak is in
  the instance it discarded. Only "idle until a view attaches" makes a thrown-away
  client harmless.

  A page can own many chats. Forty sandbox runs, or forty conversations, is a normal
  shape for this SDK. A browser allows only about six connections per origin, and
  each tailed run holds one for as long as the run lasts. So a handful of views is
  enough to consume every slot, and then every other request QUEUES: measured in the
  sandbox example, a fetch issued from the page took **93 seconds**, while the exact
  same request from outside the browser took **17 milliseconds**. The visible effects
  were a message vanishing from the transcript, no UI updates until a run finished,
  and a page reload that took 40 seconds.

  Tailing used to begin only in the `ChatClient` constructor, so a view could never
  stop tailing and later resume — unmount had to either keep the connection open or
  lose the run for good. Keeping it open is what starved the page.

  `ChatClient` now has a lifecycle pair:
  - **`attach()`** — start tailing (rejoin an in-flight run, hydrate if
    server-authoritative). Idempotent, so a wrapper's mount after construction is free.
  - **`detach()`** — drop the connection and keep everything else: transcript, resume
    pointer and run id all survive, so re-entering the view repaints instantly and
    re-tails from the durable log.

  `detach()` is deliberately neither `stop()` (which means the user ended the run) nor
  `dispose()` (which means the client is finished). It says only that nobody is
  watching right now.

  **Costs nothing for a chat that is not persisted.** Both actions in `attach()` are
  gated: the rejoin needs a persisted run pointer, and the hydration needs
  server-authoritative mode. An ephemeral chat issues no request when its view mounts
  or re-mounts.

  The React, Preact and Svelte wrappers now release the connection the moment their
  view unmounts. They previously deferred teardown through a timer that a re-mount
  could cancel — correct for disposal, useless for a connection. Svelte had no
  automatic cleanup at all and required the app to call `stop()` by hand.

  Solid, Vue and Angular already dropped the connection immediately on unmount; they
  now also `attach()` on mount, because the constructor no longer does. The generation
  and video hooks already revived on mount through `mountDevtools()` and disposed
  immediately on unmount, so those are unchanged.

  Also fixed: a hydration request that resolved AFTER its view was disposed went on to
  open a tail on a dead client, which nothing could ever abort — one leaked connection
  per thread switch.

  Drop `temperature` / `top_p` for OpenAI reasoning models so they don't 400.

  The o-series and the GPT-5 reasoning family reject `temperature`/`top_p`
  (`400 Unsupported parameter`), but a caller — or the summarize adapter's
  low-temperature default — has no way to know a given model does. The OpenAI text
  adapter now strips both for reasoning models (matched by
  `openAIModelRejectsSamplingParams`, which covers `o*` and non-`*-chat-latest`
  `gpt-5*` plus `codex-mini-latest`). Stripping only ever averts a guaranteed 400,
  so it never changes an otherwise-valid request. This fixes `summarize` (and chat)
  on `gpt-5.5` and other reasoning models.

  Add server-side persistence for `chat()`: durable thread messages, run records, and interrupts.

  `withPersistence(persistence)` is a chat middleware that stores the conversation transcript, tracks each run's status, and records interrupt state so a paused run (tool approval, client-tool execution, generic interrupt) survives a server restart.

  `@tanstack/ai-persistence` ships the **contract**, not a backend for your database:
  - The four store interfaces — `MessageStore`, `RunStore`, `InterruptStore`, `MetadataStore` — with the invariants the middleware depends on (full-replace `saveThread`, idempotent `createOrResume`, insert-if-absent interrupt `create`, `requestedAt`-ascending listings).
  - The `withPersistence` / `withGenerationPersistence` middleware, plus `composePersistence` to assemble stores that live in different systems.
  - `memoryPersistence()`, an in-process reference backend for dev and tests.
  - `LockStore` / `withLocks` / `InMemoryLockStore` for cross-worker coordination — deliberately **not** a state store, and not composable through `composePersistence`.
  - A shared conformance testkit at `@tanstack/ai-persistence/testkit`. `runPersistenceConformance` exercises every method of every store you provide and fails loudly on a store that is missing without being declared in `skip`.

  Implement the stores against whatever database you already run and hand the result to `withPersistence` — the core never inspects your tables, so the schema stays yours. The [Build Your Own Adapter](https://tanstack.com/ai/latest/docs/persistence/build-your-own-adapter) guide walks through a complete `node:sqlite` backend end to end, and the package ships Agent Skills with worked Drizzle, Prisma, and Cloudflare D1 recipes (`npx @tanstack/intent@latest install`). `examples/ts-react-chat` runs on a self-contained `node:sqlite` adapter built this way and verified by the conformance testkit.

  Resume reconstruction is delegated to the chat engine: persistence records interrupts and gates new input on a thread with pending interrupts, while the engine rebuilds the resume tool state from the resume batch and the interrupt bindings carried in the (server-loaded) message history.

  `reconstructChat(persistence, request)` is a server helper that returns a thread's stored messages as a JSON `Response`, so a server-authoritative client can hydrate its transcript on load from a one-line `GET` handler.

  Streamed artifact bodies can now be persisted to length-strict blob stores (Cloudflare R2), `maxArtifactBytes` can be turned off, and `BlobStore.get` can serve byte ranges.

  **The bug.** URL-fetched artifacts arrived at `BlobStore.put` as a `TransformStream`-wrapped body — the wrapper that enforces `maxArtifactBytes` as the body drains. A transform's readable side carries no declared length, so runtimes that require one for a single-shot upload (workerd's `R2Bucket.put`) rejected every URL-sourced artifact with `TypeError: Provided readable stream must have a known length`. Byte bodies never hit this, which is why the old conformance suite (byte bodies only) and any store that buffers were unaffected.

  **The wrapper is now applied only when it is load-bearing.** A trustworthy `content-length` is checked against the cap up front, and HTTP framing holds the origin to it — a body cannot exceed a length it declared — so counting the bytes again adds nothing and costs the declared length. Those responses (the common case for a provider CDN) now reach `BlobStore.put` exactly as `fetch` produced them, length intact, so `R2Bucket.put` single-shots them with nothing buffered. The counter still wraps the two response shapes that genuinely need it: a chunked reply (no declared length at all) and a content-encoded one (whose declared length measures the compressed bytes, so the decoded stream can be a decompression bomb).

  **`BlobPutOptions.expectedLength` (additive).** `withGenerationPersistence` now forwards the artifact's exact decoded byte length to `BlobStore.put` when it is known — the `content-length` of an un-encoded artifact response. It is deliberately _not_ forwarded when the response is content-encoded: `fetch` transparently decompresses, so a gzipped reply's `content-length` is the compressed size and the decoded stream can be arbitrarily longer. Stores may use the hint to attach a declared length (e.g. workerd's `FixedLengthStream`) and single-shot the stream, or fall back to multipart when it is absent. Also fixed in the same code: a missing `content-length` header read as a declared length of `0` (`Number(null) === 0`), which kept the early-reject unreachable for chunked replies.

  **`BlobStore.get(key, { range })` (additive).** Serving a persisted video means answering HTTP `Range` requests: seeking a `<video>` is built on `206` / `Content-Range`, and Safari refuses to play a source that ignores `Range` entirely. `get` now takes a `BlobGetOptions` with a `range`, returns just that slice, and reports it as `BlobObject.range` while `size` keeps describing the whole object — the numbers a `206` needs. `retrieveBlob(persistence, artifact, { range })` passes it through, and two new helpers cover the fiddly halves: `parseRangeHeader(header, size)` resolves a `Range` header (suffix ranges, clamping, and the `416` case) for a serve route, and `resolveBlobRange(size, range)` does the clamping every byte-storing backend needs. Ranged reads are part of the contract for a store that holds bytes: the `get` signature stays source-compatible (the parameter is optional), so an existing custom store surfaces this as a conformance failure rather than a type error.

  **`maxArtifactBytes: false`, and a 1 GiB default** (was 100 MiB). The cap is a drain-time counter, not a buffer — the URL path streams into the blob store and never holds an artifact in memory — so it bounds _transfer_, not memory, and 100 MiB was simply too low for generated video. Passing `false` drops the ceiling and the wrapper on every response, including chunked ones. Keep the cap when `allowInputUrl` lets callers name the URL, or when you want any ceiling at all on what a runaway origin can stream into your bucket (`content-length` is advisory, so uncapped is unbounded).

  **Testkit.** `runPersistenceConformance` now exercises `blobs.put` with a length-less `TransformStream`-wrapped body — with and without `expectedLength` — and `blobs.get` with a byte range, so a store that only handles byte bodies or ignores ranges fails the suite instead of failing on first real use. Custom backends should re-run the suite.

  **Skill fix.** `ai-persistence/build-cloudflare-artifact-store` no longer claims the body "flows straight through" to `R2Bucket.put`: its R2 `BlobStore.put` recipe now re-declares `expectedLength` via `FixedLengthStream` and falls back to a one-part-at-a-time multipart upload when the length is unknown, and its `get` maps `range` onto R2's own ranged read.

  Add `reapDetachedRuns`, `pruneJournals`, and `reclaimSandbox`: the sweep that closes out a detached durable run.

  Detaching a run on disconnect (see the durable-agent-runs changeset) leaves `detachedSince` on the record and a journal on disk, but nothing acted on either — recovery was manual. This ships the sweep, built on `RunStore.listReclaimable`:
  - **`reapDetachedRuns(options)`** — one argument. It makes exactly **one** `listReclaimable({ now, ttlMs: 0 })` call and classifies expiry in-process against the same inclusive cutoff; listing twice with two TTLs would cost a second store round-trip to compute a subset of what the first call already returned. A run whose journal already reached its `{"__exit":N}` sentinel is driven to terminal so its transcript lands (outcome `'finalized'`); a run past `options.detachedRunTtlMs` is `requestRunCancel`'d and then driven (outcome `'expired'`, with the run's own `status` distinguishing a replay that reached `'completed'` from an agent cut off mid-sentence at `'aborted'`). It never drives a run purely to find out whether it finished — the injected, **required** `hasFinished` probe reads the journal out of band first, and `probeRunExit` is the shipped implementation.

    The remaining outcomes are not one bucket:
    - `'producing'` and `'unknown'` — **left completely alone**. The claim is never taken, so nothing appends, no terminal record is written, `close()` is not called, and `detachedSince` is untouched.
    - `'not-claimed'` — also left alone. Another host holds the claim (a real viewer attaching mid-sweep is exactly this), or the run reached terminal in another host's hands between the listing and the claim.
    - `'budget-exceeded'` — the **opposite** of left alone, and an anomaly worth investigating. `pipeToRunLog` is total, so the record **is** terminal, the log **is** closed, and `reclaim` fired. It is a diagnostic: a run the probe already said had finished failed to replay inside `runBudgetMs`, which means the journal read, the translation, or the log is misbehaving. Finalization-path only — an expired run that outran its budget reports `'expired'`, because there the budget firing is the designed stop.
    - `'reclaim-failed'` — the transcript **is** saved and the record **is** terminal; only `options.reclaim` threw, so the sandbox is still up. Not retryable by the sweep: a terminal record leaves `listReclaimable` for good, so this entry and its `error` are the only notice that the sandbox leaks. The shipped `sandboxReclaimer` **rejects** on its `'destroy-failed'` arm so this outcome is reachable without writing a custom `reclaim`. It overwrites `'budget-exceeded'` when a run hit both — the leak is what needs acting on — and `ReapRunEntry.terminalizedAnyway` is what keeps the budget anomaly on the entry: it is set if and only if that anomaly happened, independently of the outcome the reclaim later overwrote.
    - `'failed'` — something threw; it is logged, recorded, and the sweep continues with the rest of the batch.

  - **`pruneJournals(options)`** — one argument. It deletes a journal only once its run is provably terminal; every arm that is not a proven-safe deletion keeps, including a non-terminal `'interrupted'` run, an unknown `runId` (a journal legitimately exists before its record does, so those are kept until `orphanTtlMs`), a store lookup that threw, an undecodable filename, and an mtime age gate the sandbox's `find`/`stat` could not answer.
  - **`reclaimSandbox`** / **`sandboxReclaimer`** reclaim the sandbox recorded against a run once it's terminal, from `RunRecord.sandboxKey`. `reclaimSandbox` returns `'destroy-failed'` — not `'destroyed'` — when the provider's `destroy` throws. The instance record is deleted either way (a record pointing at nothing guarantees a failed `resume` on the thread's next turn), so an operator has to be able to tell "torn down" from "possibly still billing and no longer reachable from here"; `sandboxReclaimer` logs that one arm above debug level **and rejects with a `SandboxReclaimFailedError`** (also exported), because `ReapOptions.reclaim` is `(record) => Promise<void>` and a rejection is the sweep's only channel for "the sandbox was NOT reclaimed" — logging and resolving reported the run `'finalized'` and left `outcomes['reclaim-failed']` reading `0` on exactly the leak it watches for. Every other outcome resolves: they all mean there was nothing for the reclaimer to tear down. A mismatched provider touches nothing at all, record included.
  - All of the above, plus the journal listing and exit-probe helpers behind them, are exported from `@tanstack/ai-sandbox`'s root.

  **`ReapOptions.detachedRunTtlMs` is the ONLY detached-run TTL.** `withSandbox`'s `durability` option deliberately has no `detachedRunTtl`, and the capability payload (`SandboxRunDurability`) carries no `detachedRunTtlMs`. An earlier iteration of the unreleased durability seam accepted a duration string there, validated it at setup, and published the parsed value on the capability bus — where **nothing read it**. It could not be read: the only actor that enforces a TTL is `reapDetachedRuns`, which runs from a cron with no chat in flight, so it has no `CapabilityContext` and cannot reach that bus at all. Two knobs in two units at two call sites bought only silent divergence — `detachedRunTtl: '30m'` on `withSandbox` next to `detachedRunTtlMs: 5 * 60_000` on the sweep expired runs at five minutes while the configuration claimed thirty, and nothing warned. Configure the TTL once, in milliseconds, where it is actually enforced. Nothing is lost on the fail-loud front either: the reaper's option is a required `number`, so a `'30min'`-style typo is now a compile error rather than a runtime one. Neither the option nor `SandboxDurabilityOptions` itself has ever appeared in a published release, so no released API changes.

  **This ships a function, not a scheduler.** `reapDetachedRuns` does not run itself — the application must call it on its own cadence (a cron job, a Vercel Cron route, a Cloudflare Workers `alarm()`, a queue consumer). An app that wires `durability` and `runs` but never schedules the reaper has nothing closing out detached runs: tailers on a detached run park forever, `detachedRunTtlMs` is enforced by nothing, and a sandbox that should have been reclaimed keeps billing. Wiring durability and scheduling the reaper are two separate integration steps; only the second one closes the loop.

  This corrects `durable-agent-runs-takeover.md`'s claim that "the TTL reaper still reclaims a stuck detach" — that is only true once the application schedules `reapDetachedRuns`. Nothing reclaimed anything automatically before this changeset, and nothing does after it either, absent that wiring.

  Fix `useChat` aborting an in-flight delivery resume on mount. When `live` was
  not enabled, the mount effect called `client.unsubscribe()` unconditionally,
  which cancelled the shared in-flight stream — including the `joinRun` rejoin the
  client had just started for a reloaded run. The result was a mid-stream reload
  that caught up to the buffered point and then froze instead of continuing.
  `useChat` now only tears down a subscription it actually started, so a reload
  rejoins and streams the run through to completion.

  Resumable streams: reconnect to an in-flight SSE **or NDJSON** response without
  re-running the provider.

  `toServerSentEventsResponse` and `toHttpResponse` both accept a
  `durability: { adapter, batch }` option. The adapter (`StreamDurability`)
  records every chunk to an ordered log before delivery and tags each event with
  an opaque, adapter-owned offset — an SSE `id:` line, or the `id` of an NDJSON
  `{ id, chunk }` envelope (NDJSON has no native event-id). A reconnect
  (`Last-Event-ID`) or an explicit `?offset` read replays strictly after that
  offset from the log — the lazy provider stream is never iterated on resume.
  Producers terminalize the log on cancellation and failure (`RUN_ERROR` append
  - `close()`) and on completion when the source stream emits its own terminal
    event (`chat()` always does), so readers are never parked on a dead run.

  Two adapters ship: `memoryStream(request)` in `@tanstack/ai` (process-local,
  for development and tests) and the new `@tanstack/ai-durable-stream` package,
  a Durable Streams protocol adapter for production backends.

  For the `GET` handler that a reload or a second tab reconnects to,
  `resumeServerSentEventsResponse({ adapter })` and `resumeHttpResponse({ adapter })`
  replay a run straight from the durability log. They need no producer stream and
  return a 400 when the request carries no resume offset.

  On the client, all four HTTP adapters are now resumable — `fetchServerSentEvents`,
  `fetchHttpStream`, `xhrServerSentEvents`, and `xhrHttpStream`. Each tracks the
  per-event offset, auto-reconnects with `Last-Event-ID`, de-duplicates the
  replayed prefix, and exposes `joinRun(runId)` to attach to an in-flight or
  finished run from the start (read-only GET with `offset=-1`). Untagged streams
  behave exactly as before. A durable run that ends with no terminal event and no
  forward progress now throws `DurableStreamIncompleteError` instead of hanging.

  Reconnection and durability are bounded so failures surface rather than hang or
  loop:
  - `memoryStream` evicts completed logs after a grace window (unbounded growth
    is gone); resuming an expired/unknown run throws, and a from-start join to a
    run that never produces fails after `MemoryStreamOptions.firstChunkDeadlineMs`.
  - all four HTTP adapters accept `reconnect: { maxAttempts, delayMs }` — a
    throttle plus a ceiling on CONSECUTIVE no-progress reconnects (default 5;
    forward progress resets it) that fails with the new `StreamReconnectLimitError`
    instead of reconnecting endlessly, without penalizing a healthy long-lived run.
  - `durableStream` accepts `reconnect: { maxReadFailures, delayMs }` to bound its
    read-retry loop, and `server` is now optional when `fetch` is provided (e.g. a
    Cloudflare service binding).
  - `toServerSentEventsResponse` accepts `debug` to record durability terminal /
    close failures server-side, where a replaying joiner cannot observe them.

  A durable run is now joinable from the moment it is accepted, not from its first real chunk — closing the window where refreshing during a sandbox boot permanently orphaned a live run.
  - **`@tanstack/ai`**: a fresh durable producer appends (and forwards) a synthetic `CUSTOM` chunk named `RUN_ACCEPTED_EVENT` (`'run.accepted'`, exported) to the delivery log before the producer stream is first pulled. Pulling the stream is what runs the middleware chain, and middleware that boots a sandbox (create a container, install a CLI) can legitimately emit nothing for minutes; during that window the log was empty, so every joiner's empty-log fail-fast (`memoryStream`'s first-chunk deadline, the client's rejoin connect deadline) read the run as gone. Takeover alignment is unaffected: a journal replay cannot reproduce the marker, and alignment already skips stored `CUSTOM` chunks as out-of-band. Consumers that assert exact chunk sequences over a durable wire will see the marker first.
  - **`@tanstack/ai-client`**: a rejoin that times out before attaching now KEEPS the persisted resume pointer (the run may simply not have produced yet); only a join the server refuses with a hard error (unknown / evicted run) clears it. Previously one connect-deadline timeout cleared the pointer, so the next reload never retried.

  `isTerminalRunStatus` no longer reports a prototype-chain property as terminal, and `isRunStatus` ships so a backend can validate a stored row.

  `isTerminalRunStatus` tested `status in TERMINAL`, and `in` walks the prototype chain — so a store row whose `status` column held `'toString'`, `'constructor'`, or `'valueOf'` was reported **terminal**. `status` is typed `RunStatus`, but every value reaching the guard comes off a user-implemented `RunStore` (JSON out of D1, a Durable Object, Postgres) where nothing validated it, so the type was only a claim. A false `true` is destructive, not cosmetic: `@tanstack/ai-sandbox`'s journal sweep **deletes** a terminal run's journal — the only copy of the bytes a successor needs, with no undo — `attach-preflight` fails the attach as `'terminal-run'`, and core's resume driver refuses to drive the run.
  - `isTerminalRunStatus` now uses `Object.hasOwn(TERMINAL, status)`, keeping the `Record<TerminalRunStatus, true>` exhaustiveness trick that makes adding a terminal status a compile error.
  - **New: `isRunStatus(value: unknown): value is RunStatus`**, exported from `@tanstack/ai`, over the same exhaustiveness trick across the full union. Run it on a row's `status` at deserialization in your `RunStore` — the readers downstream act destructively on the answer. Core now does this at its own only store-status read (the resume driver), which refuses an unrecognized status and logs on the `errors` channel instead of coercing it.
  - `DetachableRunCapability` and `RunDetachedCapability` are `createCapability<true>()` rather than `<boolean>`. Absence is the documented negative for both, so a published `false` had no meaning yet was representable — and a consumer testing _presence_ rather than the value would have read one as the positive. Narrowing the payload makes that unrepresentable. A provider that published `false` (which meant nothing) stops compiling; publish nothing instead.

  `RunStore.findActiveRun` is now **required**. It was optional and
  feature-detected (`store.findActiveRun?.(threadId)`), which meant an adapter that
  had not implemented it was indistinguishable from one reporting "nothing is
  running": `reconstructChat` returned `activeRun: null`, and a client reloading
  mid-generation silently never reconnected to the run still producing. That is a
  production failure the type system was in a position to catch.

  Adapters that already implement `findActiveRun` need no change. Adapters that do
  not will now get a compile error; implement it as "most recent `'running'` run
  for the thread, `null` if none" — in SQL,
  `WHERE thread_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1`.
  A backend that genuinely has no run lifecycle should declare
  `ChatTranscriptStores` and omit `runs` entirely rather than stub the method.

  The store-contract evolution policy changes to match: new store methods are
  added as required, and capability tiers are expressed at the store level, not by
  optional methods. The conformance testkit no longer skips its `findActiveRun`
  assertions when the method is absent, and `findActiveRun` is no longer accepted
  in `skipMethods`.

  `RunStore` itself now lives in `@tanstack/ai`
  (`isTerminalRunStatus` / `defineRunStore` / `InMemoryRunStore` travel with it and
  are re-exported from `@tanstack/ai-persistence`), so the requirement applies
  there too. `@tanstack/ai-sandbox`'s `fenceRunStore` forwards `findActiveRun`
  unconditionally rather than materializing it only when the wrapped store has it;
  `listByThread` and `listReclaimable` are still forwarded only when present.

  fix(sandbox): a durable sandboxed run survives losing its viewer instead of being killed by it

  A client disconnect could only reach `withSandbox` if the application mirrored
  `request.signal` into `chat()`'s `abortController` — which aborts the run.
  `chat()` then returned at its cancellation check immediately after middleware
  `setup`, so the harness adapter's `chatStream` was never called and the agent in
  the sandbox that `setup` had just spent minutes building was **never launched**.
  Switching away while the UI still said "starting the sandbox" left an empty log
  for a run that did nothing — unrecoverable even by takeover, because an agent
  that never started writes no journal to replay. Applications had to choose
  between "the middleware learns about the disconnect" and "the run survives it".

  A disconnect is now delivered as a notification rather than a cancellation: the
  durable transport tells the run its response body was cancelled, without aborting
  it. `withSandbox` records `detachedSince`/`sandboxKey` and publishes the detach
  verdict, and the run keeps draining into its still-open delivery log for a
  rejoining client to tail. Teardown stays where it belongs — the file watcher is
  not stopped and the sandbox is not destroyed while the run is still using them.

  A genuine stop is unchanged: it arrives out of band (`RunRecord.cancelRequested`
  / `RUN_CANCEL_REASON`), and aborting an `abortController` you pass still
  terminalizes the run.

  A third thing was missing in that window, and core now owns it: the delivery log was
  empty, so every joiner's fast-fail (`memoryStream`'s first-chunk deadline, the
  client's 2s rejoin connect deadline) read a live run as gone. `RUN_ACCEPTED_EVENT`
  covers it for every durable run, so `withSandbox` deliberately appends no marker of
  its own — a second one would only land mid-stream in a run already producing.

  Two related fixes, both found while verifying the above:
  - `withSandbox` registered its run state only _after_ `definition.ensure()`, so a
    disconnect during the minutes-wide sandbox creation — the likeliest moment for
    one — was a silent no-op. State is now registered before `ensure`.
  - A durable run was invisible for the whole of `ensure`. Chat persistence creates
    the run record from `onConfig`, which runs after every middleware `setup`, so
    during the minutes a sandbox takes to build there was no record at all:
    `findActiveRun` reported nothing running for a run that was demonstrably
    starting (measured: a status sidebar showed `idle` for 6.5 minutes), a client
    returning to the thread had nothing to tell it a run was in flight and rendered
    an empty pane, a crash in that window left nothing for `listReclaimable` to
    surface, and the detach stamp silently no-opped because `RunStore.update` does
    nothing for an unknown runId. `withSandbox.setup` now pre-creates the record
    before `ensure` for durable runs only; `createOrResume` is idempotent, so
    persistence's own later call simply finds it.

  `withSandbox` also records the harness's own tool calls into the transcript, so a
  FINISHED run restores its tool cards instead of only its verdict. A harness executes
  its tools inside the sandbox, so `chat()` merely relays their `TOOL_CALL_*` chunks —
  it never wrote an assistant message for them, and chat persistence stores
  `ctx.messages`. The tool history therefore existed only in the run's delivery log:
  switching away and coming back replayed all of it (there was a live run to rejoin),
  while a reload after the run finished hydrated from the message store and got the
  prompt plus the final text and nothing else (measured: 487,443 characters of
  transcript before the reload, 4,014 after). They are recorded as ordinary `toolCalls`
  plus `role: 'tool'` messages, which needs no new wire format and no client change —
  `modelMessagesToUIMessages` already merges a stored result into the call it belongs to
  and completes the card.

  Each recorded call carries `metadata.sandboxObserved`, which does two jobs. It is
  stripped from the request to the model on the next turn — those calls name tools the
  provider was never given, and one run of them is far too many tokens to replay — and
  it lets an app's own `MessageStore` find them in `saveThread` to cap or drop what it
  does not want to keep. Nothing is truncated for you; results are handed over whole.
  See `docs/sandbox/events.md`.

  One public addition, `isSandboxToolCall(toolCall)` from `@tanstack/ai-sandbox`: true
  when a tool call was executed by the harness inside the sandbox and recorded for
  display. It reads the marker so an app never has to know the metadata key, and it also
  accepts a rendered `tool-call` part, whose `metadata` is copied from the message — so
  the same helper filters a client-side view. Everything else is internal: the disconnect
  seam is exposed only through `@tanstack/ai/adapter-internals` for
  `@tanstack/ai-sandbox`, and the recorder itself is private to `withSandbox`.

  Durable **sandbox instance** resume for multi-process / multi-replica deploy.
  - **`SandboxInstanceStore` / `SandboxInstanceRecord` / `InMemorySandboxInstanceStore` / `SandboxInstanceStoreCapability`** in `@tanstack/ai-sandbox`
  - **`withSandbox(sandbox, { instances, locks? })`** takes the store directly, so it cannot be mis-ordered (in-memory fallback when absent). `SandboxInstanceStoreCapability` + `provideSandboxInstanceStore` remain for ambient/platform wiring; an explicit option wins over the bus.
  - **`defineSandboxInstanceStore`** for inline BYO typing (same pattern as `defineLock` / `defineMessageStore`)
  - Pair multi-instance with **`withLocks`** from `@tanstack/ai/locks` (distributed lock)
  - Independent of chat persistence — compose both when the app needs transcript durability _and_ instance reuse
  - Conformance: `runSandboxInstanceStoreConformance` from `@tanstack/ai-sandbox/testkit`

  `SandboxCapabilities.killableProcesses` is now either measured or falsifiable on every bundled remote provider, instead of asserted in a comment.

  The flag is not cosmetic: `journalReadStrategy` reads it to pick `'follow'` (a spawned `tail -c +N -f`) over `'poll'` (bounded `exec` reads). A wrong `true` starts a process the host then cannot stop, leaking one per run. Two providers were recently probed and **both** declared it falsely, so the remaining declarations were audited rather than trusted.
  - **Vercel** — `killableProcesses` is now `false`. Its `kill()` only called `controller.abort()`, and that signal reaches nothing: `@vercel/sandbox` forwards a detached command's `signal` to the HTTP request that _starts_ the command (already resolved by the time the handle exists) and to a log pipe this handle does not use. `kill()` was a no-op that left the remote process running — the same client-side-detach shape as the Docker defect. `kill()` now issues the SDK's real server-side `Command.kill('SIGKILL')` (and the caller's `signal` routes through the same path, best-effort so teardown cannot throw), but whether that reaches the forked `tail -f` is unmeasured, so the capability stays `false` and reads poll.
  - **Daytona** — `killableProcesses` is now `false`. `kill()` aborts the client-side poll loop and resolves _before_ anything attempts termination; the `deleteSession` that was supposed to be the kill runs later from the pump's teardown, swallows its own failures, and is documented as cleanup for a _completed_ session.
  - **Sprites** — left `true`, because its `kill()` is a genuine server-side `POST /exec/<sessionId>/kill` rather than a stream detach — but the declaration is now labelled unverified: what that endpoint signals (process group or pid) is undocumented, and the follow command is a multi-statement shell whose `tail -f` is necessarily a child.
  - **Cloudflare** — `false` confirmed by behavior, not by reading the constant: a test drives a still-running command, calls `kill()`, and asserts nothing was cancelled and no `AbortSignal` ever reached `exec` (Workers RPC cannot serialize one), then that `journalReadStrategy` answers `'poll'`.

  Daytona, Vercel, and Sprites each register the shared journal conformance suite. With credentials present it measures the claim against a real sandbox; without them it reports a **named skip** carrying the reason, never a silent pass.

  Separately, `@tanstack/ai-sandbox-cloudflare`'s `pipeToRunLog` now honors its documented "never rejects" contract. `log.open`, the terminal `log.finish`, the recovery `append`/`finish`, and the final record re-read were all unguarded, and `RunController.start` consumes the promise fire-and-forget — so any of them rejecting was an unhandled rejection, which is **instance-fatal inside a Durable Object**. Every call is now individually guarded and reports through an optional `logger`, a failing re-read falls back to a locally rebuilt terminal record instead of throwing, and the fire-and-forget hand-offs use two-argument `then` rather than `.finally` (which adopts rejections).

  Make a mid-stream reload resume the same conversation cleanly.
  - `withPersistence` now persists the pending turn at the start of a run (so a
    reload during generation still shows the user's message), stamps each
    assistant turn with its stream `messageId`, and accepts
    `withPersistence(persistence, { snapshotStreaming: true })` to also persist the
    in-progress reply on a throttled interval (`snapshotIntervalMs`, default
    `1000`) for partial-output durability.
  - `ModelMessage` gains an optional `id`; `modelMessagesToUIMessages` preserves
    it, so a hydrated message keeps the same identity as its live stream.
  - On reload, the chat client rebuilds an in-flight assistant turn from the
    delivery log (replaying from the start and applying the buffered backlog in one
    batch) instead of reconciling against the persisted partial, so the reload
    shows one clean bubble that catches up and continues rather than a frozen or
    duplicated partial.

  Make generation persistence work with server functions and direct connections. Server-driven restore (`persistence: true`) previously only worked with the HTTP adapters (`fetchServerSentEvents` / `fetchHttpStream` and their XHR variants), because they are the only connections that implement the optional `hydrateGeneration(threadId)` and `joinRun(runId)` handlers; with `stream()`, `rpcStream()`, or a plain `fetcher` the option silently no-opped, and a stored snapshot still `running` after a reload left the hook stuck on `generating` forever.

  **Handlers on the lightweight adapters (`@tanstack/ai-client`).** `stream()` and `rpcStream()` take an optional second argument, `StreamConnectionHandlers` (`{ hydrate, hydrateGeneration, joinRun }`), spread onto the returned adapter so server-driven persistence works without an HTTP endpoint — each handler is typically a one-line server-function or RPC call. `ConnectConnectionAdapter` also declares the optional chat `hydrate` handler alongside the generation ones.

  **Handlers as generation options (`@tanstack/ai-client`).** `GenerationClientOptions` (and `VideoGenerationClientOptions`, plus every framework hook's generation options) accept optional `hydrateGeneration` / `joinRun` alongside a `fetcher` — or as a fallback when a connection doesn't carry its own. `persistence: true` now hydrates whenever either source exists; the constructor warning only fires when neither does.

  **Interrupted runs no longer stick on `generating` (`@tanstack/ai-client`).** A restored or hydrated snapshot with `status: 'running'` that no `joinRun` handler can tail is repainted as an interrupted error — an interrupted generation cannot be resumed, only re-run — in both `GenerationClient` and `VideoGenerationClient`.

  **Request-free hydration (`@tanstack/ai-persistence`).** New `getGenerationHydration(persistence, id, { by?: 'threadId' | 'runId' })` returns the plain `{ resumeSnapshot, activeRun }` payload straight from the `generationRuns` store, so a server function can back `hydrateGeneration` without fabricating a `Request`. `reconstructGeneration` now delegates to it; `authorize` stays on the `Request`-based function only, so server-function callers gate on their own session before resolving the id.

  **Server-function run replay (`@tanstack/ai`).** `memoryStream` also accepts an explicit `{ runId, offset? }` init instead of a `Request`, and a new `replayRunStream(durability, offset?)` async generator maps a durability `read` (from the start by default) to a bare `StreamChunk` stream — together they let a streaming server function serve `joinRun` for a run id it received as call data.

  **Add a shared `Scope` identity type to `@tanstack/ai`.**

  `Scope` is the single identity/isolation vocabulary for the subsystems that
  persist or recall per-conversation data — `@tanstack/ai-persistence` and
  `@tanstack/ai-memory`. Rather than each subsystem inventing its own notion of
  "whose data is this?", both import one type:

  ```ts
  interface Scope {
    threadId: string // required — the single conversation key (same as ctx.threadId)
    userId?: string // durable end-user identity; required in practice for multi-user apps
    tenantId?: string // multi-tenant boundary
    namespace?: string // reserved logical partition; no subsystem keys on it yet
  }
  ```

  `threadId` is the one conversation key across the codebase (matching
  `ChatMiddlewareContext.threadId`, with `conversationId` already deprecated in
  favor of it) — subsystems must not introduce a second name (`sessionId`, …) for
  the same concept. Every field is an isolation boundary and must be derived
  server-side from trusted session state, never from client input.

  Introduced ahead of the persistence and memory packages so both share one settled
  identity contract. `@tanstack/ai-memory` now aliases `MemoryScope` to `Scope`
  (see the memory-scope-threadid changeset).

  **Make every bundled Agent Skill discoverable by TanStack Intent.**

  Intent finds skills by scanning `node_modules` for packages that carry the
  `tanstack-intent` keyword, and can only load what npm actually publishes. Three
  packages shipped skills that failed one half of that contract:
  - `@tanstack/ai-mcp` wrote its skill into a `skills/` directory that was missing
    from `files`, so it was never published at all.
  - `@tanstack/ai-memory` and `@tanstack/ai-sandbox` published their skills but
    lacked the keyword, so Intent never looked at them.

  All three now publish `skills` and carry the keyword, matching `@tanstack/ai`,
  `@tanstack/ai-code-mode`, and `@tanstack/ai-persistence`.

  The client persistence skill also moves from `@tanstack/ai-persistence` to
  `@tanstack/ai` as `ai-core/client-persistence`. It teaches
  `localStoragePersistence` / `sessionStoragePersistence` / `indexedDBPersistence`
  and the `persistence` option on `useChat` — all of which live in the framework
  packages, not in `@tanstack/ai-persistence`. An app doing browser-only
  persistence never installs that package, so the guidance was unreachable for
  exactly the people who needed it, and `ai-core` routed to a path that did not
  exist on disk. Skills now follow the code that owns them.

  Make streaming `summarize()` resumable across a mid-run reload, like the media
  activities. Additive, no public API change beyond two optional fields:
  - `summarize()` (and `SummarizationOptions`) accept optional `runId` / `threadId`.
    When set on a streaming summarize, they are threaded into the wrapped chat so
    the emitted `RUN_STARTED` carries the caller's `runId` — letting a
    delivery-durable route key the run's log by the same id the client rejoins
    with, so a mount-time `joinRun` tails the run to completion instead of
    fast-failing on a mismatched (empty) log.
  - `@tanstack/openai-base`'s Responses `chatStream` now honors
    `options.runId` for the AG-UI `RUN_STARTED` (mirroring how it already honors
    `options.threadId`), falling back to a generated id when unset.

  Update model metadata from OpenRouter API

  **Breaking:** trim the persistence public API down to what an app actually calls.

  Generation persistence is server-driven, so the types and options that only
  existed to support a client-managed copy of a run are gone.
  - **`initialResumeSnapshot` is removed from every generation hook** (`useGeneration`,
    `useGenerateImage`, `useGenerateVideo`, `useGenerateAudio`, `useGenerateSpeech`,
    `useSummarize`, `useTranscription`, and the Solid / Vue / Svelte / Angular
    equivalents) and from `GenerationClient` / `VideoGenerationClient`. A run is
    restored by `persistence: true` plus a `hydrateGeneration` handler. **`useChat`
    keeps its `initialResumeSnapshot`.**
  - **No longer exported from `@tanstack/ai-client`** (they are internals of the
    hydration path): `GenerationResumeSnapshot`, `GenerationResumeState`,
    `GenerationResumeStatus`, `GenerationResultSnapshot`, `GenerationErrorSnapshot`,
    `GenerationEventSnapshot`, `GenerationPendingArtifact`,
    `parseGenerationResumeSnapshot`, `updateGenerationResumeSnapshot`, and
    `ChatResumeSnapshot`. `GenerationPersistenceOption` (an alias for `boolean`) is
    deleted; write `persistence?: boolean`. `GenerationPersistenceOptions`, the
    union that requires a `threadId` alongside `persistence`, is unchanged.
  - **`ChatResumeSnapshotV1` / `ChatResumeSnapshotV2` are collapsed into one shape**
    with no `schemaVersion` field. The two versions were structurally identical, no
    reader branched on the version, and only V2 was ever written.
  - **The framework packages no longer re-export `PersistedArtifactRef`.** No hook
    type refers to it; import it from `@tanstack/ai` where the artifact stores are
    defined.
  - **`artifactBlobKey` is no longer exported from `@tanstack/ai-persistence`.** Use
    `resolveArtifactBlobKey(record)`, which its own docs already recommended for
    reads, since a record written with a custom `storageKey` carries its real key.
  - **`createInterruptController` and `InterruptController` are deleted.** The
    controller only forwarded five calls to the `interrupts` store; call the store
    directly (`persistence.stores.interrupts`).
  - The ctx-capability plumbing (`PersistenceCapability`, `InterruptsCapability`,
    `getPersistence`, `providePersistence`, `getInterrupts`, `provideInterrupts`) is
    unchanged and now documented, for middleware that reads the stores
    `withPersistence` holds. See
    [Persistence internals](https://tanstack.com/ai/latest/docs/persistence/internals).

  The chat hooks no longer take an `id` option — a hook's identity is its `threadId`.

  `useChat` / `createChat` previously accepted a separate `id` that keyed client
  persistence and named the devtools instance, defaulting to a framework
  `useId()` when omitted. That meant persistence keyed on an ephemeral render-tree
  id even when you passed a stable `threadId`, so a reload found nothing under the
  thread's key.

  Now the `threadId` is the single identity:
  - The hooks drop the `id` option. Pass `threadId` to persist a conversation and
    restore it on reload; omit it for an ephemeral chat.
  - Persistence keys on `threadId` (unchanged in `ChatClient`, which already
    resolved `id ?? threadId` — the hooks simply stop overriding it).
  - `ChatClient.uniqueId` (the devtools instance id) now falls back to `threadId`
    instead of a generated id, so a thread shows up in devtools under its own id.
  - Changing `threadId` on a mounted `useChat` (react/preact/solid) now recreates
    the client so the new thread takes effect; previously the change was ignored.

  `ChatClient` still accepts `id` directly as a lower-level escape hatch for
  keying storage separately from the wire thread; only the framework hooks drop it.

  Migration: replace `useChat({ id })` with `useChat({ threadId })`.

### Patch Changes

- Updated dependencies [[`7499171`](https://github.com/TanStack/ai/commit/74991716aea4d90a5d0363676a1e3349689a48e8)]:
  - @tanstack/ai-event-client@0.7.0
  - @tanstack/ai-utils@0.4.0

## 0.42.0

### Minor Changes

- [#965](https://github.com/TanStack/ai/pull/965) [`3e1b510`](https://github.com/TanStack/ai/commit/3e1b510e4fdd2334af468c47b7c37b572805200e) - Bound tool-call fan-out in agent loops: `AgentLoopState` now exposes `toolCallCount` and `lastTurnToolCallCount`, `maxToolCalls(n)` strategy caps cumulative tool calls, and `chat({ maxToolCallsPerTurn })` caps how many parallel calls execute in a single turn.

## 0.41.0

### Minor Changes

- [#405](https://github.com/TanStack/ai/pull/405) [`2665085`](https://github.com/TanStack/ai/commit/2665085970ab4d792778bb2b635ef27fbdcb6be1) - Added Gemini Realtime Adapter

- [#918](https://github.com/TanStack/ai/pull/918) [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589) - Gate the tool-call part's `approval` field on the tool's `needsApproval` flag.
  Previously `approval?` was declared on every typed tool-call part regardless of
  whether the tool could ever request approval. Now the flag is captured as a
  literal type (`toolDefinition({ needsApproval: true })` → `true`) and threaded
  through `ClientTool` / `ToolDefinitionInstance` / `ToolDefinition`, and
  `ToolCallPartForTool` only includes `approval` for tools defined with
  `needsApproval: true`:

  ```ts
  const { messages } = useChat({ tools: [getGuitars, addToCart] }) // addToCart: needsApproval: true
  for (const part of message.parts) {
    if (part.type !== 'tool-call') continue
    if (part.name === 'addToCart') part.approval?.id // ✅ typed
    if (part.name === 'getGuitars') part.approval // ✅ compile error — no such field
  }
  ```

  ## ⚠️ Breaking change (types only)

  **This is the primary migration surface for this release.** When you pass a typed
  `tools` array to `useChat` / `createChat` / `injectChat`, reading `part.approval`
  on a mixed tool-call union **without first narrowing by `part.name`** no longer
  compiles. Code that previously did `part.approval?.id` in a generic handler over
  all tool-call parts must be updated:

  ```ts
  // ❌ No longer compiles on a typed mixed union
  part.approval?.id

  // ✅ Narrow to an approval-required tool first
  if (part.name === 'deleteAccount') part.approval?.id

  // ✅ Or guard with `in`
  if ('approval' in part) part.approval?.id

  // ✅ Or type the handler against the base (untyped) ToolCallPart
  function handleApproval(part: ToolCallPart) {
    return part.approval?.id
  }
  ```

  Untyped `useChat()` (no inferred `tools` generic) and the base `ToolCallPart`
  type are unaffected: `approval` stays available on every tool-call part there.
  **Runtime behavior is unchanged** — only TypeScript narrowing is stricter.

  Adds a `TNeedsApproval extends boolean` type parameter (defaulting to `false`)
  to the client tool types; existing explicit type arguments keep working via the
  default. Literal capture requires `toolDefinition({ needsApproval: true })` at
  the call site — a dynamic `needsApproval: boolean` variable will not gate the
  type.

- [#918](https://github.com/TanStack/ai/pull/918) [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589) - Populate the parsed `input` on tool-call message parts. `ToolCallPart` already
  declared a typed `input?` field, but it was never written at runtime — only the
  raw `arguments` string (and `output`) were set, so `part.input` was always
  `undefined` and consumers had to fall back to `part.input ?? JSON.parse(part.arguments)`.

  `input` is now set from the parsed arguments once they are complete
  (`state: 'input-complete'` and later, including `approval-requested`), in the
  streaming processor, the `TOOL_CALL_END`-with-parsed-input path, and when
  hydrating history via `modelMessagesToUIMessages`. While arguments are still
  streaming, `input` stays `undefined` and the raw `arguments` string remains the
  live source. A tool call that terminates in an error state may also keep `input`
  unset. `arguments` is unchanged, always present, and not deprecated.

  With typed tools (`useChat({ tools })`), `part.input` is fully typed per tool
  via the `part.name` discriminant — matching `part.output`.

### Patch Changes

- [#924](https://github.com/TanStack/ai/pull/924) [`5fcaf90`](https://github.com/TanStack/ai/commit/5fcaf90dc82bc20b8c7a75faa3c129da04858af5) - fix: resolve directory-barrel imports in published `.d.ts` files. Bare imports of `utils`/`tools`/`middleware` barrels were emitted as `../utils.js` (etc.), which do not resolve under bundler/node16/nodenext (no `/index` fallback for explicit `.js`). With consumer `skipLibCheck: true` those symbols silently became `any`. Imports now target concrete modules (e.g. `utils/client`, `middleware/types`) or explicit `/index` paths so public types resolve correctly.

- [#922](https://github.com/TanStack/ai/pull/922) [`e0bbbdd`](https://github.com/TanStack/ai/commit/e0bbbdd9608892293e09135aab4a3c77c8d65669) - fix: resolve dangling relative imports in published declaration files

  Switch directory-barrel imports (`../utils`, `../tools`, `../middleware`) to
  concrete module paths so emitted `.d.ts` specifiers resolve under
  `bundler`/`node16`/`nodenext` resolution. Adds a `test:dts` scanner guardrail.

  Fixes [#920](https://github.com/TanStack/ai/issues/920)

- [#886](https://github.com/TanStack/ai/pull/886) [`de5fbb5`](https://github.com/TanStack/ai/commit/de5fbb52a916826cdc0ef31d18df402cd611b9d4) - Fix `generateVideo` / `getVideoJobStatus` rejecting video adapters that declare a narrowed per-model duration union (e.g. Gemini's `4 | 6 | 8` for Veo or `10` for Omni Flash) at the type level. The activity's `TAdapter extends VideoAdapter<string, any, any, any>` constraints left the input-modality and duration generics at their defaults, so `duration?: number` failed contravariance against the adapter's literal union. All video-activity constraints and helper conditionals now span all six `VideoAdapter` generics.

## 0.40.0

### Minor Changes

- [#651](https://github.com/TanStack/ai/pull/651) [`5deda27`](https://github.com/TanStack/ai/commit/5deda27085c8785894a28feb5bb3655dbd8f7e0a) - Add OpenAI transcription diarization support with `diarized_json` output, speaker-labeled segments, diarization model validation, chunking strategy options, and docs.

## 0.39.1

### Patch Changes

- [#855](https://github.com/TanStack/ai/pull/855) [`afba322`](https://github.com/TanStack/ai/commit/afba32236022589afce4d5a165fd4a8a884ae57d) - Preserve Anthropic server-tool results (`web_search` / `web_fetch`) across turns.

  Previously the Anthropic adapter dropped `server_tool_use` and
  `web_search_tool_result` / `web_fetch_tool_result` blocks while streaming, so the
  evidence never round-tripped — a follow-up turn could no longer see the prior
  web-search sources (issue [#839](https://github.com/TanStack/ai/issues/839)). These now stream as a **provider-executed**
  tool call carrying the raw result, which the agent loop skips (never executed
  client-side) and the adapter replays verbatim into the next request. Adds the
  `ProviderExecutedToolMetadata` convention plus `isProviderExecutedToolCall` /
  `getProviderExecutedMetadata` helpers to `@tanstack/ai`.

  (No e2e: aimock cannot synthesize `server_tool_use` blocks; covered by unit
  tests and verified live against the Anthropic API.)

- [#867](https://github.com/TanStack/ai/pull/867) [`e7ad181`](https://github.com/TanStack/ai/commit/e7ad181cad20c5d6560f480835c99ff1142b40af) - Fix `addToolResult` / `addToolOutput` silently no-op'ing after a `MESSAGES_SNAPSHOT`. The AG-UI snapshot wire shape cannot reconstruct client-side tool-call metadata a server may omit (a `role: 'tool'` message only carries `toolCallId` + `content`, and an assistant message may drop `toolCalls` the client already observed via `TOOL_CALL_*` events). `handleMessagesSnapshotEvent` now runs a reconciliation pass that anchors detached `tool-result`-only assistant messages into the preceding assistant message (matching the streaming fan-out shape) and carries forward a `tool-call` part from the pre-snapshot state when the snapshot references its `toolCallId` via a `tool-result` but omits the corresponding `tool-call` part. This keeps the UI representation consistent and lets a subsequent `addToolResult(toolCallId)` locate the call. Fixes [#859](https://github.com/TanStack/ai/issues/859).

## 0.39.0

### Minor Changes

- [#774](https://github.com/TanStack/ai/pull/774) [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4) - Declarative sandbox file-event hooks: observe file create / change / delete
  inside a sandbox and have them fire automatically during a chat run.
  - `@tanstack/ai`: chat middleware gains an optional `sandbox` hook group
    (`onFile`/`onFileCreate`/`onFileChange`/`onFileDelete`), a `SandboxFileEvent`
    type, and a `sandbox` debug-logging category. The engine auto-emits a
    `CUSTOM` `sandbox.file` event per change (client reads it from `parts`).
  - `@tanstack/ai-sandbox`: `defineSandbox({ hooks, fileEvents })` declares
    file + lifecycle hooks (`onFile*`/`onReady`/`onError`/`onDestroy`) that fire
    automatically while the sandbox runs in a chat — `withSandbox` owns the
    watcher. The watcher is provider-agnostic: a native `fs.watch` fast-path when
    the provider advertises it, otherwise a portable `find -printf` mtime
    snapshot-diff poll (no extra deps; `.git`/`node_modules` ignored by default).
    `watchWorkspace()` / `diffSnapshots` remain as low-level building blocks.
  - `@tanstack/ai-sandbox-local-process`: implements the optional `fs.watch` seam
    via Node's recursive `fs.watch` (Windows/macOS); Linux falls back to the core
    exec-poll automatically.

- [#774](https://github.com/TanStack/ai/pull/774) [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4) - New provider-agnostic sandbox layer so harness adapters can run **inside** isolated sandboxes.
  - **`@tanstack/ai-sandbox`** — `defineSandbox()` (lazy controller + resume→restoreSnapshot→create+bootstrap ensure algorithm), `withSandbox()` middleware, `defineWorkspace()` (git/local source, package-manager detection, setup, skills, secrets), `defineSandboxPolicy()`, the `SandboxProvider`/`SandboxHandle`/`SandboxCapabilities` contracts, capability tokens (`SandboxCapability` plus the optional `SandboxStore`/`Locks` persistence seams with in-memory defaults), `bootstrapWorkspace`, `createExecBackedGit`, `spawnNdjson` (run an agent CLI in a sandbox and stream its NDJSON stdout), the host MCP tool-proxy bridge (`startHostToolBridge` — exposes `chat()` server tools to the in-sandbox agent, with an optional permission-prompt tool), and the shared interactive-approval primitives (`resolveApproval`, `approvalId`, `buildApprovalRequestedEvent`) harness adapters use to enforce a policy and surface `approval-requested` events for client-in-the-loop approvals.
  - **`@tanstack/ai-sandbox-local-process`** — `localProcessSandbox()`: runs the agent on the host through the uniform `SandboxHandle` (no isolation; the fast dev loop).
  - **`@tanstack/ai-sandbox-docker`** — `dockerSandbox()`: runs the agent inside an isolated Docker container (dockerode), with commit-based snapshots, fork, and resume-by-id.
  - **`@tanstack/ai`** — `TextOptions.capabilities` exposes the middleware capability context to adapters so harness adapters that declare `requires: [...]` can read provided capabilities from `chatStream`; `TextOptions.approvals` threads client approval decisions through to adapters for the interactive-approval (deny + `approval-requested` + re-run) flow; `DefinedChatMiddleware` and `AnyChatMiddleware` are now exported for portable middleware authoring.

## 0.38.0

### Minor Changes

- [#843](https://github.com/TanStack/ai/pull/843) [`c1a8732`](https://github.com/TanStack/ai/commit/c1a87327b4a3463d37158f32ca90184b5fd092bb) - feat: MCP Apps support — render interactive `ui://` widgets served by MCP servers

  Adds support for the ratified [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) standard, letting MCP server tools return interactive UI widgets that render in the chat.
  - **`@tanstack/ai`** — MCP tool results that link a `ui://` resource (via `_meta.ui.resourceUri`) now surface as a new `UIResourcePart` on the assistant `UIMessage` (carried as an AG-UI `CUSTOM` event). The widget never enters model input. The `ui://` resource is read eagerly during the run, fail-soft.
  - **`@tanstack/ai-mcp`** — tool discovery now captures `serverId` + the UI resource link; `MCPClient` gains a public `callTool` and `getInfo()` (returns the client's transport descriptor); `MCPClients` gains `getServers()` (returns all pool entries' descriptors). New `@tanstack/ai-mcp/apps` subpath exports `createMcpAppCallHandler` — a server-side tool-call proxy for interactive widgets that takes the MCP client(s)/pool you already created (`clients: MCPClient | MCPClients | Array<MCPClient | MCPClients>`), reads each client's transport descriptor via `MCPClient.getInfo()` / `MCPClients.getServers()` (pure config, no live socket required), and **reconnects per call** (stateless, serverless-safe by default, same-server allowlist). Also exports an in-memory `McpSessionStore` seam for stateful transports.
  - **`@tanstack/ai-client`** — `createMcpAppBridge`, a framework-agnostic bridge routing widget tool-calls to the call handler, follow-up prompts into the chat, and blocking links unless a handler is supplied.
  - **`@tanstack/ai-react` / `@tanstack/ai-preact`** — a `MCPAppResource` component (new `./mcp-apps` subpath) that renders a `UIResourcePart` via `@mcp-ui/client`'s `AppRenderer` (optional peer dependency), wired to the bridge. Plus a `useMcpAppBridge` hook (main entry) that returns a stable `createMcpAppBridge` for a given `threadId`/`callEndpoint` while always calling the latest `sendMessage`/`onLink`.

  Persistence is intentionally out of scope (in-memory seams only); Solid/Vue/Svelte/Angular renderers are deferred (the renderer SDK is currently React-only).

## 0.37.0

### Minor Changes

- [#844](https://github.com/TanStack/ai/pull/844) [`a6cceba`](https://github.com/TanStack/ai/commit/a6cceba4812e7e986183ee856112fcf5f8fa12ff) - Republish all packages with their compiled `dist/` output.

  Releases `0.33.0`–`0.36.0` were published without a `dist/` directory: the
  release workflow relied on an Nx-cached `build` whose outputs were not
  materialized to disk before `changeset publish` packed the tarballs, and
  `files: ["dist"]` silently includes nothing when `dist/` is absent. The
  published packages therefore contained only `src/`, so every export
  (`./dist/esm/*.js`) resolved to a missing file and the packages were
  uninstallable.

  The publish step now runs a fresh, cache-bypassing build of all packages
  immediately before publishing, guaranteeing compiled artifacts are present in
  every tarball.

### Patch Changes

- Updated dependencies [[`a6cceba`](https://github.com/TanStack/ai/commit/a6cceba4812e7e986183ee856112fcf5f8fa12ff)]:
  - @tanstack/ai-event-client@0.6.8
  - @tanstack/ai-utils@0.3.1

## 0.36.0

### Minor Changes

- [#726](https://github.com/TanStack/ai/pull/726) [`fbd3762`](https://github.com/TanStack/ai/commit/fbd37623b287e370aa5678e161dec19cf13ae33b) - Add lazy tool support (progressive disclosure) to Code Mode. Tools marked `lazy: true` are kept out of the `execute_typescript` system prompt and listed in a discoverable catalog; the model fetches their TypeScript signatures on demand via a new `discover_tools` tool. A shared optional `lazyToolsConfig` (`includeDescription: 'none' | 'first-sentence' | 'full'`) tunes the catalog detail for both `chat()` and `createCodeMode()`. `createCodeMode` now also returns `discoveryTool` and a `tools` array (backward compatible — `tool` and `systemPrompt` are unchanged).

### Patch Changes

- Updated dependencies [[`e3ee4ae`](https://github.com/TanStack/ai/commit/e3ee4ae385d124619586f7c6de96b5c7de5954c5)]:
  - @tanstack/ai-event-client@0.6.7

## 0.35.0

### Minor Changes

- [#830](https://github.com/TanStack/ai/pull/830) [`c04abd3`](https://github.com/TanStack/ai/commit/c04abd35284d464d830bb9f15129c7a7c2533d3f) - Move the `RealtimeAdapter` / `RealtimeConnection` contract into `@tanstack/ai` and stop provider adapters from depending on `@tanstack/ai-client`.

  Provider packages (`@tanstack/ai-openai`, `@tanstack/ai-elevenlabs`, `@tanstack/ai-grok`) are usable server-side (text, embeddings, images, transcription, token minting, etc.) and must not pull in the client-only `@tanstack/ai-client`. The only thing their realtime adapters needed from it were the `RealtimeAdapter` / `RealtimeConnection` type shapes.

  Those two interfaces now live in `@tanstack/ai` — the shared layer that both provider packages and `@tanstack/ai-client` already depend on, and where every other realtime type (`RealtimeToken`, `RealtimeEvent`, `RealtimeSessionConfig`, …) already lives. They're exported from `@tanstack/ai` and `@tanstack/ai/client`. `@tanstack/ai-client` re-exports them unchanged, so `import { RealtimeAdapter } from '@tanstack/ai-client'` keeps working.

  As a result `@tanstack/ai-client` is no longer a dependency (peer or otherwise) of any provider package, and the previously-duplicated local contract + drift test in `@tanstack/ai-grok` are removed in favor of the single shared definition. Consumers only need `@tanstack/ai-client` at the point where they actually construct a `RealtimeClient`.

## 0.34.1

### Patch Changes

- [#698](https://github.com/TanStack/ai/pull/698) [`4188693`](https://github.com/TanStack/ai/commit/4188693d09297ce400eb1ba5fab30cfea2fdb8a6) - Fix `MESSAGES_SNAPSHOT` handling so AG-UI snapshot messages are normalized into `UIMessage[]`.

  AG-UI snapshot messages use the wire shape `{ id, role, content }` and have no `parts` array. The handler previously cast them straight to `UIMessage[]`, so any code that later read `message.parts` (e.g. the devtools `onToolCallStateChange` handler) crashed with `TypeError: Cannot read properties of undefined (reading 'find')`.

  Each snapshot message is now converted to a proper `UIMessage` via a type-safe converter that preserves the original AG-UI `id` (so subsequent `TEXT_MESSAGE_CONTENT` / `TOOL_CALL_*` events still route by `messageId`), maps `toolCalls` to `tool-call` parts and `tool` messages to `tool-result` parts, and falls back to a generated id only when the snapshot omits one.

- Updated dependencies [[`2e59b77`](https://github.com/TanStack/ai/commit/2e59b7730ef88a0107e8d7ad916906b070f6a6c0)]:
  - @tanstack/ai-event-client@0.6.6

## 0.34.0

### Minor Changes

- [#732](https://github.com/TanStack/ai/pull/732) [`31de22b`](https://github.com/TanStack/ai/commit/31de22b1ae780c53e3abbf9cf17e1db7b62de84a) - Fix structured output validation rejecting `null` for optional fields, across both stream modes and every adapter.

  Strict-mode structured output widens optional fields to `required` + nullable, so the provider returns `null` for an absent optional. Validating that `null` against the original schema then failed, because `.optional()` means `T | undefined`, not `T | null` — surfacing as a `StandardSchemaValidationError` (e.g. `Invalid type: Expected string but received null`).

  The engine now undoes the widening as a single, schema-aware step the moment the structured output is captured, so the fix applies uniformly:
  - The strict-conversion pass records a `NullWideningMap` marking exactly the positions where it added `null`, so the response can be un-widened precisely — no re-deriving or guessing which nulls were synthetic.
  - `@tanstack/ai-utils` adds `undoNullWidening(value, map)` — a counterpart to `transformNullsToUndefined` that strips only the nulls the widening pass synthesized, preserving the ones a `.nullable()`/`.nullish()` field genuinely allows.
  - The engine applies this via a new `finalStructuredOutput.normalize` hook the instant the result is captured, so **both** the `Promise<T>` result **and** the streaming `structured-output.complete` event carry the un-widened object. Previously only the `Promise<T>` path was corrected, and only for adapters that preserved provider nulls.
  - `@tanstack/openai-base` adapters (and the OpenAI/Grok/Groq adapters built on them) no longer blind-strip every `null` from structured output via `transformStructuredOutput` — that default is now a passthrough. The blind strip masked the validation bug but also destroyed genuine `.nullable()` nulls; precise un-widening in the engine fixes both. The `transformStructuredOutput` hook remains for provider-specific reshaping.

  Adapters that already preserve provider nulls (`@tanstack/ai-openrouter`, Anthropic, Gemini, Ollama) now get correct un-widening on their streaming structured output too, not just `Promise<T>`.

### Patch Changes

- Updated dependencies [[`31de22b`](https://github.com/TanStack/ai/commit/31de22b1ae780c53e3abbf9cf17e1db7b62de84a)]:
  - @tanstack/ai-utils@0.3.0
  - @tanstack/ai-event-client@0.6.5

## 0.33.0

### Minor Changes

- [#760](https://github.com/TanStack/ai/pull/760) [`2cb0313`](https://github.com/TanStack/ai/commit/2cb0313c1f13e1db37c5550308e36bb0b9b73b98) - Add activity-agnostic observability to the media activities through the unified middleware system ([#720](https://github.com/TanStack/ai/issues/720)). `generateImage`, `generateVideo`, `generateAudio`, `generateSpeech`, and `generateTranscription` now accept a `middleware` option taking `GenerationMiddleware`s — the base, activity-agnostic contract whose lifecycle hooks (`onStart` / `onUsage` / `onFinish` / `onAbort` / `onError`) receive a `GenerationMiddlewareContext`. `ChatMiddleware` is a superset of this base, so a single `otelMiddleware()` value satisfies both and can be passed to `chat()` and any media activity alike. Like chat middleware, hooks are awaited in order and propagate exceptions (a throwing hook surfaces, rather than being silently swallowed).

  `otelMiddleware()` (on the existing `@tanstack/ai/middlewares/otel` subpath) now emits one `gen_ai.*` span per media call, tagged with the correct `gen_ai.operation.name` (`image_generation`, `video_generation`, `audio_generation`, `text_to_speech`, `transcription`), reusing the same `gen_ai.usage.*` attribute set as chat — now including `tanstack.ai.usage.units_billed` for unit-billed media. With a `Meter` it records the `gen_ai.client.operation.duration` histogram per activity. An abandoned streaming-video consumer ends the span via `onAbort` (status `ERROR`, `tanstack.ai.completion.reason = cancelled`) instead of leaking it. The `GenerationMiddleware` types are exported from the package root; the `otelMiddleware` value stays on the subpath so importing `@tanstack/ai` never requires the optional `@opentelemetry/api` peer.

### Patch Changes

- [#789](https://github.com/TanStack/ai/pull/789) [`18e5f4d`](https://github.com/TanStack/ai/commit/18e5f4d9746a26c3194929ea4b49673728e8eaa5) - fix: forward token usage on the structured-output fallback path

  `fallbackStructuredOutputStream` — used by `chat({ outputSchema, stream: true })`
  whenever an adapter resolves the schema through the non-streaming
  `structuredOutput()` rather than a native streaming or combined path (in practice
  Ollama, plus Anthropic and Gemini models that predate combined tools+schema
  support) — wrapped `structuredOutput()` but dropped the `usage` from its result.
  Consumers reading `RUN_FINISHED.usage` saw `undefined`, and the engine's
  `runOnUsage` middleware hook (gated on `chunk.usage`) never fired, so
  cost-tracking and observability layers reported zero token counts on that path.

  The synthesized `RUN_FINISHED` now carries the adapter-reported `usage`, matching
  the native streaming path. Adapters that don't report usage are unaffected (no
  `usage` key is emitted).

- [#795](https://github.com/TanStack/ai/pull/795) [`21720dd`](https://github.com/TanStack/ai/commit/21720dd73524d624594a6dfb7e4669c03cc08af0) - fix: don't error when an already-discovered lazy tool's discovery is re-requested

  Lazy tools use progressive disclosure: a synthetic `__lazy__tool__discovery__`
  tool is advertised so the model can reveal a lazy tool's schema on demand. Once
  **every** lazy tool has been discovered, that discovery tool is (intentionally)
  dropped from the set advertised to the model to save tokens. But if the model
  then re-requested discovery anyway — common in long-context or when it overlooks
  that a tool is already available — the call fell through to tool execution and
  came back as `Unknown tool: __lazy__tool__discovery__`.

  The discovery tool is now kept _executable_ for the turn whenever a pending call
  references it, even after it leaves the advertised set, so re-discovery returns
  the schemas again instead of erroring. The advertised set is unchanged. The
  discovery tool is also now idempotent — re-requesting an already-discovered tool
  returns its schema without triggering a redundant tool-list refresh.

  Additionally, `DISCOVERY_TOOL_NAME` is now exported from `@tanstack/ai` so custom
  message-compaction / history-trimming logic can reference the discovery tool by
  constant instead of hard-coding the string.

- [#737](https://github.com/TanStack/ai/pull/737) [`243b8fa`](https://github.com/TanStack/ai/commit/243b8fad7e8a48b68a1a96962ee1443cbd6a0ced) - fix(ai-openrouter): stop forwarding root observability `metadata` to the provider wire request ([#735](https://github.com/TanStack/ai/issues/735))

  The OpenRouter chat-completions adapter (since 0.13.0) and responses adapter (since 0.9.0) copied `chat()`'s root-level observability `metadata` onto the wire as `chatRequest.metadata` / `responsesRequest.metadata`. The `@openrouter/sdk` validates those fields as `Record<string, string>`, so structured observability metadata (objects, arrays — the documented usage for middleware/devtools consumers) failed client-side Zod validation with `Input validation failed` on every call. The spread also clobbered an intentional, correctly-typed `modelOptions.metadata`.

  Root `metadata` is observability-only again (middleware, devtools, event client) and `modelOptions.metadata` is the sole source for OpenRouter wire metadata, matching every other adapter. The `TextOptions.metadata` doc comment in `@tanstack/ai` now states this contract explicitly.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.6.4

## 0.32.0

### Minor Changes

- [#624](https://github.com/TanStack/ai/pull/624) [`8fa6cc5`](https://github.com/TanStack/ai/commit/8fa6cc56c5f36e22885c98a511dcceb2bfc0da1f) - Add a Google Veo video adapter (`geminiVideo` / `createGeminiVideo`) and the
  per-model typed-duration video contract it is built on ([#534](https://github.com/TanStack/ai/issues/534), [#634](https://github.com/TanStack/ai/issues/634)).

  **`@tanstack/ai`** (additive, non-breaking): `VideoAdapter` /
  `BaseVideoAdapter` gain a `TModelDurationByName` generic (defaulting to
  `Record<string, number>`, preserving today's `duration?: number` typing for
  adapters without a map) plus two introspection methods with safe defaults:
  - `availableDurations()` — a `DurationOptions` tagged union
    (`discrete | range | mixed | none`) describing the durations the current
    model accepts. Default: `{ kind: 'none' }`.
  - `snapDuration(seconds)` — coerce raw seconds to the closest valid duration
    (`snapToDurationOption` is exported for adapter authors). Default:
    `undefined`.

  `generateVideo({ duration })` is now typed per model via
  `VideoDurationForAdapter<TAdapter>`.

  **`@tanstack/ai-gemini`**: new Veo adapter over the long-running
  `:predictLongRunning` operation, supporting `veo-3.1-generate-preview`,
  `veo-3.1-fast-generate-preview`, `veo-3.0-generate-001`,
  `veo-3.0-fast-generate-001`, and `veo-2.0-generate-001`:
  - `geminiVideo('veo-3.0-generate-001')` → `duration?: 4 | 6 | 8`
    (Veo 2: `5 | 6 | 8`); `adapter.snapDuration(7)` → `6`.
  - Multimodal prompts: the first un-roled / `'start_frame'` image part
    becomes the input image, `'end_frame'` → `lastFrame`, `'reference'` /
    `'character'` → `referenceImages`.
  - `size` takes Veo aspect ratios (`'16:9' | '9:16'`); everything else from
    the SDK's `GenerateVideosConfig` (e.g. `resolution`, `generateAudio`,
    `negativePrompt`) is available through `modelOptions`.
  - Responsible-AI filtering is surfaced as a failed job with the filter
    reasons.

  Note: Veo result URLs are served by the Gemini Files API and require the
  Google API key to download (`x-goog-api-key` header or `key` query
  parameter).

- [#624](https://github.com/TanStack/ai/pull/624) [`8fa6cc5`](https://github.com/TanStack/ai/commit/8fa6cc56c5f36e22885c98a511dcceb2bfc0da1f) - `generateImage()` and `generateVideo()` now accept a multimodal `prompt`: a plain string, or an ordered array of content parts (`TextPart` / `ImagePart` / `VideoPart` / `AudioPart`) for image-conditioned generation, image-to-image, multi-reference, image-to-video, and edit / inpaint flows. Part order is meaningful — "not like this _(image)_, more like this _(image)_" — and each media part may carry a `metadata.role` hint (`'reference' | 'mask' | 'control' | 'start_frame' | 'end_frame' | 'character'`) that adapters use to route to the provider-specific field, plus an informational `metadata.tag` label for your own bookkeeping. The accepted part types are narrowed per model at compile time via each adapter's input-modality map, so passing an image part to a text-only model is a type error (with a clear runtime throw as backstop).

  Prompt text is always sent **verbatim** — the SDK never injects or rewrites in-prompt referencing markers. To reference inputs from your prompt, write the provider's own convention (fal Kling / Seedance `@Image1`, OpenAI / FLUX.2 `"image 1"` prose, Gemini content descriptions); see the image-generation docs for the per-provider table.

  Provider behavior in this release:
  - **OpenAI image** — Prompts with image parts route `gpt-image-2` / `gpt-image-1` / `gpt-image-1-mini` to `images.edit()` (up to 16 source images plus optional mask); `dall-e-2` routes to `images.edit()` with one source image; `dall-e-3` rejects image parts at compile time and at runtime.
  - **OpenAI video** — Sora-2 / Sora-2-Pro accept a single image part as `input_reference`; passing more than one throws.
  - **Gemini image** — Native models (`gemini-*-flash-image`, "nano-banana") map prompt parts 1:1 onto multimodal `contents`, preserving interleaved order. Imagen is text-only (compile-time + runtime rejection).
  - **fal.ai** — Field names resolve per endpoint from a map generated from the fal SDK's endpoint types (362 endpoints with nonstandard fields, e.g. nano-banana edit → `image_urls`, Kling i2v start frame → `image_url`, Veo first-last-frame → `first_frame_url` / `last_frame_url`). Defaults for endpoints not in the map: single → `image_url`, multiple → `image_urls`; `role: 'mask'` → `mask_url`; `role: 'control'` → `control_image_url`; `role: 'reference'` / `'character'` → `reference_image_urls`; video `role: 'start_frame'` / `'end_frame'` → `start_image_url` / `end_image_url`. Per-model prompt modalities are derived at the type level from the SDK's endpoint input types. Regenerate the map after a fal SDK bump with `pnpm generate:fal-image-fields` (a unit test fails when it goes stale). In `FalImageProviderOptions` / `FalVideoProviderOptions`, media-conditioning fields the mappers can populate (`image_url`, `start_image_url`, `video_url`, `audio_url`, …) are demoted from required to optional — supply them as prompt parts, or keep passing them explicitly via `modelOptions`.
  - **Grok** — New `grok-imagine-image` / `grok-imagine-image-quality` models. Prompts with image parts route to xAI's JSON `/v1/images/edits` endpoint (up to 3 source images, addressed by xAI in request order; the prompt is sent verbatim). `role: 'mask'` / `'control'` throw. Their `size` uses an `aspectRatio_resolution` template (`'16:9_2k'`, suffix optional) mirroring Gemini's native image models. `grok-2-image-1212` remains text-to-image only.
  - **OpenRouter** — Prompt parts map 1:1 onto multimodal `text` / `image_url` chat content parts, preserving interleaved order, and are forwarded to the underlying image model. URL sources pass through verbatim (no fetching or re-encoding in your process); `data` sources become data URIs.
  - **Anthropic** — Unchanged (no image generation API).

  A new `resolveMediaPrompt()` utility (exported from `@tanstack/ai`) is the single downrev point from the canonical interleaved prompt shape to flattened text + per-modality part buckets, for adapter authors.

  On the client side, `ImageGenerateInput.prompt` and `VideoGenerateInput.prompt` (`@tanstack/ai-client`, and the `useGenerateImage` / `useGenerateVideo` hooks built on them) are widened from `string` to the same `MediaPrompt` shape, so prompt parts can be sent from the browser through your server route to `generateImage()` / `generateVideo()`.

  Closes [#618](https://github.com/TanStack/ai/issues/618).

### Patch Changes

- Updated dependencies [[`8fa6cc5`](https://github.com/TanStack/ai/commit/8fa6cc56c5f36e22885c98a511dcceb2bfc0da1f)]:
  - @tanstack/ai-event-client@0.6.3

## 0.31.0

### Minor Changes

- [#763](https://github.com/TanStack/ai/pull/763) [`07aaf8b`](https://github.com/TanStack/ai/commit/07aaf8b9e5a8e699be25f936cc9cd651a46c16c5) - Add a type-safe capability system to chat middleware. `createCapability<T>()('name')` returns a `[get, provide]` accessor tuple that is also its own identity for `requires`/`provides` declarations — no separate token import. The middleware context also exposes `ctx.get(capability)` / `ctx.getOptional(capability)` / `ctx.provide(capability, value)`, typed by the handle you pass. Middleware gain a `setup` provisioning hook (runs first, before `onConfig`) plus `requires`/`provides`/`optionalRequires`. `chat()` validates that every required capability is provided, at compile time (an array coverage check and the new order-aware `createChatMiddleware()` builder) and at runtime (clear errors before the adapter runs). Adapters can now declare `requires`. This is the primitive layer for upcoming persistence and sandbox middleware; no concrete capabilities ship yet.

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-event-client@0.6.2

## 0.30.0

### Minor Changes

- [#747](https://github.com/TanStack/ai/pull/747) [`7103348`](https://github.com/TanStack/ai/commit/71033488212bff05dcccc857e721ab9262ebc2a6) - `otelMiddleware` now emits the rest of the reported `TokenUsage` on spans instead of only input/output tokens ([#721](https://github.com/TanStack/ai/issues/721)). When the provider reports them, spans carry `gen_ai.usage.total_tokens`, `gen_ai.usage.cost` (provider-reported cost — cache discounts and gateway markup included, so backends like PostHog no longer re-derive cost from price tables), the official semconv cache/reasoning breakdowns (`gen_ai.usage.cache_read.input_tokens`, `gen_ai.usage.cache_creation.input_tokens`, `gen_ai.usage.reasoning.output_tokens`), and TanStack-namespaced attributes for duration-based billing (`tanstack.ai.usage.duration_seconds`) and the upstream cost split (`tanstack.ai.usage.upstream_cost` / `upstream_input_cost` / `upstream_output_cost`). All attributes are guarded — spans stay unchanged when a provider doesn't report a field. Media-oriented fields (`unitsBilled`, per-modality token breakdowns) and the provider-shaped `providerUsageDetails` bag are intentionally not emitted; media-activity observability is tracked in [#720](https://github.com/TanStack/ai/issues/720).

### Patch Changes

- [#769](https://github.com/TanStack/ai/pull/769) [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b) - Add repository metadata (`homepage`, `bugs`, `funding`), fix `repository.directory` to point at each package, and include an MIT `LICENSE` file in every published package.

- Updated dependencies [[`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b)]:
  - @tanstack/ai-event-client@0.6.1

## 0.29.0

### Minor Changes

- [#723](https://github.com/TanStack/ai/pull/723) [`22c9b42`](https://github.com/TanStack/ai/commit/22c9b42baec74914b720e440f29bd02be04eb164) - Surface fal's billed units as `result.usage`. The fal adapters now read fal's `x-fal-billable-units` response header off the result fetch and expose the billed quantity (`usage.unitsBilled`) on the generation result, so consumers can compute exact media-generation cost without wrapping `fetch` themselves.
  - `TokenUsage` gains an optional `unitsBilled` field for usage-based (non-token) billing, denominated in the provider's priced unit.
  - `falImage`, `falAudio`, `falVideo`, `falSpeech`, and `falTranscription` populate `result.usage.unitsBilled` when fal reports it.
  - `VideoUrlResult` gains an optional `usage` slot; `getVideoJobStatus` now emits the `video:usage` event and returns `usage` when the completed result reports billed units.

- [#727](https://github.com/TanStack/ai/pull/727) [`7d44569`](https://github.com/TanStack/ai/commit/7d445693ea079d7a85498a4465179ddd5f548cb0) - Add an `'error'` terminal to `ToolCallState`. When a tool execution produces an output error, the StreamProcessor now transitions the `tool-call` part to `state: 'error'` instead of parking it at `'input-complete'`.

  Previously an errored tool call left the tool-call part at `'input-complete'` forever, so UIs that render lifecycle from the part's `state` could not distinguish "still executing" from "failed" without reverse-engineering the error-shaped `output` or the sibling `tool-result` part. The new terminal makes the tool-call state machine self-describing and symmetric with `ToolResultState` (which already has `'error'`):

  ```ts
  if (part.type === 'tool-call' && part.state === 'error') {
    // render failure — no more inferring from output shape
  }
  ```

  The completion safety net (`RUN_FINISHED` / stream finalization) no longer downgrades a failed tool call back to `'input-complete'`, including when an `output-error` result arrives before `TOOL_CALL_END`.

### Patch Changes

- [#696](https://github.com/TanStack/ai/pull/696) [`ff267a5`](https://github.com/TanStack/ai/commit/ff267a5536327b006979f9f28ce2df7cc27f6e23) - Fix duplicate `TOOL_CALL_END` for server-executed tools. The adapter already streams `START`/`ARGS`/`END` for each tool call, but `chat()` emitted a second `END` afterwards with no matching `START` — an orphan event that AG-UI-strict consumers (e.g. `@ag-ui/client`'s `verifyEvents`) reject. The post-execution phase now only adds `TOOL_CALL_RESULT`. Fixes [#519](https://github.com/TanStack/ai/issues/519).

- [#734](https://github.com/TanStack/ai/pull/734) [`570c08a`](https://github.com/TanStack/ai/commit/570c08a8d1a35746c3d31a63188249cba2d2475a) - Fix the default debug logger dropping `meta` payloads on Cloudflare Workers / workerd ([#730](https://github.com/TanStack/ai/issues/730)). `ConsoleLogger` previously rendered `meta` with `console.dir`, which workerd never forwards to the terminal — debug mode printed category headlines but no request bodies, chunk contents, or `RUN_ERROR` payloads. The logger now detects the runtime: Node keeps the depth-unlimited `console.dir` dump, Cloudflare Workers renders `meta` as circular-safe pretty-printed JSON (workerd's own inspect truncates nested objects), and other runtimes (browsers, Deno, Bun) receive `meta` as an extra console argument so devtools keep collapsible trees. Detection checks workerd's `navigator.userAgent` marker before `process.versions.node`, since `nodejs_compat` emulates a Node version string.

- [#699](https://github.com/TanStack/ai/pull/699) [`215b6b4`](https://github.com/TanStack/ai/commit/215b6b401aa95d1d38da342aa09603cb1d616929) - Migrate the OpenAI realtime adapters from the retired Beta API (shut down 2026-05-12) to the GA API:
  - `openaiRealtime()` now exchanges WebRTC SDP via `POST /v1/realtime/calls` (the Beta `?model=` shape returned `beta_api_shape_disabled`).
  - `openaiRealtimeToken()` now mints ephemeral keys via `POST /v1/realtime/client_secrets` instead of the retired `/v1/realtime/sessions`, and parses the GA top-level `value`/`expires_at` response shape.
  - `session.update` payloads use the GA shape: required `session.type`, `audio.input.transcription`, `audio.input.turn_detection`, `audio.output.voice`, `output_modalities`, and `max_output_tokens`. `temperature` was removed from the GA session config and is no longer sent (a debug log notes when it is dropped).
  - Server events are handled under their GA names (`response.output_audio_transcript.*`, `response.output_audio.*`, `output_text`/`output_audio` content parts).
  - The default realtime model is now `gpt-realtime`; the `gpt-4o-(mini-)realtime-preview` ids (shut down by OpenAI on 2026-05-07) were removed from `OpenAIRealtimeModel`.

- Updated dependencies [[`ff267a5`](https://github.com/TanStack/ai/commit/ff267a5536327b006979f9f28ce2df7cc27f6e23), [`22c9b42`](https://github.com/TanStack/ai/commit/22c9b42baec74914b720e440f29bd02be04eb164), [`7d44569`](https://github.com/TanStack/ai/commit/7d445693ea079d7a85498a4465179ddd5f548cb0)]:
  - @tanstack/ai-event-client@0.6.0

## 0.28.0

### Minor Changes

- [#700](https://github.com/TanStack/ai/pull/700) [`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6) - Add an `mcp` option to `chat()` for managing MCP clients directly: `chat({ mcp: { clients, connection, lazyTools, onDiscoveryError } })` discovers the given MCP clients'/pools' tools at run start, merges them into the run, and (by default, `connection: 'close'`) closes them when the run ends — or keeps them warm with `connection: 'keep-alive'`. Also exports `MCPToolSource`, `ChatMCPOptions`, `MCPConnectionPolicy`, and `MCPDuplicateToolNameError` (the error thrown when tools from separate `mcp.clients` entries collide after merging; catchable with `instanceof`).

- [#700](https://github.com/TanStack/ai/pull/700) [`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6) - Add `@tanstack/ai-mcp`: a host-side Model Context Protocol client. Discover and run MCP server tools (and read resources/prompts) inside any adapter's `chat()` loop, with three type-safety modes (auto-discovery, hand-written `toolDefinition()` binding, and generated end-to-end types via `npx @tanstack/ai-mcp generate`). Includes `createMCPClients` for connecting to multiple servers with auto-prefixed tool names. Also exposes `abortSignal` on `ToolExecutionContext` so long-running tools (e.g. MCP `callTool`) cancel with the chat run.

### Patch Changes

- [#408](https://github.com/TanStack/ai/pull/408) [`c0af426`](https://github.com/TanStack/ai/commit/c0af4262d269be67c69d6f878d9618f25fdeee19) - Fix `extendAdapter` dropping required parameters after the model (e.g. `apiKey` in `createAnthropicChat`). All factory parameters after the model are now preserved, including labels and optionality.

- [#395](https://github.com/TanStack/ai/pull/395) [`00e0c93`](https://github.com/TanStack/ai/commit/00e0c932e6cb5e31f75f4b5e94486d7eb02b9ce1) - fix(ai): produce new object references in tool-call message updaters

  `updateToolCallApproval`, `updateToolCallState`, `updateToolCallWithOutput`,
  and `updateToolCallApprovalResponse` previously mutated the found tool-call
  part in-place (`toolCallPart.state = ...`) after spreading the parts array.
  The shallow `[...msg.parts]` copy created a new array but preserved the
  original object references, so frameworks that rely on reference identity
  for change detection (Svelte 5 proxies, Vue 3 reactivity, etc.) could not
  observe the updates.

  Each function now replaces the part at its index with a spread copy
  (`parts[index] = { ...toolCallPart, ...changes }`), producing a fresh
  object on every update. This aligns with the pattern already used by
  `updateToolCallPart`, `updateTextPart`, and `updateThinkingPart`.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.5.4

## 0.27.0

### Minor Changes

- [#660](https://github.com/TanStack/ai/pull/660) [`6df32b5`](https://github.com/TanStack/ai/commit/6df32b53026673d159e6df0892ce89effcb5c7b8) - **BREAKING:** Sampling options (`temperature`, `topP`, `maxTokens`) have moved off the root of `chat()` / `ai()` / `generate()` and into provider-native `modelOptions`. There is no longer a generic root-level sampling surface — each provider accepts its own native keys, fully typed per model:
  - OpenAI (Responses): `modelOptions: { temperature, top_p, max_output_tokens }`
  - Anthropic: `modelOptions: { temperature, top_p, max_tokens }`
  - Gemini: `modelOptions: { temperature, topP, maxOutputTokens }`
  - Grok: `modelOptions: { temperature, top_p, max_tokens }`
  - Groq: `modelOptions: { temperature, top_p, max_completion_tokens }`
  - Ollama: `modelOptions: { options: { temperature, top_p, num_predict } }` (nested)
  - OpenRouter (chat): `modelOptions: { temperature, topP, maxCompletionTokens }`

  Middleware no longer sees `temperature`/`topP`/`maxTokens` as first-class fields on `ChatMiddlewareConfig`; mutate `config.modelOptions` (with the provider-native keys above) instead. `metadata` is unaffected and stays at the root.

  The public `OllamaTextProviderOptions` type export has also been removed from `@tanstack/ai-ollama`. `modelOptions` is now typed per model — use the exported `OllamaChatModelOptionsByName` map (indexed by model name) or the underlying `ChatRequest` from the `ollama` SDK for arbitrary model strings.

  Migrate automatically with the codemod, which resolves the provider from the adapter and rewrites the keys for you:

  ```bash
  pnpm codemod:move-sampling-to-model-options "src/**/*.{ts,tsx}"
  ```

  See the [Sampling Options migration guide](https://tanstack.com/ai/latest/docs/migration/sampling-options-to-model-options) for details.

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-event-client@0.5.3

## 0.26.1

### Patch Changes

- Updated dependencies [[`7adff0f`](https://github.com/TanStack/ai/commit/7adff0f192e50c081b569ffb80bf65df2a404a1f)]:
  - @tanstack/ai-event-client@0.5.2

## 0.26.0

### Minor Changes

- [#676](https://github.com/TanStack/ai/pull/676) [`5d6cd28`](https://github.com/TanStack/ai/commit/5d6cd2834ba7ac1d7c7c1bd24ede202bf3e78010) - `createModel` now accepts a capabilities object — `createModel(name, { input, features, tools, modelOptions })` — in addition to the existing `createModel(name, input)` form. `ExtendedModelDef` gains optional `features` and `tools` fields.

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-event-client@0.5.1

## 0.25.0

### Minor Changes

- [#242](https://github.com/TanStack/ai/pull/242) [`c251038`](https://github.com/TanStack/ai/commit/c251038c6d8aa84e498f89e314ce5bb233bc689f) - Enhanced token usage reporting for every provider.

  `TokenUsage` is now the single canonical run-usage type. It is defined once in
  `@tanstack/ai-event-client` (the dependency-free leaf package) and re-exported by
  `@tanstack/ai`, so the two packages can no longer drift. It carries optional
  detailed breakdowns alongside the core token counts: `promptTokensDetails` /
  `completionTokensDetails` (cached, reasoning, audio, and per-modality tokens),
  `durationSeconds` for duration-billed models (e.g. Whisper transcription),
  `providerUsageDetails` for provider-specific metrics, and `cost` / `costDetails`
  for provider-reported cost — so a single `usage` shape covers counts, detailed
  breakdowns, and cost.

  `TokenUsage` is generic over its provider details bag —
  `TokenUsage<TProviderDetails = ProviderUsageDetails>` — so adapters return a
  strongly-typed `providerUsageDetails` (e.g. `TokenUsage<AnthropicProviderUsageDetails>`)
  while generic consumers keep the open-record default. The default,
  `ProviderUsageDetails` (`Record<string, NonNullable<unknown>>`), is now exported and
  uses non-nullish values rather than `unknown` so `TokenUsage` stays assignable across
  JSON-serialization boundaries (e.g. TanStack Start server-fn return types). Each
  provider's usage
  extractor now returns `undefined` (rather than fabricating zeroed totals) when
  the provider reports no usage object, so an absent `usage` is distinguishable
  from a genuine zero-token run.

  `@tanstack/ai` still exports `UsageTotals` as a `@deprecated` alias of
  `TokenUsage` for backward compatibility; it will be removed in a future release.

  Detailed usage is extracted in one place per SDK surface: OpenAI-compatible
  providers (OpenAI, Grok, Groq) share the extractors in `@tanstack/openai-base`,
  while Anthropic, Gemini, Ollama, and OpenRouter normalize their own provider
  usage. The devtools surface cached and reasoning token badges per iteration.

  Usage is now unified across **every modality**, not just text/chat. Image, audio,
  and text-to-speech results report the same canonical `TokenUsage` (with
  per-modality breakdowns) instead of a minimal `inputTokens`/`outputTokens` shape:
  - `ImageGenerationResult.usage`, `AudioGenerationResult.usage`, and the new
    `TTSResult.usage` are now typed as `TokenUsage`. **Breaking:** consumers of
    these fields should read `promptTokens`/`completionTokens` instead of
    `inputTokens`/`outputTokens`. `@tanstack/ai-event-client`'s `ImageUsage` is now
    a `@deprecated` alias of `TokenUsage`.
  - OpenAI/Grok image generation surface the text-vs-image input token breakdown
    (`promptTokensDetails`), Gemini image/audio/TTS now surface their full
    `usageMetadata` (previously dropped), and OpenRouter image generation surfaces
    the chat usage it already returns.
  - Bug fixes: Ollama no longer produces `NaN` totals or discards duration-only
    usage; Anthropic defaults missing `output_tokens` and no longer emits empty
    `promptTokensDetails`/`providerUsageDetails` objects; OpenAI GPT-4o
    transcription reads the real audio/text input token breakdown and never falls
    back to duration billing.

  Cross-adapter usage parity fixes:
  - `PromptTokensDetails`/`CompletionTokensDetails` gain a `documentTokens` field,
    and Gemini now surfaces `DOCUMENT` modality token counts (e.g. PDF inputs)
    instead of silently dropping them.
  - OpenAI-compatible chat (OpenAI/Grok/Groq via `@tanstack/openai-base`) now
    surfaces Predicted-Outputs `acceptedPredictionTokens`/`rejectedPredictionTokens`
    under `providerUsageDetails`, matching the OpenRouter adapter (rejected
    prediction tokens are billed).
  - Grok transcription (`/v1/stt`) now reports `durationSeconds`, mirroring the
    Whisper-1 path in the OpenAI transcription adapter.

### Patch Changes

- Updated dependencies [[`c251038`](https://github.com/TanStack/ai/commit/c251038c6d8aa84e498f89e314ce5bb233bc689f)]:
  - @tanstack/ai-event-client@0.5.0

## 0.24.0

### Minor Changes

- [#666](https://github.com/TanStack/ai/pull/666) [`c1ae8b9`](https://github.com/TanStack/ai/commit/c1ae8b94c83d70508975568eb4fc9b45f1af540b) - feat: support multimodal (image) tool results

  Tools may now return an `Array<ContentPart>` (e.g. a text part plus an image part) and have it transmitted to the model as structured multimodal tool output instead of a `JSON.stringify`'d blob. This unblocks use cases like returning a screenshot from a tool so the model can see it (issue [#363](https://github.com/TanStack/ai/issues/363)).
  - Detection is structural and opt-in by shape: a tool that returns a non-empty array whose every element is a valid `ContentPart` is passed through unchanged; strings and all other return values are serialized exactly as before, so there are no breaking changes.
  - The OpenAI Responses, Anthropic, and Google Gemini adapters convert the content parts into their native multimodal tool-output formats (`function_call_output.output`, `tool_result` content blocks, and `functionResponse.parts` respectively). Providers on the Chat Completions path (Groq, Ollama, Grok, OpenRouter chat) fall back to stringifying, which their APIs require.
  - AG-UI stream events (`TOOL_CALL_RESULT.content`, `TOOL_CALL_END.result`) remain string-only per the spec; the multimodal array travels on the tool message itself.

- [#673](https://github.com/TanStack/ai/pull/673) [`a452ae8`](https://github.com/TanStack/ai/commit/a452ae8bcda8abfdc6309983976ed0fbf6df1915) - Populate AG-UI `rawEvent` on `RUN_ERROR` events with the provider's structured error body.

  Previously, when a streaming chat call failed the `RUN_ERROR` event carried only an
  opaque `{ message, code }` headline (e.g. `"Provider returned error"`), and no adapter
  populated AG-UI's purpose-built `rawEvent` field — so the upstream provider detail was
  unrecoverable.

  Adapters now forward the provider's **structured error body** (e.g. an SDK `APIError`'s
  parsed `.error` response body, or OpenRouter's mid-stream `chunk.error`) as `rawEvent`
  on the `RUN_ERROR` event. The new `toRunErrorRawEvent` helper extracts only known
  provider-body fields — never the raw SDK exception object, which can carry request
  metadata such as auth headers. The `{ message, code }` contract of `toRunErrorPayload`
  is unchanged.

  The error surfaced to consumers via the `ChatClient` / `useChat` `error` (and the
  `onError` callback) now also carries `code` and `rawEvent` when present, so the upstream
  cause is recoverable in application code.

  > Note: the OpenRouter SDK parses each in-band stream chunk's `error` through a strict
  > schema (`{ code, message }`), so provider `metadata` survives only on pre-stream HTTP
  > errors (rate-limit / overload / BYOK rejection), whose typed error class exposes the
  > full body via `.error`.

- [#628](https://github.com/TanStack/ai/pull/628) [`8036b50`](https://github.com/TanStack/ai/commit/8036b5054330a180023c6e3225b8d2735a43a919) - Add typed runtime context for tools and middleware.

  Tools and middleware can now declare the runtime context shape they require, and
  `chat()`, `ChatClient`, and the framework `useChat` / `createChat` hooks infer
  the merged requirement and type-check the `context` option you pass against it.

  ```typescript
  type AppContext = { userId: string; db: Db }

  const listNotes = toolDefinition({
    name: 'list_notes' /* ... */,
  }).server<AppContext>((_input, ctx) =>
    ctx.context.db.notes.findMany({ userId: ctx.context.userId }),
  )

  chat({
    adapter,
    messages,
    tools: [listNotes],
    context: { userId, db }, // required and type-checked because listNotes declares AppContext
  })
  ```

  Runtime context is request-local application state for tool and middleware
  implementations (authenticated users, database clients, tenancy, feature flags,
  loggers, browser services). It is never sent to the model and is distinct from
  the AG-UI `RunAgentInput.context` protocol field.

  Untyped tools and middleware continue to receive `unknown` context and do not
  force a `context` option. Client tools receive client-local context via
  `ChatClient` / `useChat`; use `forwardedProps` to hand serializable client data
  to the server and map it into server context explicitly. See the new Runtime
  Context guide for details.

  Behavior change: tool output validation now also runs when a tool returns
  `undefined` or `null`. Previously these values bypassed `outputSchema`
  validation entirely; now the schema decides whether they are valid, so a tool
  whose schema forbids `undefined`/`null` surfaces a validation error
  (`output-error`) instead of silently passing. Tools whose schema permits
  `null`/`undefined` (e.g. nullable or void outputs) are unaffected.

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-event-client@0.4.3

## 0.23.1

### Patch Changes

- [#662](https://github.com/TanStack/ai/pull/662) [`94bb9c0`](https://github.com/TanStack/ai/commit/94bb9c0f3a3e56a0c6c8b7c78f44ae41288aecc3) - Fix `convertSchemaToJsonSchema` (and tool input/output validation) for ArkType schemas. ArkType's `type()` returns a callable function with `~standard` attached, but the Standard Schema detection guards required `typeof schema === 'object'`, so ArkType schemas were never recognized and the raw validator function was passed through instead of a JSON Schema object. The guards now also accept callable schemas. ([#276](https://github.com/TanStack/ai/issues/276))

- Updated dependencies []:
  - @tanstack/ai-event-client@0.4.2

## 0.23.0

### Minor Changes

- [#654](https://github.com/TanStack/ai/pull/654) [`980ff9b`](https://github.com/TanStack/ai/commit/980ff9ba925f5dbae62a9318cc1e787d0ae24314) - Surface OpenRouter's per-request cost on `RUN_FINISHED.usage`.

  OpenRouter reports the actual cost of each request inline on the chat response.
  The `openRouterText` and `openRouterResponsesText` adapters now forward that
  value on the terminal `RUN_FINISHED` event as `usage.cost`, with OpenRouter's
  per-request breakdown under `usage.costDetails`. This is the cost OpenRouter
  itself reports — it is not computed locally from token counts, so it accounts
  for routing, fallback providers, BYOK, and cached-token pricing.

  `@tanstack/ai` adds a shared `UsageTotals` type with optional `cost` and
  `costDetails` fields, plus a provider-neutral `UsageCostBreakdown` interface
  with three canonical fields (`upstreamCost`, `upstreamInputCost`,
  `upstreamOutputCost`). Each adapter's extractor normalizes its provider's
  wire-shape onto this canonical form, so consumer code reads the same fields
  regardless of which gateway populated them — swapping adapters is a one-line
  change with no consumer rewrites. The OpenRouter adapter collapses its two
  endpoint naming styles (Chat Completions' `prompt`/`completions` and
  Responses' `input`/`output`) onto the same canonical input/output split, since
  they bill against the same tokens. `RunFinishedEvent.usage`, the middleware
  `UsageInfo` (`onUsage`), and `FinishInfo.usage` (`onFinish`) all use
  `UsageTotals`. The fields are optional and additive — adapters that do not
  report cost are unaffected.

- [#647](https://github.com/TanStack/ai/pull/647) [`d5645cf`](https://github.com/TanStack/ai/commit/d5645cfd4d1b9cfc877f7d4d714517e166a99ce3) - Add React Native support for chat clients and framework hooks, including
  client-safe streaming utilities and connection adapters that work in mobile
  environments.

  The `fetcher` option is now available on `ChatClient` and the framework chat
  hooks (`useChat` / `createChat`), mirroring the generation hooks. Pass either
  `connection` or `fetcher` -- the XOR is enforced at the type level via
  `ChatTransport`. Fetchers may return either a `Response` (parsed as SSE) or an
  `AsyncIterable<StreamChunk>` (yielded directly).

  The client-safe `@tanstack/ai/client` subpath is now public for framework
  packages and mobile bundles. `stream()`, `fetchServerSentEvents`,
  `fetchHttpStream`, `rpcStream`, `xhrServerSentEvents`, and `xhrHttpStream` are
  available from the client package and framework re-exports. React Native docs,
  an Expo chat example, and smoke tests are included for the supported mobile
  setup.

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-event-client@0.4.1

## 0.22.1

### Patch Changes

- Updated dependencies [[`5634f18`](https://github.com/TanStack/ai/commit/5634f186a4946ca3e1942fbfcbf1291ec9bd9855)]:
  - @tanstack/ai-event-client@0.4.0

## 0.22.0

### Minor Changes

- Route `chat({ outputSchema, tools })` through the provider's native single-pass call where supported (modern OpenAI Chat Completions + Responses, Claude 4.5+, Gemini 3.x, Grok 4.x family). Closes #605. ([#609](https://github.com/TanStack/ai/pull/609))

  Historically, `chat({ outputSchema, tools })` ran the agent loop with `tools` and then issued a separate finalization call against the structured-output adapter for the typed answer — because most providers couldn't combine `tools` with a schema-constrained response in one call. That has changed for most modern providers, making the second round-trip pure overhead.

  **New per-adapter capability:** `TextAdapter.supportsCombinedToolsAndSchema?(modelOptions?)`. Adapters that opt in receive a JSON Schema on `TextOptions.outputSchema` in `chatStream` and wire it into the upstream request alongside `tools`. The engine harvests the final-turn JSON from the agent loop's accumulated text — no separate finalization call, no `'structuredOutput'` middleware phase.

  **Per-adapter status:**
  - **OpenAI (Chat Completions + Responses):** opted in for all models. `response_format: json_schema` / `text.format: json_schema` attached when `outputSchema` is set.
  - **Anthropic:** opted in for Claude 4.5+ (Opus / Sonnet / Haiku 4.5, 4.6, 4.7). Wires `output_config.format` on the beta Messages request. Pre-4.5 Claude models keep the forced-tool finalization workaround. Gated by exported `ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS`.
  - **Gemini:** opted in for Gemini 3.x (3-pro, 3-flash, 3.1-pro-preview, 3.1-flash-lite). Wires `responseSchema` + `responseMimeType: 'application/json'` into the regular `generateContentStream` call. Gemini 2.x keeps the legacy path. Gated by exported `GEMINI_COMBINED_TOOLS_AND_SCHEMA_MODELS`.
  - **Grok (xAI):** opted in for the Grok 4 family (`grok-4`, `grok-4-1-fast-*`, `grok-4-fast-*`, `grok-4-20*`, `grok-4-3`, `grok-code-fast-1`). Inherits the OpenAI Chat Completions wiring from `openai-base`; the override gates the capability claim by model. Grok 2 / 3 keep the legacy path. Gated by exported `GROK_COMBINED_TOOLS_AND_SCHEMA_MODELS`.
  - **Groq:** explicitly opts out — the Groq API rejects `response_format` + `tools` + `stream` with HTTP 400 ("Streaming and tool use are not currently supported with Structured Outputs").
  - **OpenRouter, Ollama:** unchanged; still take the legacy finalization path. OpenRouter's per-request capability lookup (depends on resolved upstream model) is tracked as a follow-up.

  **Backward compatibility:**
  - `'structuredOutput'` middleware phase still fires for fallback-path adapters. It does NOT fire for adapters that handle the combination natively — middleware sees the run through `'beforeModel'` / `'modelStream'` as usual.
  - `onStructuredOutputConfig` keeps its existing surface but only fires on the fallback path.
  - No call-site changes required.

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-event-client@0.3.11

## 0.21.3

### Patch Changes

- Populate server-executed tool results on the matching `tool-call` part and mark successful tool calls as `complete`. ([#596](https://github.com/TanStack/ai/pull/596))

- Updated dependencies [[`e144a53`](https://github.com/TanStack/ai/commit/e144a53e4348bb0bc365dbe342c8538544242227)]:
  - @tanstack/ai-event-client@0.3.10

## 0.21.2

### Patch Changes

- Refresh package README content and npm metadata for better discoverability. ([#626](https://github.com/TanStack/ai/pull/626))

- Updated dependencies [[`ebeb22e`](https://github.com/TanStack/ai/commit/ebeb22ec68f456b09e0181ac6f5d1ac25a0affd2)]:
  - @tanstack/ai-event-client@0.3.9

## 0.21.1

### Patch Changes

- Move `@standard-schema/spec` from `devDependencies` to `dependencies`. Closes #602. ([#615](https://github.com/TanStack/ai/pull/615))

  The package's published `.d.ts` files (`types.d.ts`, `activities/chat/tools/tool-definition.d.ts`, `activities/chat/tools/schema-converter.d.ts`) import types from `@standard-schema/spec`, so consumers need it installed for type resolution to succeed. With `skipLibCheck: true`, `tsc` silently ignored the unresolved module, but type-aware tools like `@typescript-eslint` (with `recommendedTypeChecked` / `projectService: true`) failed to resolve return types — surfacing as `Unsafe assignment of an error typed value` on `useChat()` destructuring and cascading errors through downstream usages.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.3.8

## 0.21.0

### Minor Changes

- Middleware now wraps the final structured-output provider call in `chat({ outputSchema })` (both Promise<T> and streaming variants). Closes #390. ([#600](https://github.com/TanStack/ai/pull/600))

  **New public surface:**
  - `ChatMiddlewarePhase` gains a `'structuredOutput'` value, set on `ChatMiddlewareContext` for the duration of the final structured-output adapter call.
  - New optional `ChatMiddleware.onStructuredOutputConfig` hook receives a `StructuredOutputMiddlewareConfig` (including the JSON Schema being sent to the provider) and can return a partial to transform the config before the final call.
  - New exported type `StructuredOutputMiddlewareConfig` extends `ChatMiddlewareConfig` with `outputSchema: JSONSchema`.

  **Behavior change for existing middleware:**
  - `onChunk` now observes chunks from the final structured-output call. Phase-aware middleware can branch on `ctx.phase === 'structuredOutput'` to opt out: `if (ctx.phase === 'structuredOutput') return`.
  - `onFinish` fires once at the end of the whole `chat()` invocation, after finalization completes — not after the agent loop.
  - `onFinish.info` reflects the agent loop's terminal state only. `info.usage` / `info.finishReason` / `info.content` do not include the final structured-output adapter call. To observe finalization tokens, use `onUsage` (fires for both agent-loop and finalization `RUN_FINISHED` events).

  **Internal cleanup:**
  - The previous `RUN_STARTED`/`RUN_FINISHED` suppression hack in `runStreamingStructuredOutput` was relocated into the engine (`streamModelResponse`) and gated on `finalStructuredOutput.yieldChunks`. The streaming consumer still sees exactly one outer pair around the whole run.

### Patch Changes

- Adopt `@tanstack/eslint-config@0.4.0` and clean up the local override layer. ([#607](https://github.com/TanStack/ai/pull/607))
  - Bump `@tanstack/eslint-config` from `0.3.3` to `0.4.0`.
  - Drop dead `pnpm/enforce-catalog` and `pnpm/json-enforce-catalog` disables (upstream removed `eslint-plugin-pnpm` in `0.3.1`).
  - Drop the `no-case-declarations: off` override — no current source actually violates it.
  - Drop the `no-shadow: off` override — upstream sets it to `warn`, so it surfaces in editors without blocking CI.
  - Remove ~25 unnecessary type assertions across the publishable packages that the upgraded `typescript-eslint` now catches via `no-unnecessary-type-assertion`. One deliberately defensive cast in `ag-ui-wire.ts` is preserved with an inline opt-out and a reason comment.

  No public-API or runtime-behavior changes.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.3.7

## 0.20.1

### Patch Changes

- Tighten TypeScript safety: enable `noImplicitOverride`, ([#579](https://github.com/TanStack/ai/pull/579))
  `noFallthroughCasesInSwitch`, and `useDefineForClassFields` in the
  root `tsconfig.json`; add a typed-ESLint block scoped to
  `packages/*/src/**` that turns on `no-floating-promises`,
  `no-misused-promises`, `await-thenable`,
  `switch-exhaustiveness-check`, `consistent-type-exports`,
  `prefer-readonly`, and `no-non-null-assertion` (errors), plus
  `no-explicit-any` (warning). `@ts-ignore` and `@ts-nocheck` are
  disallowed in library source via `@typescript-eslint/ban-ts-comment`,
  and `as unknown as <T>` double-casts are blocked by a
  `no-restricted-syntax` rule (escape hatches available with an inline
  reason). Two flags from the original five-flag set —
  `noPropertyAccessFromIndexSignature` and `exactOptionalPropertyTypes`
  — were tried and rolled back: they produced ~500 lines of bracket-
  access and conditional-spread churn without catching any real bugs,
  and `exactOptionalPropertyTypes` would have forced consumers using
  it themselves to deal with our internals' style preferences.

  User-visible API surface is unchanged; this is a hardening pass to
  keep streaming/agent-loop correctness and discriminated-union
  exhaustiveness honest going forward. See issue #564.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.3.6

## 0.20.0

### Minor Changes

- feat(ai): `systemPrompts` accept `{ content, metadata }` with adapter-inferred metadata typing ([#575](https://github.com/TanStack/ai/pull/575))

  `chat({ systemPrompts })` now accepts either a plain string (the existing
  shape — fully backward compatible) or `{ content, metadata }`. The `metadata`
  field's type is inferred from the adapter via a new
  `TSystemPromptMetadata` generic on `TextAdapter` / `BaseTextAdapter`:
  - `@tanstack/ai-anthropic` declares `AnthropicSystemPromptMetadata` →
    users get `cache_control` autocomplete and type-checking on
    `systemPrompts[i].metadata` for Anthropic chats.
  - Adapters with no per-prompt metadata (OpenAI, Gemini, Ollama,
    OpenRouter, openai-base) inherit the default `never`, which means the
    `metadata` field carries no meaningful value at the call site —
    TypeScript only accepts `undefined` there. Provider-foreign metadata
    that reaches an adapter via JS / `as any` is silently dropped, never
    written to the wire.

  ```ts
  import { chat } from '@tanstack/ai'
  import { anthropicText } from '@tanstack/ai-anthropic'

  // Anthropic — `cache_control` is autocompleted, no `satisfies` needed.
  chat({
    adapter: anthropicText({ apiKey }, 'claude-sonnet-4-6'),
    systemPrompts: [
      {
        content: 'Stable instructions — cache me.',
        metadata: { cache_control: { type: 'ephemeral' } },
      },
      'Volatile per-request instruction.',
    ],
  })

  // OpenAI — `metadata` is `never`; only `undefined` is assignable, so the
  // field is effectively unusable. The object form without `metadata` still
  // works for portability.
  chat({
    adapter: openaiText({ apiKey }, 'gpt-4o-mini'),
    systemPrompts: [
      'Plain string.',
      { content: 'Object form without metadata is allowed.' },
    ],
  })
  ```

  New exports:
  - `@tanstack/ai`: `SystemPrompt`, `NormalizedSystemPrompt` types and the
    `normalizeSystemPrompts()` helper adapters use to normalize the wide
    input shape to `{ content, metadata? }` before consumption.
  - `@tanstack/ai-anthropic`: `AnthropicSystemPromptMetadata` interface
    (currently exposes `cache_control` for prompt caching).

  Internal:
  - New `TSystemPromptMetadata = never` generic on `TextAdapter` /
    `BaseTextAdapter`, surfaced via `'~types'['systemPromptMetadata']`
    for inference at the `chat()` call site.
  - Anthropic adapter reads `metadata.cache_control` and attaches it to
    the corresponding `TextBlockParam`.
  - All other text adapters call `normalizeSystemPrompts()` and join
    `.content` for their respective `instructions` / `system` /
    `systemInstruction` fields. Foreign metadata that reaches them via JS
    / `as any` is dropped (never written to the wire).
  - `normalizeSystemPrompts()` is the public API boundary and throws
    `TypeError` (naming the offending index) for object-form entries whose
    `content` isn't a string — preventing literal `"undefined"` from
    reaching the model on stale call sites.
  - OpenTelemetry middleware attaches per-prompt metadata as the
    `tanstack.ai.system_prompt.metadata` JSON span attribute when
    `captureContent: true` and at least one entry carries metadata, so
    observability backends can distinguish cache hit/miss for Anthropic.
  - `@tanstack/ai-event-client` mirrors the `SystemPrompt` shape locally
    (avoids a circular import) and projects metadata away on the devtools
    wire — devtools UI still receives `Array<string>`.

### Patch Changes

- Updated dependencies [[`496db9c`](https://github.com/TanStack/ai/commit/496db9c42a7d3051a1295091eae29ae1c31ef997)]:
  - @tanstack/ai-event-client@0.3.5

## 0.19.1

### Patch Changes

- fix(ai): restore `StructuredOutputStream` assignability to `AsyncIterable<StreamChunk>` so it can be passed to `toServerSentEventsResponse` ([#587](https://github.com/TanStack/ai/pull/587))

  `StructuredOutputStartEvent`, `StructuredOutputCompleteEvent`, `ApprovalRequestedEvent`, and `ToolInputAvailableEvent` declared their shape with `extends Omit<CustomEvent, 'name' | 'value'>`. Because `CustomEvent` is inferred from a zod `passthrough` schema, it carries a `[k: string]: unknown` index signature, and `Omit` on a type with a `string` index signature collapses every surviving property to `unknown` — including `type: 'CUSTOM'`. That broke union assignability against `AGUIEvent`/`StreamChunk`, so `toServerSentEventsResponse(stream)` failed to typecheck against streams returned by `chat({ outputSchema, stream: true })`.

  Switched to `extends CustomEvent` with refined `name`/`value` (allowed: narrower types of declared properties), which keeps `type: 'CUSTOM'` intact and preserves the existing discriminated-narrowing patterns.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.3.4

## 0.19.0

### Minor Changes

- feat: structured-output as a typed MessagePart on each assistant UIMessage ([#577](https://github.com/TanStack/ai/pull/577))

  `useChat({ outputSchema })` (React, Vue, Solid) and `createChat({ outputSchema })` (Svelte) previously kept a single hook-level `partial`/`final` slot, so multi-turn structured chats lost every prior turn's response as soon as a new one streamed in. Each assistant turn now carries its own typed `structured-output` MessagePart on the UIMessage it belongs to. History walks `messages` and finds the typed part on each turn; the hook-level `partial` and `final` are derived from the latest assistant message's part and continue to work as before. Applies to all four framework hook packages.

  The structured-output part type is generic over the schema's inferred data type:
  - `StructuredOutputPart<TData = unknown>` in `@tanstack/ai` carries `data: TData`, `partial: DeepPartial<TData>`, `raw: string`, plus `status: 'streaming' | 'complete' | 'error'` and an optional `errorMessage`.
  - `MessagePart<TTools, TData>` and `UIMessage<TTools, TData>` in `@tanstack/ai-client` thread the generic through the message types.
  - Each framework hook's return (`UseChatReturn<TTools, TSchema>` for React / Vue / Solid, `CreateChatReturn<TTools, TSchema>` for Svelte) substitutes `TData = InferSchemaType<TSchema>` when a schema is supplied, so `messages[i].parts.find(p => p.type === 'structured-output').data` is typed by the schema with no cast required.

  Default `TData = unknown` keeps every existing consumer that doesn't pass a schema source-compatible.

  Server-side `chat({ outputSchema, stream: true })` emits a new `structured-output.start` CUSTOM event before the JSON deltas so the client processor can route them into the StructuredOutputPart instead of building a TextPart. The wire converter serializes the part's raw JSON back as assistant content, so multi-turn structured chats stay coherent (the LLM sees its own prior structured responses on follow-up turns). For adapters without native JSON-schema streaming (Anthropic, Gemini, Ollama), the existing fallback path emits one terminal `structured-output.complete` event and the same per-turn typed part lands on the message — consumer code is identical.

  A new example route demonstrating the multi-turn pattern is at `/generations/structured-chat` in the `ts-react-chat` example.

  **Breaking-shape note (minor, not major):** When `outputSchema` is set, `TEXT_MESSAGE_CONTENT` deltas no longer create a `TextPart` on the assistant message — they accumulate into the `StructuredOutputPart`. Consumers that iterated `message.parts` and explicitly filtered out `TextPart`s to hide raw JSON (the workaround documented prior to this change) can remove that filter; doing nothing is also safe because no `TextPart` is produced in the first place.

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-event-client@0.3.3

## 0.18.0

### Minor Changes

- **Breaking:** AG-UI client-to-server compliance. ([#511](https://github.com/TanStack/ai/pull/511))

  `@tanstack/ai-client` now POSTs an AG-UI `RunAgentInput` request body and `@tanstack/ai` server endpoints must use the new `chatParamsFromRequestBody` + `mergeAgentTools` helpers. Upgrade both packages together.

  Highlights:
  - **Wire format**: `{threadId, runId, state, messages, tools, context, forwardedProps}` (per AG-UI 0.0.52 `RunAgentInputSchema`) instead of `{messages, data}`.
  - **New server helpers** exported from `@tanstack/ai`: `chatParamsFromRequestBody`, `mergeAgentTools`.
  - **`chat()` accepts `threadId`, `runId`, `parentRunId`** as optional fields for AG-UI run correlation.
  - **`ChatClient` accepts `threadId`** option; auto-generates and persists per session if omitted; fresh `runId` per send.
  - **Client tools auto-advertised** to the server via `RunAgentInput.tools`.
  - **Foreign AG-UI clients** can hit a TanStack server: `developer` collapses to `system`, `reasoning`/`activity` drop.

  See `docs/migration/ag-ui-compliance.md` for full migration steps.

### Patch Changes

- fix(ai): infer Zod-typed `outputSchema` instead of collapsing to `unknown` ([#563](https://github.com/TanStack/ai/pull/563))

  `chat({ outputSchema: zodSchema })` previously returned `Promise<unknown>` (and
  `StructuredOutputCompleteEvent<T>` resolved with `T = unknown`) because
  `InferSchemaType` only matched `StandardJSONSchemaV1`. Zod's core `$ZodType`
  declares `~standard` as `StandardSchemaV1.Props` — without a type-level
  `jsonSchema` converter — so Zod schemas (and any other library that exposes
  only the Standard Schema validator surface to the type checker) fell through
  to `unknown`, forcing callers to either cast or run a redundant `schema.parse()`.

  `SchemaInput` now also accepts `StandardSchemaV1<any, any>`, and
  `InferSchemaType` recovers the input type from that branch when the
  JSON-schema branch doesn't match. The runtime path is unchanged for Zod /
  ArkType / Valibot (`convertSchemaToJsonSchema` still detects the runtime
  `~standard.jsonSchema` converter); only the static types are widened.

  `convertSchemaToJsonSchema` now throws an actionable error when given a
  Standard Schema validator that lacks a JSON-schema converter, instead of
  silently shipping the raw `{ '~standard': ... }` object to the LLM provider.

  Closes #562

- Updated dependencies []:
  - @tanstack/ai-event-client@0.3.2

## 0.17.0

### Minor Changes

- Streaming structured output across the OpenAI-compatible providers, an OpenAI Chat Completions sibling adapter, a summarize-subsystem unification, and the decoupling of `@tanstack/ai-openrouter` from the shared OpenAI base. ([#527](https://github.com/TanStack/ai/pull/527))

  ## Core — `@tanstack/ai`
  - New `chat({ outputSchema, stream: true })` overload returning `StructuredOutputStream<InferSchemaType<TSchema>>`. The stream yields raw JSON deltas via `TEXT_MESSAGE_CONTENT` plus a terminal `CUSTOM` `structured-output.complete` event whose `value.object` is typed against the caller's schema with no helper or cast required.
  - `StructuredOutputStream<T>` is a discriminated union over three tagged `CUSTOM` variants — `structured-output.complete<T>`, `approval-requested`, and `tool-input-available` (new `ApprovalRequestedEvent` / `ToolInputAvailableEvent` interfaces exported from `@tanstack/ai`). Narrowing on `chunk.type === 'CUSTOM' && chunk.name === '<literal>'` resolves `chunk.value` to the exact shape per variant. The bare `CustomEvent` (with `value: any`) is deliberately excluded to keep the narrow from collapsing to `any`; user-emitted events via the `emitCustomEvent` context API still flow at runtime and are documented as a small residual gap.
  - Activity-layer hardening: always-finalise after the stream loop (no silent hangs on missing `finishReason`), typed `RUN_ERROR` on empty content, mid-stream provider errors terminate cleanly, schema-validation failures carry `runId / model / timestamp`.
  - `fallbackStructuredOutputStream` in the activity layer is the single source of truth for adapters that don't implement `structuredOutputStream` natively; `BaseTextAdapter` no longer ships a default.
  - `ChatStreamSummarizeAdapter.summarizeStream` accumulates summary text and emits a terminal `CUSTOM` `generation:result` event before the final `RUN_FINISHED`. Fixes `useSummarize` never populating `result` over streaming connections (the client only sets `result` on that specific CUSTOM event).
  - `SummarizationOptions` is now generic in `TProviderOptions` and `modelOptions` is plumbed through end-to-end (previously silently dropped by `runSummarize` / `runStreamingSummarize`).

  ## Framework hooks — `@tanstack/ai-react`, `@tanstack/ai-vue`, `@tanstack/ai-solid`, `@tanstack/ai-svelte`

  `useChat` (React/Vue/Solid) and `createChat` (Svelte) now accept an `outputSchema` option mirroring `chat({ outputSchema })` on the server. When supplied, the hook's return adds two managed reactive fields:
  - `partial` — the live progressive object, typed `DeepPartial<InferSchemaType<typeof outputSchema>>`. Updated from `TEXT_MESSAGE_CONTENT` deltas via `parsePartialJSON`. Resets on every new run.
  - `final` — the validated terminal payload from the `structured-output.complete` event, typed `InferSchemaType<typeof outputSchema> | null`. `null` until the run completes.

  Both fields are typed against the schema with no helper or cast — each hook is generic on `TSchema` and conditionally adds the fields to the return type. Without `outputSchema`, the return type is unchanged. Works the same for streaming and non-streaming endpoints — for non-streaming, `partial` stays `{}` and `final` snaps when the single terminal event arrives. Reasoning text and tool calls aren't surfaced as separate hook fields — they're already on `messages[…].parts` (as `ThinkingPart`, `ToolCallPart`, `ToolResultPart`), same as a normal chat. When `outputSchema` is set, the assistant's `TextPart` contains the raw JSON the model produced; filter `text` parts out of your message renderer and let the structured view (driven by `partial` / `final`) replace it.

  Reactivity primitive per framework:

  | Framework                      | `partial` type                                          | `final` type                                     |
  | ------------------------------ | ------------------------------------------------------- | ------------------------------------------------ |
  | React (`@tanstack/ai-react`)   | `DeepPartial<T>` (plain state)                          | `T \| null` (plain state)                        |
  | Vue (`@tanstack/ai-vue`)       | `Readonly<ShallowRef<DeepPartial<T>>>`                  | `Readonly<ShallowRef<T \| null>>`                |
  | Solid (`@tanstack/ai-solid`)   | `Accessor<DeepPartial<T>>`                              | `Accessor<T \| null>`                            |
  | Svelte (`@tanstack/ai-svelte`) | `readonly partial: DeepPartial<T>` (rune-backed getter) | `readonly final: T \| null` (rune-backed getter) |

  `DeepPartial<T>` is exported from each framework package for callers who want to annotate handlers explicitly.

  ## Base — `@tanstack/openai-base`
  - Package renamed from `@tanstack/ai-openai-compatible` (which remains published for pinned lockfiles but receives no further updates). Imports change:

    ```diff
    - import { OpenAICompatibleChatCompletionsTextAdapter } from '@tanstack/ai-openai-compatible'
    + import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
    - import { OpenAICompatibleResponsesTextAdapter } from '@tanstack/ai-openai-compatible'
    + import { OpenAIBaseResponsesTextAdapter } from '@tanstack/openai-base'
    ```

  - Centralised `structuredOutputStream` on both bases. Chat Completions uses `response_format: { type: 'json_schema', strict: true }` + `stream: true`; Responses uses `text.format: { type: 'json_schema', strict: true }` + `stream: true`. Subclasses (`ai-openai`, `ai-grok`, `ai-groq`) inherit it; OpenRouter implements its own (see below).
  - Base now adopts the `openai` SDK directly and imports types from `openai/resources/...`. The previously-vendored ~720 LOC of wire-format types (`ChatCompletion`, `ResponseStreamEvent`, etc.) is removed; consumers that imported wire types from the package should import them from the openai SDK instead. The abstract `callChatCompletion*` / `callResponse*` hooks are gone — the base constructor now takes a pre-built `OpenAI` client (`new OpenAIBaseChatCompletionsTextAdapter(model, name, openaiClient)`) and calls `client.chat.completions.create` / `client.responses.create` itself.
  - New protected `isAbortError(error)` hook duck-types abort detection so `RUN_ERROR { code: 'aborted' }` is emitted consistently across SDK error types — subclasses with proprietary error classes (e.g. `@openrouter/sdk`'s `RequestAbortedError`) override.
  - Per-chunk `logger.provider(...)` debug logging now fires inside `structuredOutputStream` loops, matching the existing pattern in `chatStream` for end-to-end introspection in debug mode.

  The other extension hooks (`extractReasoning`, `extractTextFromResponse`, `processStreamChunks`, `makeStructuredOutputCompatible`, `transformStructuredOutput`, `mapOptionsToRequest`, `convertMessage`) remain. Groq's `processStreamChunks` and `makeStructuredOutputCompatible` overrides (for `x_groq.usage` promotion and Groq's structured-output schema quirks) are unchanged.

  ## Provider adapters

  | Adapter                                                    | API              | Reasoning surface                                                                                                |
  | ---------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
  | `@tanstack/ai-openai` `openaiText`                         | Responses        | `response.reasoning_text.delta` + `response.reasoning_summary_text.delta` (requires `reasoning.summary: 'auto'`) |
  | `@tanstack/ai-openai` `openaiChatCompletions` (new)        | Chat Completions | reasoning emitted silently — Chat Completions has no `reasoning.summary` opt-in                                  |
  | `@tanstack/ai-grok` `grokText`                             | Chat Completions | `delta.reasoning_content` (DeepSeek convention; not typed by OpenAI SDK)                                         |
  | `@tanstack/ai-groq` `groqText`                             | Chat Completions | `delta.reasoning` (requires `reasoning_format: 'parsed'`; not typed by groq-sdk)                                 |
  | `@tanstack/ai-openrouter` `openRouterText`                 | Chat Completions | `delta.reasoningDetails` (camelCase)                                                                             |
  | `@tanstack/ai-openrouter` `openRouterResponsesText` (beta) | Responses (beta) | `response.reasoning_text.delta` + `response.reasoning_summary_text.delta` via `normalizeStreamEvent`             |

  All six emit the contractual `REASONING_*` lifecycle (`REASONING_START` → `REASONING_MESSAGE_START` → `REASONING_MESSAGE_CONTENT` deltas → `REASONING_MESSAGE_END` → `REASONING_END`) and close it before `TEXT_MESSAGE_START`. Accumulated reasoning is also surfaced on `structured-output.complete.value.reasoning` for consumers that only subscribe to the terminal event. OpenRouter SDK's proprietary `RequestAbortedError` is mapped (alongside DOM `AbortError`) to `code: 'aborted'` in the two openrouter adapters.

  `@tanstack/ai-openai` also exports a new `OpenAIChatCompletionsTextAdapter` / `openaiChatCompletions` / `createOpenaiChatCompletions` factory — a sibling to the existing Responses adapter for callers who want the older `/v1/chat/completions` wire format against the OpenAI SDK.

  ## Decouple `@tanstack/ai-openrouter` from the OpenAI base

  OpenRouter ships its own SDK (`@openrouter/sdk`) with a camelCase shape, so inheriting from the OpenAI-shaped base forced a snake_case ↔ camelCase round-trip on every request and stream event. ai-openrouter now extends `BaseTextAdapter` directly and inlines its own stream processors (`OpenRouterTextAdapter` for chat-completions, `OpenRouterResponsesTextAdapter` for the Responses beta), reading OpenRouter's camelCase types natively. The `@tanstack/openai-base` and `openai` dependencies are removed from ai-openrouter; only `@openrouter/sdk`, `@tanstack/ai`, and `@tanstack/ai-utils` remain. The ~300 LOC of inbound/outbound shape converters (`toOpenRouterRequest`, `toChatCompletion`, `adaptOpenRouterStreamChunks`, `toSnakeResponseResult`, …) are gone. Internal: duck-typed `as { ... }` casts on stream chunks in `OpenRouterResponsesTextAdapter` are replaced with direct narrowing via the SDK's discriminated unions.

  Public OpenRouter API is unchanged: `openRouterText`, `openRouterResponsesText`, `createOpenRouterText`, `createOpenRouterResponsesText`, the OpenRouter tool factories, provider routing surface (`provider`, `models`, `plugins`, `variant`, `transforms`), app attribution headers (`httpReferer`, `appTitle`), `:variant` model suffixing, `RequestAbortedError` propagation, and the OpenRouter-specific structured-output null-preservation all behave the same.

  `ai-ollama` remains on `BaseTextAdapter` directly — its native API uses a different wire format from Chat Completions and was never on the shared base.

  ## Summarize subsystem

  Anthropic, Gemini, Ollama, and OpenRouter previously each shipped a bespoke 200–300 LOC summarize adapter. They now construct a `ChatStreamSummarizeAdapter` (formerly `ChatStreamWrapperAdapter`, renamed and exported from `@tanstack/ai/activities`) wrapping their own text adapter, matching the existing OpenAI/Grok pattern. Removes ~600 LOC of duplicated logic across the six providers and ensures behavioural parity.

  Bespoke `*SummarizeProviderOptions` interfaces (e.g. `OpenAISummarizeProviderOptions`, `AnthropicSummarizeProviderOptions`, `GeminiSummarizeProviderOptions`, `OllamaSummarizeProviderOptions`, `OpenRouterSummarizeProviderOptions`) are removed from the provider packages' public exports. Consumers who imported them should switch to inferring the type from the adapter (`InferTextProviderOptions<typeof adapter>`) or remove the explicit annotation (it'll be inferred from the adapter argument).

  `SummarizeAdapter` interface methods are now generic in `TProviderOptions`. `summarize` and `summarizeStream` previously took `SummarizationOptions` (defaulted, so `modelOptions` was effectively `Record<string, any>` regardless of the adapter's typed shape). They now take `SummarizationOptions<TProviderOptions>`. Source-compatible for callers that didn't specify the generic; type-tighter for implementers and downstream consumers. `SummarizationOptions`, `SummarizeAdapter`, `BaseSummarizeAdapter`, and `ChatStreamSummarizeAdapter` previously had a mixed `Record<string, any>` / `Record<string, unknown>` / `object` set of defaults for `TProviderOptions`; they now uniformly default to `Record<string, unknown>`.

### Patch Changes

- Update `@fal-ai/client` dependency to `^1.10.1`. Picks up upstream retry-on-transport-error and proxy-runtime-gate improvements. No public adapter API changes — `fal.config`, `fal.subscribe`, `fal.queue.{submit,status,result}` are unchanged. ([#556](https://github.com/TanStack/ai/pull/556))

  The fal type-meta narrowing now covers four cases per model, each strict:
  - `aspect_ratio` + `resolution` → `"16:9_1080p"` style template literal
  - `aspect_ratio` only → the aspect-ratio union (`"16:9" | "9:16" | …`)
  - `resolution` only → the resolution union (`"1080p" | "1440p" | "2160p"`) — new
  - neither → `undefined` (the model has no size knob, so you must omit `size`)

  For example, `fal-ai/ltx-2/text-to-video/fast` (resolution-only) now type-checks `size: '2160p'`, and `fal-ai/kling-video/v2.6/pro/image-to-video` (neither field) refuses any `size` value at compile time.

  The "neither" case uses `undefined` instead of `never` so the adapter class still satisfies the generic `VideoAdapter<string, any, any, any>` (method-parameter contravariance: `any` can't flow into `never` but it does flow into `undefined`).

  To support the `undefined` slot, `@tanstack/ai`'s `BaseImageAdapter`/`BaseVideoAdapter` (and the matching `ImageGenerationOptions`/`VideoGenerationOptions` types) widen their `TSize` constraint from `extends string` to `extends string | undefined`. The default remains `string`, so existing adapters and call sites are unaffected.

  `Extract<…['aspect_ratio'], string>` filters out the new `AspectRatio` object type that upstream 1.10 introduced on `AgeModifyInput`/`CityTeleportInput`, keeping the template-literal sizes valid for those endpoints.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.3.1

## 0.16.0

### Minor Changes

- fix(ai-gemini): read/write thoughtSignature at Part level + thread typed metadata through tool-call lifecycle ([#459](https://github.com/TanStack/ai/pull/459))

  Two fixes shipped together because the adapter fix is only effective once the framework also preserves provider metadata across the tool-call round-trip.

  **Adapter (Gemini):** Gemini emits `thoughtSignature` as a Part-level sibling of `functionCall` (per the `@google/genai` `Part` type definition), not nested inside `functionCall`. The `FunctionCall` type has never had a `thoughtSignature` property. The adapter was reading from `functionCall.thoughtSignature` (does not exist in SDK types) and writing it back nested inside `functionCall`, causing Gemini 3.x to reject subsequent tool-call turns with `400 INVALID_ARGUMENT: "Function call is missing a thought_signature"`.
  - **Read side:** reads `part.thoughtSignature` directly using the SDK's typed `Part` interface
  - **Write side:** emits `thoughtSignature` as a Part-level sibling of `functionCall`

  **Framework (typed tool-call metadata):**
  - `ToolCall.providerMetadata: Record<string, unknown>` is now `ToolCall<TMetadata>.metadata?: TMetadata`, mirroring the existing typed-metadata pattern on content parts (`ImagePart<TMetadata>`, `AudioPart<TMetadata>`, etc.).
  - `ToolCallPart` gains a typed `metadata?: TMetadata` field (also generic).
  - `ToolCallStartEvent.providerMetadata` becomes `metadata` (kept as `Record<string, unknown>` because the AGUIEvent discriminated union does not survive a generic on the event type; adapters cast to their typed shape when emitting).
  - `BaseTextAdapter` and `TextAdapter` gain a sixth generic `TToolCallMetadata` (default `unknown`), exposed via `~types.toolCallMetadata` for inference at call sites.
  - `InternalToolCallState` gains a `metadata?: Record<string, unknown>` field captured at `TOOL_CALL_START` and threaded through `updateToolCallPart`, `buildAssistantMessages`, `modelMessageToUIMessage`, and `completeToolCall`, fixing a previously-silent drop of provider metadata across the client-side UIMessage pipeline (closes the gap surfaced in #403/#404).

  **Gemini concrete impl:** new `GeminiToolCallMetadata { thoughtSignature?: string }` exported from `@tanstack/ai-gemini`. The adapter declares its `TToolCallMetadata` as this type, so consumers see `toolCall.metadata?.thoughtSignature` typed end-to-end.

  **Breaking:** consumers reading `toolCall.providerMetadata` or `toolCallStartEvent.providerMetadata` should rename to `metadata`.

### Patch Changes

- Updated dependencies [[`87f305c`](https://github.com/TanStack/ai/commit/87f305c9961d608fd7bea93a5100698a98aed11d)]:
  - @tanstack/ai-event-client@0.3.0

## 0.15.0

### Minor Changes

- **OpenTelemetry middleware.** `otelMiddleware({ tracer, meter?, captureContent?, redact?, ... })` emits GenAI-semantic-convention traces and metrics for every `chat()` call. ([#500](https://github.com/TanStack/ai/pull/500))
  - Root span per `chat()` + child span per agent-loop iteration (named `chat <model> #<iteration>`) + grandchild span per tool call.
  - `gen_ai.client.operation.duration` (seconds) recorded **once per `chat()` call**; `gen_ai.client.token.usage` (tokens) recorded **per iteration** (one input + one output record). Metric attributes are kept low-cardinality — `gen_ai.response.model` and `gen_ai.response.id` are intentionally excluded.
  - `captureContent: true` attaches prompt/completion content as `gen_ai.{user,system,assistant,tool}.message` and `gen_ai.choice` span events. Redactor failures fail closed to a `"[redaction_failed]"` sentinel — raw content never leaks. Assistant text is capped at `maxContentLength` (default 100 000).
  - Four extension points for custom attributes, names, span-options, and end-of-span callbacks. Thrown callbacks are caught and logged to `console.warn` with a label so failures remain diagnosable.
  - `@opentelemetry/api` is an optional peer dependency. The middleware is exported from the dedicated subpath `@tanstack/ai/middlewares/otel` so that importing `@tanstack/ai/middlewares` does not eagerly require OTel.

  See `docs/advanced/otel.md` for the full guide.

- **Fix thinking blocks getting merged across steps and lost on turn 2+ of Anthropic tool loops.** ([#391](https://github.com/TanStack/ai/pull/391))

  Each thinking step emitted by the adapter now produces its own `ThinkingPart` on the `UIMessage` instead of being merged into a single part, and thinking content + Anthropic signatures are preserved in server-side message history so multi-turn tool flows with extended thinking work correctly.

  This includes a public callback signature change: `StreamProcessorEvents.onThinkingUpdate` now receives `(messageId, stepId, content)` instead of `(messageId, content)`. `ChatClient` has been updated to handle the new `stepId` argument internally, but consumers implementing `StreamProcessorEvents` directly need to add the new parameter.

  `@tanstack/ai`:
  - `ThinkingPart` gains optional `stepId` and `signature` fields.
  - `ModelMessage` gains an optional `thinking?: Array<{ content; signature? }>` field so prior thinking can be replayed in subsequent turns.
  - `StepFinishedEvent` gains an optional `signature` field for provider-supplied thinking signatures.
  - `StreamProcessor` tracks thinking per-step via `stepId` and keeps step ordering. `getState().thinking` / `getResult().thinking` concatenate step contents in order.
  - The `onThinkingUpdate` callback on `StreamProcessorEvents` now receives `(messageId, stepId, content)` — consumers implementing it directly must add the `stepId` parameter.
  - `TextEngine` accumulates thinking + signatures per iteration and includes them in assistant messages with tool calls so the next turn can replay them.

  `@tanstack/ai-anthropic`:
  - Captures `signature_delta` stream events and emits the final `STEP_FINISHED` with the signature on `content_block_stop`.
  - Includes thinking blocks with signatures in `formatMessages` for multi-turn history.
  - Passes `betas: ['interleaved-thinking-2025-05-14']` to the `beta.messages.create` call site when a thinking budget is configured. The beta flag is scoped to the streaming path only, so `structuredOutput` (which uses the non-beta `messages.create` endpoint) is unaffected.

  `@tanstack/ai-client`:
  - `ChatClient`'s internal `onThinkingUpdate` wiring is updated for the new `stepId` parameter.

### Patch Changes

- Fix `tool_use.name: String should have at least 1 character` 400 from Anthropic when sending a follow-up message after approving a tool that needs approval (issue #532). ([#536](https://github.com/TanStack/ai/pull/536))

  The agent loop's continuation re-emit of `TOOL_CALL_START` after a server-side post-approval execution now includes the AG-UI spec field `toolCallName` alongside the deprecated `toolName` alias, so the client's `StreamProcessor` records a tool-call part with a defined `name` instead of `undefined`. As a defensive measure, `StreamProcessor` also accepts the deprecated `toolName` field as a fallback when `toolCallName` is missing.

  The post-approval execution also now replaces the `pendingExecution: true` placeholder tool message in the agent loop's message history with the real tool result, instead of appending a duplicate. This prevents the Anthropic adapter's `tool_result` de-dup (which keeps the first match) from discarding the real result, so the model sees the actual tool output during the post-approval streaming response.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.2.9

## 0.14.0

### Minor Changes

- feat: add generateAudio activity for music and sound-effect generation ([#463](https://github.com/TanStack/ai/pull/463))

  Adds a new `audio` activity kind alongside the existing `tts` and `transcription` activities:
  - `generateAudio()` / `createAudioOptions()` functions
  - `AudioAdapter` interface and `BaseAudioAdapter` base class
  - `AudioGenerationOptions` / `AudioGenerationResult` / `GeneratedAudio` types
  - `audio:request:started`, `audio:request:completed`, and `audio:usage` devtools events

- feat: add `useGenerateAudio` hook and streaming support for `generateAudio()` ([#463](https://github.com/TanStack/ai/pull/463))

  Closes the parity gap between audio generation and the other media
  activities (image, speech, video, transcription, summarize):
  - `generateAudio()` now accepts `stream: true`, returning an
    `AsyncIterable<StreamChunk>` that can be piped through
    `toServerSentEventsResponse()`.
  - `AudioGenerateInput` type added to `@tanstack/ai-client`.
  - `useGenerateAudio` hook added to `@tanstack/ai-react`,
    `@tanstack/ai-solid`, and `@tanstack/ai-vue`; matching
    `createGenerateAudio` added to `@tanstack/ai-svelte`. All follow the same
    `{ generate, result, isLoading, error, status, stop, reset }` shape as
    the existing media hooks and support both `connection` (SSE) and
    `fetcher` transports.

- Tighten `GeneratedImage` and `GeneratedAudio` to enforce exactly one of `url` or `b64Json` via a mutually-exclusive `GeneratedMediaSource` union. ([#463](https://github.com/TanStack/ai/pull/463))

  Both types previously declared `url?` and `b64Json?` as independently optional, which allowed meaningless `{}` values and objects that set both fields. They now require exactly one:

  ```ts
  type GeneratedMediaSource =
    { url: string; b64Json?: never } | { b64Json: string; url?: never }
  ```

  Existing read patterns like `img.url || \`data:image/png;base64,${img.b64Json}\``continue to work unchanged. The only runtime-visible change is that the`@tanstack/ai-openrouter`and`@tanstack/ai-fal`image adapters no longer populate`url`with a synthesized`data:image/png;base64,...`URI when the provider returns base64 — they return`{ b64Json }`only. Consumers that want a data URI should build it from`b64Json` at render time.

### Patch Changes

- refactor(ai, ai-openai): narrow error handling before logging ([#465](https://github.com/TanStack/ai/pull/465))

  `catch (error: any)` sites in `stream-to-response.ts`, `activities/stream-generation-result.ts`, and `activities/generateVideo/index.ts` are now narrowed to `unknown` and funnel through a shared `toRunErrorPayload(error, fallback)` helper that extracts `message` / `code` without leaking the original error object (which can carry request state from an SDK).

  Replaced four `console.error` calls in the OpenAI text adapter's `chatStream` catch block that dumped the full error object to stdout. SDK errors can carry the original request including auth headers, so the library now logs only the narrowed `{ message, code }` payload via the internal logger — any user-supplied logger receives the sanitized shape, not the raw SDK error.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.2.8

## 0.13.0

### Minor Changes

- **Pluggable debug logging across every activity.** `chat`, `summarize`, `generateImage`, `generateVideo`, `generateSpeech`, and `generateTranscription` now accept a `debug?: DebugOption` that turns on structured per-category logs (`request`, `provider`, `output`, `middleware`, `tools`, `agentLoop`, `config`, `errors`). ([#467](https://github.com/TanStack/ai/pull/467))

  ```ts
  chat({ adapter, messages, debug: true }) // all categories on
  chat({ adapter, messages, debug: false }) // silent (incl. errors)
  chat({ adapter, messages, debug: { middleware: false } }) // all except middleware
  chat({ adapter, messages, debug: { logger: pino } }) // route to a custom logger
  ```

  Additions:
  - New `Logger` interface (`debug` / `info` / `warn` / `error`) and default `ConsoleLogger` that routes to matching `console.*` methods and prints nested `meta` via `console.dir(meta, { depth: null, colors: true })` so streamed provider payloads render in full.
  - New `DebugCategories` / `DebugConfig` / `DebugOption` public types.
  - New internal `@tanstack/ai/adapter-internals` subpath export exposing `InternalLogger` + `resolveDebugOption` so provider adapters can thread logging without leaking internals on the public surface.
  - Each log line is prefixed with an emoji + `[tanstack-ai:<category>]` tag so categories are visually distinguishable in dense streams. Errors log unconditionally unless explicitly silenced.
  - `TextEngine`, `MiddlewareRunner`, and every activity entry point thread a resolved `InternalLogger` through the pipeline — no globals, concurrent calls stay independent.
  - Exceptions thrown by a user-supplied `Logger` implementation are swallowed so they never mask the real error that triggered the log call.
  - New `ai-core/debug-logging` skill shipped under `packages/ai/skills/` so agents can discover how to toggle, narrow, and redirect debug output.

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-event-client@0.2.7

## 0.12.0

### Minor Changes

- Add `ProviderTool<TProvider, TKind>` phantom-branded tool subtype and a `toolCapabilities` channel on `TextAdapter['~types']`. `TextActivityOptions['tools']` is now typed so that adapter-exported provider tools are gated against the selected model's `supports.tools` list. User tools from `toolDefinition()` remain unaffected. ([#466](https://github.com/TanStack/ai/pull/466))

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-event-client@0.2.6

## 0.11.1

### Patch Changes

- fix(ai): make optional nested objects and arrays nullable under `forStructuredOutput`. Previously `makeStructuredOutputCompatible` recursed into optional composites and skipped the `'null'`-wrap, but still added them to `required[]`, producing a schema that OpenAI-style strict `json_schema` providers reject. Any schema with an optional `z.object({...}).optional()` or `z.array(...).optional()` field now serializes as `type: ['object','null']` / `['array','null']` and passes strict validation. ([#484](https://github.com/TanStack/ai/pull/484))

- Updated dependencies []:
  - @tanstack/ai-event-client@0.2.5

## 0.11.0

### Minor Changes

- **AG-UI core interop — spec-compliant event types.** `StreamChunk` now re-uses `@ag-ui/core`'s `EventType` enum and event shapes directly. Practical changes: ([#474](https://github.com/TanStack/ai/pull/474))
  - `RunErrorEvent` is flat (`{ message, code }` at the top level) instead of nested under `error: {...}`.
  - `TOOL_CALL_START` / `TOOL_CALL_END` events expose `toolCallName` (the deprecated `toolName` alias is retained as a passthrough for now).
  - Adapters now emit `REASONING_*` events (`REASONING_START`, `REASONING_MESSAGE_START`, `REASONING_MESSAGE_CONTENT`, `REASONING_MESSAGE_END`, `REASONING_END`) alongside the legacy `STEP_*` events; consumers rendering thinking content should migrate to the `REASONING_*` channel.
  - `TOOL_CALL_RESULT` events are emitted after tool execution in the agent loop.
  - New `stripToSpecMiddleware` (always injected last) removes non-spec fields (`model`, `content`, `args`, `finishReason`, `usage`, `toolName`, `stepId`, …) from events before they reach consumers. Internal state management sees the full un-stripped chunks.
  - `ChatOptions` gained optional `threadId` and `runId` for AG-UI run correlation; they flow through to `RUN_STARTED` / `RUN_FINISHED`.
  - `StateDeltaEvent.delta` is now a JSON Patch `any[]` per the AG-UI spec.

### Patch Changes

- Updated dependencies [[`12d43e5`](https://github.com/TanStack/ai/commit/12d43e55073351a6a2b5b21861b8e28c657b92b7)]:
  - @tanstack/ai-event-client@0.2.4

## 0.10.3

### Patch Changes

- fix(ai, ai-openai, ai-gemini, ai-ollama): normalize null tool input to empty object ([#430](https://github.com/TanStack/ai/pull/430))

  When a model produces a `tool_use` block with no input, `JSON.parse('null')` returns `null` which fails Zod schema validation and silently kills the agent loop. Normalize null/non-object parsed tool input to `{}` in `executeToolCalls`, `ToolCallManager.completeToolCall`, `ToolCallManager.executeTools`, and the OpenAI/Gemini/Ollama adapter `TOOL_CALL_END` emissions. The Anthropic adapter already had this fix.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.2.3

## 0.10.2

### Patch Changes

- Emit TOOL_CALL_START and TOOL_CALL_ARGS for pending tool calls during continuation re-executions ([#372](https://github.com/TanStack/ai/pull/372))

- Updated dependencies []:
  - @tanstack/ai-event-client@0.2.2

## 0.10.1

### Patch Changes

- Add @tanstack/intent agent skills for AI coding assistants ([#432](https://github.com/TanStack/ai/pull/432))

  Adds 10 skill files covering chat-experience, tool-calling, media-generation,
  code-mode, structured-outputs, adapter-configuration, ag-ui-protocol,
  middleware, and custom-backend-integration. Skills guide AI agents to generate
  correct TanStack AI code patterns and avoid common mistakes.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.2.1

## 0.10.0

### Minor Changes

- Add code mode and isolate packages for secure AI code execution ([#362](https://github.com/TanStack/ai/pull/362))

  Also includes fixes for Ollama tool call argument streaming and usage
  reporting, OpenAI realtime adapter handling of missing call_id/item_id,
  realtime client guards for missing toolCallId, and new DevtoolsChatMiddleware
  type export from ai-event-client.

### Patch Changes

- Updated dependencies [[`54abae0`](https://github.com/TanStack/ai/commit/54abae063c91b8b04b91ecb2c6785f5ff9168a7c)]:
  - @tanstack/ai-event-client@0.2.0

## 0.9.2

### Patch Changes

- fix: handle errors from fal result fetch on completed jobs ([#396](https://github.com/TanStack/ai/pull/396))

  fal.ai does not return a FAILED queue status — invalid jobs report COMPLETED, and the real error (e.g. 422 validation) only surfaces when fetching results. `getVideoUrl()` now catches these errors and extracts detailed validation messages. `getVideoJobStatus()` returns `status: 'failed'` when the result fetch throws on a "completed" job.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.1.4

## 0.9.1

### Patch Changes

- Fix Gemini adapter tool call handling: preserve thoughtSignature for Gemini 3+ thinking models through the tool call lifecycle, use correct function name (instead of call ID) in functionResponse parts, and include the call ID in both functionCall and functionResponse for proper correlation. ([#401](https://github.com/TanStack/ai/pull/401))

- Updated dependencies []:
  - @tanstack/ai-event-client@0.1.3

## 0.9.0

### Minor Changes

- feat: Add lazy tool discovery for `chat()` ([#360](https://github.com/TanStack/ai/pull/360))

  Tools marked with `lazy: true` are not sent to the LLM upfront. Instead, a synthetic discovery tool lets the LLM selectively discover lazy tools by name, receiving their descriptions and schemas on demand. Discovered tools are dynamically injected as normal tools. This reduces token usage and improves response quality when applications have many tools.

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-event-client@0.1.2

## 0.8.1

### Patch Changes

- Add an explicit subscription lifecycle to `ChatClient` with `subscribe()`/`unsubscribe()`, `isSubscribed`, `connectionStatus`, and `sessionGenerating`, while keeping request lifecycle state separate from long-lived connection state for durable chat sessions. ([#356](https://github.com/TanStack/ai/pull/356))

  Update the React, Preact, Solid, Svelte, and Vue chat bindings with `live` mode plus reactive subscription/session state, and improve `StreamProcessor` handling for concurrent runs and reconnects so active sessions do not finalize early or duplicate resumed assistant messages.

- Add durable `subscribe()`/`send()` transport support to `ChatClient` while preserving compatibility with existing `connect()` adapters. This also introduces shared generation clients for one-shot streaming tasks and updates the framework wrappers to use the new generation transport APIs. ([#286](https://github.com/TanStack/ai/pull/286))

  Improve core stream processing to better handle concurrent runs and resumed streams so shared sessions stay consistent during reconnects and overlapping generations.

- Updated dependencies []:
  - @tanstack/ai-event-client@0.1.1

## 0.8.0

### Minor Changes

- feat: add middleware system and content guard middleware ([#367](https://github.com/TanStack/ai/pull/367))
  - **@tanstack/ai**: New `@tanstack/ai/middlewares` subpath with composable chat middleware architecture. Includes `contentGuardMiddleware` (delta and buffered strategies) and `toolCacheMiddleware`. Middleware hooks: `onStart`, `onIteration`, `onChunk`, `onToolPhaseComplete`, `onFinish`.
  - **@tanstack/ai-event-client**: Initial release. Extracted `devtoolsMiddleware` from `@tanstack/ai` core into a standalone package for tree-shaking. Emits all DevTools events as an observation-only middleware.
  - **@tanstack/ai-client**: Updated event types for middleware integration.
  - **@tanstack/ai-devtools**: Updated iteration timeline and conversation UI for middleware-aware event handling.

### Patch Changes

- Updated dependencies [[`f62eeb0`](https://github.com/TanStack/ai/commit/f62eeb0d7efd002894435c7f2c8a9f2790f0b6d7)]:
  - @tanstack/ai-event-client@0.1.0

## 0.7.0

### Minor Changes

- feat: add realtime voice chat with OpenAI and ElevenLabs adapters ([#300](https://github.com/TanStack/ai/pull/300))

  Adds realtime voice/text chat capabilities:
  - **@tanstack/ai**: `realtimeToken()` function and shared realtime types (`RealtimeToken`, `RealtimeMessage`, `RealtimeSessionConfig`, `RealtimeStatus`, `RealtimeMode`, `AudioVisualization`, events, and error types)
  - **@tanstack/ai-client**: Framework-agnostic `RealtimeClient` class with connection lifecycle, audio I/O, message state management, tool execution, and `RealtimeAdapter`/`RealtimeConnection` interfaces
  - **@tanstack/ai-openai**: `openaiRealtime()` client adapter (WebRTC) and `openaiRealtimeToken()` server token adapter with support for semantic VAD, multiple voices, and all realtime models
  - **@tanstack/ai-elevenlabs**: `elevenlabsRealtime()` client adapter (WebSocket) and `elevenlabsRealtimeToken()` server token adapter for ElevenLabs conversational AI agents
  - **@tanstack/ai-react**: `useRealtimeChat()` hook with reactive state for status, mode, messages, pending transcripts, audio visualization levels, VAD control, text/image input, and interruptions
  - **Docs**: Realtime Voice Chat guide and full API reference for all realtime classes, interfaces, functions, and type aliases

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-event-client@0.0.2

## 0.6.3

### Patch Changes

- feat: pass abort signal to generation fetchers and extract GenerationFetcher utility type ([#327](https://github.com/TanStack/ai/pull/327))
  - Generation clients now forward an `AbortSignal` to fetcher functions via an optional `options` parameter, enabling cancellation support when `stop()` is called
  - Introduced `GenerationFetcher<TInput, TResult>` utility type in `@tanstack/ai-client` to centralize the fetcher function signature across all framework integrations
  - All framework hooks/composables (React, Solid, Vue, Svelte) now use the shared `GenerationFetcher` type instead of inline definitions

## 0.6.2

### Patch Changes

- Fix tool approval flow: output priority over approval metadata, preserve approval/output fields in updateToolCallPart, batch-gate execution until all approvals are resolved ([#352](https://github.com/TanStack/ai/pull/352))

## 0.6.1

### Patch Changes

- Fix chat stall when server and client tools are called in the same turn. ([#323](https://github.com/TanStack/ai/pull/323))

  When the LLM requested both a server tool and a client tool in the same response, the server tool's result was silently dropped. The `processToolCalls` and `checkForPendingToolCalls` methods returned early to wait for the client tool, skipping the `emitToolResults` call entirely — so the server result was never emitted or added to the message history, causing the session to stall indefinitely.

  The fix emits completed server tool results before yielding the early return for client tool / approval waiting.

  Also fixes the smoke-test harness and test fixtures to use `chunk.value` instead of `chunk.data` for CUSTOM events, following the rename introduced in #307.

## 0.6.0

### Minor Changes

- feat: add custom event dispatch support for tools ([#293](https://github.com/TanStack/ai/pull/293))

  Tools can now emit custom events during execution via `dispatchEvent()`. Custom events are streamed to clients as `custom_event` stream chunks and surfaced through the client chat hook's `onCustomEvent` callback. This enables tools to send progress updates, intermediate results, or any structured data back to the UI during long-running operations.

### Patch Changes

- Refactor CustomEvent property from 'data' to 'value' for AG-UI compliance ([#307](https://github.com/TanStack/ai/pull/307))

## 0.5.1

### Patch Changes

- Fix CI ([#295](https://github.com/TanStack/ai/pull/295))

## 0.5.0

### Minor Changes

- Tighten the AG-UI adapter contract and simplify the core stream processor. ([#275](https://github.com/TanStack/ai/pull/275))

  **Breaking type changes:**
  - `TextMessageContentEvent.delta` is now required (was optional)
  - `StepFinishedEvent.delta` is now required (was optional)

  All first-party adapters already sent `delta` on every event, so this is a type-level enforcement of existing behavior. Community adapters that follow the reference implementations will not need code changes.

  **Core processor simplifications:**
  - `TEXT_MESSAGE_START` now resets text segment state, replacing heuristic overlap detection
  - `TOOL_CALL_END` is now the authoritative signal for tool call input completion
  - Removed delta/content fallback logic, whitespace-only message cleanup, and finish-reason conflict arbitration from the processor

  **Adapter fixes:**
  - Gemini: filter whitespace-only text parts, fix STEP_FINISHED content accumulation, emit fresh TEXT_MESSAGE_START after tool calls
  - Anthropic: emit fresh TEXT_MESSAGE_START after tool_use blocks for proper text segmentation

### Patch Changes

- fix(ai, ai-client, ai-anthropic, ai-gemini): fix multi-turn conversations failing after tool calls ([#275](https://github.com/TanStack/ai/pull/275))

  **Core (@tanstack/ai):**
  - Lazy assistant message creation: `StreamProcessor` now defers creating the assistant message until the first content-bearing chunk arrives (text, tool call, thinking, or error), eliminating empty `parts: []` messages from appearing during auto-continuation when the model returns no content
  - Add `prepareAssistantMessage()` (lazy) alongside deprecated `startAssistantMessage()` (eager, backwards-compatible)
  - Add `getCurrentAssistantMessageId()` to check if a message was created
  - **Rewrite `uiMessageToModelMessages()` to preserve part ordering**: the function now walks parts sequentially instead of separating by type, producing correctly interleaved assistant/tool messages (text1 + toolCall1 → toolResult1 → text2 + toolCall2 → toolResult2) instead of concatenating all text and batching all tool calls. This fixes multi-round tool flows where the model would see garbled conversation history and re-call tools unnecessarily.
  - Deduplicate tool result messages: when a client tool has both a `tool-result` part and a `tool-call` part with `output`, only one `role: 'tool'` message is emitted per tool call ID

  **Client (@tanstack/ai-client):**
  - Update `ChatClient.processStream()` to use lazy assistant message creation, preventing UI flicker from empty messages being created then removed

  **Anthropic:**
  - Fix consecutive user-role messages violating Anthropic's alternating role requirement by merging them in `formatMessages`
  - Deduplicate `tool_result` blocks with the same `tool_use_id`
  - Filter out empty assistant messages from conversation history
  - Suppress duplicate `RUN_FINISHED` event from `message_stop` when `message_delta` already emitted one
  - Fix `TEXT_MESSAGE_END` incorrectly emitting for `tool_use` content blocks
  - Add Claude Opus 4.6 model support with adaptive thinking and effort parameter

  **Gemini:**
  - Fix consecutive user-role messages violating Gemini's alternating role requirement by merging them in `formatMessages`
  - Deduplicate `functionResponse` parts with the same name (tool call ID)
  - Filter out empty model messages from conversation history

## 0.4.2

### Patch Changes

- fix issue with delta ([#272](https://github.com/TanStack/ai/pull/272))

## 0.4.1

### Patch Changes

- fix for tool calls ([#266](https://github.com/TanStack/ai/pull/266))

## 0.4.0

### Minor Changes

- add multiple modalities support to the client ([#263](https://github.com/TanStack/ai/pull/263))

## 0.3.1

### Patch Changes

- fix: improve tool execution reliability and prevent race conditions ([#258](https://github.com/TanStack/ai/pull/258))
  - Fix client tool execution race conditions by tracking pending tool executions
  - Prevent duplicate continuation attempts with continuationPending flag
  - Guard against concurrent stream processing in streamResponse
  - Add approval info to ToolCall type for server-side decision tracking
  - Include approval info in model message conversion for approval workflows
  - Check ModelMessage format for approval info extraction in chat activity

  This change improves the reliability of tool execution, especially for:
  - Client tools with async execute functions
  - Approval-based tool workflows
  - Sequential tool execution scenarios

## 0.3.0

### Minor Changes

- feat: Add AG-UI protocol events to streaming system ([#244](https://github.com/TanStack/ai/pull/244))

  All text adapters now emit AG-UI protocol events only:
  - `RUN_STARTED` / `RUN_FINISHED` - Run lifecycle events
  - `TEXT_MESSAGE_START` / `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END` - Text message streaming
  - `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END` - Tool call streaming

  Only AG-UI event types are supported; previous legacy chunk formats (`content`, `tool_call`, `done`, etc.) are no longer accepted.

## 0.2.2

### Patch Changes

- fixed an issue with gemini and thought chunks processing ([#210](https://github.com/TanStack/ai/pull/210))

## 0.2.1

### Patch Changes

- Fix up model names for OpenAI and release the new response APIs ([#188](https://github.com/TanStack/ai/pull/188))

- fix up readmes ([#188](https://github.com/TanStack/ai/pull/188))

## 0.2.0

### Minor Changes

- Standard schema / standard json schema support for TanStack AI ([#165](https://github.com/TanStack/ai/pull/165))

## 0.1.0

### Minor Changes

- Split up adapters for better tree shaking into separate functionalities ([#137](https://github.com/TanStack/ai/pull/137))

## 0.0.3

### Patch Changes

- update event client ([#128](https://github.com/TanStack/ai/pull/128))

## 0.0.2

### Patch Changes

- added text metadata support for message inputs ([#95](https://github.com/TanStack/ai/pull/95))

## 0.0.1

### Patch Changes

- Initial release of TanStack AI ([#72](https://github.com/TanStack/ai/pull/72))
