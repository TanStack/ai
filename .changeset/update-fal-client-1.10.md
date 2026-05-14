---
'@tanstack/ai': patch
'@tanstack/ai-fal': patch
---

Update `@fal-ai/client` dependency to `^1.10.1`. Picks up upstream retry-on-transport-error and proxy-runtime-gate improvements. No public adapter API changes — `fal.config`, `fal.subscribe`, `fal.queue.{submit,status,result}` are unchanged.

The fal type-meta narrowing now covers four cases per model, each strict:

- `aspect_ratio` + `resolution` → `"16:9_1080p"` style template literal
- `aspect_ratio` only → the aspect-ratio union (`"16:9" | "9:16" | …`)
- `resolution` only → the resolution union (`"1080p" | "1440p" | "2160p"`) — new
- neither → `undefined` (the model has no size knob, so you must omit `size`)

For example, `fal-ai/ltx-2/text-to-video/fast` (resolution-only) now type-checks `size: '2160p'`, and `fal-ai/kling-video/v2.6/pro/image-to-video` (neither field) refuses any `size` value at compile time.

The "neither" case uses `undefined` instead of `never` so the adapter class still satisfies the generic `VideoAdapter<string, any, any, any>` (method-parameter contravariance: `any` can't flow into `never` but it does flow into `undefined`).

To support the `undefined` slot, `@tanstack/ai`'s `BaseImageAdapter`/`BaseVideoAdapter` (and the matching `ImageGenerationOptions`/`VideoGenerationOptions` types) widen their `TSize` constraint from `extends string` to `extends string | undefined`. The default remains `string`, so existing adapters and call sites are unaffected.

`Extract<…['aspect_ratio'], string>` filters out the new `AspectRatio` object type that upstream 1.10 introduced on `AgeModifyInput`/`CityTeleportInput`, keeping the template-literal sizes valid for those endpoints.
