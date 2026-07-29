---
'@tanstack/ai-persistence': minor
---

**Breaking:** `withGenerationPersistence` now requires a `threadId` on its options.

```diff
- withGenerationPersistence(persistence, { artifactUrl })
+ withGenerationPersistence(persistence, { threadId, artifactUrl })
```

`threadId` is the generation's **scope** — a stable, app-chosen name for the slot successive runs fill (`product-123-hero`, `video-9-start-frame`), not a link to a chat conversation. It was optional here while being required on the client hooks whenever `persistence` is set, and that asymmetry hid a whole class of silent failure: a run filed under no scope cannot be hydrated by one, so `persistence: true` restored nothing, forever, with no error to explain why. The new `WithGenerationPersistenceOptions` type makes that unrepresentable.

The option is also now the **authority** for the run record's and artifacts' scope, in preference to `ctx.threadId`. An activity mints a throwaway thread id for its `RUN_STARTED` / `RUN_FINISHED` wire chunks when the caller passes none, and persisting that fabricated id filed runs in a slot nothing could look up — worse than recording no link, because it looks like one.

To migrate, pass the same scope you already give the activity and the client hook. A server route that reads `threadId` off the AG-UI envelope should reject a request that carries none, rather than inventing one.
