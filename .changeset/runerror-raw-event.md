---
'@tanstack/ai': minor
'@tanstack/openai-base': minor
'@tanstack/ai-openrouter': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-gemini': minor
---

Populate AG-UI `rawEvent` on `RUN_ERROR` events with the provider's structured error body.

Previously, when a streaming chat call failed the `RUN_ERROR` event carried only an
opaque `{ message, code }` headline (e.g. `"Provider returned error"`), and no adapter
populated AG-UI's purpose-built `rawEvent` field — so the upstream provider detail was
unrecoverable.

Adapters now forward the provider's **structured error body** (e.g. an SDK `APIError`'s
parsed `.error` response body, or OpenRouter's mid-stream `chunk.error`) as `rawEvent`
on the `RUN_ERROR` event. The new `toRunErrorRawEvent` helper extracts only known
provider-body fields — never the raw SDK exception object, which can carry request
metadata such as auth headers. The `{ message, code }` contract of `toRunErrorPayload`
is unchanged.

The error surfaced to consumers via the `ChatClient` / `useChat` `error` (and the
`onError` callback) now also carries `code` and `rawEvent` when present, so the upstream
cause is recoverable in application code.

> Note: the OpenRouter SDK parses each in-band stream chunk's `error` through a strict
> schema (`{ code, message }`), so provider `metadata` survives only on pre-stream HTTP
> errors (rate-limit / overload / BYOK rejection), whose typed error class exposes the
> full body via `.error`.
