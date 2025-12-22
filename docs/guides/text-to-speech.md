---
title: Text-to-Speech
id: text-to-speech
order: 13
---

# Text-to-Speech (TTS)

TanStack AI provides support for text-to-speech generation through dedicated TTS adapters. This guide covers how to convert text into spoken audio using OpenAI and Gemini providers.

## Overview

Text-to-speech (TTS) is handled by TTS adapters that follow the same tree-shakeable architecture as other adapters in TanStack AI. The TTS adapters support:

- **OpenAI**: TTS-1, TTS-1-HD, and audio-capable GPT-4o models
- **Gemini**: Gemini 2.5 Flash TTS (experimental)

## Basic Usage

### OpenAI Text-to-Speech

```typescript
import { generateSpeech } from '@tanstack/ai'
import { openaiTTS } from '@tanstack/ai-openai'

// Create a TTS adapter (uses OPENAI_API_KEY from environment)
const adapter = openaiSpeech()

// Generate speech from text
const result = await generateSpeech({
  adapter: openaiTTS('tts-1'),
  text: 'Hello, welcome to TanStack AI!',
  voice: 'alloy',
})

// result.audio contains base64-encoded audio data
console.log(result.format) // 'mp3'
console.log(result.contentType) // 'audio/mpeg'
```

### Gemini Text-to-Speech (Experimental)

```typescript
import { generateSpeech } from '@tanstack/ai'
import { geminiSpeech } from '@tanstack/ai-gemini'

// Create a TTS adapter (uses GOOGLE_API_KEY from environment)
const adapter = geminiSpeech()

// Generate speech from text
const result = await generateSpeech({
  adapter: geminiTTS('gemini-2.5-flash-preview-tts'),
  text: 'Hello from Gemini TTS!',
})

console.log(result.audio) // Base64 encoded audio
```

## Options

### Common Options

All TTS adapters support these common options:

| Option | Type | Description |
|--------|------|-------------|
| `text` | `string` | The text to convert to speech (required) |
| `voice` | `string` | The voice to use for generation |
| `format` | `string` | Output audio format (e.g., "mp3", "wav") |

### OpenAI Voice Options

OpenAI provides several distinct voices:

| Voice | Description |
|-------|-------------|
| `alloy` | Neutral, balanced voice |
| `echo` | Warm, conversational voice |
| `fable` | Expressive, storytelling voice |
| `onyx` | Deep, authoritative voice |
| `nova` | Friendly, upbeat voice |
| `shimmer` | Clear, gentle voice |
| `ash` | Calm, measured voice |
| `ballad` | Melodic, flowing voice |
| `coral` | Bright, energetic voice |
| `sage` | Wise, thoughtful voice |
| `verse` | Poetic, rhythmic voice |

### OpenAI Format Options

| Format | Description |
|--------|-------------|
| `mp3` | MP3 audio (default) |
| `opus` | Opus audio (good for streaming) |
| `aac` | AAC audio |
| `flac` | FLAC audio (lossless) |
| `wav` | WAV audio (uncompressed) |
| `pcm` | Raw PCM audio |

## Model Options

### OpenAI Model Options

```typescript
const result = await generateSpeech({
  adapter: openaiTTS('tts-1-hd'),
  text: 'High quality speech synthesis',
  voice: 'nova',
  format: 'mp3',
  modelOptions: {
    speed: 1.0, // 0.25 to 4.0
  },
})
```

| Option | Type | Description |
|--------|------|-------------|
| `speed` | `number` | Playback speed (0.25 to 4.0, default 1.0) |
| `instructions` | `string` | Voice style instructions (GPT-4o audio models only) |

> **Note:** The `instructions` and `stream_format` options are only available with `gpt-4o-audio-preview` and `gpt-4o-mini-audio-preview` models, not with `tts-1` or `tts-1-hd`.

## Response Format

The TTS result includes:

```typescript
interface TTSResult {
  id: string        // Unique identifier for this generation
  model: string     // The model used
  audio: string     // Base64-encoded audio data
  format: string    // Audio format (e.g., "mp3")
  contentType: string // MIME type (e.g., "audio/mpeg")
  duration?: number // Duration in seconds (if available)
}
```

## Playing Audio in the Browser

```typescript
// Convert base64 to audio and play
function playAudio(result: TTSResult) {
  const audioData = atob(result.audio)
  const bytes = new Uint8Array(audioData.length)
  for (let i = 0; i < audioData.length; i++) {
    bytes[i] = audioData.charCodeAt(i)
  }
  
  const blob = new Blob([bytes], { type: result.contentType })
  const url = URL.createObjectURL(blob)
  
  const audio = new Audio(url)
  audio.play()
  
  // Clean up when done
  audio.onended = () => URL.revokeObjectURL(url)
}
```

## Saving Audio to File (Node.js)

```typescript
import { writeFile } from 'fs/promises'

async function saveAudio(result: TTSResult, filename: string) {
  const audioBuffer = Buffer.from(result.audio, 'base64')
  await writeFile(filename, audioBuffer)
  console.log(`Saved to ${filename}`)
}

// Usage
const result = await generateSpeech({
  adapter: openaiTTS('tts-1'),
  text: 'Hello world!',
})

await saveAudio(result, 'output.mp3')
```

## Model Availability

### OpenAI Models

| Model | Quality | Speed | Use Case |
|-------|---------|-------|----------|
| `tts-1` | Standard | Fast | Real-time applications |
| `tts-1-hd` | High | Slower | Production audio |
| `gpt-4o-audio-preview` | Highest | Variable | Advanced voice control |
| `gpt-4o-mini-audio-preview` | High | Fast | Balanced quality/speed |

### Gemini Models

| Model | Status | Notes |
|-------|--------|-------|
| `gemini-2.5-flash-preview-tts` | Experimental | May require Live API for full features |

## Error Handling

```typescript
try {
  const result = await generateSpeech({
    adapter: openaiTTS('tts-1'),
    text: 'Hello!',
  })
} catch (error) {
  if (error.message.includes('exceeds maximum length')) {
    console.error('Text is too long (max 4096 characters)')
  } else if (error.message.includes('Speed must be between')) {
    console.error('Invalid speed value')
  } else {
    console.error('TTS error:', error.message)
  }
}
```

## Environment Variables

The TTS adapters use the same environment variables as other adapters:

- **OpenAI**: `OPENAI_API_KEY`
- **Gemini**: `GOOGLE_API_KEY` or `GEMINI_API_KEY`

## Explicit API Keys

For production use or when you need explicit control:

```typescript
import { createOpenaiTTS } from '@tanstack/ai-openai'
import { createGeminiTTS } from '@tanstack/ai-gemini'

// OpenAI
const openaiAdapter = createOpenaiTTS('your-openai-api-key')

// Gemini
const geminiAdapter = createGeminiTTS('your-google-api-key')
```

## Best Practices

1. **Text Length**: OpenAI TTS supports up to 4096 characters per request. For longer content, split into chunks.

2. **Voice Selection**: Choose voices appropriate for your content—use `onyx` for authoritative content, `nova` for friendly interactions.

3. **Format Selection**: Use `mp3` for general use, `opus` for streaming, `wav` for further processing.

4. **Caching**: Cache generated audio to avoid regenerating the same content.

5. **Error Handling**: Always handle errors gracefully, especially for user-facing applications.

