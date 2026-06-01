---
id: ConstrainedContent
title: ConstrainedContent
---

# Type Alias: ConstrainedContent\<TInputModalitiesTypes\>

```ts
type ConstrainedContent<TInputModalitiesTypes> = 
  | string
  | null
  | ContentPartForInputModalitiesTypes<TInputModalitiesTypes>[];
```

Defined in: [packages/ai/src/types.ts:308](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L308)

Type for message content constrained by supported modalities.
When modalities is ['text', 'image'], only TextPart and ImagePart are allowed in the array.

## Type Parameters

### TInputModalitiesTypes

`TInputModalitiesTypes` *extends* [`InputModalitiesTypes`](InputModalitiesTypes.md)
