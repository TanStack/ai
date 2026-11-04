---
'@tanstack/ai-elevenlabs': patch
---

An abort now cancels the ElevenLabs request for speech, dialogue, music, sound effects, and transcription. Before, the adapters did not give the abort signal to the SDK, so the request ran to the end and was billed.
