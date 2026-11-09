---
id: FilesAdapter
title: FilesAdapter
---

Defined in: [packages/ai/src/activities/files/adapter.ts:78](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L78)

The `files` adapter contract. `upload` is required; `get`/`delete` are
optional and present only when the provider has a lifecycle API.

`TName` is the provider name literal (`'openai'`, `'gemini'`, ...); concrete
adapters bind it so the handles they issue carry their provenance in the
type system.

Each method takes an optional `{ abortSignal }`. Adapters should forward it
to the provider request when supported.

## Type Parameters

### TName

`TName` *extends* `string` = `string`

## Properties

### delete?

```ts
optional delete?: (id, options?) => Promise<void>;
```

Defined in: [packages/ai/src/activities/files/adapter.ts:89](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L89)

#### Parameters

##### id

`string`

##### options?

###### abortSignal?

`AbortSignal`

#### Returns

`Promise`\<`void`\>

***

### get?

```ts
optional get?: (id, options?) => Promise<FileHandle<TName>>;
```

Defined in: [packages/ai/src/activities/files/adapter.ts:85](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L85)

#### Parameters

##### id

`string`

##### options?

###### abortSignal?

`AbortSignal`

#### Returns

`Promise`\<[`FileHandle`](FileHandle.md)\<`TName`\>\>

***

### kind

```ts
readonly kind: "files";
```

Defined in: [packages/ai/src/activities/files/adapter.ts:79](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L79)

***

### name

```ts
readonly name: TName;
```

Defined in: [packages/ai/src/activities/files/adapter.ts:80](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L80)

***

### upload

```ts
upload: (input, options?) => Promise<FileHandle<TName>>;
```

Defined in: [packages/ai/src/activities/files/adapter.ts:81](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L81)

#### Parameters

##### input

[`FileUploadInput`](../type-aliases/FileUploadInput.md)

##### options?

###### abortSignal?

`AbortSignal`

#### Returns

`Promise`\<[`FileHandle`](FileHandle.md)\<`TName`\>\>
