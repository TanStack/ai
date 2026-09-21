---
id: ChatSandboxHooks
title: ChatSandboxHooks
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:53](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L53)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:54](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L54)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:62](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L62)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:58](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L58)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:66](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L66)

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### e

[`SandboxFileHookEvent`](SandboxFileHookEvent.md)

#### Returns

`void` \| `Promise`\<`void`\>
