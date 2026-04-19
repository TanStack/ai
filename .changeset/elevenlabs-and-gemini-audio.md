---
'@tanstack/ai-elevenlabs': minor
'@tanstack/ai-gemini': minor
---

feat: add ElevenLabs provider package and Gemini Lyria 3 + 3.1 Flash TTS support

**New package** `@tanstack/ai-elevenlabs`:

- `elevenlabsSpeech()` — text-to-speech via Eleven v3, Multilingual v2, Flash/Turbo v2.5, etc.
- `elevenlabsMusic()` — full-length music composition via Eleven Music (`music_v1`), supporting both free-form prompts and structured composition plans with sections and lyrics
- `elevenlabsSoundEffects()` — 0.5–30 second sound effects, including looping (`eleven_text_to_sound_v2`)
- `elevenlabsTranscription()` — Scribe v2 / v1 speech-to-text with diarization, PII redaction, keyterm biasing, and segment/word timestamps

**New adapter** in `@tanstack/ai-gemini`:

- `geminiAudio()` for Google Lyria music generation — supports `lyria-3-pro-preview` (full-length songs, MP3/WAV 48 kHz stereo) and `lyria-3-clip-preview` (30-second MP3 clips)

**Enhanced** in `@tanstack/ai-gemini`:

- Added `gemini-3.1-flash-tts-preview` to the TTS model list (70+ languages, 200+ audio tags for expressive control)
- Added `multiSpeakerVoiceConfig` to `GeminiTTSProviderOptions` for 2-speaker dialogue generation
