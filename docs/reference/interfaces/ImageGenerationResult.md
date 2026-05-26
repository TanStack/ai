---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1483](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1483)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1485](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1485)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/typescript/ai/src/types.ts:1489](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1489)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1487](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1487)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1491](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1491)

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
