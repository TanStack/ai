---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1264](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1264)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1266](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1266)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/typescript/ai/src/types.ts:1270](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1270)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1268](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1268)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1272](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1272)

Token usage information (if available)

#### inputTokens?

```ts
optional inputTokens: number;
```

#### outputTokens?

```ts
optional outputTokens: number;
```

#### totalTokens?

```ts
optional totalTokens: number;
```
