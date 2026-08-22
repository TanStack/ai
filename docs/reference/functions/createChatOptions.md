---
id: createChatOptions
title: createChatOptions
---

# Function: createChatOptions()

```ts
function createChatOptions<TAdapter, TSchema, TStream, TTools, TInterrupts, TContext, TMiddleware>(options): Omit<TextActivityOptions<TAdapter, TSchema, TStream, InferredContext<TTools, TMiddleware>>, "middleware" | "tools" | "interrupts"> & object;
```

Defined in: [packages/ai/src/activities/chat/index.ts:595](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/index.ts#L595)

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
  \| readonly (
  \| `Omit`\<[`Tool`](../interfaces/Tool.md)\<`any`, `any`, `any`, `any`\>, `"execute"`\> & `object` & `object`
  \| [`ProviderTool`](../interfaces/ProviderTool.md)\<`string`, `TAdapter`\[`"~types"`\]\[`"toolCapabilities"`\]\[`number`\]\>)[]
  \| `undefined` = 
  \| readonly (
  \| `Omit`\<[`Tool`](../interfaces/Tool.md)\<`any`, `any`, `any`, `any`\>, `"execute"`\> & `object` & `object`
  \| [`ProviderTool`](../interfaces/ProviderTool.md)\<`string`, `TAdapter`\[`"~types"`\]\[`"toolCapabilities"`\]\[`number`\]\>)[]
  \| `undefined`

### TInterrupts

`TInterrupts` *extends* readonly [`InterruptDefinition`](../interfaces/InterruptDefinition.md)\<`any`, `any`, `any`, `any`, `any`\>[] = \[\]

### TContext

`TContext` = `unknown`

### TMiddleware

`TMiddleware` *extends* `unknown`[] \| `undefined` = `undefined`

## Parameters

### options

`TextActivityOptionsWithContext`\<`TAdapter`, `TSchema`, `TStream`, `TTools`, `TInterrupts`, `TContext`, `TMiddleware`\>

## Returns

`Omit`\<`TextActivityOptions`\<`TAdapter`, `TSchema`, `TStream`, `InferredContext`\<`TTools`, `TMiddleware`\>\>, `"middleware"` \| `"tools"` \| `"interrupts"`\> & `object`

## Example

```ts
const chatOptions = createChatOptions({
  adapter: anthropicText('claude-sonnet-4-5'),
})

const stream = chat({ ...chatOptions, messages })
```
