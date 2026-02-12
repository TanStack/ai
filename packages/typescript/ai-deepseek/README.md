<div align="center">
  <img src="./media/header_ai.png" >
</div>

<br />

<div align="center">
<a href="https://npmjs.com/package/@tanstack/ai-deepseek" target="\_parent">
  <img alt="" src="https://img.shields.io/npm/dm/@tanstack/ai-deepseek.svg" />
</a>
<a href="https://github.com/TanStack/ai" target="\_parent">
	  <img alt="" src="https://img.shields.io/github/stars/TanStack/ai.svg?style=social&label=Star" alt="GitHub stars" />
</a>
<a href="https://bundlephobia.com/result?p=@tanstack/ai-deepseek@latest" target="\_parent">
  <img alt="" src="https://badgen.net/bundlephobia/minzip/@tanstack/ai-deepseek@latest" />
</a>
</div>

<div align="center">
<a href="#badge">
  <img alt="semantic-release" src="https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg">
</a>
	<a href="#badge">
		<img src="https://img.shields.io/github/v/release/tanstack/ai" alt="Release"/>
	</a>
<a href="https://twitter.com/tan_stack">
  <img src="https://img.shields.io/twitter/follow/tan_stack.svg?style=social" alt="Follow @TanStack"/>
</a>
</div>

<div align="center">
  
### [Become a Sponsor!](https://github.com/sponsors/tannerlinsley/)
</div>

# TanStack AI - DeepSeek Adapter

DeepSeek adapter for TanStack AI - provides access to DeepSeek's powerful language models including DeepSeek-V3, DeepSeek Reasoner, and DeepSeek Coder.

- **Tree-shakeable adapters** - Import only what you need for smaller bundles
- **Type-safe model options** - Fully typed DeepSeek model configurations
- **Tool calling support** - Function calling with automatic tool execution
- **Streaming responses** - Real-time response streaming
- **Structured output** - Type-safe responses with Zod schemas

### <a href="https://tanstack.com/ai/docs/adapters/deepseek">Read the docs →</b></a>

## Tree-Shakeable Adapters

Import only the functionality you need for smaller bundle sizes:

```typescript
// Only chat functionality - no summarization code bundled
import { deepseekText } from '@tanstack/ai-deepseek/adapters'
import { chat } from '@tanstack/ai'

// Set your DeepSeek API key
process.env.DEEPSEEK_API_KEY = 'sk-...'

// Create adapter
const adapter = deepseekText('deepseek-chat')

// Start chatting
const stream = chat({
  adapter,
  messages: [{ role: 'user', content: 'Hello, DeepSeek!' }]
})

for await (const chunk of stream) {
  if (chunk.type === 'content') {
    console.log(chunk.delta)
  }
}
```

Available adapters: `deepseekText`, `deepseekSummarize`

## Installation

```bash
npm install @tanstack/ai-deepseek @tanstack/ai zod
```

## Supported Models

### Chat/Text Models

- `deepseek-chat` - Latest DeepSeek-V3 model with strong reasoning capabilities
- `deepseek-reasoner` - Specialized reasoning model with enhanced logical thinking
- `deepseek-coder` - Code-specialized model based on DeepSeek-Coder-V2

## Features

### Tool Calling

DeepSeek supports function calling with automatic tool execution:

```typescript
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const weatherTool = toolDefinition({
  name: 'getWeather',
  inputSchema: z.object({
    location: z.string().describe('City name'),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    condition: z.string(),
  }),
})

const serverTool = weatherTool.server(async ({ location }) => {
  // Your weather API call here
  return { temperature: 72, condition: 'sunny' }
})

const stream = chat({
  adapter: deepseekText('deepseek-chat'),
  messages: [{ role: 'user', content: 'What\'s the weather in San Francisco?' }],
  tools: [serverTool],
})
```

### Structured Output

Generate type-safe structured responses using Zod schemas:

```typescript
import { generate } from '@tanstack/ai'
import { z } from 'zod'

const schema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()),
  sentiment: z.enum(['positive', 'negative', 'neutral']),
})

const result = await generate({
  adapter: deepseekText('deepseek-chat'),
  messages: [{ 
    role: 'user', 
    content: 'Analyze this product review: "Great product, love it!"' 
  }],
  schema,
})

// result.data is fully typed according to your schema
console.log(result.data.summary)
console.log(result.data.keyPoints)
console.log(result.data.sentiment)
```

### Streaming Support

All adapters support streaming for real-time responses:

```typescript
const stream = chat({
  adapter: deepseekText('deepseek-chat'),
  messages: [{ role: 'user', content: 'Write a story about AI' }],
})

for await (const chunk of stream) {
  switch (chunk.type) {
    case 'content':
      process.stdout.write(chunk.delta)
      break
    case 'tool_call':
      console.log('Tool called:', chunk.toolCall.function.name)
      break
    case 'done':
      console.log('\nUsage:', chunk.usage)
      break
  }
}
```

## Configuration

### Environment Variables

Set your DeepSeek API key:

```bash
export DEEPSEEK_API_KEY="sk-your-api-key-here"
```

### Custom Configuration

