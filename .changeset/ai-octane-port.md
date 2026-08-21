---
'@tanstack/ai-octane': minor
---

Add `@tanstack/ai-octane` — [Octane](https://github.com/octanejs/octane) bindings for TanStack AI.

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
