---
title: Multimodal Content
id: multimodal-content
order: 4
description: "Send images, audio, video, and documents with typed ContentPart in TanStack AI messages."
keywords:
  - tanstack ai
  - multimodal
  - vision
  - images
  - audio
  - video
  - documents
  - ContentPart
  - ImagePart
---

If you need to send non-text media → set `content` to a `ContentPart[]` (string content still works).

Modalities: text, image, audio, video, document — model-dependent.

## Content parts

```typescript
import type { ImagePart, TextPart } from '@tanstack/ai'

const textPart: TextPart = {
  type: 'text',
  content: 'What do you see in this image?',
}

// Data source: mimeType required
const imagePart: ImagePart = {
  type: 'image',
  source: {
    type: 'data',
    value: 'base64EncodedImageData...',
    mimeType: 'image/jpeg',
  },
  metadata: {
    detail: 'high', // OpenAI detail level
  },
}

// URL source: mimeType optional
const imageUrlPart: ImagePart = {
  type: 'image',
  source: {
    type: 'url',
    value: 'https://example.com/image.jpg',
    mimeType: 'image/jpeg',
  },
}
```

## In chat()

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const response = await chat({
  adapter: openaiText('gpt-5.5'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', content: 'What is in this image?' },
        {
          type: 'image',
          source: {
            type: 'url',
            value: 'https://example.com/photo.jpg',
          },
        },
      ],
    },
  ],
})
```

## Provider notes

### OpenAI

```typescript
import { openaiText } from '@tanstack/ai-openai'
import { imageBase64 } from './data'

const adapter = openaiText('gpt-5.5')

const message = {
  role: 'user',
  content: [
    { type: 'text', content: 'Describe this image' },
    {
      type: 'image',
      source: { type: 'data', value: imageBase64, mimeType: 'image/jpeg' },
      metadata: { detail: 'high' }, // 'auto' | 'low' | 'high'
    },
  ],
}
```

Examples: `gpt-5.2` / `gpt-5-mini` → text, image; `gpt-4o-audio` → text, audio.

### Anthropic

Images + PDF documents on Claude models (e.g. `claude-sonnet-4-6`). Authoritative list: `supports.input` in `@tanstack/ai-anthropic` `model-meta.ts`.

```typescript
import { anthropicText } from '@tanstack/ai-anthropic'
import { imageBase64, pdfBase64 } from './data'

const adapter = anthropicText('claude-sonnet-4-6')

const imageMessage = {
  role: 'user',
  content: [
    { type: 'text', content: 'What do you see?' },
    {
      type: 'image',
      source: { type: 'data', value: imageBase64, mimeType: 'image/jpeg' },
    },
  ],
}

const docMessage = {
  role: 'user',
  content: [
    { type: 'text', content: 'Summarize this document' },
    {
      type: 'document',
      source: {
        type: 'data',
        value: pdfBase64,
        mimeType: 'application/pdf',
      },
    },
  ],
}
```

### Gemini

```typescript
import { geminiText } from '@tanstack/ai-gemini'
import { imageBase64 } from './data'

const adapter = geminiText('gemini-3-flash-preview')

const message = {
  role: 'user',
  content: [
    { type: 'text', content: 'Analyze this image' },
    {
      type: 'image',
      source: { type: 'data', value: imageBase64, mimeType: 'image/png' },
    },
  ],
}
```

Example: `gemini-2.5-flash` → text, image, audio, video.

### Ollama

Host from `OLLAMA_HOST` (default `http://localhost:11434`). Multimodal support is model-specific.

```typescript
import { ollamaText } from '@tanstack/ai-ollama'
import { imageBase64 } from './data'

const adapter = ollamaText('llama3.2-vision')

const message = {
  role: 'user',
  content: [
    { type: 'text', content: 'What is in this image?' },
    {
      type: 'image',
      source: { type: 'data', value: imageBase64, mimeType: 'image/jpeg' },
    },
  ],
}
```

## Source types

| Source | `mimeType` | When |
|--------|------------|------|
| `type: 'data'` | **Required** | Inline base64 |
| `type: 'url'` | Optional | Hosted content; not all providers/modalities support URLs |

