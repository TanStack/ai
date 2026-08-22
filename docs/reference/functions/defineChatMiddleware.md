---
id: defineChatMiddleware
title: defineChatMiddleware
---

# Function: defineChatMiddleware()

```ts
function defineChatMiddleware<TContext, TRequires, TProvides, TInterruptDefinitions>(middleware): DefinedChatMiddleware<TContext, TRequires, TProvides, TInterruptDefinitions>;
```

Defined in: [packages/ai/src/activities/chat/middleware/define.ts:27](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/define.ts#L27)

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

### TInterruptDefinitions

`TInterruptDefinitions` *extends* `AnyInterruptDefinition` = `never`

## Parameters

### middleware

[`ChatMiddleware`](../interfaces/ChatMiddleware.md)\<`TContext`, `TInterruptDefinitions`\> & `object`

## Returns

[`DefinedChatMiddleware`](../interfaces/DefinedChatMiddleware.md)\<`TContext`, `TRequires`, `TProvides`, `TInterruptDefinitions`\>
