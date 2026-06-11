---
'@tanstack/ai-openai': patch
'@tanstack/ai': patch
---

Migrate the OpenAI realtime adapters from the retired Beta API (shut down 2026-05-12) to the GA API:

- `openaiRealtime()` now exchanges WebRTC SDP via `POST /v1/realtime/calls` (the Beta `?model=` shape returned `beta_api_shape_disabled`).
- `openaiRealtimeToken()` now mints ephemeral keys via `POST /v1/realtime/client_secrets` instead of the retired `/v1/realtime/sessions`, and parses the GA top-level `value`/`expires_at` response shape.
- `session.update` payloads use the GA shape: required `session.type`, `audio.input.transcription`, `audio.input.turn_detection`, `audio.output.voice`, `output_modalities`, and `max_output_tokens`. `temperature` was removed from the GA session config and is no longer sent (a debug log notes when it is dropped).
- Server events are handled under their GA names (`response.output_audio_transcript.*`, `response.output_audio.*`, `output_text`/`output_audio` content parts).
- The default realtime model is now `gpt-realtime`; the `gpt-4o-(mini-)realtime-preview` ids (shut down by OpenAI on 2026-05-07) were removed from `OpenAIRealtimeModel`.
