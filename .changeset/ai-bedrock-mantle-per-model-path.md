---
"@tanstack/ai-bedrock": patch
---

Pick the `bedrock-mantle` URL path per model family. The mantle endpoint was
hardcoded to `/v1`, but AWS serves different model families on different
paths: Gemma needs `/openai/v1` (per its model card's "In-Region endpoint
URL"), while gpt-oss and DeepSeek use the `/v1` default. The wrong path
returned a misleading `401 ... is not enabled for this account (access_denied)`
instead of a 404 / "wrong path" error, which made the bug hard to diagnose.

`withBedrockDefaults` now takes the model id as a third argument and threads
it into `buildBaseURL` → `mantlePathForModel`, which routes `google.gemma-*`
to `/openai/v1` and falls back to `/v1` for every other id. The chat and
responses adapter constructors pass the model id through. An explicit
`baseURL` override still wins (preserves the existing escape hatch and the
E2E → aimock wiring).

The runtime (`bedrock-runtime`) endpoint is unchanged — every chat-capable
model is served at `/openai/v1` there, so the model parameter is unused on
that branch.

Out of scope: a catalog-driven refactor (Direction 1 in #925) that carries
the path per `(endpoint, api)` on the generated catalog entry would replace
this prefix switch with a data-driven lookup. That's a larger follow-up;
this is the minimal bug fix. Claude-on-mantle at `/anthropic/v1/messages`
is also out of scope — that path serves the Anthropic Messages API, which
has a different wire format from OpenAI Chat Completions, so the chat
adapter can't drive it regardless of the path. The catalog already marks
Claude models as `chat: false`, so that combination typechecks as an error
today.

Fixes #925.
