---
id: createChatOptions
title: createChatOptions
---

# Function: createChatOptions()

```ts
function createChatOptions<TAdapter, TSchema, TStream, TTools, TMiddleware>(options): TextActivityOptions<TAdapter, TSchema, TStream, InferredContext<TTools, TMiddleware>>;
```

Defined in: [packages/ai/src/activities/chat/index.ts:341](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/index.ts#L341)

Create typed options for the chat() function without executing.
This is useful for pre-defining configurations with full type inference.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`AnyTextAdapter`](../type-aliases/AnyTextAdapter.md)

### TSchema

`TSchema` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) \| `undefined` = `undefined`

### TStream

`TStream` *extends* `boolean` = `true`

### TTools

`TTools` *extends* 
  \| (
  \| `Omit`\<[`Tool`](../interfaces/Tool.md)\<`any`, `any`, `any`, `any`\>, `"execute"`\> & `object` & `object`
  \| [`ProviderTool`](../interfaces/ProviderTool.md)\<`string`, `TAdapter`\[`"~types"`\]\[`"toolCapabilities"`\]\[`number`\]\>)[]
  \| `undefined` = 
  \| (
  \| `Omit`\<[`Tool`](../interfaces/Tool.md)\<`any`, `any`, `any`, `any`\>, `"execute"`\> & `object` & `object`
  \| [`ProviderTool`](../interfaces/ProviderTool.md)\<`string`, `TAdapter`\[`"~types"`\]\[`"toolCapabilities"`\]\[`number`\]\>)[]
  \| `undefined`

### TMiddleware

`TMiddleware` *extends* 
  \| [`ChatMiddleware`](../interfaces/ChatMiddleware.md)\<`any`\>[]
  \| `undefined` = 
  \| [`ChatMiddleware`](../interfaces/ChatMiddleware.md)\<`any`\>[]
  \| `undefined`

## Parameters

### options

`TextActivityOptionsWithContext`\<`TAdapter`, `TSchema`, `TStream`, `TTools`, `TMiddleware`\>

## Returns

`TextActivityOptions`\<`TAdapter`, `TSchema`, `TStream`, `InferredContext`\<`TTools`, `TMiddleware`\>\>

## Example

```ts
const chatOptions = createChatOptions({
  adapter: anthropicText('claude-sonnet-4-5'),
})

const stream = chat({ ...chatOptions, messages })
```
