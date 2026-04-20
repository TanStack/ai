---
id: ChatMiddlewarePhase
title: ChatMiddlewarePhase
---

# Type Alias: ChatMiddlewarePhase

```ts
type ChatMiddlewarePhase = "init" | "beforeModel" | "modelStream" | "beforeTools" | "afterTools";
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:15](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L15)

Phase of the chat middleware lifecycle.
- 'init': Initial config transform before the chat engine starts
- 'beforeModel': Before each adapter chatStream call (per agent iteration)
- 'modelStream': During model streaming
- 'beforeTools': Before tool execution phase
- 'afterTools': After tool execution phase
