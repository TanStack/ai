---
id: VoiceOrigin
title: VoiceOrigin
---

```ts
type VoiceOrigin = "premade" | "generated" | "cloned" | "professional";
```

Defined in: [packages/ai/src/types.ts:2638](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2638)

Where a voice in a provider's catalog came from.

`'premade'` is the provider's own stock catalog. `'generated'` and
`'cloned'` are voices the account made, which is what `generateVoice()`
produces. `'professional'` covers a provider's curated or paid tiers.
