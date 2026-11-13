---
'@tanstack/ai-utils': minor
'@tanstack/openai-base': minor
'@tanstack/ai-anthropic': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-elevenlabs': patch
'@tanstack/ai-fal': minor
'@tanstack/ai-cohere': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-worldlabs': patch
'@tanstack/ai-ollaya': patch
'@tanstack/ai-typesafe': patch
'@tanstack/ai-reactor': patch
'@tanstack/ai-muse': patch
'@tanstack/ai-bedrock': patch
---

The provider clients now build their requests with a client that Kubb generates from the modelschemas OpenAPI document of each provider. Adapter options, results, errors, retries, and headers do not change. Calls that the documents do not describe (file uploads, job status, model lists) still use the hand-written code. `@tanstack/ai-utils` has a new `@tanstack/ai-utils/kubb` entry point with the shared runtime of the generated clients and `sendWith()`, which sends a generated request through a provider's own fetch code.

`createElevenLabsClient()` takes an optional `fetch`, like the ElevenLabs SDK option of the same name.

Each request body is now type-checked against the generated OpenAPI types.

Breaking for `@tanstack/openai-base`: `OpenAIClientLike` takes the generated request body types, so an `OpenAI` or `AzureOpenAI` SDK instance no longer type-checks as the adapter client. Build the client with `createOpenAIClient({ apiKey, baseURL })` instead. `@tanstack/openai-base` also exports the generated body types for speech, transcription, embeddings, image generation, image edit and video.

`@tanstack/ai-mistral` sends a `json_schema` response format in snake_case on the streaming path, as the API expects. `@tanstack/ai-elevenlabs` sends a string `entityDetection` or `entityRedaction` value in transcription requests, where before it dropped it.

Cohere (embed), Ollama (chat and embed), World Labs, Ollaya, TypeSafe and Reactor (session token) now send through generated clients too. World Labs no longer carries its own copy of the OpenAPI spec. Bedrock checks its Converse request bodies against the generated types and still sends through the AWS SDK. Muse checks its Chat Completions request against Meta's own generated types. Ollama requests built from adapter config no longer send the `ollama-js` `User-Agent`, and in Node an image string that is a local file path is sent as is, not read from disk.

Breaking for `@tanstack/ai-fal`: the per-model types (`FalModelInput`, `FalModelOutput`, image sizes and video durations) come from the fal schemas on modelschemas instead of `@fal-ai/client`. Field types follow the live schemas, so some fields change (for example a duration that the API takes as a number). `*_url` and `*_urls` fields still accept a `Blob` for the client to upload.
