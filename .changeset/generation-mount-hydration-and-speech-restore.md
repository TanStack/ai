---
'@tanstack/ai-client': patch
'@tanstack/ai-react': patch
---

Fix generation mount hydration to run in the commit phase, and restore TTS
results.

- The `GenerationClient` / `VideoGenerationClient` used to kick off mount
  hydration (both the client-driven storage read and the server-driven network
  fetch) from their constructor. Framework hooks build the client inside
  `useMemo`, so that ran in React's render phase — a client-driven restore fired
  a "state update on a component that hasn't mounted yet" warning, and several
  server-driven clients mounting together re-fired the hydrate GET on every
  discarded/speculative render, flooding the connection pool
  (`ERR_INSUFFICIENT_RESOURCES`). Hydration now runs once from `mountDevtools`
  (the hooks' commit-phase mount effect), guarded by `serverHydrationStarted`.
  `initialResumeSnapshot` still seeds SSR/first paint. Note for direct
  (non-framework) `GenerationClient`/`VideoGenerationClient` users: mount
  hydration and the "missing `hydrateGeneration` handler" warning now fire from
  `mountDevtools()` rather than the constructor, so call `mountDevtools()` (as
  every framework hook does on mount) to trigger a server/storage restore;
  `generate()` still triggers it too.
- New `reconstructSpeechResult` mapper, wired into `useGenerateSpeech`. A
  restored `TTSResult` carries no base64 bytes (they live in the blob store), so
  it surfaces the durable serve URL through `result.artifacts`; the speech clip
  now repaints after a reload instead of showing status only.
