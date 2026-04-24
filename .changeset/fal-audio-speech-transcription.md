---
'@tanstack/ai-fal': minor
---

feat: add audio, speech, and transcription adapters to @tanstack/ai-fal

Adds three new tree-shakeable adapters alongside the existing `falImage()` and `falVideo()`:

- `falSpeech()` — text-to-speech via models like Google `fal-ai/gemini-3.1-flash-tts`, `fal-ai/elevenlabs/tts/eleven-v3`, `fal-ai/minimax/speech-2.6-hd`, `fal-ai/kokoro/*`
- `falTranscription()` — speech-to-text via `fal-ai/whisper`, `fal-ai/wizper`, `fal-ai/speech-to-text/turbo`, `fal-ai/elevenlabs/speech-to-text`
- `falAudio()` — music and sound-effect generation via `fal-ai/minimax-music/v2.6`, `fal-ai/diffrhythm`, `fal-ai/lyria2`, `fal-ai/stable-audio-25/text-to-audio`, `fal-ai/elevenlabs/sound-effects/v2`
