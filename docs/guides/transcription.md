# Transcription

The TanStack AI SDK provides a unified transcription API that works across different AI providers. This allows you to transcribe audio to text using a consistent interface, regardless of the underlying provider.

## Overview

The transcription API supports two modes of operation:

1. **Non-streaming**: Get the complete transcription as a single result
2. **Streaming**: Receive transcription chunks as they become available

## Basic Usage

### Non-Streaming Transcription

```typescript
import { ai, transcribe } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

// Create an AI instance with OpenAI adapter
const client = ai(openai())

// Transcribe audio file
const result = await transcribe({
  adapter: client.adapters.openai,
  model: 'whisper-1',
  file: audioFile, // File, Blob, ArrayBuffer, or base64 data URL
})

console.log(result.text)
// "Hello, this is a test transcription..."
```

### Streaming Transcription

```typescript
import { ai, transcribeStream } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

const client = ai(openai())

// Stream transcription
const stream = transcribeStream({
  adapter: client.adapters.openai,
  model: 'gpt-4o-transcribe',
  file: audioFile,
})

for await (const chunk of stream) {
  switch (chunk.type) {
    case 'transcript-delta':
      // Incremental text updates
      console.log('Delta:', chunk.delta)
      console.log('Accumulated:', chunk.text)
      break
    case 'transcript-segment':
      // Complete segment with timestamps/speaker info
      console.log('Segment:', chunk.segment)
      break
    case 'transcript-done':
      // Final result with usage stats
      console.log('Complete:', chunk.text)
      console.log('Usage:', chunk.usage)
      break
    case 'error':
      console.error('Error:', chunk.error.message)
      break
  }
}
```

## Supported Providers

### OpenAI

OpenAI provides dedicated transcription models through its Whisper API:

| Model | Streaming | Features |
|-------|-----------|----------|
| `whisper-1` | ❌ | Basic transcription, word timestamps |
| `gpt-4o-transcribe` | ✅ | Streaming, enhanced accuracy |
| `gpt-4o-mini-transcribe` | ✅ | Streaming, faster, lower cost |
| `gpt-4o-transcribe-diarize` | ✅ | Streaming, speaker diarization |

```typescript
import { openai } from '@tanstack/ai-openai'

const result = await transcribe({
  adapter: client.adapters.openai,
  model: 'gpt-4o-transcribe',
  file: audioFile,
  language: 'en', // Optional: hint the language
  providerOptions: {
    response_format: 'verbose_json', // Include segments and timestamps
    timestamp_granularities: ['segment', 'word'],
  },
})
```

### Google Gemini

Gemini supports transcription through its multimodal chat API. Audio is sent to the model with a transcription prompt:

| Model | Streaming | Features |
|-------|-----------|----------|
| `gemini-2.5-pro` | ✅ | High quality, multimodal understanding |
| `gemini-2.5-flash` | ✅ | Faster, balanced quality |
| `gemini-2.5-flash-preview-09-2025` | ✅ | Preview features |
| `gemini-2.0-flash` | ✅ | Previous generation |

```typescript
import { gemini } from '@tanstack/ai-gemini'

const result = await transcribe({
  adapter: client.adapters.gemini,
  model: 'gemini-2.5-flash',
  file: audioFile,
  providerOptions: {
    // Custom transcription prompt
    transcriptionPrompt: 'Transcribe the following podcast accurately.',
    // Request timestamps
    includeTimestamps: true,
    // Speaker identification
    speakerDiarization: {
      enabled: true,
      expectedSpeakerCount: 2,
    },
  },
})
```

## Audio Input Formats

The SDK accepts various audio input formats and normalizes them for each provider:

```typescript
// From File object (browser)
const file = new File([audioData], 'recording.mp3', { type: 'audio/mpeg' })
await transcribe({ adapter, model, file })

// From Blob
const blob = new Blob([audioData], { type: 'audio/wav' })
await transcribe({ adapter, model, file: blob })

// From ArrayBuffer
const arrayBuffer = await response.arrayBuffer()
await transcribe({ adapter, model, file: arrayBuffer })

// From base64 data URL
const dataUrl = 'data:audio/mp3;base64,//uQxAAA...'
await transcribe({ adapter, model, file: dataUrl })

// From file path (Node.js)
await transcribe({ adapter, model, file: '/path/to/audio.mp3' })
```

### Supported Audio Formats

