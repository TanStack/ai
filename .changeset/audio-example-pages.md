---
---

chore: add ts-react-chat example pages and E2E coverage for audio providers

**Example pages** (`examples/ts-react-chat`):

- Updated text-to-speech and transcription pages with provider tabs (OpenAI, Gemini, Fal for TTS; OpenAI, Fal for transcription)
- Added a new `/generations/audio` page covering Gemini Lyria and Fal audio generation
- Added a shared `audio-providers` catalog and server-side adapter factories for audio, speech, and transcription

**Tests**:

- Added `@tanstack/ai-gemini` unit tests covering the Gemini TTS adapter (single-speaker default, multi-speaker config, missing-audio errors)
- Added a new `audio-gen` feature to the E2E harness with a Gemini Lyria adapter factory, route, UI, fixture, and spec
