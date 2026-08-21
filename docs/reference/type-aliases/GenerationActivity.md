---
id: GenerationActivity
title: GenerationActivity
---

# Type Alias: GenerationActivity

```ts
type GenerationActivity = 
  | "chat"
  | "image"
  | "video"
  | "audio"
  | "tts"
  | "transcription"
  | "embedding"
  | "rerank"
  | "summarize";
```

Defined in: [packages/ai/src/activities/middleware/types.ts:37](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L37)

The activity an observability event describes.

Mirrors the public surface a caller reaches for: `'chat'` for `chat()`,
`'summarize'` for `summarize()`, and the media kinds for the `generate*`
activities. `'tts'` matches the speech adapter's kind (the public
discriminator avoids inventing a parallel `'speech'`/`'text'` vocabulary).
`otelMiddleware` maps each to its `gen_ai.operation.name`.

`'summarize'` produces text, not media, so it has no artifacts — a
persistence middleware stores its run record and result and nothing else.
