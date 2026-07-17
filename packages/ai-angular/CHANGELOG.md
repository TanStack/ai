# @tanstack/ai-angular

## 0.2.4

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

## 0.2.3

### Patch Changes

- Updated dependencies [[`5deda27`](https://github.com/TanStack/ai/commit/5deda27085c8785894a28feb5bb3655dbd8f7e0a)]:
  - @tanstack/ai@0.40.0
  - @tanstack/ai-client@0.20.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`afba322`](https://github.com/TanStack/ai/commit/afba32236022589afce4d5a165fd4a8a884ae57d), [`e7ad181`](https://github.com/TanStack/ai/commit/e7ad181cad20c5d6560f480835c99ff1142b40af)]:
  - @tanstack/ai@0.39.1
  - @tanstack/ai-client@0.19.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4)]:
  - @tanstack/ai@0.39.0
  - @tanstack/ai-client@0.19.1

## 0.2.0

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

## 0.1.11

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

## 0.1.10

### Patch Changes

- Updated dependencies [[`fbd3762`](https://github.com/TanStack/ai/commit/fbd37623b287e370aa5678e161dec19cf13ae33b)]:
  - @tanstack/ai@0.36.0
  - @tanstack/ai-client@0.18.5

## 0.1.9

### Patch Changes

- Updated dependencies [[`c04abd3`](https://github.com/TanStack/ai/commit/c04abd35284d464d830bb9f15129c7a7c2533d3f)]:
  - @tanstack/ai@0.35.0
  - @tanstack/ai-client@0.18.4

## 0.1.8

### Patch Changes

- [#826](https://github.com/TanStack/ai/pull/826) [`da0feb1`](https://github.com/TanStack/ai/commit/da0feb1096b51a0ed73e73df7d8b2b81ee077b46) - Publish a working `@tanstack/ai-angular` build. The only version previously on npm (`0.0.1`) was seeded with a manual `npm publish` and shipped unresolved `workspace:` specifiers in its `dependencies`/`peerDependencies`, making it uninstallable (`EUNSUPPORTEDPROTOCOL`). Releasing through the changesets pipeline rewrites those specifiers to concrete versions.

## 0.1.7

### Patch Changes

- Updated dependencies [[`540cbf1`](https://github.com/TanStack/ai/commit/540cbf18a2f7d6c07b44f7f4da0ac3873c0d2581), [`4188693`](https://github.com/TanStack/ai/commit/4188693d09297ce400eb1ba5fab30cfea2fdb8a6)]:
  - @tanstack/ai-client@0.18.3
  - @tanstack/ai@0.34.1

## 0.1.6

### Patch Changes

- Updated dependencies [[`31de22b`](https://github.com/TanStack/ai/commit/31de22b1ae780c53e3abbf9cf17e1db7b62de84a)]:
  - @tanstack/ai@0.34.0
  - @tanstack/ai-client@0.18.2

## 0.1.5

### Patch Changes

- Updated dependencies [[`2cb0313`](https://github.com/TanStack/ai/commit/2cb0313c1f13e1db37c5550308e36bb0b9b73b98), [`18e5f4d`](https://github.com/TanStack/ai/commit/18e5f4d9746a26c3194929ea4b49673728e8eaa5), [`21720dd`](https://github.com/TanStack/ai/commit/21720dd73524d624594a6dfb7e4669c03cc08af0), [`243b8fa`](https://github.com/TanStack/ai/commit/243b8fad7e8a48b68a1a96962ee1443cbd6a0ced)]:
  - @tanstack/ai@0.33.0
  - @tanstack/ai-client@0.18.1

## 0.1.4

### Patch Changes

- Updated dependencies [[`8fa6cc5`](https://github.com/TanStack/ai/commit/8fa6cc56c5f36e22885c98a511dcceb2bfc0da1f), [`8fa6cc5`](https://github.com/TanStack/ai/commit/8fa6cc56c5f36e22885c98a511dcceb2bfc0da1f)]:
  - @tanstack/ai@0.32.0
  - @tanstack/ai-client@0.18.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`07aaf8b`](https://github.com/TanStack/ai/commit/07aaf8b9e5a8e699be25f936cc9cd651a46c16c5)]:
  - @tanstack/ai@0.31.0
  - @tanstack/ai-client@0.17.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`4d5141c`](https://github.com/TanStack/ai/commit/4d5141c128c0e9bd33cdbf36a5402811cefc3f8b)]:
  - @tanstack/ai-client@0.17.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`7103348`](https://github.com/TanStack/ai/commit/71033488212bff05dcccc857e721ab9262ebc2a6), [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b)]:
  - @tanstack/ai@0.30.0
  - @tanstack/ai-client@0.17.1

## 0.1.0

### Minor Changes

- [#762](https://github.com/TanStack/ai/pull/762) [`24028c5`](https://github.com/TanStack/ai/commit/24028c59d7c2c2d19c5685865fa6bc6d466ca16b) - Add `@tanstack/ai-angular`: an Angular signals adapter for TanStack AI, at feature parity with `@tanstack/ai-vue`. Exposes `injectChat` (streaming chat with tools, structured outputs, and fully reactive `body`/`forwardedProps`/`context`/`live` options that accept a value, `Signal`, or getter) plus media-generation functions `injectGeneration`, `injectGenerateImage`, `injectGenerateAudio`, `injectGenerateSpeech`, `injectGenerateVideo`, `injectTranscription`, and `injectSummarize`. All functions are called in an Angular injection context and return Angular signals.
