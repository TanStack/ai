---
id: TextChunkToolCallEvent
title: TextChunkToolCallEvent
---

# Interface: TextChunkToolCallEvent

Defined in: [event-client.ts:111](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L111)

Emitted for streaming tool call chunks.

## Extends

- `BaseEventContext`

## Properties

### arguments

```ts
arguments: string;
```

Defined in: [event-client.ts:118](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L118)

***

### clientId?

```ts
optional clientId: string;
```

Defined in: [event-client.ts:41](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L41)

#### Inherited from

```ts
BaseEventContext.clientId
```

***

### hasTools?

```ts
optional hasTools: boolean;
```

Defined in: [event-client.ts:50](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L50)

#### Inherited from

```ts
BaseEventContext.hasTools
```

***

### index

```ts
index: number;
```

Defined in: [event-client.ts:117](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L117)

***

### messageCount?

```ts
optional messageCount: number;
```

Defined in: [event-client.ts:49](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L49)

#### Inherited from

```ts
BaseEventContext.messageCount
```

***

### messageId?

```ts
optional messageId: string;
```

Defined in: [event-client.ts:114](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L114)

#### Overrides

```ts
BaseEventContext.messageId
```

***

### model?

```ts
optional model: string;
```

Defined in: [event-client.ts:44](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L44)

#### Inherited from

```ts
BaseEventContext.model
```

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [event-client.ts:47](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L47)

#### Inherited from

```ts
BaseEventContext.modelOptions
```

***

### options?

```ts
optional options: Record<string, unknown>;
```

Defined in: [event-client.ts:46](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L46)

#### Inherited from

```ts
BaseEventContext.options
```

***

### provider?

```ts
optional provider: string;
```

Defined in: [event-client.ts:43](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L43)

#### Inherited from

```ts
BaseEventContext.provider
```

***

### requestId?

```ts
optional requestId: string;
```

Defined in: [event-client.ts:112](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L112)

#### Overrides

```ts
BaseEventContext.requestId
```

***

### source?

```ts
optional source: "client" | "server";
```

Defined in: [event-client.ts:42](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L42)

#### Inherited from

```ts
BaseEventContext.source
```

***

### streamId

```ts
streamId: string;
```

Defined in: [event-client.ts:113](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L113)

#### Overrides

```ts
BaseEventContext.streamId
```

***

### streaming?

```ts
optional streaming: boolean;
```

Defined in: [event-client.ts:51](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L51)

#### Inherited from

```ts
BaseEventContext.streaming
```

***

### systemPrompts?

```ts
optional systemPrompts: string[];
```

Defined in: [event-client.ts:45](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L45)

#### Inherited from

```ts
BaseEventContext.systemPrompts
```

***

### timestamp

```ts
timestamp: number;
```

Defined in: [event-client.ts:37](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L37)

#### Inherited from

```ts
BaseEventContext.timestamp
```

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [event-client.ts:115](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L115)

***

### toolName

```ts
toolName: string;
```

Defined in: [event-client.ts:116](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L116)

***

### toolNames?

```ts
optional toolNames: string[];
```

Defined in: [event-client.ts:48](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L48)

#### Inherited from

```ts
BaseEventContext.toolNames
```
