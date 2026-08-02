---
id: defineChatMiddleware
title: defineChatMiddleware
---

# Function: defineChatMiddleware()

```ts
function defineChatMiddleware<TContext, TRequires, TProvides>(middleware): DefinedChatMiddleware<TContext, TRequires, TProvides>;
```

Defined in: [packages/ai/src/activities/chat/middleware/define.ts:23](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/define.ts#L23)

Identity helper for authoring middleware with precise capability inference.
Returns the middleware unchanged at runtime; only sharpens its type so the
`chat()` array coverage check and `createChatMiddleware` builder can read the
exact `requires`/`provides`.

## Type Parameters

### TContext

`TContext` = `unknown`

### TRequires

`TRequires` *extends* readonly [`CapabilityHandle`](../type-aliases/CapabilityHandle.md)[] = readonly \[\]

### TProvides

`TProvides` *extends* readonly [`CapabilityHandle`](../type-aliases/CapabilityHandle.md)[] = readonly \[\]

## Parameters

### middleware

[`ChatMiddleware`](../interfaces/ChatMiddleware.md)\<`TContext`\> & `object`

## Returns

[`DefinedChatMiddleware`](../interfaces/DefinedChatMiddleware.md)\<`TContext`, `TRequires`, `TProvides`\>
