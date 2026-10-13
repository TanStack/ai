---
id: AnyClientTool
title: AnyClientTool
---

```ts
type AnyClientTool = 
  | Omit<ClientTool<any, any, string, any, boolean, any>, "execute"> & object
  | Omit<ToolDefinitionInstance<any, any, string, any, boolean, any>, "execute"> & object;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:174](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L174)

Union type for any kind of client-side tool (client tool or definition)
