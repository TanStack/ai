---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': patch
'@tanstack/ai-vue': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-svelte': patch
'@tanstack/ai-preact': patch
'@tanstack/ai-angular': patch
'@tanstack/ai-remix': patch
'@tanstack/ai-octane': patch
---

Breaking: `chat({ stream: false })` and `streamToText()` now return a `ChatResult` with `text` and `chunks`, not a string. The chunks keep the tool calls and interrupt outcomes that the string lost. To migrate, change `const text = await chat({ stream: false })` to `const { text } = await chat({ stream: false })`.

Add a JSON transport for hosts that cannot stream a response. On the server, `toJsonResponse()` sends a run as one JSON body, and `resumeJsonResponse()` sends the rest of a durable run. On the client, the `fetchJson()` connection adapter reads that body and asks again until the run is done. Each framework package re-exports `fetchJson`.
