---
title: Extend Adapter
id: extend-adapter
order: 8
description: "Extend TanStack AI adapter factories with custom model IDs and fine-tuned models while keeping full type safety for input modalities and provider options."
keywords:
  - tanstack ai
  - extendAdapter
  - custom models
  - fine-tuned models
  - createModel
  - type safety
  - adapter factory
---

The `extendAdapter` utility allows you to extend existing adapter factories (like `openaiText`, `anthropicText`) with custom model names while maintaining full type safety for input modalities and provider options.

## Basic Usage

```typescript
import { createModel, extendAdapter } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// Define your custom models using createModel helper
const myOpenaiModel = createModel('my-fine-tuned-gpt4',['text', 'image']);
const myOpenaiModelButCooler = createModel('my-fine-tuned-gpt5',['text', 'image']);
 

// Create an extended adapter factory - simple API, no type parameters needed
const myOpenai = extendAdapter(openaiText, [
  myOpenaiModel,
  myOpenaiModelButCooler 
])

// Use with original models - full type inference preserved
const gpt5Adapter = myOpenai('gpt-5.5')

// Use with custom models - your custom types are applied
const customAdapter = myOpenai('my-fine-tuned-gpt4')

// Works seamlessly with chat()
import { chat } from '@tanstack/ai'

const stream = chat({
  adapter: myOpenai('my-fine-tuned-gpt4'),
  messages: [{ role: 'user', content: 'Hello!' }]
})
```

## The `createModel` Helper

The `createModel` function provides a clean way to define custom models with full type inference:

```typescript
import { createModel } from '@tanstack/ai'

// Arguments define name and input modalities
const model = createModel(
  'my-model',      // model name (literal type inferred)
  ['text', 'image'] // input modalities (tuple type inferred)
)
```
 
 
## Model Definition Structure

A custom model definition (`ExtendedModelDef`) has the required properties `name`, `input`, and `modelOptions`, plus optional `features` and `tools`. The two `createModel` overloads let you fill these in two ways.

### Defining Input Modalities

The positional form takes a model name and an `input` array specifying which content types your model supports:

```typescript
import { createModel } from '@tanstack/ai'

const models = [
  createModel('text-only-model', ['text']),
  createModel('multimodal-model', ['text', 'image', 'audio']),
] as const
```

Available modalities: `'text'`, `'image'`, `'audio'`, `'video'`, `'document'`

### Capabilities-object form

To attach typed `modelOptions`, declared `features`, or provider `tools` to a custom model, use the second `createModel` overload, which takes a capabilities object as its second argument:

```typescript
import { createModel } from '@tanstack/ai'
import type { OpenAITextProviderOptions } from '@tanstack/ai-openai'

// Type brand for provider options — the value is unused at runtime.
const modelOptions: OpenAITextProviderOptions = {}

const reasoner = createModel('my-reasoner', {
  input: ['text'],
  features: ['reasoning', 'structured_outputs'],
  tools: ['web_search'],
  modelOptions,
})
```

- `input` — supported input modalities (same as the positional form).
- `features` — declared feature flags (e.g. `'reasoning'`, `'structured_outputs'`).
- `tools` — declared provider tools (e.g. `'web_search'`).
- `modelOptions` — a type brand for the provider options accepted by this model; the value is unused at runtime, so declare an empty object typed as the provider options (e.g. `const modelOptions: OpenAITextProviderOptions = {}`).
 
## Preserving Original Factory Behavior

`extendAdapter` fully preserves the original factory's signature, including any configuration parameters:

```typescript
import { createModel, extendAdapter } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const customModels = [createModel('my-fine-tuned-gpt4', ['text', 'image'])] as const

const myOpenai = extendAdapter(openaiText, customModels)

// Config parameter is preserved
const adapter = myOpenai('my-fine-tuned-gpt4', {
  baseURL: 'https://my-proxy.com/v1',
  timeout: 30000
})
```

## Type Safety

The extended adapter provides full type safety:

