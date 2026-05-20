---
id: FinishInfo
title: FinishInfo
---

# Interface: FinishInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:252](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L252)

Information passed to onFinish.

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:258](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L258)

Final accumulated text content

***

### duration

```ts
duration: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:256](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L256)

Total duration of the chat run in milliseconds

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:254](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L254)

The finish reason from the last model response

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:260](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L260)

Final usage totals, if available

#### completionTokens

```ts
completionTokens: number;
```

#### promptTokens

```ts
promptTokens: number;
```

#### totalTokens

```ts
totalTokens: number;
```
