---
'@tanstack/ai': minor
'@tanstack/ai-event-client': minor
'@tanstack/openai-base': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-fal': minor
'@tanstack/ai-mistral': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-bedrock': patch
'@tanstack/ai-byteplus': patch
'@tanstack/ai-cohere': patch
---

feat(ai): native Files API support across providers (upload adapters + `file` content source)

Adds first-class support for provider **Files / storage APIs** so callers can upload media once and reference it by a provider-issued handle instead of re-sending base64 or a public URL each request (lower latency/bandwidth, no re-buffering on memory-constrained runtimes).

- **New tree-shakeable `files` adapter kind** — `openaiFiles()`, `anthropicFiles()`, `geminiFiles()`, and `falFiles()`. Each exposes `upload()`, and (where the provider has a lifecycle API) `get()` / `delete()`. Drive them with the new `uploadFile()` / `getFile()` / `deleteFile()` activity functions. fal is upload-only.
- **New `{ type: 'file' }` arm on `ContentPartSource`** — a **per-provider reference record**: `{ type: 'file', reference: { openai: 'file-…', gemini: 'https://…' } }`. Each adapter reads only its own entry and maps it to its native wire field: OpenAI (Responses) `input_image`/`input_file` `file_id`, Anthropic `file_id` message source (with the `files-api-2025-04-14` beta), Gemini `fileData.fileUri`, fal storage URL passthrough. `fileSourceFromHandle(...handles)` builds the source and merges handles from several providers into one source that routes to any of them.
- **Fail-closed capability preflight** — adapters that can consume file references declare `supportsFileSources`; `chat()` / `generateImage()` / `generateVideo()` / `embed()` reject `{ type: 'file' }` sources for every other adapter (Bedrock, Mistral, Grok, Groq, OpenRouter, Ollama, BytePlus, Cohere, and any future adapter that doesn't opt in) **before a request is built**, so a reference can never be silently mis-mapped onto a URL/data field. Endpoints that need raw bytes (image edits, Sora `input_reference`, Veo, Chat Completions images) throw endpoint-specific errors. A supporting adapter with no entry for its provider in the record throws a lookup error naming the providers that are present.
- **Provider-literal typed handles** — `FileHandle<'openai'>` etc. flow from each files adapter through `uploadFile()`, and `getFile()`/`deleteFile()` accept the handle itself, so cross-provider lifecycle calls fail at compile time. `fileSourceFromHandle` and `FileHandle` are also exported from the browser-safe `@tanstack/ai/client` entry.