```typescript
import { createDeepSeekText } from '@tanstack/ai-deepseek'

const adapter = createDeepSeekText('deepseek-chat', 'sk-...', {
  baseURL: 'https://api.deepseek.com', // Custom API endpoint
})
```

### Model Options

Configure model-specific parameters:

```typescript
const stream = chat({
  adapter: deepseekText('deepseek-chat'),
  messages: [{ role: 'user', content: 'Hello!' }],
  temperature: 0.8,        // Creativity (0-2)
  maxTokens: 2000,         // Response length
  topP: 0.9,              // Nucleus sampling
  frequencyPenalty: 0.1,   // Reduce repetition
  presencePenalty: 0.1,    // Encourage novelty
  stop: ['END'],          // Stop sequences
})
```

## Type Safety

This adapter provides full TypeScript support with:

- **Per-model type inference** - Options are typed based on the selected model
- **Tool type safety** - Automatic inference of tool input/output types
- **Schema validation** - Runtime validation with Zod schemas

```typescript
// Model-specific type inference
const adapter = deepseekText('deepseek-reasoner') // Types inferred for reasoning model

// Tool type safety
const tool = toolDefinition({
  name: 'calculate',
  inputSchema: z.object({ expression: z.string() }),
  outputSchema: z.object({ result: z.number() }),
})

// Fully typed tool implementation
const serverTool = tool.server(async ({ expression }) => {
  // expression is typed as string
  return { result: eval(expression) } // result must be { result: number }
})
```

## DeepSeek Model Capabilities

| Model | Strengths | Best For |
|-------|-----------|----------|
| `deepseek-chat` | General conversation, reasoning | Chat applications, general Q&A |
| `deepseek-reasoner` | Enhanced logical thinking | Complex problem solving, analysis |
| `deepseek-coder` | Code understanding and generation | Programming assistance, code review |

## Limitations

- **Image Generation**: DeepSeek does not currently support image generation
- **Multimodal Input**: Limited support for non-text inputs compared to other providers
- **Rate Limits**: Refer to DeepSeek's API documentation for current rate limits

## Get Involved

- We welcome issues and pull requests!
- Participate in [GitHub discussions](https://github.com/TanStack/ai/discussions)
- Chat with the community on [Discord](https://discord.com/invite/WrRKjPJ)
- See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup instructions

## Partners

<table align="center">
  <tr>
    <td>
      <a href="https://www.coderabbit.ai/?via=tanstack&dub_id=aCcEEdAOqqutX6OS" >
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://tanstack.com/assets/coderabbit-dark-CMcuvjEy.svg" height="40" />
          <source media="(prefers-color-scheme: light)" srcset="https://tanstack.com/assets/coderabbit-light-DVMJ2jHi.svg" height="40" />
          <img src="https://tanstack.com/assets/coderabbit-light-DVMJ2jHi.svg" height="40" alt="CodeRabbit" />
        </picture>
      </a>
    </td>
    <td>
      <a href="https://www.cloudflare.com?utm_source=tanstack">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://tanstack.com/assets/cloudflare-white-DQDB7UaL.svg" height="60" />
          <source media="(prefers-color-scheme: light)" srcset="https://tanstack.com/assets/cloudflare-black-CPufaW0B.svg" height="60" />
          <img src="https://tanstack.com/assets/cloudflare-black-CPufaW0B.svg" height="60" alt="Cloudflare" />
        </picture>
      </a>
    </td>
  </tr>
</table>

<div align="center">
<img src="./media/partner_logo.svg" alt="AI & you?" height="65">
<p>
We're looking for TanStack AI Partners to join our mission! Partner with us to push the boundaries of TanStack AI and build amazing things together.
</p>
<a href="mailto:partners@tanstack.com?subject=TanStack AI Partnership"><b>LET'S CHAT</b></a>
</div>

## Explore the TanStack Ecosystem

- <a href="https://github.com/tanstack/config"><b>TanStack Config</b></a> – Tooling for JS/TS packages
- <a href="https://github.com/tanstack/db"><b>TanStack DB</b></a> – Reactive sync client store
- <a href="https://github.com/tanstack/devtools"><b>TanStack Devtools</b></a> – Unified devtools panel
- <a href="https://github.com/tanstack/form"><b>TanStack Form</b></a> – Type‑safe form state
- <a href="https://github.com/tanstack/pacer"><b>TanStack Pacer</b></a> – Debouncing, throttling, batching
- <a href="https://github.com/tanstack/query"><b>TanStack Query</b></a> – Async state & caching
- <a href="https://github.com/tanstack/ranger"><b>TanStack Ranger</b></a> – Range & slider primitives
- <a href="https://github.com/tanstack/router"><b>TanStack Router</b></a> – Type‑safe routing, caching & URL state
- <a href="https://github.com/tanstack/router"><b>TanStack Start</b></a> – Full‑stack SSR & streaming
- <a href="https://github.com/tanstack/store"><b>TanStack Store</b></a> – Reactive data store
- <a href="https://github.com/tanstack/table"><b>TanStack Table</b></a> – Headless datagrids
- <a href="https://github.com/tanstack/virtual"><b>TanStack Virtual</b></a> – Virtualized rendering

… and more at <a href="https://tanstack.com"><b>TanStack.com »</b></a>

<!-- USE THE FORCE LUKE -->