---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [types.ts:801](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L801)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:803](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L803)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [types.ts:807](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L807)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [types.ts:805](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L805)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:809](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L809)

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
