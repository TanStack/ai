---
id: DeepPartial
title: DeepPartial
---

# Type Alias: DeepPartial\<T\>

```ts
type DeepPartial<T> = T extends ReadonlyArray<infer U> ? DeepPartial<U>[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
```

Defined in: [packages/typescript/ai/src/types.ts:377](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L377)

Recursive `Partial` — every nested field becomes optional. Used as the
`partial` type on a streaming structured-output part since the progressive
JSON parse hands back objects whose fields are only filled in as bytes
arrive. Defaulted in `DeepPartial<unknown>` → `unknown` so untyped parts
keep their existing shape.

## Type Parameters

### T

`T`
