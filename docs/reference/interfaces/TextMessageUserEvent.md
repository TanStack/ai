---
id: TextMessageUserEvent
title: TextMessageUserEvent
---

# Interface: TextMessageUserEvent

Defined in: [event-client.ts:97](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L97)

Emitted when a user message is created (full content).

## Extends

- [`TextMessageCreatedEvent`](TextMessageCreatedEvent.md)

## Properties

### clientId?

```ts
optional clientId: string;
```

Defined in: [event-client.ts:41](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L41)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`clientId`](TextMessageCreatedEvent.md#clientid)

***

### content

```ts
content: string;
```

Defined in: [event-client.ts:90](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L90)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`content`](TextMessageCreatedEvent.md#content)

***

### hasTools?

```ts
optional hasTools: boolean;
```

Defined in: [event-client.ts:50](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L50)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`hasTools`](TextMessageCreatedEvent.md#hastools)

***

### messageCount?

```ts
optional messageCount: number;
```

Defined in: [event-client.ts:49](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L49)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`messageCount`](TextMessageCreatedEvent.md#messagecount)

***

### messageId

```ts
messageId: string;
```

Defined in: [event-client.ts:88](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L88)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`messageId`](TextMessageCreatedEvent.md#messageid)

***

### messageIndex?

```ts
optional messageIndex: number;
```

Defined in: [event-client.ts:93](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L93)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`messageIndex`](TextMessageCreatedEvent.md#messageindex)

***

### model?

```ts
optional model: string;
```

Defined in: [event-client.ts:44](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L44)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`model`](TextMessageCreatedEvent.md#model)

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [event-client.ts:47](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L47)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`modelOptions`](TextMessageCreatedEvent.md#modeloptions)

***

### options?

```ts
optional options: Record<string, unknown>;
```

Defined in: [event-client.ts:46](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L46)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`options`](TextMessageCreatedEvent.md#options)

***

### parts?

```ts
optional parts: MessagePart[];
```

Defined in: [event-client.ts:91](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L91)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`parts`](TextMessageCreatedEvent.md#parts)

***

### provider?

```ts
optional provider: string;
```

Defined in: [event-client.ts:43](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L43)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`provider`](TextMessageCreatedEvent.md#provider)

***

### requestId?

```ts
optional requestId: string;
```

Defined in: [event-client.ts:86](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L86)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`requestId`](TextMessageCreatedEvent.md#requestid)

***

### role

```ts
role: "user";
```

Defined in: [event-client.ts:98](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L98)

#### Overrides

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`role`](TextMessageCreatedEvent.md#role)

***

### source?

```ts
optional source: "client" | "server";
```

Defined in: [event-client.ts:42](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L42)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`source`](TextMessageCreatedEvent.md#source)

***

### streamId?

```ts
optional streamId: string;
```

Defined in: [event-client.ts:87](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L87)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`streamId`](TextMessageCreatedEvent.md#streamid)

***

### streaming?

```ts
optional streaming: boolean;
```

Defined in: [event-client.ts:51](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L51)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`streaming`](TextMessageCreatedEvent.md#streaming)

***

### systemPrompts?

```ts
optional systemPrompts: string[];
```

Defined in: [event-client.ts:45](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L45)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`systemPrompts`](TextMessageCreatedEvent.md#systemprompts)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [event-client.ts:37](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L37)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`timestamp`](TextMessageCreatedEvent.md#timestamp)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [event-client.ts:92](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L92)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`toolCalls`](TextMessageCreatedEvent.md#toolcalls)

***

### toolNames?

```ts
optional toolNames: string[];
```

Defined in: [event-client.ts:48](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L48)

#### Inherited from

[`TextMessageCreatedEvent`](TextMessageCreatedEvent.md).[`toolNames`](TextMessageCreatedEvent.md#toolnames)
