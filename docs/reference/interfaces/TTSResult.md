---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [types.ts:925](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L925)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [types.ts:931](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L931)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [types.ts:937](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L937)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [types.ts:935](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L935)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [types.ts:933](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L933)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [types.ts:927](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L927)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [types.ts:929](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L929)

Model used for generation
