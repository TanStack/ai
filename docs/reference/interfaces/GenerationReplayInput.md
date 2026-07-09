---
id: GenerationReplayInput
title: GenerationReplayInput
---

# Interface: GenerationReplayInput\<TResult\>

Defined in: [packages/ai/src/activities/middleware/types.ts:50](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L50)

## Type Parameters

### TResult

`TResult` = `unknown`

## Properties

### events?

```ts
optional events: 
  | AsyncIterable<AGUIEvent, any, any>
| Iterable<AGUIEvent, any, any>;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:55](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L55)

Previously persisted public generation events. Streaming replay yields
these events as-is and does not call the provider.

***

### result?

```ts
optional result: TResult;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:61](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L61)

Previously persisted terminal result. Non-streaming replay returns this
value as-is; streaming replay wraps it in the standard generation event
envelope. Result transforms are intentionally skipped for replay.
