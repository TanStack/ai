# @tanstack/ai-vue

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

## 0.0.2

### Patch Changes

- Updated dependencies [[`52c3172`](https://github.com/TanStack/ai/commit/52c317244294a75b0c7f5e6cafc8583fbb6abfb7)]:
  - @tanstack/ai@0.0.3
  - @tanstack/ai-client@0.0.3

## 0.0.1

### Patch Changes

- Introduce `useChat()` for Vue ([#84](https://github.com/TanStack/ai/pull/84))
