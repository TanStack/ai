---
id: ToolPhaseCompleteInfo
title: ToolPhaseCompleteInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:546](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L546)

Aggregate information passed to onToolPhaseComplete after all tool calls
in an iteration have been processed.

## Properties

### needsApproval

```ts
needsApproval: object[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:557](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L557)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:564](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L564)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:550](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L550)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:548](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L548)

Tool calls that were assigned to the assistant message
