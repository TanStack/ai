---
id: ChatSandboxHooks
title: ChatSandboxHooks
---

# Interface: ChatSandboxHooks\<TContext\>

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:41](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L41)

Sandbox file-event hooks a chat middleware can declare. Fire server-side for
every file create/change/delete observed in the sandbox during the run.

## Type Parameters

### TContext

`TContext` = `unknown`

## Properties

### onFile()?

```ts
optional onFile: (ctx, e) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:42](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L42)

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### e

[`SandboxFileHookEvent`](SandboxFileHookEvent.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onFileChange()?

```ts
optional onFileChange: (ctx, e) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:50](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L50)

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### e

[`SandboxFileHookEvent`](SandboxFileHookEvent.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onFileCreate()?

```ts
optional onFileCreate: (ctx, e) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:46](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L46)

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### e

[`SandboxFileHookEvent`](SandboxFileHookEvent.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### onFileDelete()?

```ts
optional onFileDelete: (ctx, e) => void | Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:54](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L54)

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### e

[`SandboxFileHookEvent`](SandboxFileHookEvent.md)

#### Returns

`void` \| `Promise`\<`void`\>
