---
'@tanstack/ai': minor
---

Add `wrapFetch` to `chat()`, to the middleware `onConfig` config, and to `TextOptions`. A wrapper gets the next fetch and gives back a new fetch, so it can change the HTTP request and response of a model call. The engine chains the `chat()` option and the middleware wrappers into one function. A middleware wrapper applies to one model call only. The new `FetchWrapper` type names the wrapper.
