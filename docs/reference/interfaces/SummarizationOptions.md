---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions

Defined in: [packages/typescript/ai/src/types.ts:1182](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1182)

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/typescript/ai/src/types.ts:1187](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1187)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1192](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1192)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1185](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1185)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1183](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1183)

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/typescript/ai/src/types.ts:1186](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1186)

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1184](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1184)
