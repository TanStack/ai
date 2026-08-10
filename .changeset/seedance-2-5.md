---
'@tanstack/ai-byteplus': patch
---

Add first-class Seedance 2.5 support (`dreamina-seedance-2-5-260628`).

The model is fully open on ModelArk with documented capabilities: 4–30s
duration (or `-1`), 480p/720p only, multimodal reference media including
audio-only input, first-and-last-frame mode, `priority`, `generate_audio`, and
`output_format` (`mp4` | `mov`). The video adapter, typed model tables, unit
tests, docs, and Seedance Studio example catalog all treat it as a known
model rather than an escape-hatch string.
