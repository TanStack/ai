---
title: Soniox
id: soniox-adapter
order: 3
---

The Soniox adapter provides access to Soniox transcription models.

## Installation

```bash
npm install @soniox/tanstack-ai-adapter
```

## Authentication

Set `SONIOX_API_KEY` in your environment or pass `apiKey` when creating the adapter. Get your API key from the [Soniox Console](https://console.soniox.com).

## Basic Usage

```typescript
import { generateTranscription } from "@tanstack/ai";
import { sonioxTranscription } from "@soniox/tanstack-ai-adapter";

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

## Basic Usage - Custom API Key

```typescript
import { generateTranscription } from "@tanstack/ai";
import { createSonioxTranscription } from "@soniox/tanstack-ai-adapter";

const adapter = createSonioxTranscription("stt-async-v3", process.env.SONIOX_API_KEY!);

const result = await generateTranscription({
  adapter,
  audio: audioFile,
});
```

## Adapter Configuration

Use `createSonioxTranscription` to customize the adapter instance:

```typescript
import { createSonioxTranscription } from "@soniox/tanstack-ai-adapter";

const adapter = createSonioxTranscription("stt-async-v3", process.env.SONIOX_API_KEY!, {
  baseUrl: "https://api.soniox.com",
  pollingIntervalMs: 1000,
  timeout: 180000,
});
```

Options:

- `apiKey` - Override `SONIOX_API_KEY` (required when using `createSonioxTranscription`)
- `baseUrl` - Custom API base URL. Default is `https://api.soniox.com`
- `headers` - Additional request headers
- `timeout` - Transcription timeout in milliseconds (default: 180000)
- `pollingIntervalMs` - Transcription polling interval in milliseconds (default: 1000)

See the [Soniox regional endpoints](https://soniox.com/docs/stt/data-residency#regional-endpoints) if you need data residency.

## Transcription Options

Per-request options are passed via `modelOptions`:

```typescript
const result = await generateTranscription({
  adapter: sonioxTranscription("stt-async-v3"),
  audio,
  modelOptions: {
    languageHints: ["en", "es"],
    enableLanguageIdentification: true,
    enableSpeakerDiarization: true,
    context: {
      terms: ["Soniox", "TanStack"],
    },
  },
});
```

Available options:

- `languageHints` - Array of ISO language codes to bias recognition
- `languageHintsStrict` - When true, rely more heavily on language hints (not supported by all models)
- `enableLanguageIdentification` - Automatically detect spoken language
- `enableSpeakerDiarization` - Identify and separate different speakers
- `context` - Additional context to improve accuracy
- `clientReferenceId` - Optional client-defined reference ID
- `webhookUrl` - Webhook URL for completion notifications
- `webhookAuthHeaderName` - Webhook authentication header name
- `webhookAuthHeaderValue` - Webhook authentication header value
- `translation` - Translation configuration

Check the [Soniox API reference](https://soniox.com/docs/stt/api-reference/transcriptions/create_transcription) for more details.

## Language Hints

Soniox automatically detects and transcribes speech in [60+ languages](https://soniox.com/docs/stt/concepts/supported-languages). When you know which languages are likely to appear in your audio, provide `languageHints` to improve accuracy by biasing recognition toward those languages.

Language hints do not restrict recognition. If you pass the TanStack `language` option, this adapter merges it into `languageHints`.

```typescript
const result = await generateTranscription({
  adapter: sonioxTranscription("stt-async-v3"),
  audio,
  modelOptions: {
    languageHints: ["en", "es"],
  },
});
```

For more details, see the [Soniox language hints documentation](https://soniox.com/docs/stt/concepts/language-hints).

## Context

Provide custom context to improve transcription and translation accuracy. Context helps the model understand your domain, recognize important terms, and apply custom vocabulary.

The `context` object supports four optional sections:

```typescript
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
});
```

For more details, see the [Soniox context documentation](https://soniox.com/docs/stt/concepts/context).

## Translation

Configure translation for your transcriptions:

```typescript
const result = await generateTranscription({
  adapter: sonioxTranscription("stt-async-v3"),
  audio,
  modelOptions: {
    translation: {
      type: "one_way",
      targetLanguage: "es",
    },
  },
});
```

For two-way translation:

```typescript
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
});
```

When using translation, the API returns both transcription tokens and translation tokens. The `segments` array always includes only transcription tokens. To access translation tokens, use `providerMetadata` and filter by `translation_status === "translation"`.

### Accessing Raw Tokens

When using translation or working with multilingual audio, you may need access to raw tokens with per-token language information and translation status. The adapter attaches a non-standard `providerMetadata` field at runtime:

```typescript
const result = await generateTranscription({
  adapter: sonioxTranscription("stt-async-v3"),
  audio,
  modelOptions: {
    translation: { type: "one_way", targetLanguage: "es" },
  },
});

const rawTokens = (result as any).providerMetadata?.soniox?.tokens;

if (rawTokens) {
  rawTokens.forEach((token) => {
    // token.text - token text
    // token.start_ms - start time in milliseconds
    // token.end_ms - end time in milliseconds
    // token.language - detected language for this token
    // token.translation_status - translation status (if translation enabled)
    // token.speaker - speaker identifier
    // token.confidence - confidence score
  });
}
```

## Next Steps

- [Soniox Console](https://console.soniox.com) - Manage API keys and projects
- [Soniox API docs](https://soniox.com/docs) - Complete Soniox API reference
- [Transcription Guide](../guides/transcription) - Learn about transcription in TanStack AI
