---
id: GuardToolCallDecision
title: GuardToolCallDecision
---

```ts
type GuardToolCallDecision = 
  | void
  | undefined
  | null
  | {
  result: unknown;
  type: "skip";
}
  | {
  reason?: string;
  type: "abort";
};
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:484](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L484)

Decision returned from onGuardToolCall. A guard cannot change the args.
- undefined/void: allow the call. The next guard runs.
- { type: 'skip', result }: deny the call. The tool does not run, and the
  model gets `result`, as for an `onBeforeToolCall` skip.
- { type: 'abort', reason }: abort the entire chat run
