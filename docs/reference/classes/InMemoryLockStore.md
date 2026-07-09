---
id: InMemoryLockStore
title: InMemoryLockStore
---

# Class: InMemoryLockStore

Defined in: [packages/ai/src/locks.ts:39](https://github.com/TanStack/ai/blob/main/packages/ai/src/locks.ts#L39)

In-memory [LockStore](../interfaces/LockStore.md) — a per-key promise chain. Correct within a
single process; multi-instance correctness needs a distributed lock from the
persistence layer.

## Implements

- [`LockStore`](../interfaces/LockStore.md)

## Constructors

### Constructor

```ts
new InMemoryLockStore(): InMemoryLockStore;
```

#### Returns

`InMemoryLockStore`

## Methods

### withLock()

```ts
withLock<T>(key, fn): Promise<T>;
```

Defined in: [packages/ai/src/locks.ts:42](https://github.com/TanStack/ai/blob/main/packages/ai/src/locks.ts#L42)

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

#### Implementation of

[`LockStore`](../interfaces/LockStore.md).[`withLock`](../interfaces/LockStore.md#withlock)
