# @tanstack/ai-twelvelabs

TwelveLabs adapter for TanStack AI — video understanding with Pegasus.

[TwelveLabs](https://twelvelabs.io) builds video-native foundation models.
**Pegasus** reasons over a video and returns prompt-guided text (summaries,
Q&A, chapters, highlights). This adapter exposes Pegasus through the standard
TanStack AI `chat()` / `summarize()` activities: put a video content part in a
message, ask a question, and stream back text.

## Installation

```bash
npm install @tanstack/ai-twelvelabs @tanstack/ai
```

Set `TWELVELABS_API_KEY` in your environment (or pass the key explicitly). You
can grab a free API key at [twelvelabs.io](https://twelvelabs.io) — there's a
generous free tier.

## Basic Usage

```typescript
import { chat } from '@tanstack/ai'
import { twelvelabsText } from '@tanstack/ai-twelvelabs'

const stream = chat({
  adapter: twelvelabsText('pegasus1.5'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', content: 'Summarize this video in one paragraph.' },
        {
          type: 'video',
          source: { type: 'url', value: 'https://example.com/clip.mp4' },
        },
      ],
    },
  ],
})

for await (const chunk of stream) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') process.stdout.write(chunk.delta)
}
```

The video can be supplied three ways:

- **URL** — `{ type: 'video', source: { type: 'url', value } }` (direct link to
  a raw media file; hosting-platform links are not supported).
- **Inline base64** — `source: { type: 'data', value, mimeType }` (max 30 MB).
- **Pre-uploaded asset** — `modelOptions: { assetId }`, which takes precedence
  over any inline video part.

## Custom API Key

```typescript
import { createTwelveLabsText } from '@tanstack/ai-twelvelabs'

const adapter = createTwelveLabsText(
  'pegasus1.5',
  process.env.TWELVELABS_API_KEY!,
)
```

## Provider Options

```typescript
import { chat } from '@tanstack/ai'
import { twelvelabsText } from '@tanstack/ai-twelvelabs'

const stream = chat({
  adapter: twelvelabsText('pegasus1.5'),
  messages: [
    /* ... */
  ],
  modelOptions: {
    temperature: 0.2,
    maxTokens: 2048,
    startTime: 10, // analyze only seconds 10–30 (Pegasus 1.5)
    endTime: 30,
  },
})
```

## Structured Output

Pegasus supports a `json_schema` response format. Pass a schema to `chat()` and
the adapter constrains the output:

```typescript
import { chat } from '@tanstack/ai'
import { twelvelabsText } from '@tanstack/ai-twelvelabs'
import { z } from 'zod'

const result = await chat({
  adapter: twelvelabsText('pegasus1.5'),
  messages: [
    /* ... a video + prompt ... */
  ],
  outputSchema: z.object({ summary: z.string(), topics: z.array(z.string()) }),
})
```

## Models

| Model        | Use                                                             |
| ------------ | --------------------------------------------------------------- |
| `pegasus1.5` | Video understanding with clip windowing and larger token budget |
| `pegasus1.2` | General video understanding (legacy)                            |

`TWELVELABS_EMBEDDING_MODELS` (`marengo3.0`) is also exported for reference —
Marengo produces 512-dim multimodal embeddings over a shared text/image/audio/video
space. TanStack AI does not yet expose an embeddings activity; this adapter
focuses on the Pegasus video-understanding path.

## License

MIT
