---
title: Soniox
id: soniox-adapter
order: 3
description: "Transcribe audio with Soniox speech-to-text models in TanStack AI, with speaker labels, language detection, and translation, through the Soniox community adapter."
keywords:
  - tanstack ai
  - soniox
  - transcription
  - speech-to-text
  - asr
  - community adapter
---

The Soniox community adapter calls Soniox speech-to-text from `generateTranscription()`. It supports speaker labels, language detection, custom terms, and translation. Soniox maintains it.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @soniox/tanstack-ai-adapter
vue: @soniox/tanstack-ai-adapter
solid: @soniox/tanstack-ai-adapter
svelte: @soniox/tanstack-ai-adapter
preact: @soniox/tanstack-ai-adapter
angular: @soniox/tanstack-ai-adapter
vanilla: @soniox/tanstack-ai-adapter
octane: @soniox/tanstack-ai-adapter

<!-- ::end:tabs -->

## 2. Set the API key

Get your API key from the [Soniox Console](https://console.soniox.com). Put it in the environment of your server:

```bash
SONIOX_API_KEY=your-api-key
```

`sonioxTranscription` reads `SONIOX_API_KEY`. To pass the key in code, use `createSonioxTranscription`:

```typescript
import { generateTranscription } from "@tanstack/ai";
import { createSonioxTranscription } from "@soniox/tanstack-ai-adapter";
import { audioFile } from "./audio";

const adapter = createSonioxTranscription("stt-async-v3", process.env.SONIOX_API_KEY!);

const result = await generateTranscription({
  adapter,
  audio: audioFile,
  threadId: "thread-1",
});
```

## 3. Transcribe audio

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
  threadId: "thread-1",
});

console.log(result.text);
console.log(result.segments);
```

You get the full text in `result.text`, and the timed segments with speaker labels in `result.segments`. See [Transcription](../media/transcription).

## Language hints

Soniox detects and transcribes speech in [60+ languages](https://soniox.com/docs/stt/concepts/supported-languages). Do you know which languages the audio has? Pass them in `languageHints` to improve accuracy:

```typescript
import { generateTranscription } from "@tanstack/ai";
import { sonioxTranscription } from "@soniox/tanstack-ai-adapter";
import { audio } from "./audio";

const result = await generateTranscription({
  adapter: sonioxTranscription("stt-async-v3"),
  audio,
  modelOptions: {
    languageHints: ["en", "es"],
  },
  threadId: "thread-1",
});
```

- Hints do not limit recognition. They only bias it.
- If you pass the TanStack `language` option, the adapter adds it to `languageHints`.

See the [Soniox language hints docs](https://soniox.com/docs/stt/concepts/language-hints).

## Context

Context helps the model know your domain and your important terms. It improves transcription and translation:

```typescript
import { generateTranscription } from "@tanstack/ai";
import { sonioxTranscription } from "@soniox/tanstack-ai-adapter";
import { audio } from "./audio";

const result = await generateTranscription({
  adapter: sonioxTranscription("stt-async-v3"),
  audio,
  modelOptions: {
    context: {
      general: [
        { key: "domain", value: "Healthcare" },
        { key: "topic", value: "Diabetes management consultation" },
        { key: "doctor", value: "Dr. Martha Smith" },
      ],
      text: "The patient has a history of...",
      terms: ["Celebrex", "Zyrtec", "Xanax"],
      translationTerms: [
        { source: "Mr. Smith", target: "Sr. Smith" },
        { source: "MRI", target: "RM" },
      ],
    },
  },
  threadId: "thread-1",
});
```

All four sections are optional:

- `general`: key and value pairs about the audio.
- `text`: free text about the audio.
- `terms`: words to recognize.
- `translationTerms`: fixed translations for terms.

See the [Soniox context docs](https://soniox.com/docs/stt/concepts/context).

## Translation

One-way translation:

```typescript
import { generateTranscription } from "@tanstack/ai";
import { sonioxTranscription } from "@soniox/tanstack-ai-adapter";
import { audio } from "./audio";

