# @tanstack/ai-zai

[![npm version](https://img.shields.io/npm/v/@tanstack/ai-zai.svg)](https://www.npmjs.com/package/@tanstack/ai-zai)
[![license](https://img.shields.io/npm/l/@tanstack/ai-zai.svg)](https://github.com/TanStack/ai/blob/main/LICENSE)

Z.AI adapter for TanStack AI.

- Z.AI docs: https://docs.z.ai/api-reference/introduction

## OpenAI Compatibility

Z.AI exposes an OpenAI-compatible API surface. This adapter:

- Uses the OpenAI SDK internally, with Z.AI's base URL (`https://api.z.ai/api/paas/v4`)
- Targets the Chat Completions streaming interface
- Supports function/tool calling via OpenAI-style `tools`
- Supports Zhipu AI specific features like **Web Search**, **Thinking Mode**, and **Tool Streaming**
- Accepts `string` or `ContentPart[]` message content (only text parts are used today)

## Installation

```bash
npm install @tanstack/ai-zai
# or
pnpm add @tanstack/ai-zai
# or
yarn add @tanstack/ai-zai
```

## Setup

Get your API key from Z.AI and set it as an environment variable:

```bash
export ZAI_API_KEY="your_zai_api_key"
```

## Usage

### Text/Chat Adapter

```ts
import { zaiText } from '@tanstack/ai-zai'
import { generate } from '@tanstack/ai'

const adapter = zaiText('glm-4.7')

const result = await generate({
  adapter,
  model: 'glm-4.7',
  messages: [
    { role: 'user', content: [{ type: 'text', content: 'Hello! Introduce yourself briefly.' }] },
  ],
})

for await (const chunk of result) {
  console.log(chunk)
}
```

### Web Search Tool

Zhipu AI provides a built-in Web Search capability.

```ts
import { zaiText } from '@tanstack/ai-zai'
import { webSearchTool } from '@tanstack/ai-zai/tools'

const adapter = zaiText('glm-4.7')

for await (const chunk of adapter.chatStream({
  model: 'glm-4.7',
  messages: [{ role: 'user', content: 'What is the latest news about TanStack?' }],
  tools: [
    webSearchTool({ enable: true, search_result: true })
  ]
})) {
  if (chunk.type === 'content') process.stdout.write(chunk.delta)
}
```

### Thinking Mode (GLM-4.7/4.6/4.5)

Enable Deep Thinking for complex reasoning tasks.

```ts
import { zaiText } from '@tanstack/ai-zai'

const adapter = zaiText('glm-4.7')

for await (const chunk of adapter.chatStream({
  model: 'glm-4.7',
  messages: [{ role: 'user', content: 'Solve this complex logic puzzle...' }],
  modelOptions: {
    thinking: {
      type: 'enabled',
      clear_thinking: false // Optional: set to false to preserve reasoning across turns (GLM-4.7 only)
    }
  }
})) {
  // Thinking content is streamed as part of the reasoning_content delta
  // The adapter currently merges reasoning content into the main content stream or handles it as configured
  if (chunk.type === 'content') process.stdout.write(chunk.delta)
}
```

### Tool / Function Calling & Streaming

GLM-4.7 supports streaming tool calls via `tool_stream`.

```ts
import { zaiText } from '@tanstack/ai-zai'
import type { Tool } from '@tanstack/ai'

const adapter = zaiText('glm-4.7')

const tools: Array<Tool> = [
  {
    name: 'echo',
    description: 'Echo back the provided text',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
]

for await (const chunk of adapter.chatStream({
  model: 'glm-4.7',
  messages: [{ role: 'user', content: 'Call echo with {"text":"hello"}.' }],
  tools,
  modelOptions: {
    tool_stream: true // Enable streaming tool arguments
  }
})) {
  if (chunk.type === 'tool_call') {
    const { id, function: fn } = chunk.toolCall
    console.log('Tool requested:', fn.name, fn.arguments)
  }
}
```

### Summarization

```ts
import { zaiSummarize } from '@tanstack/ai-zai'
import { summarize } from '@tanstack/ai'

const adapter = zaiSummarize('glm-4.7')

const result = await summarize({
  adapter,
  text: 'Long article text...',
  style: 'bullet-points',
  maxLength: 500,
})

console.log(result.summary)
```

### Streaming (direct)

```ts
import { zaiText } from '@tanstack/ai-zai'

const adapter = zaiText('glm-4.7')

for await (const chunk of adapter.chatStream({
  model: 'glm-4.7',
  messages: [
    { role: 'user', content: [{ type: 'text', content: 'Stream a short poem about TypeScript.' }] },
  ],
})) {
  if (chunk.type === 'content') process.stdout.write(chunk.delta)
  if (chunk.type === 'error') {
    console.error(chunk.error)
    break
  }
  if (chunk.type === 'done') break
}
```

### With Explicit API Key

```ts
import { createZAIChat } from '@tanstack/ai-zai'

const adapter = createZAIChat('glm-4.7', 'your-zai-api-key-here')
```

### Error Handling

The adapter yields an `error` chunk instead of throwing.

```ts
import { zaiText } from '@tanstack/ai-zai'

const adapter = zaiText('glm-4.7')

for await (const chunk of adapter.chatStream({
  model: 'glm-4.7',
  messages: [{ role: 'user', content: 'Hello' }],
})) {
  if (chunk.type === 'error') {
    console.error(chunk.error.message, chunk.error.code)
    break
  }
}
```

## API Reference

### `createZAIChat(model, apiKey, config?)`

```ts
import { createZAIChat } from '@tanstack/ai-zai'

const adapter = createZAIChat('glm-4.7', 'your_zai_api_key', {
  baseURL: 'https://api.z.ai/api/paas/v4',
})
```

- `model`: `ZAIModel`
- `apiKey`: string (required)
- `config.baseURL`: string (optional)

### `zaiText(model, config?)`

```ts
import { zaiText } from '@tanstack/ai-zai'

const adapter = zaiText('glm-4.7', {
  baseURL: 'https://api.z.ai/api/paas/v4',
})
```

Uses `ZAI_API_KEY` from your environment.

## Supported Models

### Chat Models

- `glm-4.7` - Latest flagship model (Supports Thinking, Tool Streaming)
- `glm-4.6` - Previous flagship model (Supports Thinking)
- `glm-4.6v` - Vision model (Z.AI supports multimodal input, this adapter currently streams text)

## Features

- ✅ Streaming chat completions
- ✅ Function/tool calling
- ✅ **Web Search Tool** (Zhipu AI native)
- ✅ **Thinking Mode** (Interleaved & Preserved)
- ✅ **Tool Streaming** (Real-time argument streaming)
- ❌ Structured output (not implemented in this adapter yet)
- ❌ Multimodal input (this adapter currently extracts text only; non-text parts are ignored)

## Tree-Shakeable Adapters

This package uses tree-shakeable adapters, so you only import what you need:

```ts
import { zaiText } from '@tanstack/ai-zai'
```

## Configuration

### Environment Variables

- `ZAI_API_KEY` - used by `zaiText()`
- `ZAI_API_KEY_TEST` - used by the integration tests in this package

### Base URL Customization

Default base URL is `https://api.z.ai/api/paas/v4`. You can override it via:

- `createZAIChat(model, apiKey, { baseURL })`
- `zaiText(model, { baseURL })`

## Testing

```bash
pnpm test:lib
```

Integration tests require a real Z.AI API key.

```bash
export ZAI_API_KEY_TEST="your_test_key"
pnpm test:lib
```

## Contributing

We welcome issues and pull requests.

- GitHub: https://github.com/TanStack/ai
- Discussions: https://github.com/TanStack/ai/discussions
- Contribution guidelines: https://github.com/TanStack/ai/blob/main/CONTRIBUTING.md

## License

MIT © TanStack
