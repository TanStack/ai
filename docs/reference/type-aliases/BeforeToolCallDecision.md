---
id: BeforeToolCallDecision
title: BeforeToolCallDecision
---

# Type Alias: BeforeToolCallDecision

```ts
type BeforeToolCallDecision = 
  | void
  | undefined
  | null
  | {
  args: unknown;
  type: "transformArgs";
}
  | {
  result: unknown;
  type: "skip";
}
  | {
  reason?: string;
  type: "abort";
};
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:143](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L143)

Decision returned from onBeforeToolCall.
- undefined/void: continue with normal execution
- { type: 'transformArgs', args }: replace args used for execution
- { type: 'skip', result }: skip execution, use provided result
- { type: 'abort', reason }: abort the entire chat run
