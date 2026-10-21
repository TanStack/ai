---
title: "Extend Adapter: Advanced"
id: extend-adapter-advanced
description: "Hooks for your own text adapter: input types, reasoning levels, the prompt cache, mid-conversation changes, and the order of assistant blocks."
keywords:
  - tanstack ai
  - custom adapter
  - inputModalities
  - reasoning
  - prompt cache
  - mid-conversation changes
  - orderedAssistantBlocks
---

This page is for people who write a text adapter for a new provider. To add model names to an adapter that exists, see [Extend Adapter](./extend-adapter). For the full adapter walkthrough, see the [community adapter guide](../community-adapters/guide).

## Set inputModalities in your own adapter

`chat()` and your app read `adapter.inputModalities` to know which content types a model can read. Set it from your model list:

```typescript
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import type { DefaultMessageMetadataByModality, Modality } from '@tanstack/ai'

const INPUT_BY_MODEL: Record<string, ReadonlyArray<Modality>> = {
  'my-vision-model': ['text', 'image'],
  'my-text-model': ['text'],
}

class MyTextAdapter extends BaseTextAdapter<
  string,
  Record<string, never>,
  ReadonlyArray<Modality>,
  DefaultMessageMetadataByModality
> {
  readonly name = 'my-provider'
  override readonly inputModalities = INPUT_BY_MODEL[this.model]

  constructor(model: string) {
    super({}, model)
  }

  async *chatStream() {
    // Call your provider and yield its chunks here.
  }

  structuredOutput() {
    return Promise.resolve({ data: {}, rawText: '{}' })
  }
}

console.log(new MyTextAdapter('my-vision-model').inputModalities) // ['text', 'image']
```

For a model that is not in the list, the value is `undefined`. Apps read `undefined` as "not known".

## Add reasoning to your adapter

Your adapter talks to a thinking model. You want `chat({ reasoning: 'high' })` to work, and you want a type error for a level that the model does not have.

1. Put a `reasoning` field on the metadata of each model.
2. Build a type map of the levels with `ModelReasoningCapability`. Build a runtime map with the same keys.
3. Pass the levels to the adapter type. Return the runtime data from the `modelReasoning` hook.

On an adapter that extends `@tanstack/openai-base`, that is all. The base sends `reasoning_effort` on Chat Completions, or `reasoning: { effort, summary }` on Responses:

```typescript
import OpenAI from 'openai'
import { chat } from '@tanstack/ai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import type {
  DefaultMessageMetadataByModality,
  Modality,
  ModelReasoning,
} from '@tanstack/ai'
import type { ModelReasoningCapability } from '@tanstack/ai/adapter-internals'

// 1. The data of the model: only the levels it has, with the value for each.
const MY_MODEL = {
  name: 'my-model',
  reasoning: {
    levels: { off: 'none', low: 'low', medium: 'medium', high: 'high' },
    budget: false,
  },
} as const

// 2. The levels for the types, and the same data at run time.
const MY_REASONING = {
  [MY_MODEL.name]: MY_MODEL.reasoning,
}

type MyModelReasoningByName = {
  [K in keyof typeof MY_REASONING]: ModelReasoningCapability<
    (typeof MY_REASONING)[K]
  >
}

const MY_MODEL_REASONING: Readonly<Record<string, ModelReasoning>> =
  MY_REASONING

type MyModel = keyof MyModelReasoningByName

// 3. The levels go in the last type parameter. The hook gives the data.
class MyTextAdapter<TModel extends MyModel> extends OpenAIBaseChatCompletionsTextAdapter<
  TModel,
  Record<string, unknown>,
  ReadonlyArray<Modality>,
  DefaultMessageMetadataByModality,
  ReadonlyArray<string>,
  MyModelReasoningByName[TModel]
> {
  protected override modelReasoning(model: string) {
    return MY_MODEL_REASONING[model]
  }
}

const adapter = new MyTextAdapter(
  'my-model',
  'my-provider',
  new OpenAI({ apiKey: 'my-key', baseURL: 'https://api.example.com/v1' }),
)

chat({ adapter, messages: [{ role: 'user', content: 'Hi' }], reasoning: 'high' })

chat({
  adapter,
  messages: [{ role: 'user', content: 'Hi' }],
  // @ts-expect-error my-model has no max level
  reasoning: 'max',
})
```

- A model with `budget: true` also takes `budgetTokens`.
- A model added with `extendAdapter` has no reasoning data, so it takes no `reasoning`.

Does your provider use another wire format? Then do these steps:

1. Extend `BaseTextAdapter`, and pass the levels as its last type parameter.
2. Read `options.reasoning` in your request code.
3. Use the helpers from `@tanstack/ai/adapter-internals`:
   - `resolveReasoning` moves the level to the nearest level that the model has, and gives its value.
   - `reasoningBudget` gives the token budget for a level.

