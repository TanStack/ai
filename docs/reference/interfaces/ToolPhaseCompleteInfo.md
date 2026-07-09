---
id: ToolPhaseCompleteInfo
title: ToolPhaseCompleteInfo
---

# Interface: ToolPhaseCompleteInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:324](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L324)

Aggregate information passed to onToolPhaseComplete after all tool calls
in an iteration have been processed.

## Properties

### needsApproval

```ts
needsApproval: object[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:335](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L335)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:342](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L342)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:328](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L328)

Completed tool results

#### duration?

```ts
optional duration: number;
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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:326](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L326)

Tool calls that were assigned to the assistant message
