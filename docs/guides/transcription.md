---
title: Transcription
id: transcription
order: 14
---

# Audio Transcription

TanStack AI provides support for audio transcription (speech-to-text) through dedicated transcription adapters. This guide covers how to convert spoken audio into text using OpenAI's Whisper and GPT-4o transcription models.

## Overview

Audio transcription is handled by transcription adapters that follow the same tree-shakeable architecture as other adapters in TanStack AI.

Currently supported:
- **OpenAI**: Whisper-1, GPT-4o-transcribe, GPT-4o-mini-transcribe

## Basic Usage

### OpenAI Transcription

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

// Create a transcription adapter (uses OPENAI_API_KEY from environment)
const adapter = openaiTranscription()

// Transcribe audio from a file
const audioFile = new File([audioBuffer], 'audio.mp3', { type: 'audio/mpeg' })

const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: audioFile,
  language: 'en',
})

console.log(result.text) // The transcribed text
```

### Using Base64 Audio

```typescript
import { readFile } from 'fs/promises'

// Read audio file as base64
const audioBuffer = await readFile('recording.mp3')
const base64Audio = audioBuffer.toString('base64')

const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: base64Audio,
})

console.log(result.text)
```

### Using Data URLs

```typescript
const dataUrl = `data:audio/mpeg;base64,${base64AudioData}`