- MP3 (`audio/mpeg`)
- WAV (`audio/wav`)
- WEBM (`audio/webm`)
- OGG (`audio/ogg`)
- FLAC (`audio/flac`)
- M4A (`audio/mp4`)
- AAC (`audio/aac`)

## Transcription Options

### Common Options

| Option | Type | Description |
|--------|------|-------------|
| `adapter` | `BaseAdapter` | The AI adapter to use |
| `model` | `string` | Transcription model name |
| `file` | `AudioInput` | Audio file to transcribe |
| `language` | `string` | ISO-639-1 language code hint |
| `prompt` | `string` | Initial text to guide transcription style |
| `providerOptions` | `object` | Provider-specific options |

### OpenAI Provider Options

```typescript
interface OpenAITranscriptionProviderOptions {
  // Response format
  response_format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt'
  
  // Timestamp granularity (requires verbose_json)
  timestamp_granularities?: Array<'segment' | 'word'>
  
  // Chunking strategy for streaming
  chunking_strategy?: {
    type: 'server_vad'
    prefix_padding_ms?: number
    silence_duration_ms?: number
    threshold?: number
  }
  
  // Speaker information (for diarization models)
  known_speaker_names?: string[]
}
```

### Gemini Provider Options

```typescript
interface GeminiTranscriptionProviderOptions {
  // Custom transcription prompt
  transcriptionPrompt?: string
  
  // Model temperature (0-2)
  temperature?: number
  
  // Maximum output tokens
  maxOutputTokens?: number
  
  // Include timestamps in output
  includeTimestamps?: boolean
  
  // Language hint
  languageHint?: string
  
  // Speaker diarization
  speakerDiarization?: {
    enabled: boolean
    expectedSpeakerCount?: number
  }
}
```

## Response Types

### TranscriptionResult

```typescript
interface TranscriptionResult {
  id: string           // Unique response ID
  model: string        // Model used
  text: string         // Full transcribed text
  language?: string    // Detected language
  duration?: number    // Audio duration in seconds
  segments?: Array<{   // Transcription segments
    id: string
    start: number
    end: number
    text: string
    speaker?: string
  }>
  usage?: {            // Billing information
    type: 'tokens' | 'duration'
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    seconds?: number
  }
}
```

### Stream Chunk Types

| Type | Description |
|------|-------------|
| `transcript-delta` | Incremental text update |
| `transcript-segment` | Complete segment with metadata |
| `transcript-done` | Final result |
| `error` | Error occurred |

## Error Handling

```typescript
try {
  const result = await transcribe({
    adapter,
    model: 'whisper-1',
    file: audioFile,
  })
} catch (error) {
  if (error.message.includes('not supported')) {
    // Adapter doesn't support transcription
    console.error('This adapter does not support transcription')
  } else if (error.message.includes('Invalid audio')) {
    // Audio format issue
    console.error('Invalid audio format')
  } else {
    console.error('Transcription failed:', error)
  }
}
```

## DevTools Integration

Transcription events are automatically tracked in TanStack AI DevTools:

- `transcribe:started` - Transcription request initiated
- `transcribe:completed` - Transcription finished successfully
- `transcribe:error` - Error occurred
- `stream:chunk:transcript` - Streaming chunk received
- `stream:chunk:transcript-segment` - Segment chunk received

## Best Practices

1. **Choose the right model**: Use streaming models for real-time feedback, non-streaming for batch processing
2. **Specify language**: Providing a language hint improves accuracy
3. **Use appropriate formats**: MP3 and WAV are most widely supported
4. **Handle errors gracefully**: Some adapters don't support transcription
5. **Monitor usage**: Track token/duration usage for cost management

## Example: Real-Time Voice Chat

```typescript
import { ai, transcribeStream } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

const client = ai(openai())

async function transcribeVoiceMessage(audioBlob: Blob) {
  const chunks: string[] = []
  
  const stream = transcribeStream({
    adapter: client.adapters.openai,
    model: 'gpt-4o-mini-transcribe',
    file: audioBlob,
    providerOptions: {
      chunking_strategy: {
        type: 'server_vad',
        silence_duration_ms: 500,
      },
    },
  })
  
  for await (const chunk of stream) {
    if (chunk.type === 'transcript-delta') {
      // Update UI with partial text
      updateTranscriptUI(chunk.text)
    } else if (chunk.type === 'transcript-done') {
      return chunk.text
    }
  }
}
```
