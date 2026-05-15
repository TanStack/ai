---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1368](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1368)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1370](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1370)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/typescript/ai/src/types.ts:1374](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1374)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1372](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1372)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1376](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1376)

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
