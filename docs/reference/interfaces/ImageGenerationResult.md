---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [types.ts:1051](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1051)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:1053](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1053)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [types.ts:1057](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1057)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [types.ts:1055](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1055)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:1059](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1059)

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
