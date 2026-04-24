---
'@tanstack/ai': minor
'@tanstack/ai-openrouter': patch
'@tanstack/ai-fal': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-grok': patch
---

Tighten `GeneratedImage` and `GeneratedAudio` to enforce exactly one of `url` or `b64Json` via a mutually-exclusive `GeneratedMediaSource` union.

Both types previously declared `url?` and `b64Json?` as independently optional, which allowed meaningless `{}` values and objects that set both fields. They now require exactly one:

```ts
type GeneratedMediaSource =
  | { url: string; b64Json?: never }
  | { b64Json: string; url?: never }
```

Existing read patterns like `img.url || \`data:image/png;base64,${img.b64Json}\``continue to work unchanged. The only runtime-visible change is that the`@tanstack/ai-openrouter`and`@tanstack/ai-fal`image adapters no longer populate`url`with a synthesized`data:image/png;base64,...`URI when the provider returns base64 — they return`{ b64Json }`only. Consumers that want a data URI should build it from`b64Json` at render time.
