---
id: ContentPartForInputModalitiesTypes
title: ContentPartForInputModalitiesTypes
---

# Type Alias: ContentPartForInputModalitiesTypes\<TInputModalitiesTypes\>

```ts
type ContentPartForInputModalitiesTypes<TInputModalitiesTypes> = Extract<ContentPart<TInputModalitiesTypes["messageMetadataByModality"]["text"], TInputModalitiesTypes["messageMetadataByModality"]["image"], TInputModalitiesTypes["messageMetadataByModality"]["audio"], TInputModalitiesTypes["messageMetadataByModality"]["video"], TInputModalitiesTypes["messageMetadataByModality"]["document"]>, {
  type: TInputModalitiesTypes["inputModalities"][number];
}>;
```

Defined in: [types.ts:229](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L229)

Helper type to filter ContentPart union to only include specific modalities.
Used to constrain message content based on model capabilities.

## Type Parameters

### TInputModalitiesTypes

`TInputModalitiesTypes` *extends* [`InputModalitiesTypes`](InputModalitiesTypes.md)
