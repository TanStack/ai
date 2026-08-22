---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

# Interface: StreamProcessorOptions

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:128](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L128)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy?: ChunkStrategy;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:129](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L129)

***

### events?

```ts
optional events?: StreamProcessorEvents;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:131](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L131)

Event-driven handlers

***

### initialMessages?

```ts
optional initialMessages?: UIMessage<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:138](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L138)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser?: object;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:132](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L132)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:136](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L136)

Enable recording for replay testing
