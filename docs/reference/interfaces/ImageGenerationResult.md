---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [types.ts:1027](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1027)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:1029](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1029)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [types.ts:1033](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1033)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [types.ts:1031](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1031)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:1035](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1035)

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
