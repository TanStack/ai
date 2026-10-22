---
id: SandboxFileHookEvent
title: SandboxFileHookEvent
---

Defined in: packages/ai/src/activities/chat/middleware/types.ts:48

The file event a sandbox hook receives: the serializable [SandboxFileEvent](SandboxFileEvent.md)
 plus lazy, git-backed content accessors. Accessors compute on call, so a hook
 that only reads `path`/`type` pays nothing. Never present on the serialized
 `sandbox.file` CUSTOM chunk.

## Extends

- [`SandboxFileEvent`](SandboxFileEvent.md)

## Properties

### after

```ts
after: () => Promise<string>;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:52

Current content (`''` when the event is a delete).

#### Returns

`Promise`\<`string`\>

***

### before

```ts
before: () => Promise<string>;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:50

Content at the session baseline (`''` for a new file or non-git workspace).

#### Returns

`Promise`\<`string`\>

***

### diff

```ts
diff: () => Promise<string>;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:54

Unified patch vs the session baseline (synthesized add-patch when non-git).

#### Returns

`Promise`\<`string`\>

***

### path

```ts
path: string;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:40

Absolute path inside the sandbox (under the workspace root).

#### Inherited from

[`SandboxFileEvent`](SandboxFileEvent.md).[`path`](SandboxFileEvent.md#path)

***

### timestamp

```ts
timestamp: number;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:41

#### Inherited from

[`SandboxFileEvent`](SandboxFileEvent.md).[`timestamp`](SandboxFileEvent.md#timestamp)

***

### type

```ts
type: "create" | "change" | "delete";
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:38

#### Inherited from

[`SandboxFileEvent`](SandboxFileEvent.md).[`type`](SandboxFileEvent.md#type)
