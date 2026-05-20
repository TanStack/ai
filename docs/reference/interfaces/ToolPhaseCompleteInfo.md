---
id: ToolPhaseCompleteInfo
title: ToolPhaseCompleteInfo
---

# Interface: ToolPhaseCompleteInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:234](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L234)

Aggregate information passed to onToolPhaseComplete after all tool calls
in an iteration have been processed.

## Properties

### needsApproval

```ts
needsApproval: object[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:245](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L245)

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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:252](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L252)

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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:238](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L238)

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

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:236](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L236)

Tool calls that were assigned to the assistant message
