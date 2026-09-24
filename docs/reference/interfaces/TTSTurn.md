---
id: TTSTurn
title: TTSTurn
---

Defined in: [packages/ai/src/types.ts:2382](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2382)

One turn of a multi-voice dialogue request.

Providers that expose a dedicated dialogue endpoint (ElevenLabs
`textToDialogue`, Gemini multi-speaker) take these natively instead of a
single `text` + `voice` pair.

## Properties

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2384](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2384)

The text this voice speaks.

***

### voice

```ts
voice: string;
```

Defined in: [packages/ai/src/types.ts:2386](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2386)

Provider voice id (ElevenLabs) or voice name (Gemini) for this turn.
