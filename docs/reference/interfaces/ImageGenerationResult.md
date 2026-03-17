---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [types.ts:1044](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1044)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:1046](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1046)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [types.ts:1050](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1050)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [types.ts:1048](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1048)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:1052](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1052)

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
