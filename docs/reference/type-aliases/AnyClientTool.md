---
id: AnyClientTool
title: AnyClientTool
---

# Type Alias: AnyClientTool

```ts
type AnyClientTool = 
  | Omit<ClientTool<any, any, string, any>, "execute"> & object
  | Omit<ToolDefinitionInstance<any, any, string, any>, "execute"> & object;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:61](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L61)

Union type for any kind of client-side tool (client tool or definition)
