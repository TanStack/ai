---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:142](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L142)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy?: ChunkStrategy;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:143](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L143)

***

### events?

```ts
optional events?: StreamProcessorEvents;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:145](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L145)

Event-driven handlers

***

### initialMessages?

```ts
optional initialMessages?: UIMessage<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:152](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L152)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser?: object;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:146](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L146)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:150](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L150)

Enable recording for replay testing

***

### subagentRunId?

```ts
optional subagentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:157](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L157)

Set on the processor of a subagent card. Chunks tagged with this id are
the card's own; chunks for an id no card holds are dropped.
