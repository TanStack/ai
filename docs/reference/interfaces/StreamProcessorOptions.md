---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

# Interface: StreamProcessorOptions

Defined in: [packages/typescript/ai/src/activities/chat/stream/processor.ts:99](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L99)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy: ChunkStrategy;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/processor.ts:100](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L100)

***

### events?

```ts
optional events: StreamProcessorEvents;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/processor.ts:102](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L102)

Event-driven handlers

***

### initialMessages?

```ts
optional initialMessages: UIMessage[];
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/processor.ts:109](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L109)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser: object;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/processor.ts:103](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L103)

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

Defined in: [packages/typescript/ai/src/activities/chat/stream/processor.ts:107](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L107)

Enable recording for replay testing
