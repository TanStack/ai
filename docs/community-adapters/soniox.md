---
title: Soniox
id: soniox-adapter
order: 3
description: "Transcribe audio with Soniox STT models in TanStack AI."
keywords:
  - tanstack ai
  - soniox
  - transcription
  - speech-to-text
  - asr
  - community adapter
---

# Soniox

If you need Soniox speech-to-text → install the adapter and call `generateTranscription`.

## Install

```bash
npm install @soniox/tanstack-ai-adapter
```

Set `SONIOX_API_KEY` or pass `apiKey`. Key: [Soniox Console](https://console.soniox.com).

## Basic usage

```typescript
import { generateTranscription } from "@tanstack/ai";
import { sonioxTranscription } from "@soniox/tanstack-ai-adapter";
import { audioFile } from "./audio";

const result = await generateTranscription({
  adapter: sonioxTranscription("stt-async-v3"),
  audio: audioFile,
  modelOptions: {
    enableLanguageIdentification: true,
    enableSpeakerDiarization: true,
  },
});

console.log(result.text);
console.log(result.segments);
```

Explicit key:

```typescript
import { generateTranscription } from "@tanstack/ai";
import { createSonioxTranscription } from "@soniox/tanstack-ai-adapter";
import { audioFile } from "./audio";

const adapter = createSonioxTranscription(
  "stt-async-v3",
  process.env.SONIOX_API_KEY!,
);

const result = await generateTranscription({ adapter, audio: audioFile });
```

## Adapter config

```typescript
import { createSonioxTranscription } from "@soniox/tanstack-ai-adapter";

const adapter = createSonioxTranscription("stt-async-v3", process.env.SONIOX_API_KEY!, {
  baseUrl: "https://api.soniox.com",
  pollingIntervalMs: 1000,
  timeout: 180000,
});
```

- `apiKey` — required with `createSonioxTranscription`
- `baseUrl` — default `https://api.soniox.com` ([regional endpoints](https://soniox.com/docs/stt/data-residency#regional-endpoints))
- `headers` · `timeout` (default 180000) · `pollingIntervalMs` (default 1000)

## modelOptions

```typescript
import { generateTranscription } from "@tanstack/ai";
import { sonioxTranscription } from "@soniox/tanstack-ai-adapter";
import { audio } from "./audio";

const result = await generateTranscription({
  adapter: sonioxTranscription("stt-async-v3"),
  audio,
  modelOptions: {
    languageHints: ["en", "es"],
    enableLanguageIdentification: true,
    enableSpeakerDiarization: true,
    context: { terms: ["Soniox", "TanStack"] },
  },
});
```

- `languageHints` / `languageHintsStrict` — bias ([60+ languages](https://soniox.com/docs/stt/concepts/supported-languages)); TanStack `language` merges into hints
- `enableLanguageIdentification` · `enableSpeakerDiarization`
- `context` · `clientReferenceId` · webhook fields · `translation`

API: [create transcription](https://soniox.com/docs/stt/api-reference/transcriptions/create_transcription).

## Context

```typescript
import { generateTranscription } from "@tanstack/ai";
import { sonioxTranscription } from "@soniox/tanstack-ai-adapter";

const audio = new ArrayBuffer(0);

const result = await generateTranscription({
  adapter: sonioxTranscription("stt-async-v3"),
  audio,
  modelOptions: {
    context: {
      general: [
        { key: "domain", value: "Healthcare" },
        { key: "topic", value: "Diabetes management consultation" },
      ],
      text: "The patient has a history of...",
      terms: ["Celebrex", "Zyrtec"],
      translationTerms: [{ source: "MRI", target: "RM" }],
    },
  },
});
```

Details: [Soniox context](https://soniox.com/docs/stt/concepts/context).

## Translation

```typescript
import { generateTranscription } from "@tanstack/ai";
import { sonioxTranscription } from "@soniox/tanstack-ai-adapter";

const audio = new ArrayBuffer(0);

// one-way
await generateTranscription({
  adapter: sonioxTranscription("stt-async-v3"),
  audio,
  modelOptions: {
    translation: { type: "one_way", targetLanguage: "es" },
  },
});

// two-way
await generateTranscription({
  adapter: sonioxTranscription("stt-async-v3"),
  audio,
  modelOptions: {
    translation: { type: "two_way", languageA: "en", languageB: "es" },
  },
});
```

`segments` are transcription tokens only. Translation tokens live on runtime `providerMetadata` (non-standard field — see package docs / filter `translation_status === "translation"`).

## Links

- [Console](https://console.soniox.com) · [Soniox docs](https://soniox.com/docs)
- [Transcription Guide](../media/transcription)
