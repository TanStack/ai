---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [types.ts:817](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L817)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:819](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L819)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [types.ts:823](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L823)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [types.ts:821](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L821)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:825](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L825)

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
