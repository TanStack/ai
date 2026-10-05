---
title: 60db
id: sixtydb
order: 17
description: Generate speech with 60db workspace voices through TanStack AI.
---

Use a 60db workspace voice with `generateSpeech()`. The adapter sends synthesis requests to the [60db HTTP API](https://docs.60db.ai/api-reference/tts/text-to-speech).

## Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-sixtydb
vue: @tanstack/ai @tanstack/ai-sixtydb
solid: @tanstack/ai @tanstack/ai-sixtydb
svelte: @tanstack/ai @tanstack/ai-sixtydb
preact: @tanstack/ai @tanstack/ai-sixtydb
angular: @tanstack/ai @tanstack/ai-sixtydb
octane: @tanstack/ai @tanstack/ai-sixtydb
vanilla: @tanstack/ai @tanstack/ai-sixtydb

<!-- ::end:tabs -->

## Generate speech

Keep your API key on the server. Set `SIXTYDB_API_KEY` and `SIXTYDB_VOICE_ID` in the server environment.
Use a voice ID from your authenticated workspace's [voice catalog](https://docs.60db.ai/api-reference/voices/get-voices).

```typescript
import { writeFile } from 'node:fs/promises'
import { generateSpeech } from '@tanstack/ai'
import { sixtydbSpeech } from '@tanstack/ai-sixtydb'

const voiceId = process.env.SIXTYDB_VOICE_ID
if (!voiceId) throw new Error('Set SIXTYDB_VOICE_ID')

const result = await generateSpeech({
  adapter: sixtydbSpeech(),
  text: 'Hello from a workspace voice.',
  voice: voiceId,
  speed: 1,
  format: 'wav',
})

await writeFile('speech.wav', Buffer.from(result.audio, 'base64'))
```

The result contains base64 audio, its content type, and its duration in seconds.
WAV output contains mono PCM16 samples at 24 kHz. Open `speech.wav` to hear the result.

## Configuration

`sixtydbSpeech('tts', config)` reads `SIXTYDB_API_KEY` unless `config.apiKey` is set.
`createSixtyDBSpeech('tts', apiKey, config)` accepts an explicit key.
The `tts` identifier selects the synthesis endpoint. The workspace voice determines the synthesis model.

| Configuration | Purpose |
| --- | --- |
| `voiceId` | Default workspace voice. A request's `voice` takes precedence. |
| `baseURL` | API or gateway URL. Default: `https://api.60db.ai`. |
| `defaultHeaders` | Extra headers for a gateway. Authentication headers come from the API key. |
| `fetch` | Custom fetch implementation. |

URLs must use HTTPS. HTTP is accepted only for loopback addresses in local tests.
Authenticated redirects are rejected.

## Speech configuration

Pass the following fields through `modelOptions`:

| Field | Accepted value |
| --- | --- |
| `wpm` | Target rate from 60 to 300 words per minute. |
| `stability` | Integer from 0 to 100. |
| `similarity` | Integer from 0 to 100. |
| `targetLanguage` | Cross-lingual synthesis hint, such as `en` or `hi`. |

## Supported output

- `wav` is the default output format. Use it for file playback.
- `pcm` returns raw little-endian PCM16 samples, mono at 24 kHz.
- A request accepts up to 5000 characters. The speed range is 0.5 to 2.
- Pass `abortSignal` or `timeout` to [`generateSpeech()`](../media/text-to-speech) to cancel a request.
- Dialogue turns, timestamp alignment, transcription, and native WebSocket synthesis are not supported by this adapter.

JSON, NDJSON, SSE, and binary synthesis responses are assembled before the result returns.
The adapter rejects incompatible audio metadata and responses larger than 32 MiB.
