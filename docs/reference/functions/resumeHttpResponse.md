---
id: resumeHttpResponse
title: resumeHttpResponse
---

# Function: resumeHttpResponse()

```ts
function resumeHttpResponse<TOffset>(options): Response;
```

Defined in: [packages/ai/src/stream-to-response.ts:1189](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L1189)

Serve a resumable run from its durability log over NDJSON, without re-running
the model. The NDJSON counterpart of [resumeServerSentEventsResponse](resumeServerSentEventsResponse.md);
pair it with a `toHttpResponse` producer. Returns a 400 when the request
carries no resume offset (no `Last-Event-ID` header and no `?offset`).

## Type Parameters

### TOffset

`TOffset` *extends* `string` = `string`

## Parameters

### options

`ResumeResponseOptions`\<`TOffset`\>

## Returns

`Response`

## Example

```typescript
export async function GET(request: Request) {
  return resumeHttpResponse({ adapter: memoryStream(request) });
}
```
