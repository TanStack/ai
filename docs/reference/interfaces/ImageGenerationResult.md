---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1457](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1457)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1459](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1459)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/typescript/ai/src/types.ts:1463](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1463)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1461](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1461)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1465](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1465)

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
