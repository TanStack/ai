# @tanstack/ai-isolate-cloudflare

## 0.2.22

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.6

## 0.2.21

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.5

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.4

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.3

## 0.2.18

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.2

## 0.2.17

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.1

## 0.2.16

### Patch Changes

- Updated dependencies [[`8036b50`](https://github.com/TanStack/ai/commit/8036b5054330a180023c6e3225b8d2735a43a919)]:
  - @tanstack/ai-code-mode@0.2.0

## 0.2.15

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.24

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.23

## 0.2.13

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.22

## 0.2.12

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.21

## 0.2.11

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.20

## 0.2.10

### Patch Changes

- Refresh package README content and npm metadata for better discoverability. ([#626](https://github.com/TanStack/ai/pull/626))

- Updated dependencies [[`ebeb22e`](https://github.com/TanStack/ai/commit/ebeb22ec68f456b09e0181ac6f5d1ac25a0affd2)]:
  - @tanstack/ai-code-mode@0.1.19

## 0.2.9

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.18

## 0.2.8

### Patch Changes

- Updated dependencies [[`ec1393d`](https://github.com/TanStack/ai/commit/ec1393db4383798e5f2574dfd87779c22c309529)]:
  - @tanstack/ai-code-mode@0.1.17

## 0.2.7

### Patch Changes

- Updated dependencies [[`2ad137b`](https://github.com/TanStack/ai/commit/2ad137bd22512248bd1684cccce35ba89597cf96)]:
  - @tanstack/ai-code-mode@0.1.16

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.15

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.14

## 0.2.4

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.13

## 0.2.3

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.12

## 0.2.2

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.11

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.10

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
