---
id: isCustomEvent
title: isCustomEvent
---

# Function: isCustomEvent()

```ts
function isCustomEvent<TName>(chunk, name): chunk is WellKnownCustomEvent<TName>;
```

Defined in: [packages/ai/src/custom-events.ts:102](https://github.com/TanStack/ai/blob/main/packages/ai/src/custom-events.ts#L102)

Type guard: is `chunk` a CUSTOM event with the given well-known `name`?
Narrows the payload type when true, so consumers read `chunk.value` typed.

## Type Parameters

### TName

`TName` *extends* [`WellKnownCustomEventName`](../type-aliases/WellKnownCustomEventName.md)

## Parameters

### chunk

[`AGUIEvent`](../type-aliases/AGUIEvent.md)

### name

`TName`

## Returns

`chunk is WellKnownCustomEvent<TName>`
