---
id: ApprovalRequestedEvent
title: ApprovalRequestedEvent
---

# Interface: ApprovalRequestedEvent

Defined in: [packages/typescript/ai/src/types.ts:1123](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1123)

Emitted when a server tool requires approval before execution. The agent
loop yields this and pauses — `structured-output.complete` will not fire
for that run. The shape is fixed by the orchestrator's tool-approval flow
(see `buildApprovalChunks` in `activities/chat/index.ts`).

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
name: "approval-requested";
```

Defined in: [packages/typescript/ai/src/types.ts:1127](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1127)

***

### value

```ts
value: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1128](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1128)

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
