# @tanstack/ai-zai

[![npm version](https://img.shields.io/npm/v/@tanstack/ai-zai.svg)](https://www.npmjs.com/package/@tanstack/ai-zai)
[![license](https://img.shields.io/npm/l/@tanstack/ai-zai.svg)](https://github.com/TanStack/ai/blob/main/LICENSE)

Z.AI adapter for TanStack AI.

- Z.AI docs: https://docs.z.ai/api-reference/introduction

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
  messages: [{ role: 'user', content: 'Hello! Introduce yourself briefly.' }],
})

for await (const chunk of result) {
  console.log(chunk)
}
```

### Streaming (direct)

```ts
import { zaiText } from '@tanstack/ai-zai'

const adapter = zaiText('glm-4.7')

for await (const chunk of adapter.chatStream({
  model: 'glm-4.7',
  messages: [{ role: 'user', content: 'Stream a short poem about TypeScript.' }],
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

### Tool / Function Calling

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
})) {
  if (chunk.type === 'tool_call') {
    const { id, function: fn } = chunk.toolCall
    console.log('Tool requested:', fn.name, fn.arguments)
  }
}
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

- `glm-4.7` - Latest flagship model
- `glm-4.6` - Previous flagship model
- `glm-4.6v` - Vision model (Z.AI supports multimodal input, this adapter currently streams text)

## Features

- ✅ Streaming chat completions
- ✅ Function/tool calling
- ❌ Structured output (not implemented in this adapter yet)
- ❌ Multimodal input (this adapter currently extracts text only)

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
