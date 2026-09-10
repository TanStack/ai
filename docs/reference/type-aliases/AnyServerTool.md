---
id: AnyServerTool
title: AnyServerTool
---

# Type Alias: AnyServerTool

```ts
type AnyServerTool = Omit<ServerTool<any, any, string, any, boolean, any>, "execute"> & object;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:136](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L136)

Broad server-tool shape for heterogeneous internal collections.

## Type Declaration

### execute?

```ts
optional execute?: (args, context?) => any;
```

#### Parameters

##### args

`any`

##### context?

`any`

#### Returns

`any`
