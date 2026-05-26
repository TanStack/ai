---
'@tanstack/ai': major
'@tanstack/ai-fal': major
---

Add per-model typed durations for video generation.

`VideoAdapter` gains a fifth generic, `TModelDurationByName`, plus two
introspection methods on every adapter:

- `availableDurations()` — returns a `DurationOptions` tagged union
  (`discrete | range | mixed | none`) describing the durations the current
  model accepts.
- `snapDuration(seconds)` — coerces raw seconds to the closest valid duration
  for the current model.

The `duration` field on `generateVideo({ adapter, ... })` is now per-model
typed via `VideoDurationForAdapter<TAdapter>`. For FAL, the type is derived
from `@fal-ai/client`'s `EndpointTypeMap`, so:

- `falVideo('fal-ai/kling-video/v1.6/standard/text-to-video')` → `duration?: '5' | '10'`
- `falVideo('fal-ai/veo3')` → `duration?: '4s' | '6s' | '8s'`
- `falVideo('fal-ai/minimax/video-01')` → `duration` not accepted

**Breaking**: callers passing `duration: <number>` to FAL video models must
either pass the typed string union directly or call
`adapter.snapDuration(seconds)`. Adapters that have not yet declared their
per-model duration map get a sensible default (`{ kind: 'none' }`,
`undefined`) so existing behaviour is preserved.

Builds on `@tanstack/ai-schemas` (#622); once that PR's FAL pipeline syncs
runtime constraint data, the hand-curated map in
`packages/typescript/ai-fal/src/video/video-provider-options.ts` will be
replaced with schema-derived lookups.
