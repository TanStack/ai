---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1518](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1518)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/ai/src/types.ts:1525](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1525)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1532](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1532)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/ai/src/types.ts:1523](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1523)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1521](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1521)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1527](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1527)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/ai/src/types.ts:1524](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1524)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1522](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1522)
