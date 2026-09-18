---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-byteplus': minor
'@tanstack/ai-elevenlabs': minor
'@tanstack/ai-gemini': minor
---

Add dialogue turns and timing alignment to the text-to-speech contract.

`generateSpeech()` takes `turns` (an array of `{ text, voice }`) in place of `text` for a multi-voice script, and `timestamps: true` to ask for timings. `TTSResult` gains `alignment` (per character or per word, with `alignment.unit` saying which, all times in seconds) and `segments` (one per turn for dialogue, one per sentence for a single voice). Use `alignment` rather than `duration` to find where speech stops.

Both are adapter capabilities, declared on `adapter.capabilities` as `maxSpeakers` and `timestamps`. The activity rejects a request the adapter cannot serve before it reaches the provider, so too many speakers is a typed error rather than a provider 422.

Wired through three adapters:

- `byteplusSpeech` (Seed Audio 1.0): up to 3 voices, mapped to `references` plus a role-structured `text_prompt`. `timestamps` sets `audio_config.enable_subtitle`, and the subtitle block becomes word alignment and sentence segments, converted from milliseconds to seconds.
- `elevenlabsSpeech`: up to 10 voices. Picks between `textToSpeech.convert`, `textToSpeech.convertWithTimestamps`, `textToDialogue.convert` and `textToDialogue.convertWithTimestamps` from `turns` and `timestamps`. Dialogue also returns per-turn `segments` with the voice that spoke each one.
- `geminiSpeech`: up to 2 voices, building `multiSpeakerVoiceConfig` and the labelled prompt from the turns.

Every addition is optional, so existing adapters and callers are unaffected.
