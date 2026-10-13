---
id: ToolPhaseCompleteInfo
title: ToolPhaseCompleteInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:493](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L493)

Aggregate information passed to onToolPhaseComplete after all tool calls
in an iteration have been processed.

## Properties

### needsApproval

```ts
needsApproval: object[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:504](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L504)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:511](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L511)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:497](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L497)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:495](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L495)

Tool calls that were assigned to the assistant message
