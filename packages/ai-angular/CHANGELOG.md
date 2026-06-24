# @tanstack/ai-angular

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
