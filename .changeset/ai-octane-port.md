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

Two things to know:

- Like Svelte packages shipping `.svelte`, this one publishes **uncompiled
  source**. The hook modules are `.tsrx` and are compiled by the consumer's
  Octane plugin, so there is no `dist` and `octane` is a required peer. The
  `.tsrx.d.ts` companions are checked declaration emits, so the full generic
  surface is preserved for TypeScript consumers.
- It is baselined against `@tanstack/ai-react@0.17.0`, while this repo is at
  0.18.1. The interrupts overhaul (#970) and server-persistence / browser-refresh
  durability work (#984) are **not** yet reflected in the Octane hooks; the
  `./mcp-apps` subpath is intentionally not ported (it renders a React-only
  component). See `packages/ai-octane/status.json` for the full scope,
  divergence list, and the exact type-surface gap. Catching up to current parity
  is follow-up work.
