# @tanstack/ai-reactor

## 0.2.0

### Minor Changes

- [#1321](https://github.com/TanStack/ai/pull/1321) [`c17bc95`](https://github.com/TanStack/ai/commit/c17bc951ca783d8023bf54d69035c19c0c72ea2f) - Add `generateWorld()` and `generateLiveVideo()` for prompt-steerable sessions, plus a first-party Reactor adapter (`reactorWorld`, `reactorVideo`) and fal `falLiveVideo()` for H3 Max Director. Reactor returns a session JWT. falLiveVideo returns the WMA app id on `result.model` so the browser can call `wma(live.model)`. `generateVideo()` stays the job path that polls for a file URL.

### Patch Changes

- Updated dependencies [[`c17bc95`](https://github.com/TanStack/ai/commit/c17bc951ca783d8023bf54d69035c19c0c72ea2f), [`53e2ec0`](https://github.com/TanStack/ai/commit/53e2ec082b40d8c3fcd09f408c29f0b895436198), [`6269eff`](https://github.com/TanStack/ai/commit/6269eff90e770205ffd9cae8c5989b8ff02b57ce)]:
  - @tanstack/ai@0.54.0
