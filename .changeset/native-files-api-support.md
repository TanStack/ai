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
---

feat(ai): native Files API support across providers (upload adapters + `file` content source)

Adds first-class support for provider **Files / storage APIs** so callers can upload media once and reference it by a provider-issued handle instead of re-sending base64 or a public URL each request (lower latency/bandwidth, no re-buffering on memory-constrained runtimes).

- **New tree-shakeable `files` adapter kind** — `openaiFiles()`, `anthropicFiles()`, `geminiFiles()`, and `falFiles()`. Each exposes `upload()`, and (where the provider has a lifecycle API) `get()` / `delete()`. Drive them with the new `uploadFile()` / `getFile()` / `deleteFile()` activity functions. fal is upload-only.
- **New `{ type: 'file' }` arm on `ContentPartSource`** — reference an uploaded handle in a chat message. Adapters map it to the right wire field: OpenAI (Responses) `input_image`/`input_file` `file_id`, Anthropic `file_id` message source (with the `files-api-2025-04-14` beta), Gemini `fileData.fileUri`, fal storage URL passthrough. Use `fileSourceFromHandle(handle)` to build the source from an uploaded `FileHandle`.
- **Runtime provider routing** — a file handle only routes to the provider that issued it; adapters throw a clear error on a cross-provider handle, and providers/endpoints that can't consume a handle (image edits, Veo, Chat Completions images, Bedrock, Mistral, Grok, OpenRouter, Ollama) throw a clear "unsupported file source" error instead of silently mis-mapping.
