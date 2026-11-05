---
'@tanstack/ai-deepgram': minor
'@tanstack/ai-elevenlabs': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-grok': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-mistral': minor
'@tanstack/ai-cloudflare': minor
---

Add live transcription adapters for `transcriptionSession()`:

- `deepgramLiveTranscription()` in the new `@tanstack/ai-deepgram` package (Nova-3 and Flux).
- `elevenlabsLiveTranscription()` for Scribe realtime.
- `openaiLiveTranscription()` for OpenAI realtime transcription sessions.
- `grokLiveTranscription()` for xAI streaming speech-to-text.
- `geminiLiveTranscription()` for Gemini Live transcription.
- `mistralLiveTranscription()` for Mistral Voxtral realtime.
- `cloudflareLiveTranscription()` for Deepgram Nova-3 and Flux through the Workers AI binding.
