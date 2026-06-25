---
id: GenerationActivity
title: GenerationActivity
---

# Type Alias: GenerationActivity

```ts
type GenerationActivity = "chat" | "image" | "video" | "audio" | "tts" | "transcription";
```

Defined in: [packages/ai/src/activities/middleware/types.ts:34](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L34)

The activity an observability event describes.

Mirrors the public surface a caller reaches for: `'chat'` for `chat()`, and
the media kinds for the `generate*` activities. `'tts'` matches the speech
adapter's kind (the public discriminator avoids inventing a parallel
`'speech'`/`'text'` vocabulary). `otelMiddleware` maps each to its
`gen_ai.operation.name`.
