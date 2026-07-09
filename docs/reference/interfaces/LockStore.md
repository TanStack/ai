---
id: LockStore
title: LockStore
---

# Interface: LockStore

Defined in: [packages/ai/src/locks.ts:20](https://github.com/TanStack/ai/blob/main/packages/ai/src/locks.ts#L20)

Mutual exclusion around a critical section keyed by `key`. Used by the
sandbox `ensure` algorithm so two concurrent runs for the same thread don't
both create a sandbox, and available to any middleware that needs a named lock.

## Properties

### withLock()

```ts
withLock: <T>(key, fn) => Promise<T>;
```

Defined in: [packages/ai/src/locks.ts:21](https://github.com/TanStack/ai/blob/main/packages/ai/src/locks.ts#L21)

#### Type Parameters

##### T

`T`

#### Parameters

##### key

`string`

##### fn

() => `Promise`\<`T`\>

#### Returns

`Promise`\<`T`\>
