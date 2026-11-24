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

# @tanstack/ai-deepgram

Deepgram live speech-to-text for [TanStack AI](https://tanstack.com/ai). Stream phone and voice-agent audio (μ-law, A-law, or PCM) to Nova-3 or Flux, and get text while the speaker talks.

```bash
npm install @tanstack/ai @tanstack/ai-deepgram
```

```typescript
import { transcriptionSession } from '@tanstack/ai'
import { deepgramLiveTranscription } from '@tanstack/ai-deepgram'

const session = await transcriptionSession({
  adapter: deepgramLiveTranscription('nova-3'),
  audio: { encoding: 'mulaw', sampleRate: 8000 },
})

for await (const event of session) {
  if (event.type === 'final') console.log(event.text)
}
```

The adapter reads `DEEPGRAM_API_KEY`. See the [Deepgram adapter docs](https://tanstack.com/ai/latest/docs/adapters/deepgram) and [Live Transcription](https://tanstack.com/ai/latest/docs/media/live-transcription).
