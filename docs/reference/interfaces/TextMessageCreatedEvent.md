---
id: TextMessageCreatedEvent
title: TextMessageCreatedEvent
---

# Interface: TextMessageCreatedEvent

Defined in: [event-client.ts:85](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L85)

Emitted when a message is created (user/assistant/system/tool).

## Extends

- `BaseEventContext`

## Extended by

- [`TextMessageUserEvent`](TextMessageUserEvent.md)

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

Defined in: [event-client.ts:90](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L90)

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

### messageId

```ts
messageId: string;
```

Defined in: [event-client.ts:88](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L88)

#### Overrides

```ts
BaseEventContext.messageId
```

***

### messageIndex?

```ts
optional messageIndex: number;
```

Defined in: [event-client.ts:93](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L93)

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

### parts?

```ts
optional parts: MessagePart[];
```

Defined in: [event-client.ts:91](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L91)

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

Defined in: [event-client.ts:86](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L86)

#### Overrides

```ts
BaseEventContext.requestId
```

***

### role

```ts
role: "user" | "assistant" | "tool" | "system";
```

Defined in: [event-client.ts:89](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L89)

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

Defined in: [event-client.ts:87](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L87)

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

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [event-client.ts:92](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L92)

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
