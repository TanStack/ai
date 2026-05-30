---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:1512](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1512)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1514](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1514)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:1518](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1518)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1516](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1516)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/ai/src/types.ts:1520](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1520)

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
