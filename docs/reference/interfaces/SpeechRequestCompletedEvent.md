---
id: SpeechRequestCompletedEvent
title: SpeechRequestCompletedEvent
---

# Interface: SpeechRequestCompletedEvent

Defined in: [event-client.ts:301](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L301)

Emitted when a speech request completes.

## Extends

- `BaseEventContext`

## Properties

### audio

```ts
audio: string;
```

Defined in: [event-client.ts:305](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L305)

***

### audioDuration?

```ts
optional audioDuration: number;
```

Defined in: [event-client.ts:308](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L308)

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

### contentType?

```ts
optional contentType: string;
```

Defined in: [event-client.ts:309](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L309)

***

### duration

```ts
duration: number;
```

Defined in: [event-client.ts:307](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L307)

***

### format

```ts
format: string;
```

Defined in: [event-client.ts:306](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L306)

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

Defined in: [event-client.ts:304](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L304)

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

Defined in: [event-client.ts:303](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L303)

#### Overrides

```ts
BaseEventContext.provider
```

***

### requestId

```ts
requestId: string;
```

Defined in: [event-client.ts:302](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L302)

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
