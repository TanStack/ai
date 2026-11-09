---
id: uploadFile
title: uploadFile
---

```ts
function uploadFile<TName>(options): Promise<FileHandle<TName>>;
```

Defined in: [packages/ai/src/activities/files/index.ts:28](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/index.ts#L28)

Upload a file to a provider's Files API and return its handle. The handle
carries the provider name as a literal type, so passing it to another
provider's lifecycle call is a compile error.

## Type Parameters

### TName

`TName` *extends* `string`

## Parameters

### options

#### abortSignal?

`AbortSignal`

Cancels the upload. The call rejects when the signal aborts.

#### adapter

[`FilesAdapter`](../interfaces/FilesAdapter.md)\<`TName`\> & `object`

#### input

[`FileUploadInput`](../type-aliases/FileUploadInput.md)

## Returns

`Promise`\<[`FileHandle`](../interfaces/FileHandle.md)\<`TName`\>\>

## Example

```ts
const files = openaiFiles()
const handle = await uploadFile({ adapter: files, input: { data, mimeType: 'image/png' } })
```
