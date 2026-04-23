---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1237](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1237)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1239](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1239)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/typescript/ai/src/types.ts:1243](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1243)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1241](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1241)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1245](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1245)

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
