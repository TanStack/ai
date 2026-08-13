---
id: ResolvedMediaPrompt
title: ResolvedMediaPrompt
---

# Interface: ResolvedMediaPrompt

Defined in: [packages/ai/src/utilities/media-prompt.ts:23](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/media-prompt.ts#L23)

A [MediaPrompt](../type-aliases/MediaPrompt.md) decomposed into the views adapters consume.

Adapters with native multimodal prompts (Gemini `contents`, OpenRouter
chat content parts) consume `parts` to preserve interleaving; named-field
providers (fal, OpenAI) consume `text` plus the typed media buckets.

Prompt text is **never rewritten**: text parts are concatenated verbatim.
Providers that support referencing inputs from the prompt (e.g. fal's
`@Image1`, OpenAI's "image 1" prose) expect the user to write that syntax
themselves — the SDK does not inject or substitute markers.

## Properties

### audios

```ts
audios: AudioPart<MediaInputMetadata>[];
```

Defined in: [packages/ai/src/utilities/media-prompt.ts:36](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/media-prompt.ts#L36)

Audio parts in prompt order.

***

### images

```ts
images: ImagePart<MediaInputMetadata>[];
```

Defined in: [packages/ai/src/utilities/media-prompt.ts:32](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/media-prompt.ts#L32)

Image parts in prompt order.

***

### parts

```ts
parts: MediaPromptPart[];
```

Defined in: [packages/ai/src/utilities/media-prompt.ts:30](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/media-prompt.ts#L30)

The prompt as ordered parts; a string prompt becomes one text part.

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/utilities/media-prompt.ts:28](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/media-prompt.ts#L28)

Text parts concatenated verbatim (paragraph-separated). Empty string
for media-only prompts.

***

### videos

```ts
videos: VideoPart<MediaInputMetadata>[];
```

Defined in: [packages/ai/src/utilities/media-prompt.ts:34](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/media-prompt.ts#L34)

Video parts in prompt order.
