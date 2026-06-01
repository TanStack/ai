---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:1569](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1569)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1571](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1571)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:1575](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1575)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1573](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1573)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/ai/src/types.ts:1577](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1577)

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
