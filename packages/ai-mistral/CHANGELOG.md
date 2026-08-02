# @tanstack/ai-mistral

## 0.2.3

### Patch Changes

- Updated dependencies [[`3e1b510`](https://github.com/TanStack/ai/commit/3e1b510e4fdd2334af468c47b7c37b572805200e)]:
  - @tanstack/ai@0.42.0

## 0.2.2

### Patch Changes

- [#924](https://github.com/TanStack/ai/pull/924) [`5fcaf90`](https://github.com/TanStack/ai/commit/5fcaf90dc82bc20b8c7a75faa3c129da04858af5) - fix: resolve directory-barrel imports in published `.d.ts` files. Bare imports of `utils`/`tools`/`middleware` barrels were emitted as `../utils.js` (etc.), which do not resolve under bundler/node16/nodenext (no `/index` fallback for explicit `.js`). With consumer `skipLibCheck: true` those symbols silently became `any`. Imports now target concrete modules (e.g. `utils/client`, `middleware/types`) or explicit `/index` paths so public types resolve correctly.

- [#922](https://github.com/TanStack/ai/pull/922) [`e0bbbdd`](https://github.com/TanStack/ai/commit/e0bbbdd9608892293e09135aab4a3c77c8d65669) - fix: resolve dangling relative imports in published declaration files

  Switch directory-barrel imports (`../utils`, `../tools`, `../middleware`) to
  concrete module paths so emitted `.d.ts` specifiers resolve under
  `bundler`/`node16`/`nodenext` resolution. Adds a `test:dts` scanner guardrail.

  Fixes [#920](https://github.com/TanStack/ai/issues/920)

- Updated dependencies [[`5fcaf90`](https://github.com/TanStack/ai/commit/5fcaf90dc82bc20b8c7a75faa3c129da04858af5), [`2665085`](https://github.com/TanStack/ai/commit/2665085970ab4d792778bb2b635ef27fbdcb6be1), [`e0bbbdd`](https://github.com/TanStack/ai/commit/e0bbbdd9608892293e09135aab4a3c77c8d65669), [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589), [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589), [`de5fbb5`](https://github.com/TanStack/ai/commit/de5fbb52a916826cdc0ef31d18df402cd611b9d4)]:
  - @tanstack/ai@0.41.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`5deda27`](https://github.com/TanStack/ai/commit/5deda27085c8785894a28feb5bb3655dbd8f7e0a)]:
  - @tanstack/ai@0.40.0

## 0.2.0

### Minor Changes

- [#462](https://github.com/TanStack/ai/pull/462) [`e5f2f4b`](https://github.com/TanStack/ai/commit/e5f2f4b7ed3efb389377e614e9f0c177b42a555a) - Add new `@tanstack/ai-mistral` adapter package for Mistral models using the `@mistralai/mistralai` SDK. Supports streaming chat, tool calling, vision input (Pixtral / Mistral Medium / Small), structured output via JSON Schema, and reasoning streams (Magistral) — emitted as AG-UI `REASONING_*` events. Includes model metadata for Mistral Large, Medium, Small, Ministral 3B/8B, Codestral, Pixtral, Magistral, and Open Mistral Nemo.

### Patch Changes

- Updated dependencies [[`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4)]:
  - @tanstack/ai@0.39.0
