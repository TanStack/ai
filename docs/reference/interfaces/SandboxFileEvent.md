---
id: SandboxFileEvent
title: SandboxFileEvent
---

# Interface: SandboxFileEvent

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:18](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L18)

A file change observed inside a sandbox during a chat run.

## Extended by

- [`SandboxFileHookEvent`](SandboxFileHookEvent.md)

## Properties

### path

```ts
path: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:21](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L21)

Absolute path inside the sandbox (under the workspace root).

***

### timestamp

```ts
timestamp: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:22](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L22)

***

### type

```ts
type: "create" | "change" | "delete";
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:19](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L19)
