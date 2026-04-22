---
---

chore: add ts-react-chat example pages and E2E coverage for music & sound effects

**Example pages** (`examples/ts-react-chat`):

- Updated text-to-speech and transcription pages with provider tabs (OpenAI, Gemini, Fal for TTS; OpenAI, Fal for transcription)
- Added `/generations/music` covering Gemini Lyria and Fal music models
- Added `/generations/sound-effects` covering Fal sound-effect models
- Added shared provider catalogs (`MUSIC_PROVIDERS`, `SOUND_EFFECTS_PROVIDERS`) and server-side adapter factories

**Tests**:

- Added `@tanstack/ai-gemini` unit tests covering the Gemini TTS adapter (single-speaker default, multi-speaker config, missing-audio errors)
- Added `music-gen` and `sound-effects-gen` features to the E2E harness — Gemini Lyria adapter factory, routes, parameterized UI, fixtures, and specs
