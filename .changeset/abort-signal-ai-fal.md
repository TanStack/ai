---
'@tanstack/ai-fal': patch
---

An abort now asks fal to cancel the job for image, audio, speech, and transcription. fal stops a queued job. For a job that already runs, the model app decides whether it stops. The speech audio download also stops on abort.
