---
'@tanstack/ai-gemini': minor
---

feat(ai-gemini): add Lyria 3 Pro / Clip audio adapter and Gemini 3.1 Flash TTS

**New adapter:**

- `geminiAudio()` for Google Lyria music generation — supports `lyria-3-pro-preview` (full-length songs, MP3/WAV 48 kHz stereo) and `lyria-3-clip-preview` (30-second MP3 clips)

**Enhanced:**

- Added `gemini-3.1-flash-tts-preview` to the TTS model list (70+ languages, 200+ audio tags for expressive control)
- Added `multiSpeakerVoiceConfig` to `GeminiTTSProviderOptions` for 2-speaker dialogue generation
