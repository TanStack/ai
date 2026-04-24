---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
---

feat: add `useGenerateAudio` hook and streaming support for `generateAudio()`

Closes the parity gap between audio generation and the other media
activities (image, speech, video, transcription, summarize):

- `generateAudio()` now accepts `stream: true`, returning an
  `AsyncIterable<StreamChunk>` that can be piped through
  `toServerSentEventsResponse()`.
- `AudioGenerateInput` type added to `@tanstack/ai-client`.
- `useGenerateAudio` hook added to `@tanstack/ai-react`,
  `@tanstack/ai-solid`, and `@tanstack/ai-vue`; matching
  `createGenerateAudio` added to `@tanstack/ai-svelte`. All follow the same
  `{ generate, result, isLoading, error, status, stop, reset }` shape as
  the existing media hooks and support both `connection` (SSE) and
  `fetcher` transports.
