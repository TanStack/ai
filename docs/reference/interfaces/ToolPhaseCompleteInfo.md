---
id: ToolPhaseCompleteInfo
title: ToolPhaseCompleteInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:461](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L461)

Aggregate information passed to onToolPhaseComplete after all tool calls
in an iteration have been processed.

## Properties

### needsApproval

```ts
needsApproval: object[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:472](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L472)

Tools that need user approval

#### approvalId

```ts
approvalId: string;
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

***

### needsClientExecution

```ts
needsClientExecution: object[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:479](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L479)

Tools that need client-side execution

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

***

### results

```ts
results: object[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:465](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L465)

Completed tool results

#### duration?

```ts
optional duration?: number;
```

#### result

```ts
result: unknown;
```

#### toolCallId

```ts
toolCallId: string;
```

#### toolName

```ts
toolName: string;
```

***

### toolCalls

```ts
toolCalls: ToolCall<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:463](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L463)

Tool calls that were assigned to the assistant message
