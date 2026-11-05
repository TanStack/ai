---
title: Cartesia
id: cartesia-adapter
order: 10
description: "Generate speech with Sonic 3.6 and transcribe recordings with Ink Whisper in TanStack AI."
keywords:
  - tanstack ai
  - cartesia
  - sonic
  - ink whisper
  - text to speech
  - transcription
---

Call `cartesiaSpeech()` to generate audio with Sonic, or call `cartesiaTranscription()` to transcribe a recording with Ink Whisper.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-cartesia
vue: @tanstack/ai @tanstack/ai-cartesia
solid: @tanstack/ai @tanstack/ai-cartesia
svelte: @tanstack/ai @tanstack/ai-cartesia
preact: @tanstack/ai @tanstack/ai-cartesia
angular: @tanstack/ai @tanstack/ai-cartesia
vanilla: @tanstack/ai @tanstack/ai-cartesia
octane: @tanstack/ai @tanstack/ai-cartesia

<!-- ::end:tabs -->

## 2. Set the API key

Put your Cartesia key in the environment of your server:

```bash
CARTESIA_API_KEY=sk_car_...
```

## 3. Generate speech

Pass a [Cartesia voice ID](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest#voice-selection) to `generateSpeech()`. The result contains base64 audio in MP3 format by default.

```typescript
import { generateSpeech } from '@tanstack/ai'
import { cartesiaSpeech } from '@tanstack/ai-cartesia'

const result = await generateSpeech({
  adapter: cartesiaSpeech('sonic-3.6'),
  text: 'Hello from Cartesia.',
  voice: 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4',
  threadId: 'speech-demo',
})

console.log(result.format, result.contentType)
```

Set `format` to `mp3`, `wav`, or `pcm`. Set `speed` on `generateSpeech()` to control playback speed. Use `modelOptions` for `language`, `normalization`, `pronunciationDictId`, or `volume`.

## 4. Transcribe a recording

`cartesiaTranscription()` accepts an audio file, a Blob, an ArrayBuffer, or a base64 string. Use `responseFormat: 'verbose_json'` to request word timestamps.

```typescript
import { readFile } from 'node:fs/promises'
import { generateTranscription } from '@tanstack/ai'
import { cartesiaTranscription } from '@tanstack/ai-cartesia'

const bytes = await readFile('./recording.mp3')
const audio = new File([bytes], 'recording.mp3', { type: 'audio/mpeg' })

const result = await generateTranscription({
  adapter: cartesiaTranscription('ink-whisper'),
  audio,
  responseFormat: 'verbose_json',
  threadId: 'transcription-demo',
})

console.log(result.text, result.words)
```

For browser input and server routes, see [Text-to-Speech](../media/text-to-speech) and [Transcription](../media/transcription). Both calls now use Cartesia from your server.
