# @tanstack/ai-octane

## 0.8.0

### Minor Changes

- [#1700](https://github.com/TanStack/ai/pull/1700) [`77140d1`](https://github.com/TanStack/ai/commit/77140d1d1d612f374e0c339b0bc5f2b7eff51d1e) - Require octane `>=0.12.0`.
  - Octane 0.12 removed `Context.Provider`. `UI.Provider` and the other chat UI parts now render each context directly.
  - Projects that compile the adapter's `.tsrx` source need `@tsrx/oxc` installed. Octane 0.12 made it an optional peer.

### Patch Changes

- Updated dependencies [[`1bfcee3`](https://github.com/TanStack/ai/commit/1bfcee35bb3cf0ff3aac005440c842e66c3d687d), [`1bfcee3`](https://github.com/TanStack/ai/commit/1bfcee35bb3cf0ff3aac005440c842e66c3d687d)]:
  - @tanstack/ai@0.69.0
  - @tanstack/ai-client@0.39.3

## 0.7.3

### Patch Changes

- Updated dependencies [[`723b4a4`](https://github.com/TanStack/ai/commit/723b4a4e8432825374d4980cc74c5f66dc7d1122), [`d84a49e`](https://github.com/TanStack/ai/commit/d84a49e5fef03499b10f63255880d056a55767a3)]:
  - @tanstack/ai@0.68.0
  - @tanstack/ai-client@0.39.2

## 0.7.2

### Patch Changes

- Updated dependencies [[`7dbfaf6`](https://github.com/TanStack/ai/commit/7dbfaf6c37a3d97de3b1f5bdb87be8bbbe2b0164), [`88fd67c`](https://github.com/TanStack/ai/commit/88fd67cd7ddfbe2b154173d2395b2c0338e97644), [`3aa2e3d`](https://github.com/TanStack/ai/commit/3aa2e3d95e2dcb1c14b4fda3bcdbdf3152582092), [`c5ae415`](https://github.com/TanStack/ai/commit/c5ae4152d0a040bb6ce7321e16b7ee66d3c36f96), [`13ba1b0`](https://github.com/TanStack/ai/commit/13ba1b0e47dc822f10f6c5133184f92c2eb0a013), [`377262c`](https://github.com/TanStack/ai/commit/377262c0b4e5f59f8fd467a831b9341cc705077e)]:
  - @tanstack/ai@0.67.0
  - @tanstack/ai-client@0.39.1

## 0.7.1

### Patch Changes

- [#1658](https://github.com/TanStack/ai/pull/1658) [`f687c54`](https://github.com/TanStack/ai/commit/f687c54ae4b8a67f2154ff9dea0319b8d2712856) - Breaking: `chat({ stream: false })` and `streamToText()` now return a `ChatResult` with `text` and `chunks`, not a string. The chunks keep the tool calls and interrupt outcomes that the string lost. To migrate, change `const text = await chat({ stream: false })` to `const { text } = await chat({ stream: false })`.

  Add a JSON transport for hosts that cannot stream a response. On the server, `toJsonResponse()` sends a run as one JSON body, and `resumeJsonResponse()` sends the rest of a durable run. On the client, the `fetchJson()` connection adapter reads that body and asks again until the run is done. Each framework package re-exports `fetchJson`.

- Updated dependencies [[`f687c54`](https://github.com/TanStack/ai/commit/f687c54ae4b8a67f2154ff9dea0319b8d2712856), [`fb55bcb`](https://github.com/TanStack/ai/commit/fb55bcba5193d4465f43006505918a2dc4472ec4), [`2fc2315`](https://github.com/TanStack/ai/commit/2fc2315a3cd5cc0870b2b8a095be6dad0fa53c30), [`630ec86`](https://github.com/TanStack/ai/commit/630ec86e9997fabe046cae1a491060d72cbc71ea)]:
  - @tanstack/ai@0.66.0
  - @tanstack/ai-client@0.39.0

## 0.7.0

### Minor Changes

- [#1645](https://github.com/TanStack/ai/pull/1645) [`807c5e1`](https://github.com/TanStack/ai/commit/807c5e11dd1560e0fe47ae2dbc90f2513507f7cc) - `StructuredOutputPart.data` is no longer optional when `status` is `'complete'`. After you check `part.status === 'complete'`, TypeScript knows `part.data` is set.

  Migration: if you validate messages with a schema typed as `UIMessage` (for example `z.ZodType<UIMessage>`), split the `structured-output` part by `status`. Give `'complete'` a required `data` field.

  Add `isHydrating` to `useChat` (and `injectChat`, `createChat`) and an `onHydratingChange` callback plus `getIsHydrating()` to `ChatClient`. It is `true` while the chat is rebuilt from persistence (the server hydrate with `persistence: true`, or an async storage adapter). It turns `false` when the transcript is in place and any in-flight run is re-joined, or when the load fails.

### Patch Changes

- Updated dependencies [[`807c5e1`](https://github.com/TanStack/ai/commit/807c5e11dd1560e0fe47ae2dbc90f2513507f7cc)]:
  - @tanstack/ai@0.65.1
  - @tanstack/ai-client@0.38.0

## 0.6.6

### Patch Changes

- Updated dependencies [[`7b6b1a9`](https://github.com/TanStack/ai/commit/7b6b1a99d45e40165f0a1f833a04e793a09275de), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`82291b2`](https://github.com/TanStack/ai/commit/82291b22941d2c813ff0050fc9d41b024480153d), [`ff3a66e`](https://github.com/TanStack/ai/commit/ff3a66ed8f628d45b282316fab337d3ed19f34cd), [`560c76f`](https://github.com/TanStack/ai/commit/560c76fd638b5691e195e1d0619fee8a78d98c20), [`4b9dcb4`](https://github.com/TanStack/ai/commit/4b9dcb44d8fe1e7c933b79c23d8f072e7bc300f4), [`30254ad`](https://github.com/TanStack/ai/commit/30254ad70161894d232d3b45e3b21f45d49f336e), [`40fdd22`](https://github.com/TanStack/ai/commit/40fdd22ce05d55e71514b4cc80b1c28cefb4a431)]:
  - @tanstack/ai@0.65.0
  - @tanstack/ai-client@0.37.0

## 0.6.5

### Patch Changes

- Updated dependencies [[`4c57d04`](https://github.com/TanStack/ai/commit/4c57d04f0f5dd98e176386f3208b68daf9e7d929), [`e436250`](https://github.com/TanStack/ai/commit/e4362509fd7becad7175ce895178cd3b107fcd4b), [`4c57d04`](https://github.com/TanStack/ai/commit/4c57d04f0f5dd98e176386f3208b68daf9e7d929)]:
  - @tanstack/ai-client@0.36.2
  - @tanstack/ai@0.64.1

## 0.6.4

### Patch Changes

- Updated dependencies [[`3a09cf0`](https://github.com/TanStack/ai/commit/3a09cf04431a45810051ea5df6bb3935af421ddb), [`ee726f5`](https://github.com/TanStack/ai/commit/ee726f537dbb036d5edb756b92739afaa7573824), [`a5fce7f`](https://github.com/TanStack/ai/commit/a5fce7f95b8b9c6eb57697aa1e3f587bf27483b9), [`94116ad`](https://github.com/TanStack/ai/commit/94116ad137015b6f62fe62b4c06a335dbde36a49)]:
  - @tanstack/ai@0.64.0
  - @tanstack/ai-client@0.36.1

## 0.6.3

### Patch Changes

- Updated dependencies [[`37b2826`](https://github.com/TanStack/ai/commit/37b282655ea9c780e9793ef33013d64b1bf88625), [`8e8ee26`](https://github.com/TanStack/ai/commit/8e8ee26959a471bb6fac180ded3a9a048ae93609), [`c5c1996`](https://github.com/TanStack/ai/commit/c5c19961b8c98497fd88ae93c5d6330d7b2ecb6a), [`3e30cde`](https://github.com/TanStack/ai/commit/3e30cde8ae7f5be7be3bc9c4f30c842159fc7edf), [`0eb8f0b`](https://github.com/TanStack/ai/commit/0eb8f0b7f4ffa0133a814f8fcfccbc1acedd7488), [`f44b6b2`](https://github.com/TanStack/ai/commit/f44b6b22578b893501e05612f02ea1aaee0951d3), [`d632d41`](https://github.com/TanStack/ai/commit/d632d41df227bf11bc3cdbf5542823f87562b3d4)]:
  - @tanstack/ai@0.63.0
  - @tanstack/ai-client@0.36.0

## 0.6.2

### Patch Changes

- Updated dependencies [[`dc11e34`](https://github.com/TanStack/ai/commit/dc11e34c3a37cdcd94f24293d25efad423b68a41), [`a450d00`](https://github.com/TanStack/ai/commit/a450d007a039610994342dd9c3387f880a4eb992), [`c54e20c`](https://github.com/TanStack/ai/commit/c54e20cf5be8e1f73e0be661e242391fa0e4633e), [`73f25f7`](https://github.com/TanStack/ai/commit/73f25f7c60ac022bcfd1cbb0b95c9e03787ee1e2), [`a56192e`](https://github.com/TanStack/ai/commit/a56192eafa0da2ccca2d576dc4371b196355c605), [`740ae66`](https://github.com/TanStack/ai/commit/740ae6664d358f00deddf72319ef947fe3bb0935), [`5099a32`](https://github.com/TanStack/ai/commit/5099a32cbfb6c77e335769793415fe7e90bb17d8), [`820429f`](https://github.com/TanStack/ai/commit/820429fa9bea8ba220cf073406760475ac07b112), [`0abae97`](https://github.com/TanStack/ai/commit/0abae97f94fe4d37523f8a6427972ae7fe3b7fde), [`8c68c2d`](https://github.com/TanStack/ai/commit/8c68c2d9750bcc818201089bbbb7d90aa26d99a1)]:
  - @tanstack/ai-client@0.35.2
  - @tanstack/ai@0.62.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`54d39d3`](https://github.com/TanStack/ai/commit/54d39d30704bbdbdccea756af31530cc6713fc2e), [`e4827e2`](https://github.com/TanStack/ai/commit/e4827e223a84dcfaeead4ff0575a74ba0ba1a60b), [`a620c90`](https://github.com/TanStack/ai/commit/a620c90dcfab7de11da930926f57c5148e8da127), [`2d047c5`](https://github.com/TanStack/ai/commit/2d047c5cf5f25c244c05f0cb0e816b9634616fbb), [`74b5823`](https://github.com/TanStack/ai/commit/74b582305471eaf37a3b68595e60ed1a6f42d914), [`abb0169`](https://github.com/TanStack/ai/commit/abb0169bf96c38f59791450ce060d089a7fcd26e), [`ed87986`](https://github.com/TanStack/ai/commit/ed87986069bcfe42a51cedf1365cc10662b0e088), [`a0f7c14`](https://github.com/TanStack/ai/commit/a0f7c14a9d9a4b2e72e87b976f46d193deb5921b)]:
  - @tanstack/ai@0.61.0
  - @tanstack/ai-client@0.35.1

## 0.6.0

### Minor Changes

- [#1466](https://github.com/TanStack/ai/pull/1466) [`012fb0a`](https://github.com/TanStack/ai/commit/012fb0af0d9a3f4bf7e450882c41f0394571248d) - Give the WebMCP tools on a page to your chat as client tools.
  - `getWebMCPTools()` and `subscribeWebMCPTools()` in `@tanstack/ai-client` read `document.modelContext` and return client tools. Each tool runs through WebMCP `executeTool()`. A `filter` option skips tools. Every framework package re-exports both functions.
  - Reject duplicate page tool names after filtering so tools from different frames cannot silently replace each other in chat.
  - New framework APIs return a reactive list: `usePageWebMCPTools` (React, Preact, Octane, Vue, Solid), `createPageWebMCPTools` (Svelte, Remix), and `injectPageWebMCPTools` (Angular).
  - The chat APIs in Preact, Vue, Solid, Svelte, Remix, and Angular now pick up `tools` that change after the chat is created. Vue accepts a ref or getter. Angular accepts a `Signal` or getter. Solid, Svelte, and Remix read a `get tools()` getter.
  - `useWebMCPTools`, `createWebMCPTools`, and `injectWebMCPTools` are now `useRegisterWebMCPTools`, `createRegisterWebMCPTools`, and `injectRegisterWebMCPTools`. The old names and their options types still work, but they are deprecated. They will be removed in 1.0.0.

### Patch Changes

- Updated dependencies [[`ef0a00f`](https://github.com/TanStack/ai/commit/ef0a00f09059abfd9e96eb1367e8ff0280458abd), [`012fb0a`](https://github.com/TanStack/ai/commit/012fb0af0d9a3f4bf7e450882c41f0394571248d)]:
  - @tanstack/ai@0.60.0
  - @tanstack/ai-client@0.35.0

## 0.5.4

### Patch Changes

- Updated dependencies [[`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0), [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0), [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0), [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0)]:
  - @tanstack/ai@0.59.0
  - @tanstack/ai-client@0.34.0

## 0.5.3

### Patch Changes

- Updated dependencies [[`796f2b5`](https://github.com/TanStack/ai/commit/796f2b5f7c05debe251ad3ecd4073d8cd119b3db)]:
  - @tanstack/ai@0.58.0
  - @tanstack/ai-client@0.33.2

## 0.5.2

### Patch Changes

- Updated dependencies [[`04bfd8c`](https://github.com/TanStack/ai/commit/04bfd8c26ce337cca53f3f8d286f14ed0432a329), [`254ab5f`](https://github.com/TanStack/ai/commit/254ab5ff5b0a9ca945cb313588f4b56394c7ecf7)]:
  - @tanstack/ai@0.57.0
  - @tanstack/ai-client@0.33.1

## 0.5.1

### Patch Changes

- Updated dependencies [[`7c4b25e`](https://github.com/TanStack/ai/commit/7c4b25ebefc64e4f209c282788f515939eca02e9), [`f60f736`](https://github.com/TanStack/ai/commit/f60f73612dd7621e2f1ad76abb1a640307dea3c6)]:
  - @tanstack/ai@0.56.0
  - @tanstack/ai-client@0.33.0

## 0.5.0

### Minor Changes

- [#1408](https://github.com/TanStack/ai/pull/1408) [`62ba217`](https://github.com/TanStack/ai/commit/62ba217d31231fe3ff43ae71b649e047d3a6c1b1) - Re-export the headless client from every framework package, and add a `/byok` subpath so you can import `defineByok` without installing `@tanstack/ai-client`.

### Patch Changes

- Updated dependencies [[`db79c23`](https://github.com/TanStack/ai/commit/db79c23e0591bf42f64e7809d3d50bf6950c2e61), [`3852e16`](https://github.com/TanStack/ai/commit/3852e16158168b911f544f6a23f377fb3db9cd45)]:
  - @tanstack/ai-client@0.32.1

## 0.4.0

### Minor Changes

- [#1400](https://github.com/TanStack/ai/pull/1400) [`0945a79`](https://github.com/TanStack/ai/commit/0945a79b0923b31a5122d0bf28c115879341a410) - Page long chat threads on hydrate. Pass `history: { pageSize }` with `persistence: true`. Then call `loadOlderMessages()` to prepend older turns. `withPersistence` merges incoming messages by id so a short client list keeps stored extras. `loadThread` accepts optional `limit` / `before` and can return a `MessagePage`.

### Patch Changes

- Updated dependencies [[`fa13446`](https://github.com/TanStack/ai/commit/fa13446fab9b9048de9433a5ebf55bc626f5fd74), [`0945a79`](https://github.com/TanStack/ai/commit/0945a79b0923b31a5122d0bf28c115879341a410)]:
  - @tanstack/ai@0.55.0
  - @tanstack/ai-client@0.32.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`8de8242`](https://github.com/TanStack/ai/commit/8de8242beb973cc6b1d1d781c81d922bd296736e), [`c17bc95`](https://github.com/TanStack/ai/commit/c17bc951ca783d8023bf54d69035c19c0c72ea2f), [`53e2ec0`](https://github.com/TanStack/ai/commit/53e2ec082b40d8c3fcd09f408c29f0b895436198), [`8689cb5`](https://github.com/TanStack/ai/commit/8689cb5ed7fadfb6ca7208e989422bde9e8c6145), [`6269eff`](https://github.com/TanStack/ai/commit/6269eff90e770205ffd9cae8c5989b8ff02b57ce)]:
  - @tanstack/ai-client@0.31.1
  - @tanstack/ai@0.54.0

## 0.3.0

### Minor Changes

- [#1302](https://github.com/TanStack/ai/pull/1302) [`82ced0f`](https://github.com/TanStack/ai/commit/82ced0f5018297e5756828ecc4d312ba78adeaab) - Add the `registerWebMCPTools` registrar to `@tanstack/ai-client`. Each framework package adds a lifecycle wrapper through `useWebMCPTools`, `createWebMCPTools`, or `injectWebMCPTools`.

### Patch Changes

- Updated dependencies [[`21775ee`](https://github.com/TanStack/ai/commit/21775ee2d23dd594cdc184678ff587341bd74871), [`82ced0f`](https://github.com/TanStack/ai/commit/82ced0f5018297e5756828ecc4d312ba78adeaab)]:
  - @tanstack/ai@0.53.0
  - @tanstack/ai-client@0.31.0

## 0.2.0

### Minor Changes

- [#1252](https://github.com/TanStack/ai/pull/1252) [`a4ab03e`](https://github.com/TanStack/ai/commit/a4ab03e213dcda2cd1120c9e7bf4824650996fae) - Add typed headless chat UI on `@tanstack/ai-preact/ui`, `@tanstack/ai-octane/ui`, and `@tanstack/ai-angular/ui`.

  Preact and Octane match the React `createChatHook` factory (`useAppChat`, layout slots as components). Angular uses the same factory name and option groups, with `injectAppChat`, signal chat state, and standalone component classes.

### Patch Changes

- Updated dependencies [[`a4ab03e`](https://github.com/TanStack/ai/commit/a4ab03e213dcda2cd1120c9e7bf4824650996fae)]:
  - @tanstack/ai-client@0.30.0

## 0.1.6

### Patch Changes

- Updated dependencies [[`49fc54c`](https://github.com/TanStack/ai/commit/49fc54ca0aacf2fc60bb36647a61a23559dda4bc), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7)]:
  - @tanstack/ai@0.52.0
  - @tanstack/ai-client@0.29.2

## 0.1.5

### Patch Changes

- Updated dependencies [[`5dc4e1a`](https://github.com/TanStack/ai/commit/5dc4e1a08728b410f85956093ccef621d12b4d6b), [`a7e0798`](https://github.com/TanStack/ai/commit/a7e079872af372496728d25e6ec23149cd5e04b9), [`6a083bf`](https://github.com/TanStack/ai/commit/6a083bfcfaa4fd0c83368c4d10067e5c2298e22c)]:
  - @tanstack/ai@0.51.0
  - @tanstack/ai-client@0.29.1

## 0.1.4

### Patch Changes

- Updated dependencies [[`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b), [`4e9c5d2`](https://github.com/TanStack/ai/commit/4e9c5d2887dc9a3d64fce6ed424aa68f451e20f6), [`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b)]:
  - @tanstack/ai@0.50.0
  - @tanstack/ai-client@0.29.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`ad3840c`](https://github.com/TanStack/ai/commit/ad3840c44bd09860b29cd22f24a0cdce3adaf9dc), [`67ce4e5`](https://github.com/TanStack/ai/commit/67ce4e529c42e64d4591f996c7e3e32458d5dd7c), [`365efb8`](https://github.com/TanStack/ai/commit/365efb870e5a3fe084d0969f71781ffc772e39a0), [`a955710`](https://github.com/TanStack/ai/commit/a9557101048286c225145bad058ca81ff275b330), [`a74817a`](https://github.com/TanStack/ai/commit/a74817a38e8deb4c7ff86d81067db12befbadf5d)]:
  - @tanstack/ai-client@0.28.0
  - @tanstack/ai@0.49.1

## 0.1.2

### Patch Changes

- Updated dependencies [[`b7ebcb0`](https://github.com/TanStack/ai/commit/b7ebcb0bbe63e425facb5e38f138bd0cd36637dd)]:
  - @tanstack/ai@0.49.0
  - @tanstack/ai-client@0.27.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`1c0415b`](https://github.com/TanStack/ai/commit/1c0415bec4bbefcd3abf784d0209af05aca5db46)]:
  - @tanstack/ai@0.48.0
  - @tanstack/ai-client@0.26.0

## 0.1.0

### Minor Changes

- [#1000](https://github.com/TanStack/ai/pull/1000) [`25f06d1`](https://github.com/TanStack/ai/commit/25f06d1ac7266d21bdbc30312ffb8228259444fd) - Add `@tanstack/ai-octane` — [Octane](https://github.com/octanejs/octane) bindings for TanStack AI.

  This is a port of `@octanejs/tanstack-ai@0.0.11`, which lived in the
  octanejs/octane repo as a temporary stopgap. The code moves here essentially
  unchanged apart from the rename; the runtime surface is the same.

  The package covers the `@tanstack/ai-react` hook surface — `useChat`,
  `useRealtimeChat`, `useMcpAppBridge`, `useGeneration`, `useGenerateImage` /
  `Audio` / `Speech` / `Video`, `useTranscription`, `useSummarize`,
  `useAudioRecorder` — plus the 30 `@tanstack/ai-client` convenience re-exports,
  reusing `@tanstack/ai` and `@tanstack/ai-client` unchanged. SSR through
  `octane/server` is supported and tested.

  Three defects found while reviewing the port were fixed rather than mirrored, and
  are covered by tests (each verified to fail if the fix is reverted). Issues are
  filed upstream so the React adapter can catch up:
  - `useAudioRecorder`'s transforming overload now requires `onComplete`.
    Previously, passing any unrelated option (`useAudioRecorder({ onError })`)
    matched it, inferred `TOnComplete` as `unknown`, and silently collapsed
    `recording`/`stop()` to `unknown`.
  - `useGeneration` spreads caller `devtools` metadata before the hardcoded
    `framework`/`hookName`, so a caller can no longer misattribute the binding in
    the devtools. The sibling hooks already ordered it this way.
  - `UseGenerationReturn` is now `<TInput, TOutput>` and types `generate` as
    `(input: TInput)` instead of widening to `(input: Record<string, any>)`, so
    required and narrow input fields are checked at the call site. This is the one
    place the public _type_ surface differs in shape from `@tanstack/ai-react`;
    the runtime surface is unchanged.

  Two other things to know:
  - Like Svelte packages shipping `.svelte`, this one publishes **uncompiled
    source**. The hook modules are `.tsrx` and are compiled by the consumer's
    Octane plugin, so there is no `dist` and `octane` is a required peer. The
    `.tsrx.d.ts` companions are checked declaration emits, so the full generic
    surface is preserved for TypeScript consumers.
  - `useChat` matches the current ChatClient shape: `threadId` identity, queue,
    `runId`, interrupts, `attach`/`detach`, and `SendMessageOptions`. The
    `./mcp-apps` subpath is not ported (it renders a React-only component). See
    `packages/ai-octane/status.json` for the full scope and divergence list.

### Patch Changes

- Updated dependencies [[`7c4b73a`](https://github.com/TanStack/ai/commit/7c4b73af5023e7ab7e113121644213c75d611aac), [`87e497f`](https://github.com/TanStack/ai/commit/87e497f2e282c2389579051ec743fa4cc8cf493e), [`2c7381c`](https://github.com/TanStack/ai/commit/2c7381c602d8fd05c20a0b41863f42b2568c0603), [`c0ba484`](https://github.com/TanStack/ai/commit/c0ba48402a807d6482e1cb36a0cf393d0cd26b2b), [`d34b6c0`](https://github.com/TanStack/ai/commit/d34b6c01fbc9ed83e5dc9bd2725eb05f6b03bfd4)]:
  - @tanstack/ai@0.47.3
  - @tanstack/ai-client@0.25.2
