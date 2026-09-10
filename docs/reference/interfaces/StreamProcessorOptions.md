---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

# Interface: StreamProcessorOptions

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:136](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L136)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy?: ChunkStrategy;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:137](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L137)

***

### events?

```ts
optional events?: StreamProcessorEvents;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:139](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L139)

Event-driven handlers

***

### initialMessages?

```ts
optional initialMessages?: UIMessage<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:146](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L146)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser?: object;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:140](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L140)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:144](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L144)

Enable recording for replay testing
