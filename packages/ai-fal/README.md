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

# @tanstack/ai-fal

fal.ai adapter for TanStack AI image, video, live, audio, speech, and transcription generation

## Installation

```bash
npm install @tanstack/ai-fal
# or
pnpm add @tanstack/ai-fal
# or
yarn add @tanstack/ai-fal
```

## Setup

Create an API key at [fal.ai](https://fal.ai) and set it as an environment variable:

```bash
export FAL_KEY="your-fal-api-key"
```

Or pass it explicitly to any adapter factory: `falImage('fal-ai/flux/dev', { apiKey })`.

## Usage

### Image generation

```typescript
import { generateImage } from '@tanstack/ai'
import { falImage } from '@tanstack/ai-fal'

const result = await generateImage({
  adapter: falImage('fal-ai/flux/dev'),
  prompt: 'A futuristic cityscape at sunset',
  numberOfImages: 1,
})

console.log(result.images)
```

Model ids are string literals with full type safety, so `size` and `modelOptions` are checked against the model you picked.

### Video generation (experimental)

Video runs as a job: submit, then poll.

```typescript
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { falVideo } from '@tanstack/ai-fal'

const adapter = falVideo('fal-ai/kling-video/v2.6/pro/text-to-video')

const job = await generateVideo({
  adapter,
  prompt: 'A timelapse of a flower blooming',
  size: '16:9',
  duration: '5',
})

const status = await getVideoJobStatus({ adapter, jobId: job.jobId })
console.log(status.status) // "pending" | "processing" | "completed"
```

### Text-to-speech

The adapter fetches the generated audio from fal's CDN and returns it base64-encoded, matching the `TTSResult` contract.

```typescript
import { generateSpeech } from '@tanstack/ai'
import { falSpeech } from '@tanstack/ai-fal'

const result = await generateSpeech({
  adapter: falSpeech('fal-ai/kokoro/american-english'),
  text: 'Hello from fal!',
  voice: 'af_heart',
  speed: 1.0,
})

console.log(result.format) // e.g. "wav"
```

### Transcription

`audio` accepts a URL string, `Blob`, `File`, or `ArrayBuffer`.

```typescript
import { generateTranscription } from '@tanstack/ai'
import { falTranscription } from '@tanstack/ai-fal'

const result = await generateTranscription({
  adapter: falTranscription('fal-ai/whisper'),
  audio: 'https://example.com/recording.mp3',
  language: 'en',
})

console.log(result.text)
```

### Music and sound effects

Unlike TTS, `generateAudio()` returns a URL in `result.audio.url`.

```typescript
import { generateAudio } from '@tanstack/ai'
import { falAudio } from '@tanstack/ai-fal'

const music = await generateAudio({
  adapter: falAudio('fal-ai/minimax-music/v2.6'),
  prompt: 'City Pop, 80s retro, groovy synth bass, warm female vocal, 104 BPM',
})

console.log(music.audio.url)
```

### Live video

`falLiveVideo('minimax/h3-max/director')` with `generateLiveVideo()` starts an H3 Max Director session; the browser then connects through a server proxy that attaches `FAL_KEY`. See [Live Generation](https://tanstack.com/ai/latest/docs/media/live-generation) for the connect step.

## Adapters

| Factory              | Activity                  |
| -------------------- | ------------------------- |
| `falImage()`         | `generateImage()`         |
| `falVideo()`         | `generateVideo()`         |
| `falLiveVideo()`     | `generateLiveVideo()`     |
| `falSpeech()`        | `generateSpeech()`        |
| `falTranscription()` | `generateTranscription()` |
| `falAudio()`         | `generateAudio()`         |

## Limitations

- No text/chat, tools, or summarization — use a text adapter for `chat()` and `summarize()`
- Video generation is experimental and its API may change

## Documentation

- [fal.ai adapter](https://tanstack.com/ai/latest/docs/adapters/fal): every option, the popular models per activity, and the full API reference
- [Live Generation](https://tanstack.com/ai/latest/docs/media/live-generation)

## License

MIT
