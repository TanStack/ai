---
'@tanstack/ai': minor
---

Add `keyedAdapter(provider, create)` and `isKeyedAdapter(value)`. Import them from `@tanstack/ai` or `@tanstack/ai/byok`.

- `keyedAdapter` wraps an adapter factory that needs a provider key. `provider` is a BYOK descriptor (for example `openaiByok`) or a provider id. It throws when the provider id is not valid.
- A host finds the key, for example with `getByokKey(request, keyed.provider)`, and calls `keyed.create(key)` just before the call. The key is not in your code.
- `isKeyedAdapter` tells a keyed adapter apart from a plain adapter.
- It works for every adapter kind: text, image, speech, audio, video, and the rest.
