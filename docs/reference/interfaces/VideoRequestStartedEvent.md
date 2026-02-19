---
id: VideoRequestStartedEvent
title: VideoRequestStartedEvent
---

# Interface: VideoRequestStartedEvent

Defined in: [event-client.ts:355](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L355)

Emitted when a video request starts.

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

### duration?

```ts
optional duration: number;
```

Defined in: [event-client.ts:363](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L363)

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

### jobId?

```ts
optional jobId: string;
```

Defined in: [event-client.ts:360](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L360)

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

Defined in: [event-client.ts:358](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L358)

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

### prompt?

```ts
optional prompt: string;
```

Defined in: [event-client.ts:361](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L361)

***

### provider

```ts
provider: string;
```

Defined in: [event-client.ts:357](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L357)

#### Overrides

```ts
BaseEventContext.provider
```

***

### requestId

```ts
requestId: string;
```

Defined in: [event-client.ts:356](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L356)

#### Overrides

```ts
BaseEventContext.requestId
```

***

### requestType

```ts
requestType: "url" | "create" | "status";
```

Defined in: [event-client.ts:359](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L359)

***

### size?

```ts
optional size: string;
```

Defined in: [event-client.ts:362](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L362)

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
