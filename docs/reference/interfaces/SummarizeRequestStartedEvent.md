---
id: SummarizeRequestStartedEvent
title: SummarizeRequestStartedEvent
---

# Interface: SummarizeRequestStartedEvent

Defined in: [event-client.ts:231](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L231)

Emitted when summarize starts.

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

### inputLength

```ts
inputLength: number;
```

Defined in: [event-client.ts:235](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L235)

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

Defined in: [event-client.ts:234](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L234)

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

Defined in: [event-client.ts:233](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L233)

#### Overrides

```ts
BaseEventContext.provider
```

***

### requestId

```ts
requestId: string;
```

Defined in: [event-client.ts:232](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L232)

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

### streamId?

```ts
optional streamId: string;
```

Defined in: [event-client.ts:39](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L39)

#### Inherited from

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

### toolNames?

```ts
optional toolNames: string[];
```

Defined in: [event-client.ts:48](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L48)

#### Inherited from

```ts
BaseEventContext.toolNames
```
