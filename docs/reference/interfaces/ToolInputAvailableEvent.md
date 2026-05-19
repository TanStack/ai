---
id: ToolInputAvailableEvent
title: ToolInputAvailableEvent
---

# Interface: ToolInputAvailableEvent

Defined in: [packages/typescript/ai/src/types.ts:1199](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1199)

Emitted when a client tool is invoked. The agent loop yields this and
pauses to let the caller run the tool client-side — `structured-output.complete`
will not fire for that run. Shape fixed by the agent-loop forwarding in
`runStreamingStructuredOutputImpl` in `activities/chat/index.ts`.

## Extends

- `Omit`\<[`CustomEvent`](CustomEvent.md), `"name"` \| `"value"`\>

## Indexable

```ts
[key: string]: unknown
```

```ts
[key: number]: unknown
```

## Properties

### name

```ts
name: "tool-input-available";
```

Defined in: [packages/typescript/ai/src/types.ts:1203](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1203)

***

### value

```ts
value: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1204](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1204)

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
