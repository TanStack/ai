---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1251](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1251)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1253](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1253)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/typescript/ai/src/types.ts:1257](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1257)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1255](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1255)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1259](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1259)

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
