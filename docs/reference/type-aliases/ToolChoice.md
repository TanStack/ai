---
id: ToolChoice
title: ToolChoice
---

```ts
type ToolChoice<TName> = 
  | "auto"
  | "none"
  | "required"
  | {
  name: TName | string & object;
  type: "tool";
};
```

Defined in: packages/ai/src/types.ts:1254

How the model uses the tools of a call.
- `'auto'`: the model decides.
- `'none'`: the model calls no tool.
- `'required'`: the model must call a tool.
- `{ type: 'tool', name }`: the model must call that tool.

`TName` is the names of the tools of the call, for editor suggestions. Any
other string is also allowed, for example a provider tool or a lazy tool.

## Type Parameters

### TName

`TName` *extends* `string` = `string`
