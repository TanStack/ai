# @tanstack/ai-groq

## 0.1.6

### Patch Changes

- Expose the `/tools` subpath and add an empty `supports.tools: []` channel per model so Groq adapters participate in the core tool-capability type gating. No provider-specific tool factories are exposed yet — define your own tools with `toolDefinition()` from `@tanstack/ai`. ([#466](https://github.com/TanStack/ai/pull/466))

- Updated dependencies [[`e32583e`](https://github.com/TanStack/ai/commit/e32583e7612cede932baee6a79355e96e7124d90)]:
  - @tanstack/ai@0.12.0

## 0.1.5

### Patch Changes

- Align stream output with `@tanstack/ai`'s AG-UI-compliant event shapes: emit `REASONING_*` events alongside `STEP_*`, thread `threadId`/`runId` through `RUN_STARTED`/`RUN_FINISHED`, and return flat `RunErrorEvent` shape. Cast raw events through an internal `asChunk` helper so they line up with the re-exported `@ag-ui/core` `EventType` enum. No changes to adapter factory signatures or config shapes. ([#474](https://github.com/TanStack/ai/pull/474))

- Updated dependencies [[`12d43e5`](https://github.com/TanStack/ai/commit/12d43e55073351a6a2b5b21861b8e28c657b92b7)]:
  - @tanstack/ai@0.11.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`54abae0`](https://github.com/TanStack/ai/commit/54abae063c91b8b04b91ecb2c6785f5ff9168a7c)]:
  - @tanstack/ai@0.10.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`842e119`](https://github.com/TanStack/ai/commit/842e119a07377307ba0834ccca0e224dcb5c46ea)]:
  - @tanstack/ai@0.9.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`f62eeb0`](https://github.com/TanStack/ai/commit/f62eeb0d7efd002894435c7f2c8a9f2790f0b6d7)]:
  - @tanstack/ai@0.8.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`86be1c8`](https://github.com/TanStack/ai/commit/86be1c8262bb3176ea786aa0af115b38c3e3f51a)]:
  - @tanstack/ai@0.7.0

## 0.1.0

### Minor Changes

- Adds a new @tanstack/ai-groq package(minor release), a Groq AI adapter for TanStack AI. ([#332](https://github.com/TanStack/ai/pull/332))
