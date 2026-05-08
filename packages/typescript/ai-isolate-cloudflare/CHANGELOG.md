# @tanstack/ai-isolate-cloudflare

## 0.2.0

### Minor Changes

- Port the Cloudflare worker driver from `unsafe_eval` to `worker_loader` (Dynamic Workers). ([#523](https://github.com/TanStack/ai/pull/523))

  Cloudflare gates the `unsafe_eval` binding for all customer prod accounts; the previous driver was unusable in production and broken in `wrangler dev` on current Wrangler 4.x. The supported replacement is the `worker_loader` binding (GA-beta'd 2026-03-24).

  **Breaking:** the worker now requires the `LOADER` binding instead of `UNSAFE_EVAL`. Update your `wrangler.toml`:

  ```toml
  # before
  [[unsafe.bindings]]
  name = "UNSAFE_EVAL"
  type = "unsafe_eval"

  # after
  [[worker_loaders]]
  binding = "LOADER"
  ```

  The HTTP tool-callback protocol and public driver API are unchanged. Workers Paid plan is required for any edge usage (deploy or `wrangler dev --remote`); local `wrangler dev` works on the Free plan.

  Closes #522.

### Patch Changes

- fix(ai-isolate-cloudflare): accumulate `toolResults` across rounds in the driver round-trip ([#524](https://github.com/TanStack/ai/pull/524))

  The Cloudflare isolate driver was wiping `toolResults` between rounds. `wrap-code` uses sequential `tc_<idx>` ids that are re-derived every round when the Worker re-executes user code, so prior-round results must remain in the cache. With the wipe, multi-tool programs (e.g. `await A(); await B();`) would ping-pong between `{tc_0}` and `{tc_1}` and exhaust `maxToolRounds`, surfacing as `MaxRoundsExceeded`.

  Single-tool code worked because only one cache entry was ever needed in a given round. Existing tests covered single-round flows only and did not exercise real `wrap-code` ids end-to-end, so the regression slipped through.

  Added a `tc_<idx>`-shaped regression test that fails on the prior implementation and passes with the merge.

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.9

## 0.1.8

### Patch Changes

- feat(ai-isolate-cloudflare): support production deployments and close tool-name injection vector ([#465](https://github.com/TanStack/ai/pull/465))

  The Worker now documents production-capable `unsafe_eval` usage (previously the code, wrangler.toml, and README all described it as dev-only). Tool names are validated against a strict identifier regex before being interpolated into the generated wrapper code, so a malicious tool name like `foo'); process.exit(1); (function bar() {` is rejected at generation time rather than breaking out of the wrapping function.

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`1d1c58f`](https://github.com/TanStack/ai/commit/1d1c58f33188ff98893edb626efd66ac73b8eadb)]:
  - @tanstack/ai-code-mode@0.1.1

## 0.1.0

### Minor Changes

- Add code mode and isolate packages for secure AI code execution ([#362](https://github.com/TanStack/ai/pull/362))

  Also includes fixes for Ollama tool call argument streaming and usage
  reporting, OpenAI realtime adapter handling of missing call_id/item_id,
  realtime client guards for missing toolCallId, and new DevtoolsChatMiddleware
  type export from ai-event-client.

### Patch Changes

- Updated dependencies [[`54abae0`](https://github.com/TanStack/ai/commit/54abae063c91b8b04b91ecb2c6785f5ff9168a7c)]:
  - @tanstack/ai-code-mode@0.1.0
