---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:154](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L154)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy?: ChunkStrategy;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:155](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L155)

***

### events?

```ts
optional events?: StreamProcessorEvents;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:157](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L157)

Event-driven handlers

***

### initialMessages?

```ts
optional initialMessages?: UIMessage<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:164](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L164)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser?: object;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:158](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L158)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:162](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L162)

Enable recording for replay testing

***

### subagentRunId?

```ts
optional subagentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:169](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L169)

Set on the processor of a subagent card. Chunks tagged with this id are
the card's own; chunks for an id no card holds are dropped.
