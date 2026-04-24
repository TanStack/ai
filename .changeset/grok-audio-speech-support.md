---
'@tanstack/ai-grok': minor
---

feat(ai-grok): add audio and speech adapters for xAI

Add three new tree-shakeable adapters that wrap xAI's audio APIs:

- `grokSpeech` / `createGrokSpeech` — text-to-speech via `POST /v1/tts`. Supports the 5 xAI voices (`eve`, `ara`, `rex`, `sal`, `leo`), MP3/WAV/PCM/μ-law/A-law codecs, and the `language`, `sample_rate`, `bit_rate`, `optimize_streaming_latency`, `text_normalization` provider options.
- `grokTranscription` / `createGrokTranscription` — speech-to-text via `POST /v1/stt`. Passes through `language`, `diarize`, `multichannel`, `channels`, `audio_format`, and `sample_rate`; maps xAI's word-level timestamps to `TranscriptionResult.words`.
- `grokRealtime` / `grokRealtimeToken` — Voice Agent (realtime) adapter for `wss://api.x.ai/v1/realtime` with ephemeral tokens via `/v1/realtime/client_secrets`. Supports the `grok-voice-fast-1.0` and `grok-voice-think-fast-1.0` models.

New model identifier exports: `GROK_TTS_MODELS`, `GROK_TRANSCRIPTION_MODELS`, `GROK_REALTIME_MODELS` and their corresponding types.
