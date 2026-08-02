---
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-angular': minor
---

**Breaking:** the hooks expose `runId` instead of `resumeState`.

```diff
- const { resumeState } = useChat({ threadId, connection })
- const liveRunId = resumeState?.runId ?? null
+ const { runId } = useChat({ threadId, connection })
```

Every chat hook (`useChat` / `createChat` / `injectChat`) and every generation
hook (`useGenerateImage`, `useGenerateVideo`, `useGenerateAudio`,
`useGenerateSpeech`, `useGeneration`, `useSummarize`, `useTranscription` and the
Solid / Vue / Svelte / Angular equivalents) now returns `runId: string | null` —
the id of the run streaming right now, or `null` when nothing is in flight.

`resumeState` was a `{ threadId, runId }` pair whose `threadId` half was always
the id the caller had just passed in, so the only new information it carried was
the run id, wrapped in an object that had to be unwrapped and null-checked.
`runId` is the thing callers actually reach for: the handle you send to your own
endpoint to cancel or poll a provider job, since `stop()` only aborts the local
stream and does not stop work already running on the provider.

On chat it also reports **more** than `resumeState` did. `resumeState` only ever
held a run that was interrupted or being rejoined, so it stayed `null` through an
ordinary streaming turn. `runId` tracks every run: it is set when any run starts
(including a rejoin) and cleared when it settles, backed by the new
`ChatClient.getCurrentRunId()`.

`injectChat` (Angular) exposed no equivalent field before and now returns `runId`
alongside the other frameworks.

`ChatResumeState` remains exported, since `resumeInterruptsUnsafe` still takes
one. It is simply no longer part of a hook's return shape.

New docs page: [Id map](https://tanstack.com/ai/latest/docs/persistence/id-map)
covers what each id means on chat versus generation, how to choose a `threadId`,
and when to read `runId`.
