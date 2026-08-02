# @tanstack/ai-bedrock

## 0.1.4

### Patch Changes

- Updated dependencies [[`3e1b510`](https://github.com/TanStack/ai/commit/3e1b510e4fdd2334af468c47b7c37b572805200e)]:
  - @tanstack/ai@0.42.0
  - @tanstack/openai-base@0.9.9

## 0.1.3

### Patch Changes

- [#924](https://github.com/TanStack/ai/pull/924) [`5fcaf90`](https://github.com/TanStack/ai/commit/5fcaf90dc82bc20b8c7a75faa3c129da04858af5) - fix: resolve directory-barrel imports in published `.d.ts` files. Bare imports of `utils`/`tools`/`middleware` barrels were emitted as `../utils.js` (etc.), which do not resolve under bundler/node16/nodenext (no `/index` fallback for explicit `.js`). With consumer `skipLibCheck: true` those symbols silently became `any`. Imports now target concrete modules (e.g. `utils/client`, `middleware/types`) or explicit `/index` paths so public types resolve correctly.

- [#922](https://github.com/TanStack/ai/pull/922) [`e0bbbdd`](https://github.com/TanStack/ai/commit/e0bbbdd9608892293e09135aab4a3c77c8d65669) - fix: resolve dangling relative imports in published declaration files

  Switch directory-barrel imports (`../utils`, `../tools`, `../middleware`) to
  concrete module paths so emitted `.d.ts` specifiers resolve under
  `bundler`/`node16`/`nodenext` resolution. Adds a `test:dts` scanner guardrail.

  Fixes [#920](https://github.com/TanStack/ai/issues/920)

- Updated dependencies [[`fbfd4be`](https://github.com/TanStack/ai/commit/fbfd4be3dda591303725664a802e0efbced0d22b), [`5fcaf90`](https://github.com/TanStack/ai/commit/5fcaf90dc82bc20b8c7a75faa3c129da04858af5), [`2665085`](https://github.com/TanStack/ai/commit/2665085970ab4d792778bb2b635ef27fbdcb6be1), [`e0bbbdd`](https://github.com/TanStack/ai/commit/e0bbbdd9608892293e09135aab4a3c77c8d65669), [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589), [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589), [`de5fbb5`](https://github.com/TanStack/ai/commit/de5fbb52a916826cdc0ef31d18df402cd611b9d4)]:
  - @tanstack/openai-base@0.9.8
  - @tanstack/ai@0.41.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`5deda27`](https://github.com/TanStack/ai/commit/5deda27085c8785894a28feb5bb3655dbd8f7e0a)]:
  - @tanstack/ai@0.40.0
  - @tanstack/openai-base@0.9.7

## 0.1.1

### Patch Changes

- Updated dependencies [[`afba322`](https://github.com/TanStack/ai/commit/afba32236022589afce4d5a165fd4a8a884ae57d), [`e7ad181`](https://github.com/TanStack/ai/commit/e7ad181cad20c5d6560f480835c99ff1142b40af)]:
  - @tanstack/ai@0.39.1
  - @tanstack/openai-base@0.9.6

## 0.1.0

### Minor Changes

- [#665](https://github.com/TanStack/ai/pull/665) [`27ba4c7`](https://github.com/TanStack/ai/commit/27ba4c72eb959786635046dc9e7d58cad3d6c4cd) - Add `@tanstack/ai-bedrock`: an Amazon Bedrock adapter. The default `bedrockText` path uses Bedrock's **Converse** API (`@aws-sdk/client-bedrock-runtime`), reaching the broad chat catalog including Anthropic Claude, Amazon Nova, and Meta Llama, with streaming, tools, reasoning, and structured output. Opt into Bedrock's OpenAI-compatible endpoints with `api: 'chat'` (Chat Completions) or `api: 'responses'` (gpt-oss Responses). Authentication supports Bedrock API keys or SigV4 via the AWS credential chain.

### Patch Changes

- Updated dependencies [[`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4)]:
  - @tanstack/ai@0.39.0
  - @tanstack/openai-base@0.9.6
