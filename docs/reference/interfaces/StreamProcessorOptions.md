---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:160](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L160)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy?: ChunkStrategy;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:161](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L161)

***

### events?

```ts
optional events?: StreamProcessorEvents;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:163](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L163)

Event-driven handlers

***

### initialMessages?

```ts
optional initialMessages?: UIMessage<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:170](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L170)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser?: object;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:164](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L164)

#### parse

```ts
parse: (jsonString) => any;
```

##### Parameters

###### jsonString

`string`

##### Returns

`any`

***

### recording?

```ts
optional recording?: boolean;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:168](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L168)

Enable recording for replay testing

***

### subagentRunId?

```ts
optional subagentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:175](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L175)

Set on the processor of a subagent card. Chunks tagged with this id are
the card's own; chunks for an id no card holds are dropped.
