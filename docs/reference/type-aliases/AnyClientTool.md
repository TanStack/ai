---
id: AnyClientTool
title: AnyClientTool
---

```ts
type AnyClientTool = 
  | Omit<ClientTool<any, any, string, any, boolean, any>, "execute"> & object
  | Omit<ToolDefinitionInstance<any, any, string, any, boolean, any>, "execute"> & object;
```

Defined in: packages/ai/src/activities/chat/tools/tool-definition.ts:174

Union type for any kind of client-side tool (client tool or definition)
