---
id: RunFinishedEvent
title: RunFinishedEvent
---

# Interface: RunFinishedEvent

Defined in: [types.ts:775](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L775)

Emitted when a run completes successfully.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### finishReason

```ts
finishReason: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [types.ts:780](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L780)

Why the generation stopped

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:751](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L751)

Model identifier for multi-model support

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`model`](BaseAGUIEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:753](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L753)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`rawEvent`](BaseAGUIEvent.md#rawevent)

***

### runId

```ts
runId: string;
```

Defined in: [types.ts:778](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L778)

Run identifier

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:749](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L749)

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`timestamp`](BaseAGUIEvent.md#timestamp)

***

### type

```ts
type: "RUN_FINISHED";
```

Defined in: [types.ts:776](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L776)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:782](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L782)

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
