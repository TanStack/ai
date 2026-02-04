---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [types.ts:966](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L966)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:968](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L968)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [types.ts:972](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L972)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [types.ts:970](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L970)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:974](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L974)

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
