---
id: ChatStream
title: ChatStream
---

# Type Alias: ChatStream

```ts
type ChatStream = AsyncIterable<
  | Exclude<StreamChunk, CustomEvent>
| KnownCustomEvent>;
```

Defined in: [packages/ai/src/types.ts:1488](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1488)

The default chat streaming result: standard chunks plus every typed
 framework CUSTOM event, with the `value: any` catch-all excluded so
 literal-`name` narrowing types `value`. User-emitted custom names are typed
 out (still flow at runtime — branch outside the name narrows or cast).
