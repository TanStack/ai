---
id: ChatSandboxHooks
title: ChatSandboxHooks
---

# Interface: ChatSandboxHooks\<TContext\>

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:44](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L44)

Sandbox file-event hooks a chat middleware can declare. Fire server-side for
every file create/change/delete observed in the sandbox during the run.

## Type Parameters

### TContext

`TContext` = `unknown`

## Properties

### onFile?

```ts
optional onFile?: (ctx, e) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:45](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L45)

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### e

[`SandboxFileHookEvent`](SandboxFileHookEvent.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onFileChange?

```ts
optional onFileChange?: (ctx, e) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:53](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L53)

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### e

[`SandboxFileHookEvent`](SandboxFileHookEvent.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onFileCreate?

```ts
optional onFileCreate?: (ctx, e) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:49](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L49)

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### e

[`SandboxFileHookEvent`](SandboxFileHookEvent.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onFileDelete?

```ts
optional onFileDelete?: (ctx, e) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:57](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L57)

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### e

[`SandboxFileHookEvent`](SandboxFileHookEvent.md)

#### Returns

`void` \| `Promise`\<`void`\>
