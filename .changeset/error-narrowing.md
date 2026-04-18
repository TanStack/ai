---
'@tanstack/ai': patch
'@tanstack/ai-openai': patch
---

refactor(ai, ai-openai): narrow error handling and stop logging raw errors

`catch (error: any)` sites in `stream-to-response.ts`, `activities/stream-generation-result.ts`, and `activities/generateVideo/index.ts` are now narrowed to `unknown` and funnel through a shared `toRunErrorPayload(error, fallback)` helper that extracts `message` / `code` without leaking the original error object (which can carry request state from an SDK).

Removed four `console.error` calls in the OpenAI text adapter's `chatStream` catch block that dumped the full error object to stdout. SDK errors can carry the original request including auth headers, so the library now re-throws without logging; upstream callers should convert errors into structured events themselves.
