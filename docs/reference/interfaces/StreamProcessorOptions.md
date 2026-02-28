---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

# Interface: StreamProcessorOptions

Defined in: [activities/chat/stream/processor.ts:97](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L97)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy: ChunkStrategy;
```

Defined in: [activities/chat/stream/processor.ts:98](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L98)

***

### events?

```ts
optional events: StreamProcessorEvents;
```

Defined in: [activities/chat/stream/processor.ts:100](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L100)

Event-driven handlers

***

### initialMessages?

```ts
optional initialMessages: UIMessage[];
```

Defined in: [activities/chat/stream/processor.ts:107](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L107)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser: object;
```

Defined in: [activities/chat/stream/processor.ts:101](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L101)

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

Defined in: [activities/chat/stream/processor.ts:105](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L105)

Enable recording for replay testing
