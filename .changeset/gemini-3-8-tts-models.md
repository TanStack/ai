---
'@tanstack/ai-gemini': minor
---

Add `gemini-3.8-flash-tts` and `gemini-3.8-flash-lite-tts` to the Gemini speech model list. On these models `systemInstruction` is sent as `speechMetadata.style` on each text part, and `turns` set `speechMetadata.speaker` instead of a label in the text, because the 3.8 models reject a system instruction and read the text verbatim. On these models, `multiSpeakerVoiceConfig` without `turns` throws before the request, because one text part cannot carry the speakers.
