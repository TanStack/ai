---
title: Extend Adapter
id: extend-adapter
order: 8
description: "Add custom or fine-tuned model IDs to adapter factories with createModel + extendAdapter."
keywords:
  - tanstack ai
  - extendAdapter
  - custom models
  - fine-tuned models
  - createModel
  - type safety
  - adapter factory
---

If you need typed fine-tuned or proxy model IDs → `createModel` + `extendAdapter` on an existing factory.

## Minimal path

```typescript
import { chat, createModel, extendAdapter } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const myOpenaiModel = createModel('my-fine-tuned-gpt4', ['text', 'image'])
const myOpenaiModelButCooler = createModel('my-fine-tuned-gpt5', ['text', 'image'])

const myOpenai = extendAdapter(openaiText, [
  myOpenaiModel,
  myOpenaiModelButCooler,
])

// Original models keep full inference
const gpt5Adapter = myOpenai('gpt-5.5')

// Custom models use your modalities
const customAdapter = myOpenai('my-fine-tuned-gpt4')

const stream = chat({
  adapter: myOpenai('my-fine-tuned-gpt4'),
  messages: [{ role: 'user', content: 'Hello!' }],
})
```

## createModel

**Positional** — name + input modalities:

```typescript
import { createModel } from '@tanstack/ai'

const model = createModel(
  'my-model',
  ['text', 'image'], // 'text' | 'image' | 'audio' | 'video' | 'document'
)
```

**Capabilities object** — modalities, features, tools, typed `modelOptions`:

```typescript
import { createModel } from '@tanstack/ai'
import type { OpenAITextProviderOptions } from '@tanstack/ai-openai'

// Type brand only — value unused at runtime
const modelOptions: OpenAITextProviderOptions = {}

const reasoner = createModel('my-reasoner', {
  input: ['text'],
  features: ['reasoning', 'structured_outputs'],
  tools: ['web_search'],
  modelOptions,
})
```

`ExtendedModelDef` requires `name`, `input`, `modelOptions`; optional `features`, `tools`.

## Factory config preserved

```typescript
import { createModel, extendAdapter } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const customModels = [
  createModel('my-fine-tuned-gpt4', ['text', 'image']),
] as const

const myOpenai = extendAdapter(openaiText, customModels)

const adapter = myOpenai('my-fine-tuned-gpt4', {
  baseURL: 'https://my-proxy.com/v1',
  timeout: 30000,
})
```

## Type safety

```typescript ignore
import { extendAdapter, createModel } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const myOpenai = extendAdapter(openaiText, [
  createModel('custom-model', ['text']),
])

const a1 = myOpenai('gpt-5.5') // original
const a2 = myOpenai('custom-model') // custom
// const invalid = myOpenai('nonexistent-model') // TypeScript error
```

## Runtime

No runtime validation of custom names — the original factory receives what you pass. Use for:

1. Fine-tuned IDs the provider accepts but types don't list
2. Proxies with custom identifiers
3. Compile-time safety without runtime cost

## OpenAI-compatible proxy

```typescript
import { extendAdapter, createModel } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const proxyModels = [
  createModel('llama-3.1-70b', ['text']),
  createModel('mixtral-8x7b', ['text']),
] as const

const proxyAdapter = extendAdapter(openaiText, proxyModels)

const adapter = proxyAdapter('llama-3.1-70b', {
  baseURL: 'https://my-llm-proxy.com/v1',
})
```

## Fine-tuned Anthropic

```typescript
import { chat, createModel, extendAdapter } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

const fineTunedModels = [
  createModel('ft:claude-3-opus:my-org:custom-task:abc123', [
    'text',
    'image',
  ]),
] as const

const myAnthropic = extendAdapter(anthropicText, fineTunedModels)

chat({
  adapter: myAnthropic('ft:claude-3-opus:my-org:custom-task:abc123'),
  messages: [{ role: 'user', content: 'Analyze this...' }],
})
```
