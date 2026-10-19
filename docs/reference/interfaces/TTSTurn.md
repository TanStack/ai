---
id: TTSTurn
title: TTSTurn
---

Defined in: [packages/ai/src/types.ts:2912](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2912)

One turn of a multi-voice dialogue request.

Providers that expose a dedicated dialogue endpoint (ElevenLabs
`textToDialogue`, Gemini multi-speaker) take these natively instead of a
single `text` + `voice` pair.

## Properties

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2914](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2914)

The text this voice speaks.

***

### voice

```ts
voice: string;
```

Defined in: [packages/ai/src/types.ts:2916](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2916)

Provider voice id (ElevenLabs) or voice name (Gemini) for this turn.