```typescript
const imageData = {
  type: 'image',
  source: {
    type: 'data',
    value: 'iVBORw0KGgoAAAANSUhEUgAAAAUA...',
    mimeType: 'image/png',
  },
}

const imageUrl = {
  type: 'image',
  source: {
    type: 'url',
    value: 'https://example.com/image.jpg',
    mimeType: 'image/jpeg',
  },
}
```

## Types

```typescript
import type {
  ContentPart,
  ImagePart,
  DocumentPart,
  AudioPart,
  VideoPart,
  TextPart,
} from '@tanstack/ai'

import type { OpenAIImageMetadata } from '@tanstack/ai-openai'
import type { AnthropicImageMetadata } from '@tanstack/ai-anthropic'
import type { GeminiImageMetadata } from '@tanstack/ai-gemini'
```

## Validate dynamic messages

No built-in runtime message validator. Parse with a Standard Schema library before `chat()`:

```typescript ignore
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const ContentPartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), content: z.string() }),
  z.object({
    type: z.literal('image'),
    source: z.object({
      type: z.enum(['url', 'data']),
      value: z.string(),
    }),
  }),
])

const MessageSchema = z.object({
  // roles: 'user' | 'assistant' | 'tool' — no 'system' role.
  // System instructions → systemPrompts on chat().
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.union([z.string(), z.array(ContentPartSchema)]),
})

const BodySchema = z.object({ messages: z.array(MessageSchema) })

const { messages } = BodySchema.parse(await request.json())

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
})
```

`chat()` still type-checks call-site content against the selected model's modalities.

## Must / optional practices

**Must:**

1. Confirm the model supports the modality
2. Require `mimeType` on data sources
3. Handle unsupported-modality errors

**Optional:** URL sources for large/hosted files; provider `metadata` (e.g. OpenAI `detail`).

## Client: ChatClient / useChat

`sendMessage` accepts a string or multimodal payload:

```typescript group=multimodal-content
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('/api/chat'),
})

await client.sendMessage('Hello!')

await client.sendMessage({
  content: [
    { type: 'text', content: 'What is in this image?' },
    {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/photo.jpg' },
    },
  ],
})
```

Custom id:

```typescript group=multimodal-content
await client.sendMessage({
  content: 'Hello!',
  id: 'custom-message-id-123',
})
```

Per-message `forwardedProps` (second arg) shallow-merge over client base; per-message wins. Legacy `body` constructor option is deprecated — use `forwardedProps`.

```typescript
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('/api/chat'),
  forwardedProps: { model: 'gpt-5' },
})

await client.sendMessage('Analyze this complex problem', {
  model: 'gpt-5',
  temperature: 0.2,
})
```

### React: image URL

```tsx
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { useState } from 'react'

function ChatWithImages() {
  const [imageUrl, setImageUrl] = useState('')
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  const handleSendWithImage = () => {
    if (!imageUrl) return
    sendMessage({
      content: [
        { type: 'text', content: 'What do you see in this image?' },
        { type: 'image', source: { type: 'url', value: imageUrl } },
      ],
    })
  }

  return (
    <div>
      <input
        type="url"
        placeholder="Image URL"
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
      />
      <button onClick={handleSendWithImage}>Send with Image</button>
    </div>
  )
}
```

### React: file upload (base64)

```tsx
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'

function ChatWithFileUpload() {
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  const handleFileUpload = async (file: File) => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result !== 'string') {
          reject(new Error('Expected data URL string'))
          return
        }
        const payload = result.split(',')[1]
        if (payload === undefined) {
          reject(new Error('Invalid data URL'))
          return
        }
        resolve(payload)
      }
      reader.onerror = () => reject(reader.error ?? new Error('read failed'))
      reader.readAsDataURL(file)
    })

    const type = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('audio/')
        ? 'audio'
        : file.type.startsWith('video/')
          ? 'video'
          : 'document'

    await sendMessage({
      content: [
        { type: 'text', content: `Please analyze this ${type}` },
        {
          type,
          source: { type: 'data', value: base64, mimeType: file.type },
        },
      ],
    })
  }

  return (
    <input
      type="file"
      accept="image/*,audio/*,video/*,.pdf"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) void handleFileUpload(file)
      }}
    />
  )
}
```
