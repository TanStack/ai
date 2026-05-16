---
id: RunFinishedEvent
title: RunFinishedEvent
---

# Interface: RunFinishedEvent

Defined in: [packages/typescript/ai/src/types.ts:860](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L860)

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

Defined in: [packages/typescript/ai/src/types.ts:864](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L864)

Why the generation stopped

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:862](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L862)

Model identifier for multi-model support

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:866](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L866)

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
