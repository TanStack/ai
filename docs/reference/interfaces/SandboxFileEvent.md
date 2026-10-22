---
id: SandboxFileEvent
title: SandboxFileEvent
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:37](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L37)

A file change observed inside a sandbox during a chat run.

## Extended by

- [`SandboxFileHookEvent`](SandboxFileHookEvent.md)

## Properties

### path

```ts
path: string;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:40](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L40)

Absolute path inside the sandbox (under the workspace root).

***

### timestamp

```ts
timestamp: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:41](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L41)

***

### type

```ts
type: "create" | "change" | "delete";
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:38](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L38)
