---
id: MetadataStore
title: MetadataStore
---

Defined in: packages/ai/src/activities/chat/middleware/metadata.ts:9

Namespaced key/value store for app and middleware metadata.

`(namespace, key)` is the composite identity. Keep both values separate;
joining them with a delimiter can create collisions.

## Properties

### delete

```ts
delete: (namespace, key) => Promise<void>;
```

Defined in: packages/ai/src/activities/chat/middleware/metadata.ts:15

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

Defined in: packages/ai/src/activities/chat/middleware/metadata.ts:11

Return the value for `(namespace, key)`, or `null` when it is absent.

#### Parameters

##### namespace

`string`

##### key

`string`

#### Returns

`Promise`\<`unknown`\>

***

### getVersioned?

```ts
optional getVersioned?: (namespace, key) => Promise<
  | {
  revision: string;
  value: unknown;
}
| null>;
```

Defined in: packages/ai/src/activities/chat/middleware/metadata.ts:22

Optional. The value with a revision, or `null` when it is absent. Pair it
with `setIf` for compare-and-set writes: implement both or neither.
Every write (also a plain `set`) gives the key a new revision, and a
revision does not come back after a `delete`.

#### Parameters

##### namespace

`string`

##### key

`string`

#### Returns

`Promise`\<
  \| \{
  `revision`: `string`;
  `value`: `unknown`;
\}
  \| `null`\>

***

### set

```ts
set: (namespace, key, value) => Promise<void>;
```

Defined in: packages/ai/src/activities/chat/middleware/metadata.ts:13

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

***

### setIf?

```ts
optional setIf?: (namespace, key, value, expectedRevision) => Promise<
  | {
  ok: true;
  revision: string;
}
  | {
  ok: false;
  reason: "conflict";
}>;
```

Defined in: packages/ai/src/activities/chat/middleware/metadata.ts:31

Optional. Write only when the current revision is `expectedRevision`
(`null` means the key is absent). Success is `{ ok: true, revision }`.
A different revision returns `{ ok: false, reason: 'conflict' }`.

#### Parameters

##### namespace

`string`

##### key

`string`

##### value

`unknown`

##### expectedRevision

`string` \| `null`

#### Returns

`Promise`\<
  \| \{
  `ok`: `true`;
  `revision`: `string`;
\}
  \| \{
  `ok`: `false`;
  `reason`: `"conflict"`;
\}\>
