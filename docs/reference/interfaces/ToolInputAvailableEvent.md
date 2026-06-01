---
id: ToolInputAvailableEvent
title: ToolInputAvailableEvent
---

# Interface: ToolInputAvailableEvent

Defined in: [packages/ai/src/types.ts:1308](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1308)

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

Defined in: [packages/ai/src/types.ts:1244](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1244)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "tool-input-available";
```

Defined in: [packages/ai/src/types.ts:1309](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1309)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1310](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1310)

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
