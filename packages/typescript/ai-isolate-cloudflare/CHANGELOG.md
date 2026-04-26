# @tanstack/ai-isolate-cloudflare

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
