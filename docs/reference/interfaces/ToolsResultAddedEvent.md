---
id: ToolsResultAddedEvent
title: ToolsResultAddedEvent
---

# Interface: ToolsResultAddedEvent

Defined in: [event-client.ts:209](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L209)

Emitted when a client tool result is added.

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

### output

```ts
output: unknown;
```

Defined in: [event-client.ts:212](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L212)

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

Defined in: [event-client.ts:38](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L38)

#### Inherited from

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

### state

```ts
state: "output-available" | "output-error";
```

Defined in: [event-client.ts:213](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L213)

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

### toolCallId

```ts
toolCallId: string;
```

Defined in: [event-client.ts:210](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L210)

***

### toolName

```ts
toolName: string;
```

Defined in: [event-client.ts:211](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/event-client.ts#L211)

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
