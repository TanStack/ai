---
'@tanstack/ai-fal': patch
---

Update `@fal-ai/client` dependency to `^1.10.1`. Picks up upstream retry-on-transport-error and proxy-runtime-gate improvements. No public API changes — the adapter's surface area (`fal.config`, `fal.subscribe`, `fal.queue.{submit,status,result}`) is unchanged.

Internally, `FalModelImageSize` and `FalModelVideoSize` now narrow `aspect_ratio`/`resolution` to string-only members via `Extract<…, string>`. Upstream 1.10 changed two endpoint inputs (`AgeModifyInput`, `CityTeleportInput`) so that `aspect_ratio` is an object `{ ratio?: … }` rather than a string union; the narrowing keeps the string template literal types that derive `FalModelVideoSize` valid for those endpoints.