## Send the prompt cache

`chat()` asks every adapter for [prompt caching](./prompt-caching) by default. It passes the setting as `options.promptCache`:

- `retention`: `'none'`, `'short'`, or `'long'`.
- `key`: optional.

When you build the request, map it to the cache fields of your provider:

```typescript
import type { TextOptions } from '@tanstack/ai'

export function cacheFields(options: TextOptions) {
  const cache = options.promptCache
  if (!cache || cache.retention === 'none') return {}
  return {
    ...(cache.key ? { cache_key: cache.key } : {}),
    ...(cache.retention === 'long' ? { cache_ttl: '1h' } : {}),
  }
}
```

- If `promptCache` is `undefined` (a call outside `chat()`), send no cache fields.
- Put the cache fields first and the `modelOptions` of the user after them. Then a value that the user sets wins.

## Send mid-conversation changes

Tools or system prompts can grow between model calls. If your provider takes them inside the conversation, the cached start of the request can stay the same. To support it:

1. Set `midConversationChannels` on the adapter: `{ tools, systemPrompts }`. Then `chat()` passes the changes as `options.midConversationChanges`.
2. Read them with `splitMidConversationChanges`. You get the start lists, and the changes by message index. You get `undefined` when the names or counts do not match the current lists.
3. Send the start lists at the top of the request. Send each change right before the message at its index. A change at `options.messages.length` goes at the end.

Do you extend the Responses adapter of `@tanstack/openai-base`? Then set the field and you are done. The base sends `additional_tools` and `developer` messages:

```typescript
import { OpenAIBaseResponsesTextAdapter } from '@tanstack/openai-base'

export class MyResponsesAdapter extends OpenAIBaseResponsesTextAdapter<'my-model'> {
  override readonly midConversationChannels = { tools: true, systemPrompts: true }
}
```

With another wire format, do the steps yourself:

```typescript
import { splitMidConversationChanges } from '@tanstack/ai'
import type { ModelMessage, TextOptions } from '@tanstack/ai'

type WireTool = { name: string; description: string }
type WireItem =
  | { kind: 'message'; message: ModelMessage }
  | { kind: 'change'; tools: Array<WireTool>; prompts: Array<string> }

export function buildRequest(
  options: TextOptions,
  tools: Array<WireTool>,
  prompts: Array<string>,
) {
  const changes = options.midConversationChanges
  const split = changes
    ? splitMidConversationChanges({ changes, tools, systemPrompts: prompts })
    : undefined
  if (!split) {
    // No changes, or names that do not match: send the full lists.
    const items = options.messages.map((message): WireItem => ({ kind: 'message', message }))
    return { tools, system: prompts, items }
  }
  const items: Array<WireItem> = []
  const pushChange = (index: number) => {
    const change = split.at.get(index)
    if (change) items.push({ kind: 'change', tools: change.tools, prompts: change.systemPrompts })
  }
  options.messages.forEach((message, index) => {
    pushChange(index)
    items.push({ kind: 'message', message })
  })
  pushChange(options.messages.length)
  return { tools: split.startTools, system: split.startSystemPrompts, items }
}
```

- `split.addedTools` lists every added tool, in order. If your provider also wants them in its tool list, use it.
- Some providers cannot add a kind of tool later (a hosted search tool, for example). For that request, send the full tool list. Keep the prompt changes in the conversation.

## Send assistant blocks in order

Your provider wants thinking, text, and tool calls in the order that the model sent them. A `ModelMessage` keeps them in three separate fields: `thinking`, `content`, and `toolCalls`. Use `orderedAssistantBlocks` to get them back in order:

```typescript
import { orderedAssistantBlocks } from '@tanstack/ai'
import type { ModelMessage } from '@tanstack/ai'

type WireBlock =
  | { type: 'reasoning'; text: string; signature?: string }
  | { type: 'text'; text: string }
  | { type: 'call'; id: string; name: string; args: string }

export function orderedWireBlocks(message: ModelMessage): Array<WireBlock> | undefined {
  const blocks = orderedAssistantBlocks(message)
  if (!blocks) return undefined
  return blocks.map((block): WireBlock => {
    if (block.type === 'thinking') {
      return { type: 'reasoning', text: block.thinking.content, signature: block.thinking.signature }
    }
    if (block.type === 'text') return { type: 'text', text: block.text }
    return {
      type: 'call',
      id: block.toolCall.id,
      name: block.toolCall.function.name,
      args: block.toolCall.function.arguments,
    }
  })
}
```

- The order comes from `message.blockOrder`. The library writes it only when the order is not the default. The default is all thinking, then the text, then the tool calls.
- `orderedAssistantBlocks` returns `undefined` when the message has no map, or when the map does not match the message. Then send your default order.
