---
'@tanstack/ai-elevenlabs': minor
---

feat: add REST adapters to @tanstack/ai-elevenlabs and migrate realtime to the renamed SDK

Extends `@tanstack/ai-elevenlabs` (previously realtime-only) with three tree-shakeable REST adapters built on the official `@elevenlabs/elevenlabs-js` SDK (v2.44+):

- `elevenlabsSpeech()` — text-to-speech on `eleven_v3`, `eleven_multilingual_v2`, `eleven_flash_*`, `eleven_turbo_*`
- `elevenlabsAudio()` — music (`music_v1`, with structured composition plans) and sound effects (`eleven_text_to_sound_v2`/`v1`) via a single adapter that dispatches by model
- `elevenlabsTranscription()` — Scribe v1/v2 speech-to-text with diarization, keyterm biasing, PII redaction, and word-level timestamps

Also migrates the existing realtime adapter off the deprecated `@11labs/client` onto the renamed `@elevenlabs/client` package.
