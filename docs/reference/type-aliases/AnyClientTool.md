---
id: AnyClientTool
title: AnyClientTool
---

# Type Alias: AnyClientTool

```ts
type AnyClientTool = 
  | ClientTool<SchemaInput, SchemaInput>
| ToolDefinitionInstance<SchemaInput, SchemaInput>;
```

Defined in: [activities/chat/tools/tool-definition.ts:55](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L55)

Union type for any kind of client-side tool (client tool or definition)
