---
id: resumeServerSentEventsResponse
title: resumeServerSentEventsResponse
---

# Function: resumeServerSentEventsResponse()

```ts
function resumeServerSentEventsResponse<TOffset>(options): Response;
```

Defined in: [packages/ai/src/stream-to-response.ts:996](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L996)

Serve a resumable run from its durability log over Server-Sent Events, without
re-running the model. Use this in a `GET` handler so a reload or a second tab
can re-attach to an in-flight or finished run.

The adapter (`memoryStream(request)` / `durableStream(request)`) captures the
resume offset from the request. If there is none (no `Last-Event-ID` header
and no `?offset`), there is nothing to replay and this returns a 400.

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
  return resumeServerSentEventsResponse({ adapter: memoryStream(request) });
}
```
