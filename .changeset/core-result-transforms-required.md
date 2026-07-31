---
'@tanstack/ai': minor
---

`GenerationMiddlewareContext.resultTransforms` is now required.

Middleware registers a result transform by pushing onto the array, so an optional one let a host that builds its own context omit it and silently no-op every registration — generation persistence would then mark a run completed with neither its result nor its artifacts written, with nothing to observe but the missing data. Every context the library builds already comes from `createGenerationContext`, which always sets `[]`, so this only affects code that constructs a `GenerationMiddlewareContext` by hand: set `resultTransforms: []`.
