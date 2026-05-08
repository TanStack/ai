---
id: RunFinishedEvent
title: RunFinishedEvent
---

# Interface: RunFinishedEvent

Defined in: [packages/typescript/ai/src/types.ts:824](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L824)

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

Defined in: [packages/typescript/ai/src/types.ts:828](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L828)

Why the generation stopped

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:826](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L826)

Model identifier for multi-model support

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:830](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L830)

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
