---
id: TextRequestStartedEvent
title: TextRequestStartedEvent
---

# Interface: TextRequestStartedEvent

Defined in: [event-client.ts:59](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L59)

Emitted when a text request starts execution.

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

### hasTools

```ts
hasTools: boolean;
```

Defined in: [event-client.ts:65](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L65)

#### Overrides

```ts
BaseEventContext.hasTools
```

***

### messageCount

```ts
messageCount: number;
```

Defined in: [event-client.ts:64](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L64)

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

Defined in: [event-client.ts:63](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L63)

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

Defined in: [event-client.ts:62](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L62)

#### Overrides

```ts
BaseEventContext.provider
```

***

### requestId

```ts
requestId: string;
```

Defined in: [event-client.ts:60](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L60)

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

Defined in: [event-client.ts:61](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L61)

#### Overrides

```ts
BaseEventContext.streamId
```

***

### streaming

```ts
streaming: boolean;
```

Defined in: [event-client.ts:66](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L66)

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
