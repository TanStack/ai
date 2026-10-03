---
'@tanstack/ai': minor
---

Add `fakeText()` at the new `@tanstack/ai/testing` subpath: a text adapter that answers from a script, for tests of `chat()`, tools, and middleware with no network and no API key.

- Queue answers with `setResponses` and `appendResponses`. An answer is `{ text?, thinking?, toolCalls?, finishReason?, error? }`, or a function that gets `{ request, state }`. An empty queue fails with "No more fake responses queued".
- Token usage is estimated as `ceil(characters / 4)`. With `cache: true`, the part of a request that matches the thread's previous request counts as cached tokens.
- Options: `model`, `input` (the adapter's input modalities), `contextWindow`, and `tokensPerSecond` for stream pacing. The stream stops when the request aborts.
