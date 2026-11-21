<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://tanstack.com/api/readme/ai.png?theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://tanstack.com/api/readme/ai.png" />
    <img src="https://tanstack.com/api/readme/ai.png" alt="TanStack AI" width="900" />
  </picture>
</div>

<br />

# @tanstack/ai-cartesia

Cartesia text-to-speech and batch transcription adapters for TanStack AI.

```bash
pnpm add @tanstack/ai @tanstack/ai-cartesia
```

Set `CARTESIA_API_KEY` on your server. Then generate speech:

```ts
import { generateSpeech } from '@tanstack/ai'
import { cartesiaSpeech } from '@tanstack/ai-cartesia'

const result = await generateSpeech({
  adapter: cartesiaSpeech('sonic-3.6'),
  text: 'Hello from Cartesia.',
  voice: 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4',
  threadId: 'speech-demo',
})
```

For transcription, use `cartesiaTranscription('ink-whisper')` with `generateTranscription()`. To pass a key directly, use `createCartesiaSpeech()` or `createCartesiaTranscription()`.
