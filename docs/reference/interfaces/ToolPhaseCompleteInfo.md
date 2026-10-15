---
id: ToolPhaseCompleteInfo
title: ToolPhaseCompleteInfo
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:510](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L510)

Aggregate information passed to onToolPhaseComplete after all tool calls
in an iteration have been processed.

## Properties

### needsApproval

```ts
needsApproval: object[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:521](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L521)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:528](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L528)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:514](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L514)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:512](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L512)

Tool calls that were assigned to the assistant message
