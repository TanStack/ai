---
'@tanstack/ai': minor
---

Add `fakeText()` at the new `@tanstack/ai/testing` subpath. It is a text adapter that answers from a script. Use it to test `chat()`, tools, and middleware with no network and no API key.

- Queue answers with `setResponses` and `appendResponses`. An answer is `{ text?, thinking?, toolCalls?, finishReason?, error? }`, or a function that gets `{ request, state }`. An empty queue fails with "No more fake responses queued".
- Token usage is an estimate: `ceil(characters / 4)`. With `cache: true`, the part of a request that matches the previous request of the same thread counts as cached tokens.
- Options: `model`, `contextWindow`, and `tokensPerSecond` for stream pacing. The stream stops when the request aborts.
- `RUN_STARTED` carries `parentRunId` when the call has one.
- The default tool call id is `fake-call-<fake>-<call>-<index>`. It is unique across `fakeText()` instances.
