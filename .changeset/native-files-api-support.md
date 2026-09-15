---
'@tanstack/ai': minor
'@tanstack/ai-event-client': minor
'@tanstack/openai-base': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-fal': minor
'@tanstack/ai-mistral': patch
'@tanstack/ai-grok': minor
'@tanstack/ai-openrouter': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-bedrock': patch
'@tanstack/ai-byteplus': patch
'@tanstack/ai-cohere': patch
---

feat(ai): native Files API support across providers (upload adapters + `file` content source)

Adds first-class support for provider **Files / storage APIs** so callers can upload media once and reference it by a provider-issued handle instead of re-sending base64 or a public URL each request (lower latency/bandwidth, no re-buffering on memory-constrained runtimes).

- **New tree-shakeable `files` adapter kind** — `openaiFiles()`, `anthropicFiles()`, `geminiFiles()`, `grokFiles()`, and `falFiles()`. Each exposes `upload()`, and (where the provider has a lifecycle API) `get()` / `delete()`. Drive them with the new `uploadFile()` / `getFile()` / `deleteFile()` activity functions. fal is upload-only.
- **New `{ type: 'file' }` arm on `ContentPartSource`**, matching the AG-UI `FileSource` arm: `{ type: 'file', value, provider?, mimeType? }`. `value` is the opaque handle the provider issued; `provider` names the adapter that issued it. Each adapter maps `value` to its native wire field: OpenAI (Responses) `input_image`/`input_file` `file_id`, Anthropic `file_id` message source (with the `files-api-2025-04-14` beta), Gemini `fileData.fileUri`, fal storage URL, Grok public URL. `fileSourceFromHandle(handle)` builds the source.
- **Fail-closed capability preflight** — adapters that can consume file references declare `supportsFileSources`; `chat()` / `generateImage()` / `generateVideo()` / `embed()` reject `{ type: 'file' }` sources for every other adapter (Bedrock, Mistral, Groq, OpenRouter, Ollama, BytePlus, Cohere, and any future adapter that doesn't opt in) **before a request is built**, so a reference can never be silently mis-mapped onto a URL/data field. Endpoints that need raw bytes (image edits, Sora `input_reference`, Veo, Chat Completions images) throw endpoint-specific errors. A supporting adapter handed a source whose `provider` names a different adapter throws an error naming the issuer.
- **Provider-literal typed handles** — `FileHandle<'openai'>` etc. flow from each files adapter through `uploadFile()`, and `getFile()`/`deleteFile()` accept the handle itself, so cross-provider lifecycle calls fail at compile time. `fileSourceFromHandle` and `FileHandle` are also exported from the browser-safe `@tanstack/ai/client` entry. A `{ type: 'file' }` source cannot cross the chat wire format (which carries `data`/`url` sources only) and throws rather than being dropped, so a browser that holds a handle sends it in its own request body and the server builds the source.
