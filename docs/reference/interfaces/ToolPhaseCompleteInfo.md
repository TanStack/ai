---
id: ToolPhaseCompleteInfo
title: ToolPhaseCompleteInfo
---

# Interface: ToolPhaseCompleteInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:337](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L337)

Aggregate information passed to onToolPhaseComplete after all tool calls
in an iteration have been processed.

## Properties

### needsApproval

```ts
needsApproval: object[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:348](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L348)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:355](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L355)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:341](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L341)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:339](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L339)

Tool calls that were assigned to the assistant message
