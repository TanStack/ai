---
id: createCapability
title: createCapability
---

# Function: createCapability()

```ts
function createCapability<TValue>(): <TName>(name) => Capability<TValue, TName>;
```

Defined in: [packages/ai/src/activities/chat/middleware/capabilities.ts:114](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/capabilities.ts#L114)

Create a capability. Returns a hybrid handle that destructures to
`[get, provide]` and is itself the identity for `requires`/`provides`.

Curried so the value type is supplied explicitly while the name literal is
INFERRED from the argument: `createCapability<T>()('name')`. (A single call
`createCapability<T>('name')` cannot work — supplying `T` explicitly stops
TypeScript inferring the name, collapsing it to `string` and defeating the
compile-time coverage check that keys on the literal name.)

## Type Parameters

### TValue

`TValue` = `unknown`

## Returns

```ts
<TName>(name): Capability<TValue, TName>;
```

### Type Parameters

#### TName

`TName` *extends* `string`

### Parameters

#### name

`TName`

### Returns

[`Capability`](../type-aliases/Capability.md)\<`TValue`, `TName`\>

## Example

```ts
const counterCapability = createCapability<{ value: number }>()('counter')
const [getCounter, provideCounter] = counterCapability

const withCounter = defineChatMiddleware({
  name: 'counter',
  provides: [counterCapability],
  setup(ctx) { provideCounter(ctx, { value: 0 }) },
})

const readsCounter = defineChatMiddleware({
  name: 'reads-counter',
  requires: [counterCapability],
  onChunk(ctx) { getCounter(ctx).value++ },
})

chat({ adapter, messages, middleware: [withCounter, readsCounter] })
```

## Remarks

Capability `name`s must be unique across your app: compile-time
coverage tracking keys on the name literal (runtime keys on reference).
