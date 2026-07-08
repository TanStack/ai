---
'@tanstack/ai-gemini': minor
'@tanstack/ai-openai': minor
---

fix(ai-gemini, ai-openai): don't buffer arbitrary HTTP(S) URL image inputs by default on paths that require uploaded bytes.

Gemini **Veo** (`createGeminiVideo`), OpenAI image **edits** (`createOpenaiImage`), and OpenAI **Sora** `input_reference` (`createOpenaiVideo`) have no URL passthrough — the provider only accepts inline bytes (or, for Veo, a `gs://` reference). Previously an HTTP(S) URL image input was silently fetched and buffered in memory, which can OOM memory-constrained runtimes (e.g. Cloudflare Workers).

These paths now **throw** on an HTTP(S) URL image input by default, with an error pointing to the alternatives. `data:` URIs (and `gs://` for Veo) still work without any flag. To opt back into fetching + buffering, set `allowUrlFetch: true` on the adapter config:

```ts
createOpenaiImage('gpt-image-1', apiKey, { allowUrlFetch: true })
createOpenaiVideo('sora-2', apiKey, { allowUrlFetch: true })
createGeminiVideo('veo-3.1-generate-preview', apiKey, { allowUrlFetch: true })
```

Migration: if you passed HTTP(S) URL image inputs to these adapters, either fetch the bytes yourself and pass a `data:` URI, pass a `gs://` reference (Veo), or set `allowUrlFetch: true`.
