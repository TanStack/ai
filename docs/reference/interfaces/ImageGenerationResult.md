---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1399](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1399)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1401](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1401)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/typescript/ai/src/types.ts:1405](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1405)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1403](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1403)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1407](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1407)

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
