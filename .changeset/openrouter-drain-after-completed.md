---
'@tanstack/ai-openrouter': patch
---

Stop the OpenRouter Responses adapter from cancelling a finished request. After `response.completed` the adapter stopped reading at once, which cancelled the SDK's event stream and the fetch body, so a gateway such as Cloudflare AI Gateway logged a billed, complete call as a client cancel (499). The adapter now lets the body end by itself for up to 250 ms and cancels it only after that.
