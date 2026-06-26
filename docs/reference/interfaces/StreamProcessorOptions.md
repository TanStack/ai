---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

# Interface: StreamProcessorOptions

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:122](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L122)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy: ChunkStrategy;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:123](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L123)

***

### events?

```ts
optional events: StreamProcessorEvents;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:125](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L125)

Event-driven handlers

***

### initialMessages?

```ts
optional initialMessages: UIMessage<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:132](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L132)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser: object;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:126](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L126)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:130](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L130)

Enable recording for replay testing
