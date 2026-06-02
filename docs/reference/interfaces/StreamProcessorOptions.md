---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

# Interface: StreamProcessorOptions

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:118](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L118)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy: ChunkStrategy;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:119](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L119)

***

### events?

```ts
optional events: StreamProcessorEvents;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:121](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L121)

Event-driven handlers

***

### initialMessages?

```ts
optional initialMessages: UIMessage<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:128](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L128)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser: object;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:122](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L122)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:126](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L126)

Enable recording for replay testing
