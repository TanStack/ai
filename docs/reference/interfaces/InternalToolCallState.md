---
id: InternalToolCallState
title: InternalToolCallState
---

Defined in: packages/ai/src/activities/chat/stream/types.ts:21

Internal state for a tool call being tracked

## Properties

### arguments

```ts
arguments: string;
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:24

***

### id

```ts
id: string;
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:22

***

### index

```ts
index: number;
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:27

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:32

Provider-specific metadata that round-trips with the tool call
(e.g. Gemini's `thoughtSignature`). Untyped at this layer because
the stream processor is provider-agnostic; adapters narrow it
via their `TToolCallMetadata` generic.

***

### name

```ts
name: string;
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:23

***

### parsedArguments?

```ts
optional parsedArguments?: any;
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:26

***

### state

```ts
state: ToolCallState;
```

Defined in: packages/ai/src/activities/chat/stream/types.ts:25
