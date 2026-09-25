---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:148](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L148)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy?: ChunkStrategy;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:149](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L149)

***

### events?

```ts
optional events?: StreamProcessorEvents;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:151](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L151)

Event-driven handlers

***

### initialMessages?

```ts
optional initialMessages?: UIMessage<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:158](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L158)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser?: object;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:152](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L152)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:156](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L156)

Enable recording for replay testing

***

### subagentRunId?

```ts
optional subagentRunId?: string;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:163](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L163)

Set on the processor of a subagent card. Chunks tagged with this id are
the card's own; chunks for an id no card holds are dropped.
