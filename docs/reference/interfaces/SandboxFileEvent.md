---
id: SandboxFileEvent
title: SandboxFileEvent
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:31](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L31)

A file change observed inside a sandbox during a chat run.

## Extended by

- [`SandboxFileHookEvent`](SandboxFileHookEvent.md)

## Properties

### path

```ts
path: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:34](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L34)

Absolute path inside the sandbox (under the workspace root).

***

### timestamp

```ts
timestamp: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:35](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L35)

***

### type

```ts
type: "create" | "change" | "delete";
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:32](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L32)
