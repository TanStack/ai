---
id: ToolPhaseCompleteInfo
title: ToolPhaseCompleteInfo
---

# Interface: ToolPhaseCompleteInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:298](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L298)

Aggregate information passed to onToolPhaseComplete after all tool calls
in an iteration have been processed.

## Properties

### needsApproval

```ts
needsApproval: object[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:309](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L309)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:316](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L316)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:302](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L302)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:300](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L300)

Tool calls that were assigned to the assistant message
