# @tanstack/ai-muse

## 0.1.0

### Minor Changes

- [#2142](https://github.com/TanStack/ai/pull/2142) [`5efdeb3`](https://github.com/TanStack/ai/commit/5efdeb3890da592b12a7a421c38b2ec6cc4a72f9) - Add the Muse provider adapter. It drives Muse's OpenAI-compatible Chat Completions endpoint and ships the Muse model family, including the flagship `muse-ember-1.0` (Ember) model. Use `museText('muse-ember-1.0')` to read the key from `MUSE_API_KEY`, or `createMuseText(model, apiKey)` to pass a key directly.
