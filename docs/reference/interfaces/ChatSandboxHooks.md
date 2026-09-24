---
id: ChatSandboxHooks
title: ChatSandboxHooks
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:55](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L55)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:56](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L56)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:64](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L64)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:60](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L60)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:68](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L68)

#### Parameters

##### ctx

[`ChatMiddlewareContext`](ChatMiddlewareContext.md)\<`TContext`\>

##### e

[`SandboxFileHookEvent`](SandboxFileHookEvent.md)

#### Returns

`void` \| `Promise`\<`void`\>
