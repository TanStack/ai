---
id: AnyServerTool
title: AnyServerTool
---

```ts
type AnyServerTool = Omit<ServerTool<any, any, string, any, boolean, any>, "execute"> & object;
```

Defined in: [packages/ai/src/activities/chat/tools/tool-definition.ts:138](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/tool-definition.ts#L138)

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
