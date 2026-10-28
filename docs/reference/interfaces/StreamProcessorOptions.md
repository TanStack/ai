---
id: StreamProcessorOptions
title: StreamProcessorOptions
---

Defined in: packages/ai/src/activities/chat/stream/processor.ts:159

Options for StreamProcessor

## Properties

### chunkStrategy?

```ts
optional chunkStrategy?: ChunkStrategy;
```

Defined in: packages/ai/src/activities/chat/stream/processor.ts:160

***

### events?

```ts
optional events?: StreamProcessorEvents;
```

Defined in: packages/ai/src/activities/chat/stream/processor.ts:162

Event-driven handlers

***

### initialMessages?

```ts
optional initialMessages?: UIMessage<unknown>[];
```

Defined in: packages/ai/src/activities/chat/stream/processor.ts:169

Initial messages to populate the processor

***

### jsonParser?

```ts
optional jsonParser?: object;
```

Defined in: packages/ai/src/activities/chat/stream/processor.ts:163

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

Defined in: packages/ai/src/activities/chat/stream/processor.ts:167

Enable recording for replay testing

***

### subagentRunId?

```ts
optional subagentRunId?: string;
```

Defined in: packages/ai/src/activities/chat/stream/processor.ts:174

Set on the processor of a subagent card. Chunks tagged with this id are
the card's own; chunks for an id no card holds are dropped.
