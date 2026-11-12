---
'@tanstack/ai-muse': minor
---

Add the Muse provider adapter. It drives Muse's OpenAI-compatible Chat Completions endpoint and ships the Muse model family, including the flagship `muse-ember-1.0` (Ember) model. Use `museText('muse-ember-1.0')` to read the key from `MUSE_API_KEY`, or `createMuseText(model, apiKey)` to pass a key directly.
