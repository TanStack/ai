---
id: ToolPhaseCompleteInfo
title: ToolPhaseCompleteInfo
---

# Interface: ToolPhaseCompleteInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:235](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L235)

Aggregate information passed to onToolPhaseComplete after all tool calls
in an iteration have been processed.

## Properties

### needsApproval

```ts
needsApproval: object[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:246](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L246)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:253](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L253)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:239](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L239)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:237](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L237)

Tool calls that were assigned to the assistant message