const result = await generateTranscription({
  adapter: sonioxTranscription("stt-async-v3"),
  audio,
  modelOptions: {
    translation: {
      type: "one_way",
      targetLanguage: "es",
    },
  },
  threadId: "thread-1",
});
```

Two-way translation:

```typescript
import { generateTranscription } from "@tanstack/ai";
import { sonioxTranscription } from "@soniox/tanstack-ai-adapter";
import { audio } from "./audio";

const result = await generateTranscription({
  adapter: sonioxTranscription("stt-async-v3"),
  audio,
  modelOptions: {
    translation: {
      type: "two_way",
      languageA: "en",
      languageB: "es",
    },
  },
  threadId: "thread-1",
});
```

With translation, the API returns transcription tokens and translation tokens. `segments` holds only the transcription tokens. To get the translation tokens, read the raw tokens and keep the ones where `translation_status === "translation"`. See [Raw tokens](#raw-tokens).

## Models and options

### Transcription options

Pass these in `modelOptions`:

| Option | What it does |
| --- | --- |
| `languageHints` | An array of ISO language codes that bias recognition. |
| `languageHintsStrict` | When `true`, rely more on the language hints. Not all models support it. |
| `enableLanguageIdentification` | Detect the spoken language. |
| `enableSpeakerDiarization` | Find and label the different speakers. |
| `context` | More context, to improve accuracy. See [Context](#context). |
| `translation` | The translation settings. See [Translation](#translation). |
| `clientReferenceId` | An optional reference ID of your own. |
| `webhookUrl` | A webhook URL that gets a call when the transcription is done. |
| `webhookAuthHeaderName` | The name of the auth header for the webhook. |
| `webhookAuthHeaderValue` | The value of the auth header for the webhook. |

See the [Soniox API reference](https://soniox.com/docs/stt/api-reference/transcriptions/create_transcription).

### Adapter options

Pass these to `createSonioxTranscription`:

```typescript
import { createSonioxTranscription } from "@soniox/tanstack-ai-adapter";

const adapter = createSonioxTranscription("stt-async-v3", process.env.SONIOX_API_KEY!, {
  baseUrl: "https://api.soniox.com",
  pollingIntervalMs: 1000,
  timeout: 180000,
});
```

| Option | What it does |
| --- | --- |
| `apiKey` | Overrides `SONIOX_API_KEY`. Required with `createSonioxTranscription`. |
| `baseUrl` | A custom API base URL. Default `https://api.soniox.com`. |
| `headers` | More request headers. |
| `timeout` | The transcription timeout in milliseconds. Default `180000`. |
| `pollingIntervalMs` | How often the adapter checks the transcription status, in milliseconds. Default `1000`. |

For data residency, see the [Soniox regional endpoints](https://soniox.com/docs/stt/data-residency#regional-endpoints).

## Advanced

### Raw tokens

For translation or audio with many languages, you can need the raw tokens. Each one has its language and its translation status. The adapter adds a non-standard `providerMetadata` field at run time. It is not on the `TranscriptionResult` type, so narrow it with `in` checks:

```typescript
import { generateTranscription } from "@tanstack/ai";
import { sonioxTranscription } from "@soniox/tanstack-ai-adapter";
import { audio } from "./audio";

function sonioxTokens(result: object): Array<unknown> {
  if (!("providerMetadata" in result)) return [];
  const metadata = result.providerMetadata;
  if (typeof metadata !== "object" || metadata === null) return [];
  if (!("soniox" in metadata)) return [];
  const soniox = metadata.soniox;
  if (typeof soniox !== "object" || soniox === null) return [];
  if (!("tokens" in soniox) || !Array.isArray(soniox.tokens)) return [];
  return soniox.tokens;
}

const result = await generateTranscription({
  adapter: sonioxTranscription("stt-async-v3"),
  audio,
  modelOptions: {
    translation: { type: "one_way", targetLanguage: "es" },
  },
  threadId: "thread-1",
});

for (const token of sonioxTokens(result)) {
  console.log(token);
}
```

Each token has these fields:

- `text`: the token text.
- `start_ms` and `end_ms`: the start and end time in milliseconds.
- `language`: the detected language of the token.
- `translation_status`: the translation status, when translation is on.
- `speaker`: the speaker id.
- `confidence`: the confidence score.

For all of the Soniox API, see the [Soniox docs](https://soniox.com/docs).
