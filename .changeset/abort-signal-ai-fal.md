---
'@tanstack/ai-fal': patch
---

An abort now cancels the queued fal job for image, audio, speech, and transcription, so the job stops billing. The speech audio download also stops on abort.
