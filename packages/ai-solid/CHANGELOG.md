# @tanstack/ai-solid

## 0.14.4

### Patch Changes

- [#918](https://github.com/TanStack/ai/pull/918) [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589) - Add the `const` modifier to the `TTools` type parameter of `useChat`
  (`createChat` in Svelte, `injectChat` in Angular) so a plain inline `tools` array
  now yields full type-safe message chunks. Previously the array widened to
  `Array<Union>` and lost the literal tool `name`s that drive the
  discriminated `tool-call` part union, so callers had to wrap their tools in
  `clientTools(...)` (or add `as const`) to get narrowing. That wrapper is now
  optional — `tools: [toolA, toolB]` narrows `part.name`, `part.input`, and
  `part.output` on its own. `clientTools(...)` still works and remains useful
  for defining a shared tuple outside the hook call.
- Updated dependencies [[`5fcaf90`](https://github.com/TanStack/ai/commit/5fcaf90dc82bc20b8c7a75faa3c129da04858af5), [`2665085`](https://github.com/TanStack/ai/commit/2665085970ab4d792778bb2b635ef27fbdcb6be1), [`e0bbbdd`](https://github.com/TanStack/ai/commit/e0bbbdd9608892293e09135aab4a3c77c8d65669), [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589), [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589), [`de5fbb5`](https://github.com/TanStack/ai/commit/de5fbb52a916826cdc0ef31d18df402cd611b9d4)]:
  - @tanstack/ai@0.41.0
  - @tanstack/ai-client@0.21.0

## 0.14.3

### Patch Changes

- Updated dependencies [[`5deda27`](https://github.com/TanStack/ai/commit/5deda27085c8785894a28feb5bb3655dbd8f7e0a)]:
  - @tanstack/ai@0.40.0
  - @tanstack/ai-client@0.20.0

## 0.14.2

### Patch Changes

- Updated dependencies [[`afba322`](https://github.com/TanStack/ai/commit/afba32236022589afce4d5a165fd4a8a884ae57d), [`e7ad181`](https://github.com/TanStack/ai/commit/e7ad181cad20c5d6560f480835c99ff1142b40af)]:
  - @tanstack/ai@0.39.1
  - @tanstack/ai-client@0.19.2

## 0.14.1

### Patch Changes

- Updated dependencies [[`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4)]:
  - @tanstack/ai@0.39.0
  - @tanstack/ai-client@0.19.1

## 0.14.0

### Minor Changes

- [#810](https://github.com/TanStack/ai/pull/810) [`33acdd4`](https://github.com/TanStack/ai/commit/33acdd4df4aef13d594700d9b52087252091bd40) - Add `AudioRecorder` (`@tanstack/ai-client`) and framework hooks for recording an
  audio message in the browser: `useAudioRecorder` (React/Solid/Vue),
  `createAudioRecorder` (Svelte), and `injectAudioRecorder` (Angular). The
  recording exposes a ready-to-use audio content part (`.part`) for `sendMessage`
  and base64 (`.base64`) for the generation hooks. Native recorder output
  (webm/mp4), no transcoding, no new dependency.

  Each hook also returns a reactive `recording` field — the latest resolved
  recording (`AudioRecording | null`), available without awaiting `stop()`. Pass
  `onComplete: (recording) => T | Promise<T>` to transform the output: `stop()`
  then resolves to `T` and `recording` becomes `T | null`. Omitting `onComplete`
  keeps the raw `AudioRecording`.

### Patch Changes

- [#856](https://github.com/TanStack/ai/pull/856) [`c22c663`](https://github.com/TanStack/ai/commit/c22c6632fdca761033cb9c4273bf61fc8ce86662) - Fix `onResult` transform type inference on the generation hooks across every
  framework package — the base generation hook plus `generateImage`,
  `generateAudio`, `generateSpeech`, `generateVideo`, `transcription`, and
  `summarize` (React `use*`, Vue `use*`, Solid `use*`, Svelte `create*`, and
  Angular `inject*`).

  The hooks declared the `onResult` transform via a single defaulted type
  parameter inferred from an optional nested property, which TypeScript collapses
  to its default — leaving the callback parameter typed `any` (a hard error under
  `strict`) and never narrowing `result` to the transform's return type. The
  hooks now infer the transform type from the `onResult` return position (a
  covariant inference site that works for an optional nested property), so the
  callback parameter is typed as the raw result and `result` narrows to the
  transform's return type; omitting the transform keeps the raw result type. See
  issue [#848](https://github.com/TanStack/ai/issues/848).

- Updated dependencies [[`33acdd4`](https://github.com/TanStack/ai/commit/33acdd4df4aef13d594700d9b52087252091bd40), [`c1a8732`](https://github.com/TanStack/ai/commit/c1a87327b4a3463d37158f32ca90184b5fd092bb)]:
  - @tanstack/ai-client@0.19.0
  - @tanstack/ai@0.38.0

## 0.13.15

### Patch Changes

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

- Updated dependencies [[`a6cceba`](https://github.com/TanStack/ai/commit/a6cceba4812e7e986183ee856112fcf5f8fa12ff)]:
  - @tanstack/ai@0.37.0
  - @tanstack/ai-client@0.18.6

## 0.13.14

### Patch Changes

- Updated dependencies [[`fbd3762`](https://github.com/TanStack/ai/commit/fbd37623b287e370aa5678e161dec19cf13ae33b)]:
  - @tanstack/ai@0.36.0
  - @tanstack/ai-client@0.18.5

## 0.13.13

### Patch Changes

- Updated dependencies [[`c04abd3`](https://github.com/TanStack/ai/commit/c04abd35284d464d830bb9f15129c7a7c2533d3f)]:
  - @tanstack/ai@0.35.0
  - @tanstack/ai-client@0.18.4

## 0.13.12

### Patch Changes

- Updated dependencies [[`540cbf1`](https://github.com/TanStack/ai/commit/540cbf18a2f7d6c07b44f7f4da0ac3873c0d2581), [`4188693`](https://github.com/TanStack/ai/commit/4188693d09297ce400eb1ba5fab30cfea2fdb8a6)]:
  - @tanstack/ai-client@0.18.3
  - @tanstack/ai@0.34.1

## 0.13.11

### Patch Changes

- Updated dependencies [[`31de22b`](https://github.com/TanStack/ai/commit/31de22b1ae780c53e3abbf9cf17e1db7b62de84a)]:
  - @tanstack/ai@0.34.0
  - @tanstack/ai-client@0.18.2

## 0.13.10

### Patch Changes

- Updated dependencies [[`2cb0313`](https://github.com/TanStack/ai/commit/2cb0313c1f13e1db37c5550308e36bb0b9b73b98), [`18e5f4d`](https://github.com/TanStack/ai/commit/18e5f4d9746a26c3194929ea4b49673728e8eaa5), [`21720dd`](https://github.com/TanStack/ai/commit/21720dd73524d624594a6dfb7e4669c03cc08af0), [`243b8fa`](https://github.com/TanStack/ai/commit/243b8fad7e8a48b68a1a96962ee1443cbd6a0ced)]:
  - @tanstack/ai@0.33.0
  - @tanstack/ai-client@0.18.1

## 0.13.9

### Patch Changes

- Updated dependencies [[`8fa6cc5`](https://github.com/TanStack/ai/commit/8fa6cc56c5f36e22885c98a511dcceb2bfc0da1f), [`8fa6cc5`](https://github.com/TanStack/ai/commit/8fa6cc56c5f36e22885c98a511dcceb2bfc0da1f)]:
  - @tanstack/ai@0.32.0
  - @tanstack/ai-client@0.18.0

## 0.13.8

### Patch Changes

- Updated dependencies [[`07aaf8b`](https://github.com/TanStack/ai/commit/07aaf8b9e5a8e699be25f936cc9cd651a46c16c5)]:
  - @tanstack/ai@0.31.0
  - @tanstack/ai-client@0.17.3

## 0.13.7

### Patch Changes

- Updated dependencies [[`4d5141c`](https://github.com/TanStack/ai/commit/4d5141c128c0e9bd33cdbf36a5402811cefc3f8b)]:
  - @tanstack/ai-client@0.17.2

## 0.13.6

### Patch Changes

- [#769](https://github.com/TanStack/ai/pull/769) [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b) - Add repository metadata (`homepage`, `bugs`, `funding`), fix `repository.directory` to point at each package, and include an MIT `LICENSE` file in every published package.

- Updated dependencies [[`7103348`](https://github.com/TanStack/ai/commit/71033488212bff05dcccc857e721ab9262ebc2a6), [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b)]:
  - @tanstack/ai@0.30.0
  - @tanstack/ai-client@0.17.1

## 0.13.5

### Patch Changes

- Updated dependencies [[`ff267a5`](https://github.com/TanStack/ai/commit/ff267a5536327b006979f9f28ce2df7cc27f6e23), [`570c08a`](https://github.com/TanStack/ai/commit/570c08a8d1a35746c3d31a63188249cba2d2475a), [`22c9b42`](https://github.com/TanStack/ai/commit/22c9b42baec74914b720e440f29bd02be04eb164), [`215b6b4`](https://github.com/TanStack/ai/commit/215b6b401aa95d1d38da342aa09603cb1d616929), [`7d44569`](https://github.com/TanStack/ai/commit/7d445693ea079d7a85498a4465179ddd5f548cb0)]:
  - @tanstack/ai@0.29.0
  - @tanstack/ai-client@0.17.0

## 0.13.4

### Patch Changes

- Updated dependencies [[`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6), [`c0af426`](https://github.com/TanStack/ai/commit/c0af4262d269be67c69d6f878d9618f25fdeee19), [`00e0c93`](https://github.com/TanStack/ai/commit/00e0c932e6cb5e31f75f4b5e94486d7eb02b9ce1), [`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6)]:
  - @tanstack/ai@0.28.0
  - @tanstack/ai-client@0.16.3

## 0.13.3

### Patch Changes

- [#689](https://github.com/TanStack/ai/pull/689) [`d5cb4b9`](https://github.com/TanStack/ai/commit/d5cb4b9445c5b97b06a7fc224dd2c3a92f0e802a) - Forward `threadId` option to `ChatClient` in all framework wrappers

## 0.13.2

### Patch Changes

- Updated dependencies [[`6df32b5`](https://github.com/TanStack/ai/commit/6df32b53026673d159e6df0892ce89effcb5c7b8)]:
  - @tanstack/ai@0.27.0
  - @tanstack/ai-client@0.16.2

## 0.13.1

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai@0.26.1
  - @tanstack/ai-client@0.16.1

## 0.13.0

### Minor Changes

- [#661](https://github.com/TanStack/ai/pull/661) [`755e995`](https://github.com/TanStack/ai/commit/755e9953a31e879c4b88df0e7672ce1224886c97) - Add persistence support for chat messages.

### Patch Changes

- Updated dependencies [[`755e995`](https://github.com/TanStack/ai/commit/755e9953a31e879c4b88df0e7672ce1224886c97)]:
  - @tanstack/ai-client@0.16.0

## 0.12.2

### Patch Changes

- Updated dependencies [[`5d6cd28`](https://github.com/TanStack/ai/commit/5d6cd2834ba7ac1d7c7c1bd24ede202bf3e78010)]:
  - @tanstack/ai@0.26.0
  - @tanstack/ai-client@0.15.2

## 0.12.1

### Patch Changes

- Updated dependencies [[`c251038`](https://github.com/TanStack/ai/commit/c251038c6d8aa84e498f89e314ce5bb233bc689f)]:
  - @tanstack/ai@0.25.0
  - @tanstack/ai-client@0.15.1

## 0.12.0

### Minor Changes

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

- Updated dependencies [[`c1ae8b9`](https://github.com/TanStack/ai/commit/c1ae8b94c83d70508975568eb4fc9b45f1af540b), [`a452ae8`](https://github.com/TanStack/ai/commit/a452ae8bcda8abfdc6309983976ed0fbf6df1915), [`8036b50`](https://github.com/TanStack/ai/commit/8036b5054330a180023c6e3225b8d2735a43a919)]:
  - @tanstack/ai@0.24.0
  - @tanstack/ai-client@0.15.0

## 0.11.1

### Patch Changes

- Updated dependencies [[`94bb9c0`](https://github.com/TanStack/ai/commit/94bb9c0f3a3e56a0c6c8b7c78f44ae41288aecc3)]:
  - @tanstack/ai@0.23.1
  - @tanstack/ai-client@0.14.1

## 0.11.0

### Minor Changes

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

- Updated dependencies [[`980ff9b`](https://github.com/TanStack/ai/commit/980ff9ba925f5dbae62a9318cc1e787d0ae24314), [`d5645cf`](https://github.com/TanStack/ai/commit/d5645cfd4d1b9cfc877f7d4d714517e166a99ce3)]:
  - @tanstack/ai@0.23.0
  - @tanstack/ai-client@0.14.0

## 0.10.10

### Patch Changes

- [#632](https://github.com/TanStack/ai/pull/632) [`5634f18`](https://github.com/TanStack/ai/commit/5634f186a4946ca3e1942fbfcbf1291ec9bd9855) - Add hook-aware AI devtools registration, run tracking, state snapshots, and tool fixture replay.

- Updated dependencies [[`5634f18`](https://github.com/TanStack/ai/commit/5634f186a4946ca3e1942fbfcbf1291ec9bd9855)]:
  - @tanstack/ai-client@0.13.0
  - @tanstack/ai@0.22.1

## 0.10.9

### Patch Changes

- Add a `fetcher` option to `ChatClient` and the framework chat hooks ([#512](https://github.com/TanStack/ai/pull/512))
  (`useChat` / `createChat`), mirroring the `fetcher` option on the
  generation hooks. Pass either `connection` or `fetcher` — the XOR is
  enforced at the type level via `ChatTransport`.

  ```ts
  useChat({
    fetcher: ({ messages }, { signal }) =>
      chatFn({ data: { messages }, signal }),
  })
  ```

  The fetcher may return either a `Response` (parsed as SSE) or an
  `AsyncIterable<StreamChunk>` (yielded directly). `stream()`,
  `fetchServerSentEvents`, `fetchHttpStream`, and `rpcStream` are unchanged.

- Updated dependencies [[`ad23da9`](https://github.com/TanStack/ai/commit/ad23da92c279759b3778672dcee3d1616a02994b)]:
  - @tanstack/ai-client@0.12.0

## 0.10.8

### Patch Changes

- Updated dependencies [[`02f7d04`](https://github.com/TanStack/ai/commit/02f7d0427a406bd2dda6f5a51d1ef1d2600d5ac9)]:
  - @tanstack/ai@0.22.0
  - @tanstack/ai-client@0.11.8

## 0.10.7

### Patch Changes

- Updated dependencies [[`e144a53`](https://github.com/TanStack/ai/commit/e144a53e4348bb0bc365dbe342c8538544242227)]:
  - @tanstack/ai@0.21.3
  - @tanstack/ai-client@0.11.7

## 0.10.6

### Patch Changes

- Refresh package README content and npm metadata for better discoverability. ([#626](https://github.com/TanStack/ai/pull/626))

- Updated dependencies [[`ebeb22e`](https://github.com/TanStack/ai/commit/ebeb22ec68f456b09e0181ac6f5d1ac25a0affd2)]:
  - @tanstack/ai@0.21.2
  - @tanstack/ai-client@0.11.6

## 0.10.5

### Patch Changes

- Updated dependencies [[`573f12e`](https://github.com/TanStack/ai/commit/573f12eb5a3b04a2625be92900099f48d6f76632)]:
  - @tanstack/ai@0.21.1
  - @tanstack/ai-client@0.11.5

## 0.10.4

### Patch Changes

- Expose the connection adapter primitives needed to build custom ([#597](https://github.com/TanStack/ai/pull/597))
  transports from every framework hook package. `@tanstack/ai-client`
  now re-exports `RunAgentInputContext` at its entry point, and
  `@tanstack/ai-react`, `@tanstack/ai-vue`, `@tanstack/ai-solid`,
  `@tanstack/ai-svelte`, and `@tanstack/ai-preact` now re-export
  `rpcStream`, `ConnectConnectionAdapter`, `SubscribeConnectionAdapter`,
  and `RunAgentInputContext` alongside the existing `stream`,
  `fetchServerSentEvents`, and `fetchHttpStream` re-exports.

  Previously, authors of WebSocket / persistent or RPC-backed adapters
  had to import these symbols from `@tanstack/ai-client` even though
  they were already pulling `useChat` from a framework package. No
  runtime change.

- Updated dependencies [[`ec1393d`](https://github.com/TanStack/ai/commit/ec1393db4383798e5f2574dfd87779c22c309529), [`a03d12b`](https://github.com/TanStack/ai/commit/a03d12b13ade93f3e262c6ffa996696ce27472ef), [`188fe11`](https://github.com/TanStack/ai/commit/188fe11b9b9691e5a241cfc416803da5b8ce5376)]:
  - @tanstack/ai@0.21.0
  - @tanstack/ai-client@0.11.4

## 0.10.3

### Patch Changes

- Updated dependencies [[`2ad137b`](https://github.com/TanStack/ai/commit/2ad137bd22512248bd1684cccce35ba89597cf96)]:
  - @tanstack/ai@0.20.1
  - @tanstack/ai-client@0.11.3

## 0.10.2

### Patch Changes

- Updated dependencies [[`496db9c`](https://github.com/TanStack/ai/commit/496db9c42a7d3051a1295091eae29ae1c31ef997)]:
  - @tanstack/ai@0.20.0
  - @tanstack/ai-client@0.11.2

## 0.10.1

### Patch Changes

- Updated dependencies [[`617b5b5`](https://github.com/TanStack/ai/commit/617b5b512a6b3989c442efa41975dacc194d882a)]:
  - @tanstack/ai@0.19.1
  - @tanstack/ai-client@0.11.1

## 0.10.0

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

- Updated dependencies [[`2e0e2eb`](https://github.com/TanStack/ai/commit/2e0e2eb72684aac82e570d57767656e218289b49)]:
  - @tanstack/ai@0.19.0
  - @tanstack/ai-client@0.11.0

## 0.9.0

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

- Updated dependencies [[`a9d1916`](https://github.com/TanStack/ai/commit/a9d19165a5028515cf1d091d611c8ac4b5b86099), [`e810153`](https://github.com/TanStack/ai/commit/e810153b34e593d3f3e1bbd8050164a6ad4423ed)]:
  - @tanstack/ai@0.18.0
  - @tanstack/ai-client@0.10.0

## 0.8.0

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

- Updated dependencies [[`98979f7`](https://github.com/TanStack/ai/commit/98979f7e72f4b5bfb816fb14b60a12871f8c4bec), [`02527c2`](https://github.com/TanStack/ai/commit/02527c28c3285829535cd486e529e659260b3c5d)]:
  - @tanstack/ai@0.17.0
  - @tanstack/ai-client@0.9.2

## 0.7.2

### Patch Changes

- Updated dependencies [[`87f305c`](https://github.com/TanStack/ai/commit/87f305c9961d608fd7bea93a5100698a98aed11d)]:
  - @tanstack/ai@0.16.0
  - @tanstack/ai-client@0.9.1

## 0.7.1

### Patch Changes

- Updated dependencies [[`a4e2c55`](https://github.com/TanStack/ai/commit/a4e2c55a79490c2245ff2de2d3e1803a533c867b), [`82078bd`](https://github.com/TanStack/ai/commit/82078bdabe28d7d4a15a2847d667f363bf0a9cbe), [`b2d3cc1`](https://github.com/TanStack/ai/commit/b2d3cc131a31c54bd1e5841f958fbe333514e508), [`13cceae`](https://github.com/TanStack/ai/commit/13cceaedf64e398ca15b8dbbbfe215329ea26794)]:
  - @tanstack/ai@0.15.0
  - @tanstack/ai-client@0.9.0

## 0.7.0

### Minor Changes

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

### Patch Changes

- fix(ai-react, ai-preact, ai-vue, ai-solid): propagate `useChat` callback changes ([#465](https://github.com/TanStack/ai/pull/465))

  `onResponse`, `onChunk`, and `onCustomEvent` were captured by reference at client creation time. When a parent component re-rendered with fresh closures, the `ChatClient` kept calling the originals. Every framework now wraps these callbacks so the latest `options.xxx` is read at call time (via `optionsRef.current` in React/Preact, and direct option access in Vue/Solid, matching the pattern already used for `onFinish` / `onError`). Clearing a callback (setting it to `undefined`) now correctly no-ops instead of continuing to invoke the stale handler.

- Updated dependencies [[`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`af9eb7b`](https://github.com/TanStack/ai/commit/af9eb7bbb875b23b7e99b2e6b743636daad402d1), [`008f015`](https://github.com/TanStack/ai/commit/008f0154f852e7e6734d3e3d35cad47780b52b7a), [`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a)]:
  - @tanstack/ai@0.14.0
  - @tanstack/ai-client@0.8.0

## 0.6.19

### Patch Changes

- Updated dependencies [[`c1fd96f`](https://github.com/TanStack/ai/commit/c1fd96ffbcee1372ab039127903162bdf5543dd9)]:
  - @tanstack/ai@0.13.0
  - @tanstack/ai-client@0.7.14

## 0.6.18

### Patch Changes

- Updated dependencies [[`e32583e`](https://github.com/TanStack/ai/commit/e32583e7612cede932baee6a79355e96e7124d90)]:
  - @tanstack/ai@0.12.0
  - @tanstack/ai-client@0.7.13

## 0.6.17

### Patch Changes

- Updated dependencies [[`633a3d9`](https://github.com/TanStack/ai/commit/633a3d93fff27e3de7c10ce0059b2d5d87f33245)]:
  - @tanstack/ai@0.11.1
  - @tanstack/ai-client@0.7.12

## 0.6.16

### Patch Changes

- Updated dependencies [[`12d43e5`](https://github.com/TanStack/ai/commit/12d43e55073351a6a2b5b21861b8e28c657b92b7), [`12d43e5`](https://github.com/TanStack/ai/commit/12d43e55073351a6a2b5b21861b8e28c657b92b7), [`1d6f3be`](https://github.com/TanStack/ai/commit/1d6f3bef4fd1c4917823612fbcd9450a0fd2e627)]:
  - @tanstack/ai@0.11.0
  - @tanstack/ai-client@0.7.11

## 0.6.15

### Patch Changes

- Updated dependencies [[`c780bc1`](https://github.com/TanStack/ai/commit/c780bc127755ecf7e900343bf0e4d4823ff526ca)]:
  - @tanstack/ai@0.10.3
  - @tanstack/ai-client@0.7.10

## 0.6.14

### Patch Changes

- Updated dependencies [[`4445410`](https://github.com/TanStack/ai/commit/44454100e5825f948bab0ce52c57c80d70c0ebe7)]:
  - @tanstack/ai@0.10.2
  - @tanstack/ai-client@0.7.9

## 0.6.13

### Patch Changes

- Updated dependencies [[`1d1c58f`](https://github.com/TanStack/ai/commit/1d1c58f33188ff98893edb626efd66ac73b8eadb)]:
  - @tanstack/ai@0.10.1
  - @tanstack/ai-client@0.7.8

## 0.6.12

### Patch Changes

- Updated dependencies [[`54abae0`](https://github.com/TanStack/ai/commit/54abae063c91b8b04b91ecb2c6785f5ff9168a7c)]:
  - @tanstack/ai@0.10.0
  - @tanstack/ai-client@0.7.7

## 0.6.11

### Patch Changes

- Updated dependencies [[`c0ae603`](https://github.com/TanStack/ai/commit/c0ae603b4febbfc2d5f549a67e107a4bd0ec09cc)]:
  - @tanstack/ai-client@0.7.6

## 0.6.10

### Patch Changes

- Updated dependencies [[`26d8243`](https://github.com/TanStack/ai/commit/26d8243bab564a547fed8adb5e129d981ba228ea)]:
  - @tanstack/ai@0.9.2
  - @tanstack/ai-client@0.7.5

## 0.6.9

### Patch Changes

- Updated dependencies [[`b8cc69e`](https://github.com/TanStack/ai/commit/b8cc69e15eda49ce68cc48848284b0d74a55a97c)]:
  - @tanstack/ai@0.9.1
  - @tanstack/ai-client@0.7.4

## 0.6.8

### Patch Changes

- Updated dependencies [[`842e119`](https://github.com/TanStack/ai/commit/842e119a07377307ba0834ccca0e224dcb5c46ea)]:
  - @tanstack/ai@0.9.0
  - @tanstack/ai-client@0.7.3

## 0.6.7

### Patch Changes

- Add an explicit subscription lifecycle to `ChatClient` with `subscribe()`/`unsubscribe()`, `isSubscribed`, `connectionStatus`, and `sessionGenerating`, while keeping request lifecycle state separate from long-lived connection state for durable chat sessions. ([#356](https://github.com/TanStack/ai/pull/356))

  Update the React, Preact, Solid, Svelte, and Vue chat bindings with `live` mode plus reactive subscription/session state, and improve `StreamProcessor` handling for concurrent runs and reconnects so active sessions do not finalize early or duplicate resumed assistant messages.

- Add durable `subscribe()`/`send()` transport support to `ChatClient` while preserving compatibility with existing `connect()` adapters. This also introduces shared generation clients for one-shot streaming tasks and updates the framework wrappers to use the new generation transport APIs. ([#286](https://github.com/TanStack/ai/pull/286))

  Improve core stream processing to better handle concurrent runs and resumed streams so shared sessions stay consistent during reconnects and overlapping generations.

- Updated dependencies [[`64b9cba`](https://github.com/TanStack/ai/commit/64b9cba2ebf89162b809ba575c49ef12c0e87ee7), [`dc53e1b`](https://github.com/TanStack/ai/commit/dc53e1b89fddf6fc744e4788731e8ca64ec3d250)]:
  - @tanstack/ai@0.8.1
  - @tanstack/ai-client@0.7.2

## 0.6.6

### Patch Changes

- Updated dependencies [[`f62eeb0`](https://github.com/TanStack/ai/commit/f62eeb0d7efd002894435c7f2c8a9f2790f0b6d7)]:
  - @tanstack/ai@0.8.0
  - @tanstack/ai-client@0.7.1

## 0.6.5

### Patch Changes

- Updated dependencies [[`86be1c8`](https://github.com/TanStack/ai/commit/86be1c8262bb3176ea786aa0af115b38c3e3f51a)]:
  - @tanstack/ai@0.7.0
  - @tanstack/ai-client@0.7.0

## 0.6.4

### Patch Changes

- feat: pass abort signal to generation fetchers and extract GenerationFetcher utility type ([#327](https://github.com/TanStack/ai/pull/327))
  - Generation clients now forward an `AbortSignal` to fetcher functions via an optional `options` parameter, enabling cancellation support when `stop()` is called
  - Introduced `GenerationFetcher<TInput, TResult>` utility type in `@tanstack/ai-client` to centralize the fetcher function signature across all framework integrations
  - All framework hooks/composables (React, Solid, Vue, Svelte) now use the shared `GenerationFetcher` type instead of inline definitions

- Updated dependencies [[`6dfffca`](https://github.com/TanStack/ai/commit/6dfffca99aeac1ada59eb288f8eb09e564d3db1e), [`6dfffca`](https://github.com/TanStack/ai/commit/6dfffca99aeac1ada59eb288f8eb09e564d3db1e)]:
  - @tanstack/ai@0.6.3
  - @tanstack/ai-client@0.6.0

## 0.6.3

### Patch Changes

- Updated dependencies [[`2ee0b33`](https://github.com/TanStack/ai/commit/2ee0b33386c1f1604c04c1f2f78a859f8a83fd2d)]:
  - @tanstack/ai@0.6.2
  - @tanstack/ai-client@0.5.3

## 0.6.2

### Patch Changes

- Updated dependencies [[`4fe31d4`](https://github.com/TanStack/ai/commit/4fe31d41c2c67ea721173d63cdfd5fbcbaf13d93)]:
  - @tanstack/ai-client@0.5.2

## 0.6.1

### Patch Changes

- Updated dependencies [[`d8678e2`](https://github.com/TanStack/ai/commit/d8678e254a8edfa4f95eeb059aa30083c18f52f8)]:
  - @tanstack/ai@0.6.1
  - @tanstack/ai-client@0.5.1

## 0.6.0

### Patch Changes

- feat: add custom event dispatch support for tools ([#293](https://github.com/TanStack/ai/pull/293))

  Tools can now emit custom events during execution via `dispatchEvent()`. Custom events are streamed to clients as `custom_event` stream chunks and surfaced through the client chat hook's `onCustomEvent` callback. This enables tools to send progress updates, intermediate results, or any structured data back to the UI during long-running operations.

- Updated dependencies [[`5aa6acc`](https://github.com/TanStack/ai/commit/5aa6acc1a4faea5346f750322e80984abf2d7059), [`1f800aa`](https://github.com/TanStack/ai/commit/1f800aacf57081f37a075bc8d08ff397cb33cbe9)]:
  - @tanstack/ai@0.6.0
  - @tanstack/ai-client@0.5.0

## 0.5.4

### Patch Changes

- Updated dependencies [[`58702bc`](https://github.com/TanStack/ai/commit/58702bcaad31c46f8fd747b2f0e1daff2003beb9)]:
  - @tanstack/ai@0.5.1
  - @tanstack/ai-client@0.4.5

## 0.5.3

### Patch Changes

- Updated dependencies [[`5d98472`](https://github.com/TanStack/ai/commit/5d984722e1f84725e3cfda834fbda3d0341ecedd), [`5d98472`](https://github.com/TanStack/ai/commit/5d984722e1f84725e3cfda834fbda3d0341ecedd)]:
  - @tanstack/ai@0.5.0
  - @tanstack/ai-client@0.4.4

## 0.5.2

### Patch Changes

- Updated dependencies [[`6f886e9`](https://github.com/TanStack/ai/commit/6f886e96f2478374520998395357fdf3aa9149ab)]:
  - @tanstack/ai@0.4.2
  - @tanstack/ai-client@0.4.3

## 0.5.1

### Patch Changes

- Updated dependencies [[`6e1bb50`](https://github.com/TanStack/ai/commit/6e1bb5097178a6ad795273ca715f1e09d3f5a006)]:
  - @tanstack/ai@0.4.1
  - @tanstack/ai-client@0.4.2

## 0.5.0

### Minor Changes

- add multiple modalities support to the client ([#263](https://github.com/TanStack/ai/pull/263))

### Patch Changes

- Updated dependencies [[`0158d14`](https://github.com/TanStack/ai/commit/0158d14df00639ff5325680ae91b7791c189e60f)]:
  - @tanstack/ai@0.4.0
  - @tanstack/ai-client@0.4.1

## 0.4.0

### Minor Changes

- Added status property to useChat to track the generation lifecycle (ready, submitted, streaming, error) ([#247](https://github.com/TanStack/ai/pull/247))

### Patch Changes

- Updated dependencies [[`99ccee5`](https://github.com/TanStack/ai/commit/99ccee5c72df12adc13bede98142c6da84d13cc4), [`230bab6`](https://github.com/TanStack/ai/commit/230bab6417c8ff2c25586a12126c85e27dd7bc15)]:
  - @tanstack/ai-client@0.4.0
  - @tanstack/ai@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [[`e52135f`](https://github.com/TanStack/ai/commit/e52135f6ec3285227679411636e208ae84a408d7)]:
  - @tanstack/ai@0.3.0
  - @tanstack/ai-client@0.3.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`7573619`](https://github.com/TanStack/ai/commit/7573619a234d1a50bd2ac098d64524447ebc5869)]:
  - @tanstack/ai@0.2.2
  - @tanstack/ai-client@0.2.2

## 0.2.1

### Patch Changes

- Fix up model names for OpenAI and release the new response APIs ([#188](https://github.com/TanStack/ai/pull/188))

- Updated dependencies [[`181e0ac`](https://github.com/TanStack/ai/commit/181e0acdfb44b27db6cf871b36593c0f867cadf9), [`181e0ac`](https://github.com/TanStack/ai/commit/181e0acdfb44b27db6cf871b36593c0f867cadf9)]:
  - @tanstack/ai@0.2.1
  - @tanstack/ai-client@0.2.1

## 0.2.0

### Minor Changes

- Standard schema / standard json schema support for TanStack AI ([#165](https://github.com/TanStack/ai/pull/165))

### Patch Changes

- Updated dependencies [[`c5df33c`](https://github.com/TanStack/ai/commit/c5df33c2d3e72c3332048ffe7c64a553e5ea86fb)]:
  - @tanstack/ai-client@0.2.0
  - @tanstack/ai@0.2.0

## 0.1.0

### Minor Changes

- Split up adapters for better tree shaking into separate functionalities ([#137](https://github.com/TanStack/ai/pull/137))

### Patch Changes

- Updated dependencies [[`8d77614`](https://github.com/TanStack/ai/commit/8d776146f94ffd1579e1ab01b26dcb94d1bb3092)]:
  - @tanstack/ai@0.1.0
  - @tanstack/ai-client@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies [[`52c3172`](https://github.com/TanStack/ai/commit/52c317244294a75b0c7f5e6cafc8583fbb6abfb7)]:
  - @tanstack/ai@0.0.3
  - @tanstack/ai-client@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [[`a7bd563`](https://github.com/TanStack/ai/commit/a7bd5639eb2fbf1b4169eb307f77149f4a85a915), [`64fda55`](https://github.com/TanStack/ai/commit/64fda55f839062bc67b8c24850123e879fdbf0b3)]:
  - @tanstack/ai-client@0.0.2
  - @tanstack/ai@0.0.2

## 0.0.1

### Patch Changes

- Initial release of TanStack AI ([#72](https://github.com/TanStack/ai/pull/72))

- Updated dependencies [[`a9b54c2`](https://github.com/TanStack/ai/commit/a9b54c21282d16036a427761e0784b159a6f2d99)]:
  - @tanstack/ai-client@0.0.1
  - @tanstack/ai@0.0.1
