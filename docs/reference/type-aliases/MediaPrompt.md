---
id: MediaPrompt
title: MediaPrompt
---

# Type Alias: MediaPrompt

```ts
type MediaPrompt = string | MediaPromptPart[];
```

Defined in: [packages/ai/src/types.ts:1725](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1725)

Prompt accepted by `generateImage()` / `generateVideo()`: a plain string,
or an ordered array of content parts for image-conditioned generation
("not like this *(image)*, more like this *(image)*"). Part order is
meaningful — adapters with native multimodal prompts (Gemini, OpenRouter)
preserve the interleaving; named-field providers (fal, OpenAI, xAI)
extract the media parts and flatten the text. Text is always sent
verbatim: to reference inputs from the prompt, write the provider's own
syntax yourself (e.g. fal's `@Image1`, OpenAI's "image 1"). An array may
be media-only (e.g. upscalers or pure img2img endpoints that take no
instruction text).
