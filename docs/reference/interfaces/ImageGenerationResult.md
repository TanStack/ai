---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1467](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1467)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1469](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1469)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/typescript/ai/src/types.ts:1473](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1473)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1471](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1471)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1475](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1475)

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
