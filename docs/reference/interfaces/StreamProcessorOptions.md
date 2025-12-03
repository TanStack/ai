---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

# Interface: StreamProcessorOptions

Defined in: [stream/processor.ts:139](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L139)

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy: ChunkStrategy;
```

Defined in: [stream/processor.ts:140](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L140)

***

### events?

```ts
optional events: StreamProcessorEvents;
```

Defined in: [stream/processor.ts:142](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L142)

New event-driven handlers

***

### handlers?

```ts
optional handlers: StreamProcessorHandlers;
```

Defined in: [stream/processor.ts:144](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L144)

Legacy callback handlers (for backward compatibility)

***

### initialMessages?

```ts
optional initialMessages: UIMessage[];
```

Defined in: [stream/processor.ts:151](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L151)

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser: object;
```

Defined in: [stream/processor.ts:145](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L145)

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

Defined in: [stream/processor.ts:149](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L149)

Enable recording for replay testing
