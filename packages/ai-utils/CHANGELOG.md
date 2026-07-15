# @tanstack/ai-utils

## 0.3.1

### Patch Changes

- [#844](https://github.com/TanStack/ai/pull/844) [`a6cceba`](https://github.com/TanStack/ai/commit/a6cceba4812e7e986183ee856112fcf5f8fa12ff) - Republish all packages with their compiled `dist/` output.

  Releases `0.33.0`–`0.36.0` were published without a `dist/` directory: the
  release workflow relied on an Nx-cached `build` whose outputs were not
  materialized to disk before `changeset publish` packed the tarballs, and
  `files: ["dist"]` silently includes nothing when `dist/` is absent. The
  published packages therefore contained only `src/`, so every export
  (`./dist/esm/*.js`) resolved to a missing file and the packages were
  uninstallable.

  The publish step now runs a fresh, cache-bypassing build of all packages
  immediately before publishing, guaranteeing compiled artifacts are present in
  every tarball.

## 0.3.0

### Minor Changes

- [#732](https://github.com/TanStack/ai/pull/732) [`31de22b`](https://github.com/TanStack/ai/commit/31de22b1ae780c53e3abbf9cf17e1db7b62de84a) - Fix structured output validation rejecting `null` for optional fields, across both stream modes and every adapter.

  Strict-mode structured output widens optional fields to `required` + nullable, so the provider returns `null` for an absent optional. Validating that `null` against the original schema then failed, because `.optional()` means `T | undefined`, not `T | null` — surfacing as a `StandardSchemaValidationError` (e.g. `Invalid type: Expected string but received null`).

  The engine now undoes the widening as a single, schema-aware step the moment the structured output is captured, so the fix applies uniformly:
  - The strict-conversion pass records a `NullWideningMap` marking exactly the positions where it added `null`, so the response can be un-widened precisely — no re-deriving or guessing which nulls were synthetic.
  - `@tanstack/ai-utils` adds `undoNullWidening(value, map)` — a counterpart to `transformNullsToUndefined` that strips only the nulls the widening pass synthesized, preserving the ones a `.nullable()`/`.nullish()` field genuinely allows.
  - The engine applies this via a new `finalStructuredOutput.normalize` hook the instant the result is captured, so **both** the `Promise<T>` result **and** the streaming `structured-output.complete` event carry the un-widened object. Previously only the `Promise<T>` path was corrected, and only for adapters that preserved provider nulls.
  - `@tanstack/openai-base` adapters (and the OpenAI/Grok/Groq adapters built on them) no longer blind-strip every `null` from structured output via `transformStructuredOutput` — that default is now a passthrough. The blind strip masked the validation bug but also destroyed genuine `.nullable()` nulls; precise un-widening in the engine fixes both. The `transformStructuredOutput` hook remains for provider-specific reshaping.

  Adapters that already preserve provider nulls (`@tanstack/ai-openrouter`, Anthropic, Gemini, Ollama) now get correct un-widening on their streaming structured output too, not just `Promise<T>`.

## 0.2.2

### Patch Changes

- [#769](https://github.com/TanStack/ai/pull/769) [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b) - Add repository metadata (`homepage`, `bugs`, `funding`), fix `repository.directory` to point at each package, and include an MIT `LICENSE` file in every published package.

## 0.2.1

### Patch Changes

- Refresh package README content and npm metadata for better discoverability. ([#626](https://github.com/TanStack/ai/pull/626))

## 0.2.0

### Minor Changes

- New package: shared provider-agnostic utilities for TanStack AI adapters. Includes `generateId`, `getApiKeyFromEnv`, `transformNullsToUndefined`, and `ModelMeta` types with `defineModelMeta` validation helper. Zero runtime dependencies. ([#409](https://github.com/TanStack/ai/pull/409))
