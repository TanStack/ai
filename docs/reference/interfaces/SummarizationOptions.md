---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions

Defined in: [packages/typescript/ai/src/types.ts:1174](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1174)

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/typescript/ai/src/types.ts:1179](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1179)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1184](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1184)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1177](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1177)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1175](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1175)

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/typescript/ai/src/types.ts:1178](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1178)

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1176](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1176)
