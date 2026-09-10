---
id: MetadataStore
title: MetadataStore
---

# Interface: MetadataStore

Defined in: [packages/ai/src/activities/chat/middleware/metadata.ts:9](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/metadata.ts#L9)

Namespaced key/value store for app and middleware metadata.

`(namespace, key)` is the composite identity. Keep both values separate;
joining them with a delimiter can create collisions.

## Properties

### delete

```ts
delete: (namespace, key) => Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/metadata.ts:15](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/metadata.ts#L15)

Delete `(namespace, key)`. Do nothing when it is absent.

#### Parameters

##### namespace

`string`

##### key

`string`

#### Returns

`Promise`\<`void`\>

***

### get

```ts
get: (namespace, key) => Promise<unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/metadata.ts:11](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/metadata.ts#L11)

Return the value for `(namespace, key)`, or `null` when it is absent.

#### Parameters

##### namespace

`string`

##### key

`string`

#### Returns

`Promise`\<`unknown`\>

***

### set

```ts
set: (namespace, key, value) => Promise<void>;
```

Defined in: [packages/ai/src/activities/chat/middleware/metadata.ts:13](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/metadata.ts#L13)

Insert or replace the value for `(namespace, key)`.

#### Parameters

##### namespace

`string`

##### key

`string`

##### value

`unknown`

#### Returns

`Promise`\<`void`\>
