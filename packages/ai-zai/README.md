<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-zai

Z.AI adapter for TanStack AI. It calls the GLM chat models over Z.AI's
OpenAI-compatible Chat Completions API.

- Z.AI API docs: https://docs.z.ai/api-reference/llm/chat-completion

## Installation

```bash
npm install @tanstack/ai-zai
# or
pnpm add @tanstack/ai-zai
# or
yarn add @tanstack/ai-zai
```

## Setup

Get a key from https://z.ai/manage-apikey/apikey-list and put it in the
environment of your server:

```bash
ZAI_API_KEY=...
```

`zaiText` reads `ZAI_API_KEY`. To pass the key in code, use `createZAIText`:

```ts
import { createZAIText } from '@tanstack/ai-zai'

const adapter = createZAIText('glm-5.3', apiKey)
```

## Usage

### Stream a chat from the server

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { zaiText } from '@tanstack/ai-zai'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  const stream = chat({
    adapter: zaiText('glm-5.3'),
    messages,
    threadId,
    runId,
  })

  return toServerSentEventsResponse(stream)
}
```

The client is the same as for every other provider. See the Groq guide in
`docs/adapters/groq.md` for the `useChat` half.

### Reasoning

GLM-5.3, GLM-5.3 Flash, and GLM-5.2 accept a reasoning effort. Pass a level to
`chat()`. The adapter clamps it to the nearest level the model supports, then
sends it as `reasoning_effort`.

```ts
const stream = chat({
  adapter: zaiText('glm-5.3'),
  messages,
  reasoning: 'high',
})
```

| Model           | `reasoning_effort` values |
| --------------- | ------------------------- |
| `glm-5.3`       | `low`, `high`, `max`      |
| `glm-5.2`       | `high`, `max`             |
| `glm-5.3-flash` | `max`                     |

For GLM-4.7 and GLM-4.6, turn thinking on with the provider option instead:

```ts
const stream = chat({
  adapter: zaiText('glm-4.7'),
  messages,
  modelOptions: { thinking: { type: 'enabled', clear_thinking: false } },
})
```

### Structured output

Pass `outputSchema`. Z.AI rejects `response_format: { type: 'json_schema' }`,
so the adapter sends JSON mode plus a schema system prompt and validates the
reply against your schema.

```ts
import { z } from 'zod'

const orderSchema = z.object({
  status: z.enum(['open', 'closed']),
  total: z.number(),
})

const stream = chat({
  adapter: zaiText('glm-5.3'),
  messages,
  outputSchema: orderSchema,
})
```

### Tools

Function tools and Z.AI's built-in web search both work. `tool_choice` is
always `auto`, because Z.AI rejects the other values.

```ts
import { zaiText, zaiWebSearchTool } from '@tanstack/ai-zai'

const stream = chat({
  adapter: zaiText('glm-5.3'),
  messages,
  tools: [zaiWebSearchTool({ search_result: true })],
})
```

### Images and video

Vision models take `image` and `video` content parts:

```ts
const stream = chat({
  adapter: zaiText('glm-5.3-flash'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', content: 'What is in this image?' },
        { type: 'image', source: { type: 'url', value: imageUrl } },
      ],
    },
  ],
})
```

### Summarization

```ts
import { summarize } from '@tanstack/ai'
import { zaiSummarize } from '@tanstack/ai-zai'

const result = await summarize({
  adapter: zaiSummarize('glm-5.3'),
  text: longText,
  threadId: 'article-summary',
  style: 'bullet-points',
  maxLength: 500,
})
```

### Coding endpoint

A coding-plan key talks to a different host. Pass `coding: true`:

```ts
const adapter = zaiText('glm-5.3', { coding: true })
```

That sets the base URL to `https://api.z.ai/api/coding/paas/v4`. A `baseURL`
you set yourself wins.

### Bring your own key

`@tanstack/ai-zai/byok` exports a BYOK descriptor. Add it to your store so the
key dialog shows a Z.AI field, then read the key in the route. The
`x-byok-zai` header from the browser wins over `ZAI_API_KEY`:

```ts
import { defineByok, defaultByokStorage } from '@tanstack/ai-client/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { createZAIText } from '@tanstack/ai-zai'
import { zaiByok } from '@tanstack/ai-zai/byok'

export const byok = defineByok({
  storage: defaultByokStorage(),
  providers: [zaiByok],
})

// In the route handler. getByokKey reads the header, then ZAI_API_KEY.
const apiKey = getByokKey(request, zaiByok)
if (!apiKey) return byokMissing(zaiByok)

const adapter = createZAIText('glm-5.3', apiKey)
```

## Models

| Model           | Context   | Max output | Input              |
| --------------- | --------- | ---------- | ------------------ |
| `glm-5.3`       | 1,000,000 | 128,000    | text               |
| `glm-5.3-flash` | 1,000,000 | 128,000    | text, image, video |
| `glm-5.2`       | 1,000,000 | 131,072    | text               |
| `glm-5.1`       | 200,000   | 128,000    | text               |
| `glm-5-turbo`   | 200,000   | 128,000    | text               |
| `glm-5`         | 200,000   | 128,000    | text               |
| `glm-5v-turbo`  | 200,000   | 128,000    | text, image, video |
| `glm-4.7`       | 200,000   | 128,000    | text               |
| `glm-4.6v`      | 128,000   | 128,000    | text, image, video |
| `glm-4.6`       | 128,000   | 128,000    | text               |

Every model in the table streams, calls tools, and accepts JSON mode. Import
`ZAI_CHAT_MODELS` for the list at runtime and `ZAI_MODEL_META` for the full
metadata, including pricing.

## Features

- ✅ Streaming chat completions
- ✅ Function/tool calling
- ✅ Web search tool (provider runs the search)
- ✅ Reasoning events (`delta.reasoning_content`)
- ✅ Structured output (JSON mode plus a schema prompt)
- ✅ Multimodal input (image and video on vision models)
- ✅ Summarization (`zaiSummarize`)
- ❌ Embeddings (Z.AI has none on this endpoint)
- ❌ Image generation (not part of Chat Completions)

## Configuration

- `ZAI_API_KEY`: read by `zaiText()` and `zaiSummarize()`.
- `ZAI_API_KEY_TEST`: read by the live integration tests in `tests/`.
- Base URL: `https://api.z.ai/api/paas/v4` by default,
  `https://api.z.ai/api/coding/paas/v4` with `coding: true`, or your own
  `baseURL`.

The config object extends the OpenAI SDK client options, so `timeout`,
`maxRetries`, and `defaultHeaders` pass straight through.

## Testing

```bash
pnpm --filter @tanstack/ai-zai test:lib
```

The unit tests run offline. The live tests in
`tests/zai-adapter.integration.test.ts` need a real key in
`ZAI_API_KEY_TEST`.

## Contributing

We welcome issues and pull requests.

- GitHub: https://github.com/TanStack/ai
- Discussions: https://github.com/TanStack/ai/discussions
- Contribution guidelines: https://github.com/TanStack/ai/blob/main/CONTRIBUTING.md

## License

MIT © TanStack
