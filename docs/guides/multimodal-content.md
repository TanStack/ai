---
title: Multimodal Content
id: multimodal-content
order: 8
---

TanStack AI supports multimodal content in messages, allowing you to send images, audio, video, and documents alongside text to AI models that support these modalities.

When sending messages to AI models, you can include different types of content:
- **Text** - Plain text messages
- **Images** - JPEG, PNG, GIF, WebP images
- **Audio** - Audio files (model-dependent support)
- **Video** - Video files (model-dependent support)
- **Documents** - PDFs and other document types

## Content Parts

Multimodal messages use the `ContentPart` type to represent different content types:

```typescript
import type { ContentPart, ImagePart, TextPart } from '@tanstack/ai'

// Text content
const textPart: TextPart = {
  type: 'text',
  content: 'What do you see in this image?'
}

// Image from base64 data (mimeType is required for data sources)
const imagePart: ImagePart = {
  type: 'image',
  source: {
    type: 'data',
    value: 'base64EncodedImageData...',
    mimeType: 'image/jpeg' // Required for data sources
  },
  metadata: {
    // Provider-specific metadata
    detail: 'high' // OpenAI detail level
  }
}

// Image from URL (mimeType is optional for URL sources)
const imageUrlPart: ImagePart = {
  type: 'image',
  source: {
    type: 'url',
    value: 'https://example.com/image.jpg',
    mimeType: 'image/jpeg' // Optional hint for URL sources
  }
}
```

## Using Multimodal Content in Messages

Messages can have `content` as either a string or an array of `ContentPart`:

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const response = await chat({
  adapter: openaiText('gpt-5.2'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', content: 'What is in this image?' },
        {
          type: 'image',
          source: {
            type: 'url',
            value: 'https://example.com/photo.jpg'
          }
        }
      ]
    }
  ]
})
```

## Provider Support

### OpenAI

OpenAI supports images and audio in their vision and audio models:

```typescript
import { openaiText } from '@tanstack/ai-openai'

const adapter = openaiText()

// Image with detail level metadata
const message = {
  role: 'user' ,
  content: [
    { type: 'text' , content: 'Describe this image' },
    {
      type: 'image' ,
      source: { type: 'data' , value: imageBase64, mimeType: 'image/jpeg' },
      metadata: { detail: 'high' } // 'auto' | 'low' | 'high'
    }
  ]
}
```

**Supported modalities by model:**
- `gpt-5.2`, `gpt-5-mini`: text, image
- `gpt-5.2-audio-preview`: text, image, audio

### Anthropic

Anthropic's Claude models support images and PDF documents:

```typescript
import { anthropicText } from '@tanstack/ai-anthropic'

const adapter = anthropicText()

// Image with mimeType in source
const imageMessage = {
  role: 'user' ,
  content: [
    { type: 'text' , content: 'What do you see?' },
    {
      type: 'image' ,
      source: { type: 'data' , value: imageBase64, mimeType: 'image/jpeg' }
    }
  ]
}

// PDF document
const docMessage = {
  role: 'user',
  content: [
    { type: 'text', content: 'Summarize this document' },
    {
      type: 'document',
      source: { type: 'data', value: pdfBase64, mimeType: 'application/pdf' }
    }
  ]
}
```

**Supported modalities:**
- Claude 3 models: text, image
- Claude 3.5 models: text, image, document (PDF)

### Gemini

Google's Gemini models support a wide range of modalities:

```typescript
import { geminiText } from '@tanstack/ai-gemini'

const adapter = geminiText()

// Image with mimeType in source
const message = {
  role: 'user',
  content: [
    { type: 'text', content: 'Analyze this image' },
    {
      type: 'image',
      source: { type: 'data', value: imageBase64, mimeType: 'image/png' }
    }
  ]
}
```

**Supported modalities:**
- `gemini-1.5-pro`, `gemini-1.5-flash`: text, image, audio, video, document
- `gemini-2.0-flash`: text, image, audio, video, document

### Ollama

Ollama supports images in compatible models:

```typescript
import { ollamaText } from '@tanstack/ai-ollama'

const adapter = ollamaText('http://localhost:11434')

// Image as base64
const message = {
  role: 'user',
  content: [
    { type: 'text', content: 'What is in this image?' },
    {
      type: 'image',
      source: { type: 'data', value: imageBase64, mimeType: 'image/jpeg' }
    }
  ]
}
```

**Note:** Ollama support varies by model. Check the specific model documentation for multimodal capabilities.

## Source Types

Content can be provided as either inline data or a URL:

### Data (Base64)

Use `type: 'data'` for inline base64-encoded content. **The `mimeType` field is required** to ensure providers receive proper content type information:

```typescript
const imagePart = {
  type: 'image',
  source: {
    type: 'data',
    value: 'iVBORw0KGgoAAAANSUhEUgAAAAUA...', // Base64 string
    mimeType: 'image/png' // Required for data sources
  }
}

