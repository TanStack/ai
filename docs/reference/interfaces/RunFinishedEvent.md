---
id: RunFinishedEvent
title: RunFinishedEvent
---

# Interface: RunFinishedEvent

Defined in: [packages/typescript/ai/src/types.ts:900](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L900)

Emitted when a run completes successfully.

@ag-ui/core provides: `threadId`, `runId`, `result?`
TanStack AI adds: `model?`, `finishReason?`, `usage?`

## Extends

- `RunFinishedEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [packages/typescript/ai/src/types.ts:904](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L904)

Why the generation stopped

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:902](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L902)

Model identifier for multi-model support

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:906](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L906)

Token usage statistics

#### completionTokens

```ts
completionTokens: number;
```

#### promptTokens

```ts
promptTokens: number;
```

#### totalTokens

```ts
totalTokens: number;
```
