---
id: ProcessorState
title: ProcessorState
---

Defined in: packages/ai/src/activities/chat/stream/types.ts:87

Current state of the processor

## Properties

### content

```ts
content: string;
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:88

***

### done

```ts
done: boolean;
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:93

***

### finishReason

```ts
finishReason: string | null;
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:92

***

### thinking

```ts
thinking: string;
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:89

***

### toolCallOrder

```ts
toolCallOrder: string[];
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:91

***

### toolCalls

```ts
toolCalls: Map<string, InternalToolCallState>;
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:90