const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: dataUrl,
})
```

## Options

### Common Options

| Option | Type | Description |
|--------|------|-------------|
| `audio` | `File \| string` | Audio data (File object or base64 string) - required |
| `language` | `string` | Language code (e.g., "en", "es", "fr") |

### Supported Languages

Whisper supports many languages. Common codes include:

| Code | Language |
|------|----------|
| `en` | English |
| `es` | Spanish |
| `fr` | French |
| `de` | German |
| `it` | Italian |
| `pt` | Portuguese |
| `ja` | Japanese |
| `ko` | Korean |
| `zh` | Chinese |
| `ru` | Russian |

> **Tip:** Providing the correct language code improves accuracy and reduces latency.

## Model Options

### OpenAI Model Options

```typescript
const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: audioFile,
  modelOptions: {
    response_format: 'verbose_json', // Get detailed output with timestamps
    temperature: 0, // Lower = more deterministic
    prompt: 'Technical terms: API, SDK, CLI', // Guide transcription
  },
})
```

| Option | Type | Description |
|--------|------|-------------|
| `response_format` | `string` | Output format: "json", "text", "srt", "verbose_json", "vtt" |
| `temperature` | `number` | Sampling temperature (0 to 1) |
| `prompt` | `string` | Optional text to guide transcription style |
| `include` | `string[]` | Timestamp granularity: ["word"], ["segment"], or both |

### Response Formats

| Format | Description |
|--------|-------------|
| `json` | Simple JSON with text |
| `text` | Plain text only |
| `srt` | SubRip subtitle format |
| `verbose_json` | Detailed JSON with timestamps and segments |
| `vtt` | WebVTT subtitle format |

## Response Format

The transcription result includes:

```typescript
interface TranscriptionResult {
  id: string           // Unique identifier
  model: string        // Model used
  text: string         // Full transcribed text
  language?: string    // Detected/specified language
  duration?: number    // Audio duration in seconds
  segments?: Array<{   // Timestamped segments
    start: number      // Start time in seconds
    end: number        // End time in seconds
    text: string       // Segment text
    words?: Array<{    // Word-level timestamps
      word: string
      start: number
      end: number
      confidence?: number
    }>
  }>
}
```

## Complete Example

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { readFile } from 'fs/promises'

async function transcribeAudio(filepath: string) {
  const adapter = openaiTranscription()
  
  // Read the audio file
  const audioBuffer = await readFile(filepath)
  const audioFile = new File(
    [audioBuffer], 
    filepath.split('/').pop()!, 
    { type: 'audio/mpeg' }
  )

  // Transcribe with detailed output
  const result = await generateTranscription({
    adapter: openaiTranscription('whisper-1'),
    audio: audioFile,
    language: 'en',
    modelOptions: {
      response_format: 'verbose_json',
      include: ['segment', 'word'],
    },
  })

  console.log('Full text:', result.text)
  console.log('Duration:', result.duration, 'seconds')
  
  // Print segments with timestamps
  if (result.segments) {
    for (const segment of result.segments) {
      console.log(`[${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s]: ${segment.text}`)
    }
  }

  return result
}

// Usage
await transcribeAudio('./meeting-recording.mp3')
```

## Model Availability

### OpenAI Models

| Model | Description | Use Case |
|-------|-------------|----------|
| `whisper-1` | Whisper large-v2 | General transcription |
| `gpt-4o-transcribe` | GPT-4o-based transcription | Higher accuracy |
| `gpt-4o-transcribe-diarize` | With speaker diarization | Multi-speaker audio |
| `gpt-4o-mini-transcribe` | Faster, lighter model | Cost-effective |

### Supported Audio Formats

OpenAI supports these audio formats:

- `mp3` - MPEG Audio Layer 3
- `mp4` - MPEG-4 Audio
- `mpeg` - MPEG Audio
- `mpga` - MPEG Audio
- `m4a` - MPEG-4 Audio
- `wav` - Waveform Audio
- `webm` - WebM Audio
- `flac` - Free Lossless Audio Codec
- `ogg` - Ogg Vorbis

> **Note:** Maximum file size is 25 MB.

## Browser Usage

### Recording and Transcribing

```typescript
async function recordAndTranscribe() {
  // Request microphone access
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mediaRecorder = new MediaRecorder(stream)
  const chunks: Blob[] = []

  mediaRecorder.ondataavailable = (e) => chunks.push(e.data)
  
  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(chunks, { type: 'audio/webm' })
    const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' })
    
    // Send to your API endpoint for transcription
    const formData = new FormData()
    formData.append('audio', audioFile)
    
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData,
    })
    
    const result = await response.json()
    console.log('Transcription:', result.text)
  }

  // Start recording
  mediaRecorder.start()
  
  // Stop after 10 seconds
  setTimeout(() => mediaRecorder.stop(), 10000)
}
```

### Server API Endpoint

```typescript
// api/transcribe.ts
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const formData = await request.formData()
  const audioFile = formData.get('audio') as File

  const result = await generateTranscription({
    adapter: openaiTranscription('whisper-1'),
    audio: audioFile,
  })

  return Response.json(result)
}
```

## Error Handling

```typescript
try {
  const result = await generateTranscription({
    adapter: openaiTranscription('whisper-1'),
    audio: audioFile,
  })
} catch (error) {
  if (error.message.includes('Invalid file format')) {
    console.error('Unsupported audio format')
  } else if (error.message.includes('File too large')) {
    console.error('Audio file exceeds 25 MB limit')
  } else if (error.message.includes('Audio file is too short')) {
    console.error('Audio must be at least 0.1 seconds')
  } else {
    console.error('Transcription error:', error.message)
  }
}
```

## Environment Variables

The transcription adapter uses:

- `OPENAI_API_KEY`: Your OpenAI API key

## Explicit API Keys

```typescript
import { createOpenaiTranscription } from '@tanstack/ai-openai'

const adapter = createOpenaiTranscription('your-openai-api-key')
```

## Best Practices

1. **Audio Quality**: Better audio quality leads to more accurate transcriptions. Reduce background noise when possible.

2. **Language Specification**: Always specify the language if known—this improves accuracy and speed.

3. **File Size**: Keep audio files under 25 MB. For longer recordings, split into chunks.

4. **Format Selection**: MP3 offers a good balance of quality and size. Use WAV or FLAC for highest quality.

5. **Prompting**: Use the `prompt` option to provide context or expected vocabulary (e.g., technical terms, names).

6. **Timestamps**: Request `verbose_json` format and enable `include: ['word', 'segment']` when you need timing information for captions or synchronization.

