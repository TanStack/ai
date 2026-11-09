---
id: generationParamsFromBody
title: generationParamsFromBody
---

```ts
function generationParamsFromBody<TKind>(kind, body): GenerationParams<TKind>;
```

Defined in: [packages/ai/src/client.ts:118](https://github.com/TanStack/ai/blob/main/packages/ai/src/client.ts#L118)

Read a generation request: the AG-UI `RunAgentInput` body that the
generation hooks send. The input is in `forwardedProps`.

## Type Parameters

### TKind

`TKind` *extends* `GenerationKind`

## Parameters

### kind

`TKind`

### body

`unknown`

## Returns

`GenerationParams`\<`TKind`\>

## Throws

When the body has no `threadId` or `runId`, or its input does not fit
  the kind.
