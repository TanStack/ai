---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

# Interface: StreamProcessorOptions

Defined in: [activities/chat/stream/processor.ts:136](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L136)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy: ChunkStrategy;
```

Defined in: [activities/chat/stream/processor.ts:137](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L137)

***

### events?

```ts
optional events: StreamProcessorEvents;
```

Defined in: [activities/chat/stream/processor.ts:139](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L139)

New event-driven handlers

***

### handlers?

```ts
optional handlers: StreamProcessorHandlers;
```

Defined in: [activities/chat/stream/processor.ts:141](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L141)

Legacy callback handlers (for backward compatibility)

***

### initialMessages?

```ts
optional initialMessages: UIMessage[];
```

Defined in: [activities/chat/stream/processor.ts:148](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L148)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser: object;
```

Defined in: [activities/chat/stream/processor.ts:142](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L142)

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

Defined in: [activities/chat/stream/processor.ts:146](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L146)

Enable recording for replay testing