```typescript ignore
import { extendAdapter, createModel } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const myOpenai = extendAdapter(openaiText, [createModel('custom-model', ['text'])])

// ✅ Original models work with their original types
const a1 = myOpenai('gpt-5.5')

// ✅ Custom models work with your defined types
const a2 = myOpenai('custom-model')

// ❌ Type error: invalid model name
// Note: Type checking works when you assign the result to a variable
const invalid = myOpenai('nonexistent-model') // TypeScript error!
```
 

## Runtime Behavior

At runtime, `extendAdapter` simply passes through to the original factory:

- No validation is performed on custom model names
- The original factory receives exactly what you pass
- This allows the original provider's API to handle the model name

This design is intentional - it allows you to:
- Use fine-tuned model names that the provider accepts but TypeScript doesn't know about
- Proxy requests to different backends that accept custom model identifiers
- Add type safety without runtime overhead

## Example: OpenAI-Compatible Proxy

A common use case is typing models for an OpenAI-compatible proxy:

```typescript
import { extendAdapter, createModel } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// Models available through your proxy
const proxyModels = [
  createModel(
    'llama-3.1-70b',
    ['text']
  ),
  createModel(
    'mixtral-8x7b',
    ['text']
  ),
] as const

const proxyAdapter = extendAdapter(openaiText, proxyModels)

// Use with your proxy's base URL
const adapter = proxyAdapter('llama-3.1-70b', {
  baseURL: 'https://my-llm-proxy.com/v1'
})
```

## Example: Fine-tuned Models

Adding type safety for your fine-tuned models:

```typescript
import { chat, createModel, extendAdapter } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

const fineTunedModels = [
  createModel(
    'ft:claude-3-opus:my-org:custom-task:abc123',
    ['text', 'image']
  ),
] as const

const myAnthropic = extendAdapter(anthropicText, fineTunedModels)

chat({
  adapter: myAnthropic('ft:claude-3-opus:my-org:custom-task:abc123'),
  messages: [{ role: 'user', content: 'Analyze this...' }]
})
```

## Add reasoning to your adapter

`chat({ reasoning })` reaches an adapter as `options.reasoning`: a level, a `summary` flag, and an optional `budgetTokens`. To support it:

1. Give each model its reasoning data as a `ModelReasoning`: a map from each level to the value your provider takes, and whether it takes a token budget.
2. Declare the levels on the adapter type, so `chat()` checks them. The last type parameter of `BaseTextAdapter` and the `openai-base` adapters is `{ levels; budget }`.
3. Turn the request into your provider's field. `resolveReasoning` clamps the level to the model and looks up the value.

An adapter built on `@tanstack/openai-base` only needs `modelReasoning`. The base then sends `reasoning_effort` on Chat Completions, or `reasoning.effort` on Responses:

```typescript
import OpenAI from "openai";
import { OpenAIBaseChatCompletionsTextAdapter } from "@tanstack/openai-base";
import type {
  DefaultMessageMetadataByModality,
  Modality,
  ModelReasoning,
} from "@tanstack/ai";

const MY_MODEL_REASONING: Record<string, ModelReasoning> = {
  "my-model": {
    map: { off: "none", minimal: null, low: "low", medium: "medium", high: "high" },
    budget: false,
  },
};

class MyTextAdapter extends OpenAIBaseChatCompletionsTextAdapter<
  "my-model",
  Record<string, unknown>,
  ReadonlyArray<Modality>,
  DefaultMessageMetadataByModality,
  ReadonlyArray<string>,
  { levels: "off" | "low" | "medium" | "high"; budget: false }
> {
  protected override modelReasoning(model: string) {
    return MY_MODEL_REASONING[model];
  }
}

export const myText = () =>
  new MyTextAdapter(
    "my-model",
    "my-provider",
    new OpenAI({ apiKey: process.env.MY_API_KEY, baseURL: "https://api.example.com/v1" }),
  );
```

An adapter with another wire format calls `resolveReasoning` from `@tanstack/ai/adapter-internals` in its request code and sends the result its own way.

Models added with `extendAdapter` take no `reasoning` option, because the adapter has no reasoning data for them.

## Keep block order and mid-conversation changes

Two optional fields reach your adapter. If your adapter ignores them, it sends the same request as before.

### Send assistant blocks in their order

