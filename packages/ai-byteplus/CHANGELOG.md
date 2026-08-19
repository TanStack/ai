# @tanstack/ai-byteplus

## 0.1.3

### Patch Changes

- [#1149](https://github.com/TanStack/ai/pull/1149) [`870e5cc`](https://github.com/TanStack/ai/commit/870e5ccf811479651f00a360a6a4eae195da6afe) - Allow 1080p on Seedance 2.5 (`dreamina-seedance-2-5-260628`).

  BytePlus ModelArk and the live fal Seedance 2.5 spec now accept native
  `480p` / `720p` / `1080p` (default still `720p`). `4k` remains exclusive
  to `dreamina-seedance-2-0-260128`.

## 0.1.2

### Patch Changes

- [#1132](https://github.com/TanStack/ai/pull/1132) [`eda82cc`](https://github.com/TanStack/ai/commit/eda82cc8a86923afd604a663d050c6edfa6b829b) - Timestamp native and fallback structured-output events when they are emitted so their lifecycle remains chronologically ordered.

- Updated dependencies [[`d10dfe6`](https://github.com/TanStack/ai/commit/d10dfe6eca788ae52631d45e5599aa0c45e9ba37), [`eda82cc`](https://github.com/TanStack/ai/commit/eda82cc8a86923afd604a663d050c6edfa6b829b), [`c63319e`](https://github.com/TanStack/ai/commit/c63319e34a2ca2f1d56b90addf28784f7c3e13ad), [`b09e010`](https://github.com/TanStack/ai/commit/b09e010b32932c812e65b1e14f6faa2b0e6d5cb8), [`0fb8263`](https://github.com/TanStack/ai/commit/0fb826321c9ba7bd5d8ba0062be2a00b6178726d)]:
  - @tanstack/ai@0.45.0
  - @tanstack/openai-base@0.9.13

## 0.1.1

### Patch Changes

- [#1060](https://github.com/TanStack/ai/pull/1060) [`888e8b7`](https://github.com/TanStack/ai/commit/888e8b7e8247844bb13b1d194ab814c0ffaff41f) - Add first-class Seedance 2.5 support (`dreamina-seedance-2-5-260628`).

  The model is fully open on ModelArk with documented capabilities: 4–30s
  duration (or `-1`), 480p/720p only, multimodal reference media including
  audio-only input, first-and-last-frame mode, `priority`, `generate_audio`, and
  `output_format` (`mp4` | `mov`). The video adapter, typed model tables, unit
  tests, docs, and Seedance Studio example catalog all treat it as a known
  model rather than an escape-hatch string.

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

- Updated dependencies [[`59aa8b5`](https://github.com/TanStack/ai/commit/59aa8b5049549246227c8f2cf736ce50d05205a5), [`ee07854`](https://github.com/TanStack/ai/commit/ee07854fd3d2d4bb279e6e4748802f7f9a5a7167), [`b785cc4`](https://github.com/TanStack/ai/commit/b785cc4ae382fb0e2a337199d192bd9335ac9249), [`7d92296`](https://github.com/TanStack/ai/commit/7d922963b09b59dd693fcaef84bef3ffe35a0a94), [`47e2464`](https://github.com/TanStack/ai/commit/47e246480d29e2ab5a83ca684e047670e75ba66c), [`dd7ddf1`](https://github.com/TanStack/ai/commit/dd7ddf19283358adfbf61d057321d7daee3ca50d), [`6903978`](https://github.com/TanStack/ai/commit/690397804254dca638961c79b7941555edc52c02), [`fdb791a`](https://github.com/TanStack/ai/commit/fdb791a1c9c8de906eecf76f59743f697621b027), [`7aa4ae9`](https://github.com/TanStack/ai/commit/7aa4ae9d07d21195dd3d62598ac503f1dfdc79e4), [`ea9c077`](https://github.com/TanStack/ai/commit/ea9c07724bd6992480238a699fbb18835eab743e)]:
  - @tanstack/ai@0.44.0
  - @tanstack/openai-base@0.9.11

## 0.1.0

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
  - @tanstack/ai@0.43.0
  - @tanstack/ai-utils@0.4.0
  - @tanstack/openai-base@0.9.10
