---
id: AdapterReasoning
title: AdapterReasoning
---

```ts
type AdapterReasoning<TAdapter> = TAdapter extends object ? TCapability : never;
```

Defined in: [packages/ai/src/reasoning.ts:58](https://github.com/TanStack/ai/blob/main/packages/ai/src/reasoning.ts#L58)

The reasoning capability an adapter declares in `'~types'`, or `never`.

## Type Parameters

### TAdapter

`TAdapter`
