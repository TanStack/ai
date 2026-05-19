---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1447](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1447)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1449](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1449)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/typescript/ai/src/types.ts:1453](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1453)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1451](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1451)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1455](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1455)

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
