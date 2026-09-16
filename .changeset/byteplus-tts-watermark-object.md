---
'@tanstack/ai-byteplus': patch
---

fix(ai-byteplus): send Seed Speech `watermark` as the object the API expects

`byteplusSpeech` sent `watermark` as a boolean, but Seed Audio 1.0 reads an
object with `aigc_watermark` (an audible marker) and `aigc_metadata` (header
provenance). A boolean was ignored by the server, so callers who asked for a
watermark silently got unwatermarked audio.

`modelOptions.watermark` now accepts `boolean | BytePlusTTSWatermark`, and
`true` normalizes to `{ aigc_watermark: true }`, so existing callers get the
behavior they intended.
