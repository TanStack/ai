---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [types.ts:999](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L999)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:1001](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1001)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [types.ts:1005](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1005)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [types.ts:1003](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1003)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:1007](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1007)

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
