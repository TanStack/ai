---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

# Interface: StreamProcessorOptions

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:126](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L126)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy: ChunkStrategy;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:127](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L127)

***

### events?

```ts
optional events: StreamProcessorEvents;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:129](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L129)

Event-driven handlers

***

### initialMessages?

```ts
optional initialMessages: UIMessage<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:136](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L136)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser: object;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:130](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L130)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:134](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L134)

Enable recording for replay testing
