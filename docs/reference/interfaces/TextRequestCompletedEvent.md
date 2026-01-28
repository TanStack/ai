---
id: TextRequestCompletedEvent
title: TextRequestCompletedEvent
---

# Interface: TextRequestCompletedEvent

Defined in: [event-client.ts:70](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L70)

Emitted when a text request completes with final output.

## Extends

- `BaseEventContext`

## Properties

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

### content

```ts
content: string;
```

Defined in: [event-client.ts:75](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L75)

***

### duration?

```ts
optional duration: number;
```

Defined in: [event-client.ts:78](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L78)

***

### finishReason?

```ts
optional finishReason: string;
```

Defined in: [event-client.ts:76](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L76)

***

### hasTools

```ts
hasTools: boolean;
```

Defined in: [event-client.ts:81](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L81)

#### Overrides

```ts
BaseEventContext.hasTools
```

***

### messageCount

```ts
messageCount: number;
```

Defined in: [event-client.ts:80](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L80)

#### Overrides

```ts
BaseEventContext.messageCount
```

***

### messageId?

```ts
optional messageId: string;
```

Defined in: [event-client.ts:40](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L40)

#### Inherited from

```ts
BaseEventContext.messageId
```

***

### model

```ts
model: string;
```

Defined in: [event-client.ts:74](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L74)

#### Overrides

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

### provider

```ts
provider: string;
```

Defined in: [event-client.ts:73](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L73)

#### Overrides

```ts
BaseEventContext.provider
```

***

### requestId

```ts
requestId: string;
```

Defined in: [event-client.ts:71](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L71)

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

Defined in: [event-client.ts:72](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L72)

#### Overrides

```ts
BaseEventContext.streamId
```

***

### streaming

```ts
streaming: boolean;
```

Defined in: [event-client.ts:79](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L79)

#### Overrides

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

### toolNames?

```ts
optional toolNames: string[];
```

Defined in: [event-client.ts:48](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L48)

#### Inherited from

```ts
BaseEventContext.toolNames
```

***

### usage?

```ts
optional usage: TokenUsage;
```

Defined in: [event-client.ts:77](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L77)
