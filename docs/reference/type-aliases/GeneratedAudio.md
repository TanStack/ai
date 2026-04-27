---
id: GeneratedAudio
title: GeneratedAudio
---

# Type Alias: GeneratedAudio

```ts
type GeneratedAudio = GeneratedMediaSource & object;
```

Defined in: [packages/typescript/ai/src/types.ts:1296](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1296)

A single generated audio output

## Type Declaration

### contentType?

```ts
optional contentType: string;
```

Content type of the audio (e.g., 'audio/wav', 'audio/mp3')

### duration?

```ts
optional duration: number;
```

Duration of the generated audio in seconds
