---
id: FileUploadInput
title: FileUploadInput
---

```ts
type FileUploadInput = 
  | Blob
  | {
  data: string;
  filename?: string;
  mimeType: string;
};
```

Defined in: [packages/ai/src/activities/files/adapter.ts:20](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L20)

Input to [FilesAdapter.upload](../interfaces/FilesAdapter.md#upload). Either a `Blob` (memory-efficient,
preferred for large assets) or base64 `data` plus its `mimeType`.

## Union Members

`Blob`

***

### Type Literal

```ts
{
  data: string;
  filename?: string;
  mimeType: string;
}
```

#### data

```ts
data: string;
```

Base64-encoded file bytes.

#### filename?

```ts
optional filename?: string;
```

Optional filename hint sent to providers that accept one.

#### mimeType

```ts
mimeType: string;
```

MIME type of the bytes (e.g. `'image/png'`, `'application/pdf'`).
