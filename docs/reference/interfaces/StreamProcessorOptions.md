---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

# Interface: StreamProcessorOptions

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:124](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L124)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy: ChunkStrategy;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:125](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L125)

***

### events?

```ts
optional events: StreamProcessorEvents;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:127](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L127)

Event-driven handlers

***

### initialMessages?

```ts
optional initialMessages: UIMessage<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:134](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L134)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser: object;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:128](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L128)

#### parse()

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
optional recording: boolean;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:132](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L132)

Enable recording for replay testing
