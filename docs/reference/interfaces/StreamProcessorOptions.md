---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:155](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L155)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy?: ChunkStrategy;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:156](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L156)

***

### events?

```ts
optional events?: StreamProcessorEvents;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:158](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L158)

Event-driven handlers

***

### initialMessages?

```ts
optional initialMessages?: UIMessage<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:165](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L165)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser?: object;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:159](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L159)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:163](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L163)

Enable recording for replay testing

***

### subagentRunId?

```ts
optional subagentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:170](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L170)

Set on the processor of a subagent card. Chunks tagged with this id are
the card's own; chunks for an id no card holds are dropped.
