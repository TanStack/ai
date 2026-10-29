---
id: AdapterReasoning
title: AdapterReasoning
---

```ts
type AdapterReasoning<TAdapter> = TAdapter extends object ? TCapability : never;
```

Defined in: packages/ai/src/reasoning.ts:58

The reasoning capability an adapter declares in `'~types'`, or `never`.

## Type Parameters

### TAdapter

`TAdapter`