A model can answer with thinking, a tool call, more thinking, then text. A `ModelMessage` keeps `thinking`, `content`, and `toolCalls` in separate fields. The optional `blockOrder` map says how they mix. `orderedAssistantBlocks` gives you the blocks in that order:

```typescript
import { orderedAssistantBlocks } from "@tanstack/ai";
import type { ModelMessage } from "@tanstack/ai";

type WireBlock =
  | { type: "reasoning"; text: string; signature?: string }
  | { type: "text"; text: string }
  | { type: "call"; id: string; name: string; args: string };

export function orderedWireBlocks(message: ModelMessage): Array<WireBlock> | undefined {
  const blocks = orderedAssistantBlocks(message);
  if (!blocks) return undefined;
  return blocks.map((block): WireBlock => {
    if (block.type === "thinking") {
      return { type: "reasoning", text: block.thinking.content, signature: block.thinking.signature };
    }
    if (block.type === "text") return { type: "text", text: block.text };
    return {
      type: "call",
      id: block.toolCall.id,
      name: block.toolCall.function.name,
      args: block.toolCall.function.arguments,
    };
  });
}
```

- The function returns `undefined` when the message has no map, or when the map does not match the message. Then send your default order.
- The library writes `blockOrder` only when the order is not the default. The default order is all thinking, then the text, then the tool calls.

### Send mid-conversation changes

Tools or system prompts can grow between model calls. If your provider has a mid-conversation channel, it can take the change inside the conversation. Then the cached start of the request stays the same. To support it:

1. Set `midConversationChannels` on the adapter to the channels that your provider has: `{ tools, systemPrompts }`. Before each call, the `chat()` engine compares the lists. It passes the result as `options.midConversationChanges`.
2. Resolve the change with `splitMidConversationChanges`. It gives the start lists and the changes by message index. It returns `undefined` when a name or a count does not match the current lists.
3. Send the start lists at the top of the request. Send each change directly before the message at its index. A change at `options.messages.length` goes at the end.

An adapter that extends the Responses adapter of `@tanstack/openai-base` only sets the field. The base then sends `additional_tools` and `developer` messages:

```typescript
import { OpenAIBaseResponsesTextAdapter } from "@tanstack/openai-base";

export class MyResponsesAdapter extends OpenAIBaseResponsesTextAdapter<"my-model"> {
  override readonly midConversationChannels = { tools: true, systemPrompts: true };
}
```

An adapter with another wire format does the steps itself:

```typescript
import { splitMidConversationChanges } from "@tanstack/ai";
import type { ModelMessage, TextOptions } from "@tanstack/ai";

type WireTool = { name: string; description: string };
type WireItem =
  | { kind: "message"; message: ModelMessage }
  | { kind: "change"; tools: Array<WireTool>; prompts: Array<string> };

export function buildRequest(
  options: TextOptions,
  tools: Array<WireTool>,
  prompts: Array<string>,
) {
  const changes = options.midConversationChanges;
  const split = changes
    ? splitMidConversationChanges({ changes, tools, systemPrompts: prompts })
    : undefined;
  if (!split) {
    // No changes, or names that do not match: send the full lists.
    const items = options.messages.map((message): WireItem => ({ kind: "message", message }));
    return { tools, system: prompts, items };
  }
  const items: Array<WireItem> = [];
  const pushChange = (index: number) => {
    const change = split.at.get(index);
    if (change) items.push({ kind: "change", tools: change.tools, prompts: change.systemPrompts });
  };
  options.messages.forEach((message, index) => {
    pushChange(index);
    items.push({ kind: "message", message });
  });
  pushChange(options.messages.length);
  return { tools: split.startTools, system: split.startSystemPrompts, items };
}
```

- `split.addedTools` lists every added tool, in change order. Use it if your provider also wants the added tools in its tool list. Claude takes them there with `defer_loading`.
- A tool can keep its name and get a new definition. Take every definition from `options.tools`.
- If your provider cannot add some kind of tool later (for example a hosted search tool), send the full tool list for that request. Keep the prompt changes in the conversation.

See [Mid-Conversation Changes](./mid-conversation-changes) for how the library finds the changes.
