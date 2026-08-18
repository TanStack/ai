# BytePlus Adapter Reference

## Package

```
@tanstack/ai-byteplus
```

## Adapter Factories

| Factory                 | Type          | Description                |
| ----------------------- | ------------- | -------------------------- |
| `byteplusText`          | Text/Chat     | ModelArk chat completions  |
| `byteplusVideo`         | Video         | Seedance async task API    |
| `byteplusImage`         | Image         | Seedream image generation  |
| `byteplusSpeech`        | TTS           | Seed Speech text-to-speech |
| `byteplusTranscription` | Transcription | Seed Speech ASR            |

Each has a `createBytePlus*(model, apiKey, config?)` sibling that takes an
explicit key instead of reading the environment.

## Import

```typescript
import {
  byteplusText,
  byteplusVideo,
  byteplusImage,
} from '@tanstack/ai-byteplus'
import { byteplusSpeech, byteplusTranscription } from '@tanstack/ai-byteplus'
```

## Key Chat Models

| Model                        | Context | Notes                                                              |
| ---------------------------- | ------- | ------------------------------------------------------------------ |
| `dola-seed-2-1-turbo-260628` | 256K    | Flagship; text/image/video in; structured output; thinking summary |
| `seed-2-0-lite-260428`       | 256K    | Good default; audio in; **no** structured output                   |
| `seed-2-0-mini-260428`       | 256K    | Smallest 2.0; audio in; **no** structured output                   |
| `seed-2-0-pro-260328`        | 256K    | Structured output; thinking summary                                |
| `seed-2-0-lite-260228`       | 256K    | Structured output — use instead of `-260428` for typed output      |
| `seed-1-6-flash-250715`      | 256K    | Fast/cheap; structured output                                      |
| `glm-5-2-260617`             | 1024K   | Structured output; `reasoning_effort` incl. `none`/`xhigh`/`max`   |
| `deepseek-v4-pro-260425`     | 1024K   | 384K output; no structured output                                  |
| `deepseek-v3-2-251201`       | 128K    | Reasoning defaults **off**; no structured output                   |
| `gpt-oss-120b-250805`        | 128K    | Only model accepting `thinking: { type: 'auto' }`                  |

`BYTEPLUS_CHAT_MODELS` is the full list of 18 (also
`seed-2-0-mini-260215`, `seed-2-0-code-preview-260328`, `seed-1-8-251228`,
`seed-1-6-250915`, `seed-1-6-250615`, `seed-1-6-flash-250615`,
`glm-4-7-251222`, `deepseek-v4-flash-260425`).

Media models: `BYTEPLUS_VIDEO_MODELS` (Seedance —
`dreamina-seedance-2-0-260128` / `-fast-260128` / `-mini-260615`,
`seedance-1-5-pro-251215`, `seedance-1-0-pro-250528`,
`seedance-1-0-pro-fast-251015`), `BYTEPLUS_IMAGE_MODELS` (Seedream —
`dola-seedream-5-0-pro-260628`, `seedream-5-0-260128`,
`seedream-5-0-lite-260128`, `seedream-4-5-251128`, `seedream-4-0-250828`),
`BYTEPLUS_TTS_MODELS` (`seed-audio-1.0`) and
`BYTEPLUS_TRANSCRIPTION_MODELS` (`seed-asr`).

## Provider-Specific modelOptions

```typescript
chat({
  adapter: byteplusText('dola-seed-2-1-turbo-260628'),
  messages,
  modelOptions: {
    // Ark-only
    thinking: { type: 'enabled' }, // 'enabled' | 'disabled' | 'auto' ('auto': gpt-oss-120b only)
    reasoning_effort: 'medium', // 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
    repetition_penalty: 1.1,
    service_tier: 'default', // 'default' | 'flex' (flex = cheaper offline batch queue)
    // Sampling (OpenAI-compatible names)
    temperature: 0.7,
    top_p: 0.9,
    top_k: 40,
    frequency_penalty: 0.5,
    presence_penalty: 0.5,
    seed: 42,
    stop: ['\n\n'],
    // Token limits — mutually exclusive
    max_tokens: 2048,
    // max_completion_tokens: 2048,
    // Tool calling
    tool_choice: 'auto',
    parallel_tool_calls: true,
    // Logging / attribution
    logprobs: true,
    top_logprobs: 5,
    user: 'user-123',
  },
})
```

`response_format` is deliberately **not** a provider option — the chat
activity owns it via `outputSchema`.

## Environment Variables

```
ARK_API_KEY              # chat, video, image (falls back to BYTEPLUS_API_KEY)
BYTEPLUS_VOICE_API_KEY   # TTS + transcription — a DIFFERENT product key
```

## Gotchas

- **Two products, two keys.** ModelArk uses `Authorization: Bearer $ARK_API_KEY`
  at `ark.ap-southeast.bytepluses.com`; Seed Speech uses
  `X-Api-Key: $BYTEPLUS_VOICE_API_KEY` at `voice.ap-southeast-1.bytepluses.com`.
  An Ark key on the voice host fails with `45000010 Invalid X-Api-Key`.
- **Ark keys are region-isolated.** The default base URL is ap-southeast; the EU
  endpoint serves chat and image only (no Seedance). Override with
  `config.baseURL`.
- **Structured output is per model and fails loud.** Only the 10 ids in
  `BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS` accept `json_schema`; the other 8
  reject `json_object` too, so there is no JSON-mode fallback. `glm-4-7-251222`
  is excluded deliberately — it accepts the schema with `200` and then answers
  in prose. `seed-2-0-lite-260428` is _not_ on the list.
- **`reasoning_effort` + `thinking: { type: 'disabled' }` is a 400.** So is
  sending both `max_tokens` and `max_completion_tokens`.
- **`reasoning_effort` values are gated per model.** `minimal` / `low` /
  `medium` / `high` are general; `none` and `xhigh` are accepted only by
  `glm-5-2-260617`; `max` only by `glm-5-2-260617` and the two
  `deepseek-v4-*-260425` models. `thinking: { type: 'auto' }` is
  `gpt-oss-120b-250805` only.
- **Reasoning is on by default** on every model except `deepseek-v3-2-251201`.
- **`encrypted_content` round-trip.** The four thinking-summary models
  (`dola-seed-2-1-turbo-260628`, `seed-2-0-lite-260428`,
  `seed-2-0-mini-260428`, `seed-2-0-pro-260328`) emit an opaque signature over
  the reasoning trace that BytePlus asks for back on the next turn. The adapter
  round-trips it automatically over the same seam Anthropic thinking signatures
  use: it is captured onto `STEP_FINISHED.signature`, which lands on the
  thinking part as `ModelMessage.thinking[].signature` and is echoed back on the
  following request. Code that persists and replays history by hand must **keep
  the thinking part's `signature`** — not "message metadata", which is a
  different field and carries nothing here. Losing it costs a reasoning-cache
  hit, not the request: a live probe confirmed Ark accepts a turn whose
  assistant message omits `encrypted_content`. A structured-output turn doesn't
  capture the blob at all, for the same reason.
- **Model ids are dated and retired aggressively.** Only ids verified against a
  live request are exported; the published BytePlus lists include dead ones.
  Bare ids mostly don't resolve — the `dola-` prefix is required on
  `dola-seed-2-1-turbo-260628` and the `dreamina-` prefix on the Seedance 2.0
  family, but adding `dola-` to an older id 404s.
- **Media option applicability is per model and enforced server-side** — Ark
  400s on an inapplicable Seedance field instead of ignoring it. See the
  media-generation skill.
