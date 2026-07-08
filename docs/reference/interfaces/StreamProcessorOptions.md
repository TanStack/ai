---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

# Interface: StreamProcessorOptions

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:125](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L125)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy: ChunkStrategy;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:126](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L126)

***

### events?

```ts
optional events: StreamProcessorEvents;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:128](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L128)

Event-driven handlers

***

### initialMessages?

```ts
optional initialMessages: UIMessage<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:135](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L135)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser: object;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:129](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L129)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:133](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L133)

Enable recording for replay testing
