---
'@tanstack/ai-schemas': minor
---

Initial release of `@tanstack/ai-schemas` — JSON Schema and Zod schemas for AI provider generation endpoints, generated nightly from upstream OpenAPI specs.

Covers OpenAI, Anthropic, Gemini, ElevenLabs, xAI Grok, and FAL. Endpoints are grouped per provider by activity — `chat`, `image`, `video`, `audio` (TTS, transcription, music, sound effects in one group), `embeddings`, `moderation` — behind `@tanstack/ai-schemas/{provider}/{activity}/{json-schema,zod}` subpaths. Platform/admin endpoints are excluded from generation. Architecture ported from fal-ai/fal-js PR #212; extended to every provider that publishes an OpenAPI spec.

Sources:

- OpenAI: `github.com/openai/openai-openapi`
- Anthropic: Stainless OpenAPI resolved via `anthropic-sdk-typescript/.stats.yml`
- Gemini: Google Generative Language Discovery doc, converted to OpenAPI in-pipeline
- ElevenLabs: `api.elevenlabs.io/openapi.json`
- xAI Grok: `docs.x.ai/openapi.json`
- FAL: per-model OpenAPI from the FAL models API (requires `FAL_KEY`)

The `.github/workflows/sync-schemas.yml` workflow runs daily and opens a PR when any provider's spec changes. Resolves #619.
