---
id: VideoRequestCompletedEvent
title: VideoRequestCompletedEvent
---

# Interface: VideoRequestCompletedEvent

Defined in: [event-client.ts:367](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L367)

Emitted when a video request completes.

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

### duration

```ts
duration: number;
```

Defined in: [event-client.ts:377](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L377)

***

### error?

```ts
optional error: string;
```

Defined in: [event-client.ts:376](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L376)

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

Defined in: [event-client.ts:372](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L372)

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

Defined in: [event-client.ts:370](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L370)

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

### progress?

```ts
optional progress: number;
```

Defined in: [event-client.ts:374](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L374)

***

### provider

```ts
provider: string;
```

Defined in: [event-client.ts:369](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L369)

#### Overrides

```ts
BaseEventContext.provider
```

***

### requestId

```ts
requestId: string;
```

Defined in: [event-client.ts:368](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L368)

#### Overrides

```ts
BaseEventContext.requestId
```

***

### requestType

```ts
requestType: "url" | "create" | "status";
```

Defined in: [event-client.ts:371](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L371)

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

### status?

```ts
optional status: "pending" | "processing" | "completed" | "failed";
```

Defined in: [event-client.ts:373](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L373)

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

***

### url?

```ts
optional url: string;
```

Defined in: [event-client.ts:375](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L375)
