---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [types.ts:998](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L998)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:1000](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1000)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [types.ts:1004](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1004)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [types.ts:1002](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1002)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:1006](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1006)

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
