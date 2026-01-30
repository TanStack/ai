---
id: createChatOptions
title: createChatOptions
---

# Function: createChatOptions()

```ts
function createChatOptions<TAdapter, TSchema, TStream>(options): TextActivityOptions<TAdapter, TSchema, TStream>;
```

Defined in: [activities/chat/index.ts:152](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/index.ts#L152)

Create typed options for the chat() function without executing.
This is useful for pre-defining configurations with full type inference.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`AnyTextAdapter`](../type-aliases/AnyTextAdapter.md)

### TSchema

`TSchema` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) \| `undefined` = `undefined`

### TStream

`TStream` *extends* `boolean` = `true`

## Parameters

### options

`TextActivityOptions`\<`TAdapter`, `TSchema`, `TStream`\>

## Returns

`TextActivityOptions`\<`TAdapter`, `TSchema`, `TStream`\>

## Example

```ts
const chatOptions = createChatOptions({
  adapter: anthropicText('claude-sonnet-4-5'),
})

const stream = chat({ ...chatOptions, messages })
```
