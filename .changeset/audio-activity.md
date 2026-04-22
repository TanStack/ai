---
'@tanstack/ai': minor
---

feat: add generateAudio activity for music and sound-effect generation

Adds a new `audio` activity kind alongside the existing `tts` and `transcription` activities:

- `generateAudio()` / `createAudioOptions()` functions
- `AudioAdapter` interface and `BaseAudioAdapter` base class
- `AudioGenerationOptions` / `AudioGenerationResult` / `GeneratedAudio` types
- `audio:request:started`, `audio:request:completed`, and `audio:usage` devtools events
