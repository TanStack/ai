---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [types.ts:822](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L822)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:824](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L824)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [types.ts:828](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L828)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [types.ts:826](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L826)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:830](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L830)

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
