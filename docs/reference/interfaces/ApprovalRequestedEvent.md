---
id: ApprovalRequestedEvent
title: ApprovalRequestedEvent
---

# Interface: ApprovalRequestedEvent

Defined in: [packages/ai/src/types.ts:1241](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1241)

Emitted when a server tool requires approval before execution. The agent
loop yields this and pauses — `structured-output.complete` will not fire
for that run. The shape is fixed by the orchestrator's tool-approval flow
(the agent-loop branch of `runStreamingStructuredOutputImpl` in
`activities/chat/index.ts` forwards CUSTOM events from `TextEngine.run()`).

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

Defined in: [packages/ai/src/types.ts:1193](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1193)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "approval-requested";
```

Defined in: [packages/ai/src/types.ts:1242](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1242)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1243](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1243)

#### approval

```ts
approval: object;
```

##### approval.id

```ts
id: string;
```

##### approval.needsApproval

```ts
needsApproval: true;
```

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
