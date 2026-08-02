---
'@tanstack/ai': patch
'@tanstack/ai-persistence': minor
---

`withGenerationPersistence` reads `threadId` from the activity instead of
requiring it twice.

```diff
- generateImage({ threadId, middleware: [withGenerationPersistence(p, { threadId })] })
+ generateImage({ threadId, middleware: [withGenerationPersistence(p)] })
```

**The bug underneath (`@tanstack/ai`).** Four streaming activities spread the
resolved wire identity over their own options:

```diff
- (resolved) => runGenerateImage({ ...options, ...resolved })
+ (resolved) => runGenerateImage({ ...options, runId: resolved.runId })
```

`streamGenerationResult` mints a thread id for the `RUN_*` chunks when the caller
passes none, so that spread overwrote the caller's `threadId` with an id known to
nobody. `generateImage`, `generateAudio`, `generateSpeech`, and
`generateTranscription` were all affected; `generateVideo` already did this
correctly. Any middleware reading `ctx.threadId` on those four saw a fabricated
value it could not tell apart from a real one, which is why persistence ignored
the context and demanded the option.

**The option (`@tanstack/ai-persistence`).** `WithGenerationPersistenceOptions.threadId`
is now optional, and an override rather than the only source. The scope resolves
to `opts.threadId ?? ctx.threadId`, and a run with neither throws a named error
at `onStart` instead of being filed somewhere nothing can hydrate it from. Code
that passes `threadId` to both keeps working unchanged.

The redundancy was also a trap: passing different values to the activity and the
middleware silently split one slot in two, with the wire using one id and the
record filed under the other.
