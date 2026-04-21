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

Defined in: [packages/typescript/ai/src/activities/chat/tools/tool-definition.ts:56](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/tool-definition.ts#L56)

Union type for any kind of client-side tool (client tool or definition)
