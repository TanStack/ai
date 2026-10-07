---
id: ActivityRecord
title: ActivityRecord
---

Defined in: [packages/ai/src/types.ts:506](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L506)

Durable sidecar row for frontend-only AG-UI activity. Never a ModelMessage.
`index` is the insert position in the reconstructed UI transcript.

## Extends

- `Omit`\<`AGUIActivityMessage`, `"role"`\>

## Properties

### index

```ts
index: number;
```

Defined in: [packages/ai/src/types.ts:507](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L507)
