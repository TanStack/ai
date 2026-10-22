---
id: ProviderKeySource
title: ProviderKeySource
---

```ts
type ProviderKeySource = 
  | Readonly<Record<ProviderId, string | null | undefined>>
  | ((provider) => 
  | string
  | null
  | undefined
  | Promise<string | null | undefined>);
```

Defined in: packages/ai/src/byok/env-keys.ts:20

Where `subagents.keys` finds a key: an object by provider id, or a function
that gets the provider (a BYOK descriptor or an id) and returns its key.
