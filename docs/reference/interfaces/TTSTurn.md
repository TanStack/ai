---
id: TTSTurn
title: TTSTurn
---

Defined in: [packages/ai/src/types.ts:2639](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2639)

One turn of a multi-voice dialogue request.

Providers that expose a dedicated dialogue endpoint (ElevenLabs
`textToDialogue`, Gemini multi-speaker) take these natively instead of a
single `text` + `voice` pair.

## Properties

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2641](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2641)

The text this voice speaks.

***

### voice

```ts
voice: string;
```

Defined in: [packages/ai/src/types.ts:2643](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2643)

Provider voice id (ElevenLabs) or voice name (Gemini) for this turn.
