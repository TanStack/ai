---
id: AnyTool
title: AnyTool
---

```ts
type AnyTool = Omit<Tool<any, any, any, any>, "execute"> & object;
```

Defined in: packages/ai/src/types.ts:1104

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
