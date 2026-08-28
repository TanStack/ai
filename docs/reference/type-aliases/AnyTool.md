---
id: AnyTool
title: AnyTool
---

# Type Alias: AnyTool

```ts
type AnyTool = Omit<Tool<any, any, any, any>, "execute"> & object;
```

Defined in: [packages/ai/src/types.ts:826](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L826)

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
