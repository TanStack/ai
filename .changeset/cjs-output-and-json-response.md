---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-event-client': patch
---

**Dual ESM + CJS output.** `@tanstack/ai`, `@tanstack/ai-client`, and `@tanstack/ai-event-client` now ship both ESM and CJS builds with type-aware dual `exports` maps (`import` → `./dist/esm/*.js`, `require` → `./dist/cjs/*.cjs`), plus a `main` field pointing at CJS. Fixes Metro / Expo / CJS-only resolvers that previously couldn't find `@tanstack/ai/adapters` or `@tanstack/ai-client` because the packages were ESM-only (#308).

**New `toJSONResponse(stream, init?)` on `@tanstack/ai`.** Drains the chat stream fully and returns a JSON-array `Response` with `Content-Type: application/json`. Use on server runtimes that can't emit `ReadableStream` responses (Expo's `@expo/server`, some edge proxies). Pair with the new `fetchJSON(url, options?)` connection adapter on `@tanstack/ai-client` — it fetches the array and replays each chunk into the normal `ChatClient` pipeline. Trade-off: no incremental rendering (every chunk arrives at once when the request resolves). Closes #309.
