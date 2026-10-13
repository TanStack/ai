---
id: resumeJsonResponse
title: resumeJsonResponse
---

```ts
function resumeJsonResponse<TOffset>(options): Promise<Response>;
```

Defined in: [packages/ai/src/stream-to-response.ts:1736](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L1736)

Serve a resumable run from its durability log as one JSON body, without
re-running the model. The JSON counterpart of
[resumeServerSentEventsResponse](resumeServerSentEventsResponse.md); pair it with a `toJsonResponse`
producer. `fetchJson` calls it with `?runId=<id>&offset=<offset>` while a
reply says `done: false`, and with `offset=-1` to join a run from the start.

The reply holds every chunk strictly after the offset. It is `done: true`
once the log is closed, or `done: false` after `maxWaitMs` (default 1000) on a
run that is still going. Returns a 400 when the request carries no resume
offset (no `Last-Event-ID` header and no `?offset`).

## Type Parameters

### TOffset

`TOffset` *extends* `string` = `string`

## Parameters

### options

`ResponseInit` & `object` & `object`

## Returns

`Promise`\<`Response`\>

## Example

```typescript
export async function GET(request: Request) {
  return resumeJsonResponse({ adapter: memoryStream(request) });
}
```
