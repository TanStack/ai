---
'@tanstack/openai-base': patch
---

Stop the OpenAI Responses adapters from aborting a finished request. After `response.completed` the adapters stopped reading at once, so the OpenAI SDK aborted the request and a gateway such as Cloudflare AI Gateway logged a billed, complete call as a client cancel (499). The adapters now let the body end by itself for up to 250 ms and abort it only after that.
