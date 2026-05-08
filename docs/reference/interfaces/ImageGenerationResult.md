---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1256](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1256)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1258](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1258)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/typescript/ai/src/types.ts:1262](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1262)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1260](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1260)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1264](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1264)

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
