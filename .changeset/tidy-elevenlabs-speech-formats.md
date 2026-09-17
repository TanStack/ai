---
'@tanstack/ai-elevenlabs': patch
'@tanstack/ai': patch
---

Return real WAV audio for ElevenLabs speech requests with `format: 'wav'` and reject unsupported AAC and FLAC formats instead of silently returning MP3. Preserve explicit `modelOptions.outputFormat` overrides and document the supported formats in the media-generation skill.
