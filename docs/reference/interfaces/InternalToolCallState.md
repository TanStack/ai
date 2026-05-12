---
id: InternalToolCallState
title: InternalToolCallState
---

# Interface: InternalToolCallState

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:21](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L21)

Internal state for a tool call being tracked

## Properties

### arguments

```ts
arguments: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:24](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L24)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:22](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L22)

***

### index

```ts
index: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:27](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L27)

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:32](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L32)

Provider-specific metadata that round-trips with the tool call
(e.g. Gemini's `thoughtSignature`). Untyped at this layer because
the stream processor is provider-agnostic; adapters narrow it
via their `TToolCallMetadata` generic.

***

### name

```ts
name: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:23](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L23)

***

### parsedArguments?

```ts
optional parsedArguments: any;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:26](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L26)

***

### state

```ts
state: ToolCallState;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:25](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L25)
