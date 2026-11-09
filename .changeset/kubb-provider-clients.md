---
'@tanstack/ai-utils': minor
'@tanstack/openai-base': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-elevenlabs': patch
'@tanstack/ai-fal': patch
---

The provider clients now build their requests with a client that Kubb generates from the modelschemas OpenAPI document of each provider. Adapter options, results, errors, retries, and headers do not change. Calls that the documents do not describe (file uploads, job status, model lists) still use the hand-written code. `@tanstack/ai-utils` has a new `@tanstack/ai-utils/kubb` entry point with the shared runtime of the generated clients and `sendWith()`, which sends a generated request through a provider's own fetch code.

`createElevenLabsClient()` takes an optional `fetch`, like the ElevenLabs SDK option of the same name.
