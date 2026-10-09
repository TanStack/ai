---
'@tanstack/ai': minor
---

Add `keyedAdapter(provider, create)` and `isKeyedAdapter(value)`. Import them from `@tanstack/ai` or `@tanstack/ai/byok`.

- `keyedAdapter` wraps an adapter factory that needs a provider key. `provider` is a BYOK descriptor (for example `openaiByok`) or a provider id. It throws when the provider id is not valid.
- A host finds the key, for example with `getByokKey(request, keyed.provider)`, and calls `keyed.create(key)` just before the call. The key is not in your code.
- `isKeyedAdapter` tells a keyed adapter apart from a plain adapter.
- It works for every adapter kind: text, image, speech, audio, video, and the rest.

For several providers, use `keyedAdapters({ openai: (key) => ..., anthropic: keyedAdapter(anthropicByok, ...) })`. The map key is the provider id, so a key goes only to its own provider. An entry that is a keyed adapter for another provider throws at startup. In a route, `keyedAdapterFromRequest(request, models)` from `@tanstack/ai/byok/server` builds the adapter of the provider that has a key. The user's `x-byok-<id>` header wins, then the env names of descriptor entries, in map order. It gives `null` when no provider has a key.
