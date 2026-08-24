# @tanstack/ai-octane

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
