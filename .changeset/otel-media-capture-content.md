---
'@tanstack/ai': patch
---

`otelMiddleware({ captureContent: true })` now records content on media spans (`generateImage`, `generateVideo`, `generateAudio`, `generateSpeech`, `generateTranscription`, and the others). `gen_ai.input.messages` gets the prompt and input media. `gen_ai.output.messages` gets the output URLs or the transcript text. Inline data stays a placeholder. `redact` and `maxContentLength` apply to each text part.