const audioPart = {
  type: 'audio',
  source: {
    type: 'data',
    value: 'base64AudioData...',
    mimeType: 'audio/mp3' // Required for data sources
  }
}
```

### URL

Use `type: 'url'` for content hosted at a URL. The `mimeType` field is **optional** as providers can often infer it from the URL or response headers:

```typescript
const imagePart = {
  type: 'image' ,
  source: {
    type: 'url' ,
    value: 'https://example.com/image.jpg',
    mimeType: 'image/jpeg' // Optional hint
  }
}
```

**Note:** Not all providers support URL-based content for all modalities. Check provider documentation for specifics.

## Backward Compatibility

String content continues to work as before:

```typescript
// This still works
const message = {
  role: 'user',
  content: 'Hello, world!'
}

// And this works for multimodal
const multimodalMessage = {
  role: 'user',
  content: [
    { type: 'text', content: 'Hello, world!' },
    { type: 'image', source: { type: 'url', value: '...' } }
  ]
}
```

## Type Safety

The multimodal types are fully typed. Provider-specific metadata types are available:

```typescript
import type { 
  ContentPart,
  ImagePart,
  DocumentPart,
  AudioPart,
  VideoPart,
  TextPart 
} from '@tanstack/ai'

// Provider-specific metadata types
import type { OpenAIImageMetadata } from '@tanstack/ai-openai'
import type { AnthropicImageMetadata } from '@tanstack/ai-anthropic'
import type { GeminiMediaMetadata } from '@tanstack/ai-gemini'
```

### Handling Dynamic Messages

When receiving messages from external sources (like `request.json()`), the data is typed as `any`, which can bypass TypeScript's type checking. Use `assertMessages` to restore type safety:

```typescript
import { chat, assertMessages } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// In an API route handler
const { messages: incomingMessages } = await request.json()

const adapter = openaiText('gpt-5.2')

// Assert incoming messages are compatible with gpt-5.2 (text + image only)
const typedMessages = assertMessages({ adapter }, incomingMessages)

// Now TypeScript will properly check any additional messages you add
const stream = chat({
  adapter,
  messages: [
    ...typedMessages,
    // This will error if you try to add unsupported content types
    {
      role: 'user',
      content: [
        { type: 'text', content: 'What do you see?' },
        { type: 'image', source: { type: 'url', value: '...' } }
      ]
    }
  ]
})
```

> **Note:** `assertMessages` is a type-level assertion only. It does not perform runtime validation. For runtime validation of message content, use a schema validation library like Zod.

## Best Practices

1. **Use appropriate source type**: Use `data` for small content or when you need to include content inline. Use `url` for large files or when the content is already hosted.

2. **Include metadata**: Provide relevant metadata (like `mimeType` or `detail`) to help the model process the content correctly.

3. **Check model support**: Not all models support all modalities. Verify the model you're using supports the content types you want to send.

4. **Handle errors gracefully**: When a model doesn't support a particular modality, it may throw an error. Handle these cases in your application.

## Client-Side Multimodal Messages

When using the `ChatClient` from `@tanstack/ai-client`, you can send multimodal messages directly from your UI using the `sendMessage` method.

### Basic Usage

The `sendMessage` method accepts either a simple string or a `MultimodalContent` object:

```typescript
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('/api/chat'),
})

// Simple text message
await client.sendMessage('Hello!')

// Multimodal message with image
await client.sendMessage({
  content: [
    { type: 'text', content: 'What is in this image?' },
    {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/photo.jpg' }
    }
  ]
})
```

### Custom Message ID

You can provide a custom ID for the message:

```typescript
await client.sendMessage({
  content: 'Hello!',
  id: 'custom-message-id-123'
})
```

### Per-Message Body Parameters

The second parameter allows you to pass additional body parameters for that specific request. These are shallow-merged with the client's base body configuration, with per-message parameters taking priority:

```typescript
const client = new ChatClient({
  connection: fetchServerSentEvents('/api/chat'),
  body: { model: 'gpt-5' }, // Base body params
})

// Override model for this specific message
await client.sendMessage('Analyze this complex problem', {
  model: 'gpt-5',
  temperature: 0.2,
})

 
```

### React Example

Here's how to use multimodal messages in a React component:

```tsx
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { useState } from 'react'

function ChatWithImages() {
  const [imageUrl, setImageUrl] = useState('')
  const { sendMessage, messages } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  const handleSendWithImage = () => {
    if (imageUrl) {
      sendMessage({
        content: [
          { type: 'text', content: 'What do you see in this image?' },
          { type: 'image', source: { type: 'url', value: imageUrl } }
        ]
      })
    }
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

### File Upload Example

Here's how to handle file uploads and send them as multimodal content:

```tsx
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'

function ChatWithFileUpload() {
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  const handleFileUpload = async (file: File) => {
    // Convert file to base64
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        resolve(result.split(',')[1])
      }
      reader.readAsDataURL(file)
    })

    // Determine content type based on file type
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
          source: { type: 'data', value: base64 },
          metadata: { mimeType: file.type }
        }
      ]
    })
  }

  return (
    <input
      type="file"
      accept="image/*,audio/*,video/*,.pdf"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) handleFileUpload(file)
      }}
    />
  )
}
```

