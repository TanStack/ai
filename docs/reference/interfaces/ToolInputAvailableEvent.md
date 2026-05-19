---
id: ToolInputAvailableEvent
title: ToolInputAvailableEvent
---

# Interface: ToolInputAvailableEvent

Defined in: [packages/typescript/ai/src/types.ts:1192](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1192)

Emitted when a client tool is invoked. The agent loop yields this and
pauses to let the caller run the tool client-side — `structured-output.complete`
will not fire for that run. Shape fixed by the agent-loop forwarding in
`runStreamingStructuredOutputImpl` in `activities/chat/index.ts`.

## Extends

- [`CustomEvent`](CustomEvent.md)

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1128](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1128)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "tool-input-available";
```

Defined in: [packages/typescript/ai/src/types.ts:1193](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1193)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1194](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1194)

#### input

```ts
input: unknown;
```

#### toolCallId

```ts
toolCallId: string;
```

#### toolName

```ts
toolName: string;
```

#### Overrides

```ts
CustomEvent.value
```
