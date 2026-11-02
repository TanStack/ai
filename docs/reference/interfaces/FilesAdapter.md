---
id: FilesAdapter
title: FilesAdapter
---

Defined in: [packages/ai/src/activities/files/adapter.ts:75](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L75)

The `files` adapter contract. `upload` is required; `get`/`delete` are
optional and present only when the provider has a lifecycle API.

`TName` is the provider name literal (`'openai'`, `'gemini'`, ...); concrete
adapters bind it so the handles they issue carry their provenance in the
type system.

## Type Parameters

### TName

`TName` *extends* `string` = `string`

## Properties

### delete?

```ts
optional delete?: (id) => Promise<void>;
```

Defined in: [packages/ai/src/activities/files/adapter.ts:80](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L80)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`void`\>

***

### get?

```ts
optional get?: (id) => Promise<FileHandle<TName>>;
```

Defined in: [packages/ai/src/activities/files/adapter.ts:79](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L79)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FileHandle`](FileHandle.md)\<`TName`\>\>

***

### kind

```ts
readonly kind: "files";
```

Defined in: [packages/ai/src/activities/files/adapter.ts:76](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L76)

***

### name

```ts
readonly name: TName;
```

Defined in: [packages/ai/src/activities/files/adapter.ts:77](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L77)

***

### upload

```ts
upload: (input) => Promise<FileHandle<TName>>;
```

Defined in: [packages/ai/src/activities/files/adapter.ts:78](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L78)

#### Parameters

##### input

[`FileUploadInput`](../type-aliases/FileUploadInput.md)

#### Returns

`Promise`\<[`FileHandle`](FileHandle.md)\<`TName`\>\>
