# @tanstack/ai-event-client

## 0.2.8

### Patch Changes

- Updated dependencies [[`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`af9eb7b`](https://github.com/TanStack/ai/commit/af9eb7bbb875b23b7e99b2e6b743636daad402d1), [`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a)]:
  - @tanstack/ai@0.14.0

## 0.2.7

### Patch Changes

- Updated dependencies [[`c1fd96f`](https://github.com/TanStack/ai/commit/c1fd96ffbcee1372ab039127903162bdf5543dd9)]:
  - @tanstack/ai@0.13.0

## 0.2.6

### Patch Changes

- Updated dependencies [[`e32583e`](https://github.com/TanStack/ai/commit/e32583e7612cede932baee6a79355e96e7124d90)]:
  - @tanstack/ai@0.12.0

## 0.2.5

### Patch Changes

- Updated dependencies [[`633a3d9`](https://github.com/TanStack/ai/commit/633a3d93fff27e3de7c10ce0059b2d5d87f33245)]:
  - @tanstack/ai@0.11.1

## 0.2.4

### Patch Changes

- Update the devtools middleware to match `@tanstack/ai`'s AG-UI-compliant event shapes so emitted instrumentation remains accurate after the strip-to-spec pass. ([#474](https://github.com/TanStack/ai/pull/474))

- Updated dependencies [[`12d43e5`](https://github.com/TanStack/ai/commit/12d43e55073351a6a2b5b21861b8e28c657b92b7)]:
  - @tanstack/ai@0.11.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`c780bc1`](https://github.com/TanStack/ai/commit/c780bc127755ecf7e900343bf0e4d4823ff526ca)]:
  - @tanstack/ai@0.10.3

## 0.2.2

### Patch Changes

- Updated dependencies [[`4445410`](https://github.com/TanStack/ai/commit/44454100e5825f948bab0ce52c57c80d70c0ebe7)]:
  - @tanstack/ai@0.10.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`1d1c58f`](https://github.com/TanStack/ai/commit/1d1c58f33188ff98893edb626efd66ac73b8eadb)]:
  - @tanstack/ai@0.10.1

## 0.2.0

### Minor Changes

- Add code mode and isolate packages for secure AI code execution ([#362](https://github.com/TanStack/ai/pull/362))

  Also includes fixes for Ollama tool call argument streaming and usage
  reporting, OpenAI realtime adapter handling of missing call_id/item_id,
  realtime client guards for missing toolCallId, and new DevtoolsChatMiddleware
  type export from ai-event-client.

### Patch Changes

- Updated dependencies [[`54abae0`](https://github.com/TanStack/ai/commit/54abae063c91b8b04b91ecb2c6785f5ff9168a7c)]:
  - @tanstack/ai@0.10.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`26d8243`](https://github.com/TanStack/ai/commit/26d8243bab564a547fed8adb5e129d981ba228ea)]:
  - @tanstack/ai@0.9.2

## 0.1.3

### Patch Changes

- Updated dependencies [[`b8cc69e`](https://github.com/TanStack/ai/commit/b8cc69e15eda49ce68cc48848284b0d74a55a97c)]:
  - @tanstack/ai@0.9.1

## 0.1.2

### Patch Changes

- Updated dependencies [[`842e119`](https://github.com/TanStack/ai/commit/842e119a07377307ba0834ccca0e224dcb5c46ea)]:
  - @tanstack/ai@0.9.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`64b9cba`](https://github.com/TanStack/ai/commit/64b9cba2ebf89162b809ba575c49ef12c0e87ee7), [`dc53e1b`](https://github.com/TanStack/ai/commit/dc53e1b89fddf6fc744e4788731e8ca64ec3d250)]:
  - @tanstack/ai@0.8.1

## 0.1.0

### Minor Changes

- feat: add middleware system and content guard middleware ([#367](https://github.com/TanStack/ai/pull/367))
  - **@tanstack/ai**: New `@tanstack/ai/middlewares` subpath with composable chat middleware architecture. Includes `contentGuardMiddleware` (delta and buffered strategies) and `toolCacheMiddleware`. Middleware hooks: `onStart`, `onIteration`, `onChunk`, `onToolPhaseComplete`, `onFinish`.
  - **@tanstack/ai-event-client**: Initial release. Extracted `devtoolsMiddleware` from `@tanstack/ai` core into a standalone package for tree-shaking. Emits all DevTools events as an observation-only middleware.
  - **@tanstack/ai-client**: Updated event types for middleware integration.
  - **@tanstack/ai-devtools**: Updated iteration timeline and conversation UI for middleware-aware event handling.

### Patch Changes

- Updated dependencies [[`f62eeb0`](https://github.com/TanStack/ai/commit/f62eeb0d7efd002894435c7f2c8a9f2790f0b6d7)]:
  - @tanstack/ai@0.8.0

## 0.0.2

### Patch Changes

- Updated dependencies [[`86be1c8`](https://github.com/TanStack/ai/commit/86be1c8262bb3176ea786aa0af115b38c3e3f51a)]:
  - @tanstack/ai@0.7.0
