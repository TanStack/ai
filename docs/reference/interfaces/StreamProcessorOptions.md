---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

# Interface: StreamProcessorOptions

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:135](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L135)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy?: ChunkStrategy;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:136](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L136)

***

### events?

```ts
optional events?: StreamProcessorEvents;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:138](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L138)

Event-driven handlers

***

### initialMessages?

```ts
optional initialMessages?: UIMessage<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:145](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L145)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser?: object;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:139](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L139)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:143](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L143)

Enable recording for replay testing
