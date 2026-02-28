---
id: detectImageMimeType
title: detectImageMimeType
---

# Function: detectImageMimeType()

```ts
function detectImageMimeType(base64Data): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | undefined;
```

Defined in: [utils.ts:17](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/utils.ts#L17)

Detect image mime type from base64 data using magic bytes.
Returns undefined if the format cannot be detected.

This function analyzes the first few bytes of base64-encoded image data
to determine the image format based on file signature (magic bytes).

## Parameters

### base64Data

`string`

The base64-encoded image data

## Returns

`"image/jpeg"` \| `"image/png"` \| `"image/gif"` \| `"image/webp"` \| `undefined`

The detected mime type, or undefined if unrecognized

## Example

```ts
const mimeType = detectImageMimeType(imageBase64)
// Returns 'image/jpeg', 'image/png', 'image/gif', 'image/webp', or undefined
```
