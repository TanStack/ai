---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1462](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1462)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1464](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1464)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/typescript/ai/src/types.ts:1468](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1468)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1466](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1466)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1470](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1470)

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
